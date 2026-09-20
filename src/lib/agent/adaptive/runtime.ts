/**
 * The adaptive agent runtime.
 *
 * OBSERVE → DECIDE → ACT, with the model choosing every tool and the
 * application enforcing every limit. The loop itself is small; almost all the
 * code here is the boundary around it.
 *
 * ## Why a direct tool-use loop rather than the Claude Agent SDK
 *
 * The Agent SDK is built for long-lived assistant sessions with filesystem and
 * shell access and its own permission model. What this build needs is narrower
 * and stricter: a bounded loop over one MCP server, with turn and tool budgets,
 * loop detection, state validation after every call, and the ability to run
 * headless inside a Vitest process with no credentials. A direct Messages API
 * loop over the MCP client gives exactly that in ~200 lines, keeps the
 * guardrails inspectable, and leaves the MCP layer as the only tool surface —
 * which is the part that actually needed to be real.
 *
 * ## What the model cannot do here
 *
 * It cannot reach the database, choose a tool that is not registered, pass a
 * technical fact into a tool, exceed its budget, or conclude without going
 * through the deterministic finalizer. Those are properties of this file and
 * the MCP handlers, not of the prompt.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@/generated/prisma";
import { connectMcp } from "@/lib/mcp/client";
import { contractFor, isTerminal, TOOL_CONTRACTS, type ToolName } from "@/lib/mcp/contracts";
import type { ToolBus } from "@/lib/agent/toolbus";
import type { HandlerContext } from "@/lib/mcp/handlers";
import {
  applyToolResult,
  canDraftQuote,
  emptyState,
  narrateState,
  type InvestigationState,
  type TerminationStatus,
} from "./state";
import { buildSystemPrompt, buildUserMessage } from "./prompt";
import {
  DEFAULT_GUARDRAILS,
  GuardrailTracker,
  type GuardrailConfig,
  type GuardrailEvent,
} from "./guardrails";

export interface AdaptiveRunOptions {
  asOf?: Date;
  guardrails?: Partial<GuardrailConfig>;
  /** Injected in tests so the loop can be driven without a live model. */
  modelClient?: ModelClient;
  model?: string;
}

/** The slice of the Messages API this runtime uses. */
export interface ModelClient {
  createMessage(params: {
    model: string;
    system: string;
    messages: Anthropic.MessageParam[];
    tools: Anthropic.Tool[];
    maxTokens: number;
  }): Promise<Anthropic.Message>;
}

export class AnthropicModelClient implements ModelClient {
  private readonly client: Anthropic;
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }
  async createMessage(params: Parameters<ModelClient["createMessage"]>[0]): Promise<Anthropic.Message> {
    return this.client.messages.create({
      model: params.model,
      system: params.system,
      messages: params.messages,
      tools: params.tools,
      max_tokens: params.maxTokens,
    });
  }
}

export interface AdaptiveResult {
  runId: string;
  termination: TerminationStatus;
  state: InvestigationState;
  terminalTool: ToolName | null;
  terminalPayload: unknown;
  steps: string[];
  guardrailEvents: GuardrailEvent[];
  turnCount: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
  errorCategory: string | null;
  error: string | null;
}

/** Per-million-token list prices, used only when the API reports usage. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 15, output: 75 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing || (inputTokens === 0 && outputTokens === 0)) return null;
  return Number(((inputTokens / 1e6) * pricing.input + (outputTokens / 1e6) * pricing.output).toFixed(6));
}

/** Contracts → Anthropic tool definitions. The model sees exactly what MCP exposes. */
export function toolDefinitions(): Anthropic.Tool[] {
  return (Object.entries(TOOL_CONTRACTS) as [ToolName, (typeof TOOL_CONTRACTS)[ToolName]][]).map(
    ([name, contract]) => ({
      name,
      description: contract.description,
      input_schema: zodObjectToJsonSchema(contract.input),
    }),
  );
}

/**
 * Minimal Zod → JSON Schema for the flat, primitive-typed tool inputs this
 * registry uses. Deliberately narrow: it throws on anything it does not
 * understand rather than silently emitting a schema that lets bad arguments
 * through.
 */
