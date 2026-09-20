/**
 * Runtime guardrails.
 *
 * An agent that cannot be stopped is not a product feature. These are the
 * limits the runtime enforces regardless of what the model asks for, and every
 * trip is recorded on the run so the eval harness can count them.
 */

export interface GuardrailConfig {
  /** Model round-trips. */
  maxTurns: number;
  /** Total tool executions across the run. */
  maxToolCalls: number;
  /** Wall-clock budget for the whole run. */
  timeoutMs: number;
  /**
   * How many times the same tool may be called with identical arguments.
   * One repeat is often legitimate — re-reading state after a change. Three
   * identical calls is a loop.
   */
  maxIdenticalCalls: number;
  /** Consecutive invalid tool arguments before the run is abandoned. */
  maxConsecutiveInvalid: number;
}

export const DEFAULT_GUARDRAILS: GuardrailConfig = {
  maxTurns: 18,
  maxToolCalls: 30,
  timeoutMs: 180_000,
  maxIdenticalCalls: 2,
  maxConsecutiveInvalid: 3,
};

export type GuardrailKind =
  | "TURN_LIMIT"
  | "TOOL_LIMIT"
  | "TIMEOUT"
  | "REPEATED_CALL"
  | "INVALID_ARGUMENTS"
  | "UNKNOWN_TOOL"
  | "NO_TERMINAL_ACTION"
  | "MODEL_ERROR"
  | "FORBIDDEN_EFFECT";

export interface GuardrailEvent {
  kind: GuardrailKind;
  detail: string;
  atTurn: number;
}

/**
 * Tracks the run's budget and repetition.
 *
 * Separated from the runtime so the limits can be tested on their own, without
 * a model, a database or a clock.
 */
export class GuardrailTracker {
  readonly events: GuardrailEvent[] = [];
  private readonly callCounts = new Map<string, number>();
  private consecutiveInvalid = 0;
  turn = 0;
  toolCalls = 0;

  constructor(
    private readonly config: GuardrailConfig,
    private readonly startedAt: number = Date.now(),
    private readonly now: () => number = Date.now,
  ) {}

  record(kind: GuardrailKind, detail: string): GuardrailEvent {
    const event = { kind, detail, atTurn: this.turn };
    this.events.push(event);
    return event;
  }

  /** Why the run must stop now, or null to continue. */
  stopReason(): GuardrailEvent | null {
    if (this.now() - this.startedAt > this.config.timeoutMs) {
      return this.record("TIMEOUT", `Run exceeded ${Math.round(this.config.timeoutMs / 1000)}s.`);
    }
    if (this.turn >= this.config.maxTurns) {
      return this.record("TURN_LIMIT", `Reached the ${this.config.maxTurns}-turn limit without concluding.`);
    }
    if (this.toolCalls >= this.config.maxToolCalls) {
      return this.record("TOOL_LIMIT", `Reached the ${this.config.maxToolCalls}-tool-call limit without concluding.`);
    }
    return null;
  }

  /**
   * Has the run run out of budget to execute another tool *right now*?
   *
   * Separate from `stopReason` because this is checked inside a turn, between
   * the individual calls the model asked for in one go. It deliberately does
   * not consider the turn limit — the current turn is already underway — and
   * it records at most one event, so refusing the tail of a greedy turn does
   * not bury the trace in duplicates.
   */
  toolBudgetExhausted(): GuardrailEvent | null {
    if (this.toolCalls >= this.config.maxToolCalls) {
      return (
        this.events.find((e) => e.kind === "TOOL_LIMIT") ??
        this.record("TOOL_LIMIT", `Reached the ${this.config.maxToolCalls}-tool-call limit without concluding.`)
      );
    }
    if (this.now() - this.startedAt > this.config.timeoutMs) {
      return (
        this.events.find((e) => e.kind === "TIMEOUT") ??
        this.record("TIMEOUT", `Run exceeded ${Math.round(this.config.timeoutMs / 1000)}s.`)
      );
    }
    return null;
  }

  /**
   * Is this call a repeat of one already made with the same arguments?
   *
   * Returns a message for the model rather than a boolean, because telling it
   * *why* a call was refused is what stops the loop — silently dropping the
   * call just makes it try again.
   */
  checkRepeat(toolName: string, args: unknown): string | null {
    const key = `${toolName}:${stableStringify(args)}`;
    const count = (this.callCounts.get(key) ?? 0) + 1;
    this.callCounts.set(key, count);
    if (count > this.config.maxIdenticalCalls) {
      this.record("REPEATED_CALL", `${toolName} called ${count} times with identical arguments.`);
      return `You have already called ${toolName} with these exact arguments ${count - 1} times and the answer has not changed. Use what you have and move on, or take a terminal action.`;
    }
    return null;
  }

  noteInvalid(toolName: string, detail: string): boolean {
    this.consecutiveInvalid += 1;
    this.record("INVALID_ARGUMENTS", `${toolName}: ${detail}`);
    return this.consecutiveInvalid >= this.config.maxConsecutiveInvalid;
  }

  noteValid(): void {
    this.consecutiveInvalid = 0;
  }

  elapsedMs(): number {
    return this.now() - this.startedAt;
  }
}

/** Key-order-independent stringify, so argument order cannot defeat repeat detection. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
