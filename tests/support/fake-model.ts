/**
 * A scripted stand-in for the Messages API.
 *
 * Lets the whole adaptive runtime — MCP round trips, state folding,
 * guardrails, grounding, deterministic finalization — be exercised with no
 * credentials and no network. The script says which tools to call on each
 * turn; everything downstream is the real implementation.
 *
 * This is a test double for the *model*, not for the agent. Nothing about the
 * tool layer, the engines or the safety boundary is mocked.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { ModelClient } from "@/lib/agent/adaptive/runtime";

export interface ScriptedTurn {
  /** Tools to call this turn. An empty array produces a text-only reply. */
  calls: { name: string; input: Record<string, unknown> }[];
  text?: string;
}

export class FakeModelClient implements ModelClient {
  readonly received: Anthropic.MessageParam[][] = [];
  readonly toolsOffered: string[][] = [];
  private turn = 0;

  constructor(
    private readonly script: ScriptedTurn[],
    private readonly options: { failOnTurn?: number; failWith?: Error } = {},
  ) {}

  get turnsUsed(): number {
    return this.turn;
  }

  async createMessage(params: Parameters<ModelClient["createMessage"]>[0]): Promise<Anthropic.Message> {
    this.received.push([...params.messages]);
    this.toolsOffered.push(params.tools.map((t) => t.name));

    if (this.options.failOnTurn !== undefined && this.turn === this.options.failOnTurn) {
      throw this.options.failWith ?? new Error("simulated provider outage");
    }

    // Past the end of the script the model just talks, which exercises the
    // "no terminal action" path and, eventually, the turn limit.
    const step = this.script[this.turn] ?? { calls: [], text: "Still thinking." };
    this.turn += 1;

    const content: Anthropic.ContentBlock[] = [];
    if (step.text) {
      content.push({ type: "text", text: step.text, citations: null } as Anthropic.ContentBlock);
    }
    for (const [index, call] of step.calls.entries()) {
      content.push({
        type: "tool_use",
        id: `call_${this.turn}_${index}`,
        name: call.name,
        input: call.input,
      } as Anthropic.ContentBlock);
    }

    return {
      id: `msg_${this.turn}`,
      type: "message",
      role: "assistant",
      model: params.model,
      content,
      stop_reason: step.calls.length > 0 ? "tool_use" : "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 1200,
        output_tokens: 180,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        server_tool_use: null,
        service_tier: null,
      },
    } as Anthropic.Message;
  }
}

/** The investigation a competent agent runs on a substitution case. */
export function substitutionScript(incumbent: string, replacement: string): ScriptedTurn[] {
  return [
    { calls: [{ name: "resolve_customer", input: {} }] },
    { calls: [{ name: "get_request_state", input: {} }] },
    { calls: [{ name: "check_compatibility", input: { sku: incumbent } }] },
    { calls: [{ name: "find_substitutes", input: { sku: incumbent } }] },
    { calls: [{ name: "check_compatibility", input: { sku: replacement } }] },
    { calls: [{ name: "build_fulfillment_plan", input: { sku: replacement } }] },
    { calls: [{ name: "calculate_price", input: { sku: replacement } }] },
    {
      calls: [
        {
          name: "create_quote_draft",
          input: {
            candidateSkus: [incumbent, replacement],
            rationale: `The requested ${incumbent} fails on temperature for this duty, so ${replacement} is proposed in its place after checking compatibility, stock and pricing.`,
          },
        },
      ],
    },
  ];
}