function zodObjectToJsonSchema(schema: {
  shape: Record<string, unknown>;
}): Anthropic.Tool["input_schema"] {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, raw] of Object.entries(schema.shape)) {
    const { node, optional } = describeZod(raw);
    properties[key] = node;
    if (!optional) required.push(key);
  }
  return { type: "object", properties, required } as Anthropic.Tool["input_schema"];
}

function describeZod(raw: unknown): { node: Record<string, unknown>; optional: boolean } {
  let current = raw as { _def?: Record<string, unknown>; description?: string };
  let optional = false;
  const description = (current as { description?: string }).description;

  // Unwrap optional/default/nullable wrappers.
  for (let depth = 0; depth < 6; depth += 1) {
    const typeName = (current?._def?.typeName ?? current?._def?.type) as string | undefined;
    if (typeName === "ZodOptional" || typeName === "optional" || typeName === "ZodDefault" || typeName === "default") {
      optional = true;
      current = (current._def as { innerType: typeof current }).innerType;
      continue;
    }
    if (typeName === "ZodNullable" || typeName === "nullable") {
      current = (current._def as { innerType: typeof current }).innerType;
      continue;
    }
    break;
  }

  const typeName = (current?._def?.typeName ?? current?._def?.type) as string | undefined;
  const node: Record<string, unknown> = {};
  const desc = description ?? (current as { description?: string }).description;
  if (desc) node.description = desc;

  switch (typeName) {
    case "ZodString":
    case "string":
      node.type = "string";
      break;
    case "ZodNumber":
    case "number":
      node.type = "number";
      break;
    case "ZodBoolean":
    case "boolean":
      node.type = "boolean";
      break;
    case "ZodArray":
    case "array": {
      node.type = "array";
      const element = (current._def as { type?: unknown; element?: unknown }).element ??
        (current._def as { type?: unknown }).type;
      node.items = describeZod(element).node;
      break;
    }
    case "ZodEnum":
    case "enum": {
      node.type = "string";
      const values = (current._def as { values?: unknown }).values;
      node.enum = Array.isArray(values) ? values : Object.values(values ?? {});
      break;
    }
    case "ZodObject":
    case "object":
      node.type = "object";
      break;
    default:
      throw new Error(`Tool input schema uses an unsupported Zod type: ${typeName ?? "unknown"}`);
  }
  return { node, optional };
}

/**
 * Run one case adaptively.
 *
 * Persists nothing about the recommendation itself — that is the finalizer's
 * job. This returns what the agent established and how it wants to conclude.
 */
