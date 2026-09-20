/**
 * Tool bus.
 *
 * Every capability the agent has is a tool, and every tool invocation is
 * recorded: name, inputs, output, duration, status, safety class, and the
 * evidence it produced. That record is the audit trail — the UI reads it
 * back rather than a separate log, so what an operator inspects is literally
 * what executed.
 *
 * Chain-of-thought is never captured. Each call carries a `summary` written
 * for a salesperson ("Checked inventory for PX-440 across 6 locations"),
 * which is the operational trace the product exposes.
 */

import type { PrismaClient } from "@/generated/prisma";
import type { SafetyClass } from "@/lib/domain/types";

export interface EvidenceDraft {
  kind: "document" | "spec" | "inventory" | "pricing" | "policy" | "account";
  label: string;
  claim: string;
  sectionId?: string | null;
  recordRef?: string | null;
}

export interface ToolResult<T> {
  output: T;
  summary: string;
  status?: "OK" | "EMPTY" | "ERROR" | "BLOCKED";
  safety?: SafetyClass;
  evidence?: EvidenceDraft[];
}

export interface ToolContext {
  prisma: PrismaClient;
  runId: string;
  requestId: string;
  /** Injected clock so runs are reproducible in tests and seeds. */
  asOf: Date;
}

export interface RecordedCall {
  id: string;
  sequence: number;
  toolName: string;
  summary: string;
  status: string;
}

export class ToolBus {
  private sequence = 0;
  readonly calls: RecordedCall[] = [];

  constructor(private readonly ctx: ToolContext) {}

  get context(): ToolContext {
    return this.ctx;
  }

  /**
   * Execute a tool, persist the invocation and return its output.
   *
   * A thrown error is recorded as an ERROR call and re-thrown: the run fails
   * loudly rather than continuing with a hole in the evidence chain.
   */
  async run<TInput extends object, TOutput>(
    toolName: string,
    input: TInput,
    fn: (ctx: ToolContext) => Promise<ToolResult<TOutput>>,
  ): Promise<TOutput> {
    const sequence = ++this.sequence;
    const startedAt = new Date();
    const started = performance.now();

    try {
      const result = await fn(this.ctx);
      const durationMs = Math.max(1, Math.round(performance.now() - started));

      const call = await this.ctx.prisma.toolCall.create({
        data: {
          runId: this.ctx.runId,
          sequence,
          toolName,
          input: input as object,
          output: toJson(result.output),
          status: result.status ?? "OK",
          safety: result.safety ?? "AUTO_SAFE",
          summary: result.summary,
          startedAt,
          durationMs,
          evidence: result.evidence?.length
            ? {
                create: result.evidence.map((e) => ({
                  kind: e.kind,
                  label: e.label,
                  claim: e.claim,
                  sectionId: e.sectionId ?? null,
                  recordRef: e.recordRef ?? null,
                })),
              }
            : undefined,
        },
      });

      this.calls.push({
        id: call.id,
        sequence,
        toolName,
        summary: result.summary,
        status: result.status ?? "OK",
      });
      return result.output;
    } catch (error) {
      const durationMs = Math.max(1, Math.round(performance.now() - started));
      const message = error instanceof Error ? error.message : String(error);
      const call = await this.ctx.prisma.toolCall.create({
        data: {
          runId: this.ctx.runId,
          sequence,
          toolName,
          input: input as object,
          status: "ERROR",
          safety: "BLOCKED",
          summary: `${toolName} failed: ${message}`,
          error: message,
          startedAt,
          durationMs,
        },
      });
      this.calls.push({ id: call.id, sequence, toolName, summary: message, status: "ERROR" });
      throw error;
    }
  }
}

/** Prisma Json columns reject undefined and Date; normalise before writing. */
function toJson(value: unknown): object {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (v instanceof Date ? v.toISOString() : v)),
  ) as object;
}
