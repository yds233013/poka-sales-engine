"use server";

/**
 * Agent Lab server actions.
 *
 * Deliberately thin. The interesting behaviour — mode availability, the agent
 * loop, the eval scoring — lives in the libraries, so this surface cannot
 * become a second place where those rules are decided.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runSalesRequest } from "@/lib/agent/orchestrator";
import { runAdaptiveRequest, AdaptiveUnavailableError } from "@/lib/agent/adaptive";
import { isAdaptiveAvailable } from "@/lib/ai/capability";
import { EVAL_SCENARIOS, scenarioById } from "@/lib/eval/scenario";
import { runScenario, prepareScenarioCase, type EvalResult } from "@/lib/eval/runner";

/** What a run actually recorded, read back from the database after it ran. */
export interface LabRunObservability {
  mode: "DETERMINISTIC" | "ADAPTIVE_AGENT";
  /** NONE for deterministic, SCRIPTED for a stand-in, LIVE for a real provider call. */
  modelSource: "NONE" | "SCRIPTED" | "LIVE";
  model: string | null;
  termination: string | null;
  turnCount: number | null;
  toolCallCount: number | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  estimatedCostUsd: number | null;
  groundingIssues: string[];
  /** The tools the model itself chose, in order. Never the pipeline's steps. */
  toolSequence: string[];
}

export interface LabRunResult {
  ok: boolean;
  message: string;
  requestId: string | null;
  runId: string | null;
  run: LabRunObservability | null;
}

const runSchema = z.object({
  mode: z.enum(["DETERMINISTIC", "ADAPTIVE_AGENT"]),
  scenarioId: z.string().min(1).optional(),
  reference: z.string().min(1).optional(),
  customRfq: z
    .object({
      subject: z.string().trim().min(3).max(200),
      body: z.string().trim().min(20).max(8000),
      accountNumber: z.string().trim().min(3).max(20),
    })
    .optional(),
});

export async function runInLab(input: z.infer<typeof runSchema>): Promise<LabRunResult> {
  try {
    const parsed = runSchema.parse(input);

    if (parsed.mode === "ADAPTIVE_AGENT" && !isAdaptiveAvailable()) {
      return {
        ok: false,
        message:
          "Adaptive mode is unavailable — no model provider is configured. Run the deterministic workflow instead.",
        run: null,
        requestId: null,
        runId: null,
      };
    }

    let requestId: string;
    if (parsed.customRfq) {
      const customer = await prisma.customer.findFirst({
        where: { accountNumber: parsed.customRfq.accountNumber },
        include: { sites: true, contacts: true },
      });
      if (!customer) {
        return {
          ok: false,
          message: `No account with number ${parsed.customRfq.accountNumber}.`,
          requestId: null,
          runId: null,
          run: null,
        };
      }
      const owner = await prisma.user.findFirstOrThrow({ where: { role: "SALES_REP" } });
      const created = await prisma.salesRequest.create({
        data: {
          reference: `LAB-${Date.now().toString(36).toUpperCase()}`,
          subject: parsed.customRfq.subject,
          rawBody: parsed.customRfq.body,
          receivedAt: new Date(),
          customerId: customer.id,
          siteId: (customer.sites.find((s) => s.isPrimary) ?? customer.sites[0])?.id ?? null,
          contactId: customer.contacts[0]?.id ?? null,
          ownerId: owner.id,
        },
      });
      requestId = created.id;
    } else if (parsed.scenarioId) {
      const scenario = scenarioById(parsed.scenarioId);
      if (!scenario) return { ok: false, message: "Unknown scenario.", requestId: null, runId: null, run: null };
      const prepared = await prepareScenarioCase(prisma, scenario);
      requestId = prepared.requestId;
    } else if (parsed.reference) {
      const existing = await prisma.salesRequest.findFirst({ where: { reference: parsed.reference } });
      if (!existing) {
        return { ok: false, message: `No case ${parsed.reference}.`, requestId: null, runId: null, run: null };
      }
      requestId = existing.id;
    } else {
      return { ok: false, message: "Choose a scenario or enter a request.", requestId: null, runId: null, run: null };
    }

    const outcome =
      parsed.mode === "DETERMINISTIC"
        ? await runSalesRequest(prisma, requestId)
        : await runAdaptiveRequest(prisma, requestId);

    revalidatePath("/agent-lab");
    revalidatePath(`/cases/${requestId}`);
    revalidatePath("/inbox");

    // Read the run back rather than describing it from the return value: the
    // console reports what was persisted, including whether a real provider
    // or a scripted stand-in directed it.
    const run = await prisma.agentRun.findUnique({
      where: { id: outcome.runId },
      select: {
        mode: true,
        modelSource: true,
        model: true,
        termination: true,
        turnCount: true,
        toolCallCount: true,
        durationMs: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        estimatedCostUsd: true,
        groundingIssues: true,
      },
    });
    const sequence = (
      await prisma.toolCall.findMany({
        where: { runId: outcome.runId, modelInitiated: true },
        orderBy: { sequence: "asc" },
        select: { toolName: true },
      })
    ).map((c) => c.toolName);

    return {
      ok: true,
      message:
        parsed.mode === "DETERMINISTIC"
          ? "Deterministic workflow complete."
          : `Adaptive investigation complete — ${"termination" in outcome ? outcome.termination : outcome.status}.`,
      requestId,
      runId: outcome.runId,
      run: run
        ? {
            mode: run.mode,
            modelSource: run.modelSource,
            model: run.model,
            termination: run.termination,
            turnCount: run.turnCount,
            toolCallCount: run.toolCallCount,
            durationMs: run.durationMs,
            inputTokens: run.inputTokens,
            outputTokens: run.outputTokens,
            cacheReadTokens: run.cacheReadTokens,
            estimatedCostUsd: run.estimatedCostUsd ? Number(run.estimatedCostUsd) : null,
            groundingIssues: run.groundingIssues,
            toolSequence: sequence,
          }
        : null,
    };
  } catch (error) {
    if (error instanceof AdaptiveUnavailableError) {
      return { ok: false, message: error.message, requestId: null, runId: null, run: null };
    }
    // A ZodError's `message` is a JSON dump of its issues. Rendering that in
    // the console would be unreadable, so it is turned into a sentence.
    if (error instanceof z.ZodError) {
      const detail = error.issues
        .map((i) => `${i.path.join(".") || "input"}: ${i.message.toLowerCase()}`)
        .join("; ");
      return { ok: false, message: `That request cannot be run — ${detail}.`, requestId: null, runId: null, run: null };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: message.split("\n")[0], requestId: null, runId: null, run: null };
  }
}

export interface EvalSuiteResult {
  ranAt: string;
  adaptiveAvailable: boolean;
  rows: { scenarioId: string; title: string; deterministic: EvalResult; adaptive: EvalResult }[];
}

/** Run the whole suite in both modes. Adaptive reports NOT_RUN without a key. */
export async function runEvalSuite(): Promise<EvalSuiteResult> {
  const rows: EvalSuiteResult["rows"] = [];
  for (const scenario of EVAL_SCENARIOS) {
    const deterministic = await runScenario(prisma, scenario, "DETERMINISTIC");
    const adaptive = await runScenario(prisma, scenario, "ADAPTIVE_AGENT");
    rows.push({ scenarioId: scenario.id, title: scenario.title, deterministic, adaptive });
  }
  revalidatePath("/agent-lab");
  return { ranAt: new Date().toISOString(), adaptiveAvailable: isAdaptiveAvailable(), rows };
}