export async function runAdaptiveLoop(
  prisma: PrismaClient,
  requestId: string,
  runId: string,
  bus: ToolBus,
  modelClient: ModelClient,
  model: string,
  options: AdaptiveRunOptions = {},
): Promise<AdaptiveResult> {
  const asOf = options.asOf ?? new Date();
  const config = { ...DEFAULT_GUARDRAILS, ...options.guardrails };
  const tracker = new GuardrailTracker(config);

  const request = await prisma.salesRequest.findUniqueOrThrow({ where: { id: requestId } });
  const terminal: HandlerContext["terminal"] = { called: null, payload: null };
  const ctx: HandlerContext = { prisma, bus, requestId, asOf, terminal };

  const session = await connectMcp(ctx);
  let state = emptyState(requestId);
  let inputTokens = 0;
  let outputTokens = 0;
  const errorCategory: string | null = null;
  let error: string | null = null;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserMessage(request.subject, request.rawBody, request.reference) },
  ];
  const tools = toolDefinitions();
  const system = buildSystemPrompt();

  try {
    while (true) {
      const stop = tracker.stopReason();
      if (stop) {
        return finish("GUARDRAIL_STOP", stop.kind === "TIMEOUT" ? "TIMEOUT" : "GUARDRAIL");
      }

      tracker.turn += 1;

      let response: Anthropic.Message;
      try {
        response = await modelClient.createMessage({
          model,
          system,
          messages,
          tools,
          maxTokens: 4096,
        });
      } catch (modelError) {
        // A provider failure is not a safety event — it is an outage. The run
        // ends cleanly and the caller decides whether to fall back.
        error = modelError instanceof Error ? modelError.message : String(modelError);
        tracker.record("MODEL_ERROR", error);
        return finish("FAILED", "PROVIDER_ERROR");
      }

      inputTokens += response.usage?.input_tokens ?? 0;
      outputTokens += response.usage?.output_tokens ?? 0;
      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );

      if (toolUses.length === 0) {
        // The model stopped talking without concluding. Nudge once; if it does
        // it again the turn limit will end the run.
        messages.push({
          role: "user",
          content:
            "You have not taken a terminal action. Finish with create_quote_draft, request_clarification or escalate_for_review.",
        });
        tracker.record("NO_TERMINAL_ACTION", "Model produced no tool call.");
        continue;
      }

      const results: Anthropic.ToolResultBlockParam[] = [];

      for (const use of toolUses) {
        // Checked per call, not per turn. A single turn can request many tools
        // at once, so a cap enforced only at the top of the loop would let one
        // greedy turn run straight past it before anything noticed.
        const capped = tracker.toolBudgetExhausted();
        if (capped) {
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content: `Stopped: ${capped.detail}`,
          });
          continue;
        }

        tracker.toolCalls += 1;
        const contract = contractFor(use.name);

        if (!contract) {
          tracker.record("UNKNOWN_TOOL", use.name);
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content: `There is no tool called "${use.name}". Use one of the tools you were given.`,
          });
          continue;
        }

        const repeat = tracker.checkRepeat(use.name, use.input);
        if (repeat) {
          results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: repeat });
          continue;
        }

        // Preconditions for a quote draft are checked before the terminal
        // action is spent, so the model gets a chance to fix the gap.
        if (use.name === "create_quote_draft") {
          const candidates = ((use.input as { candidateSkus?: string[] }).candidateSkus ?? []).map((s) =>
            s.toUpperCase(),
          );
          const ready = canDraftQuote(state, candidates);
          if (!ready.ok) {
            tracker.record("FORBIDDEN_EFFECT", ready.reason);
            results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: ready.reason });
            continue;
          }
        }

        const callResult = await session.client.callTool({
          name: use.name,
          arguments: (use.input ?? {}) as Record<string, unknown>,
        });

        const isError = Boolean((callResult as { isError?: boolean }).isError);
        const structured = (callResult as { structuredContent?: unknown }).structuredContent;
        const textContent = Array.isArray((callResult as { content?: { text?: string }[] }).content)
          ? ((callResult as { content: { text?: string }[] }).content[0]?.text ?? "")
          : "";

        if (isError) {
          const abandon = tracker.noteInvalid(use.name, textContent.slice(0, 200));
          results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: textContent });
          if (abandon) {
            return finish("GUARDRAIL_STOP", "REPEATED_INVALID_ARGS");
          }
          continue;
        }

        tracker.noteValid();
        state = applyToolResult(state, use.name, structured);
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(structured ?? {}),
        });

        if (isTerminal(use.name) && terminal.called) {
          messages.push({ role: "user", content: results });
          return finish(terminationFor(terminal.called), null);
        }
      }

      messages.push({ role: "user", content: results });
    }
  } finally {
    await session.close().catch(() => undefined);
  }

  function finish(termination: TerminationStatus, category: string | null): AdaptiveResult {
    return {
      runId,
      termination,
      state,
      terminalTool: terminal.called,
      terminalPayload: terminal.payload,
      steps: narrateState(state),
      guardrailEvents: tracker.events,
      turnCount: tracker.turn,
      toolCallCount: tracker.toolCalls,
      inputTokens,
      outputTokens,
      errorCategory: category ?? errorCategory,
      error,
    };
  }
}

function terminationFor(tool: ToolName): TerminationStatus {
  switch (tool) {
    case "create_quote_draft":
      return "READY_TO_DRAFT";
    case "request_clarification":
      return "NEEDS_CUSTOMER_CLARIFICATION";
    case "escalate_for_review":
      return "NEEDS_INTERNAL_REVIEW";
    default:
      return "FAILED";
  }
}
