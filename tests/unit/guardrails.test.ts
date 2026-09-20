import { describe, expect, it } from "vitest";
import {
  DEFAULT_GUARDRAILS,
  GuardrailTracker,
  stableStringify,
  type GuardrailConfig,
} from "@/lib/agent/adaptive/guardrails";

const config = (overrides: Partial<GuardrailConfig> = {}): GuardrailConfig => ({
  ...DEFAULT_GUARDRAILS,
  ...overrides,
});

describe("guardrail tracker", () => {
  it("allows a run inside every budget", () => {
    const tracker = new GuardrailTracker(config());
    tracker.turn = 3;
    tracker.toolCalls = 5;
    expect(tracker.stopReason()).toBeNull();
  });

  it("stops at the turn limit", () => {
    const tracker = new GuardrailTracker(config({ maxTurns: 4 }));
    tracker.turn = 4;
    expect(tracker.stopReason()?.kind).toBe("TURN_LIMIT");
  });

  it("stops at the tool-call limit", () => {
    const tracker = new GuardrailTracker(config({ maxToolCalls: 6 }));
    tracker.toolCalls = 6;
    expect(tracker.stopReason()?.kind).toBe("TOOL_LIMIT");
  });

  it("stops on timeout", () => {
    let now = 1_000;
    const tracker = new GuardrailTracker(config({ timeoutMs: 500 }), now, () => now);
    expect(tracker.stopReason()).toBeNull();
    now += 900;
    expect(tracker.stopReason()?.kind).toBe("TIMEOUT");
  });

  it("records every trip for the eval harness", () => {
    const tracker = new GuardrailTracker(config({ maxTurns: 1 }));
    tracker.turn = 1;
    tracker.stopReason();
    expect(tracker.events).toHaveLength(1);
    expect(tracker.events[0]).toMatchObject({ kind: "TURN_LIMIT", atTurn: 1 });
  });
});

describe("loop detection", () => {
  it("permits a call and one repeat, then refuses", () => {
    const tracker = new GuardrailTracker(config({ maxIdenticalCalls: 2 }));
    expect(tracker.checkRepeat("get_inventory", { sku: "PX-440" })).toBeNull();
    expect(tracker.checkRepeat("get_inventory", { sku: "PX-440" })).toBeNull();
    const third = tracker.checkRepeat("get_inventory", { sku: "PX-440" });
    expect(third).toMatch(/already called get_inventory/i);
    expect(tracker.events.some((e) => e.kind === "REPEATED_CALL")).toBe(true);
  });

  it("tells the model why, rather than silently dropping the call", () => {
    const tracker = new GuardrailTracker(config({ maxIdenticalCalls: 1 }));
    tracker.checkRepeat("get_inventory", { sku: "PX-440" });
    const refusal = tracker.checkRepeat("get_inventory", { sku: "PX-440" })!;
    // Silently dropping it just makes the model try again.
    expect(refusal).toMatch(/move on|terminal action/i);
  });

  it("treats different arguments as different calls", () => {
    const tracker = new GuardrailTracker(config({ maxIdenticalCalls: 1 }));
    expect(tracker.checkRepeat("get_inventory", { sku: "PX-440" })).toBeNull();
    expect(tracker.checkRepeat("get_inventory", { sku: "AX-220" })).toBeNull();
  });

  it("cannot be defeated by reordering argument keys", () => {
    const tracker = new GuardrailTracker(config({ maxIdenticalCalls: 1 }));
    expect(tracker.checkRepeat("build_fulfillment_plan", { sku: "PX-440", quantity: 12 })).toBeNull();
    const reordered = tracker.checkRepeat("build_fulfillment_plan", { quantity: 12, sku: "PX-440" });
    expect(reordered).not.toBeNull();
  });
});

describe("invalid argument handling", () => {
  it("abandons the run after repeated invalid arguments", () => {
    const tracker = new GuardrailTracker(config({ maxConsecutiveInvalid: 3 }));
    expect(tracker.noteInvalid("check_compatibility", "bad")).toBe(false);
    expect(tracker.noteInvalid("check_compatibility", "bad")).toBe(false);
    expect(tracker.noteInvalid("check_compatibility", "bad")).toBe(true);
  });

  it("resets the counter once a call succeeds", () => {
    const tracker = new GuardrailTracker(config({ maxConsecutiveInvalid: 2 }));
    tracker.noteInvalid("x", "bad");
    tracker.noteValid();
    expect(tracker.noteInvalid("x", "bad")).toBe(false);
  });
});

describe("stableStringify", () => {
  it("is key-order independent", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });
  it("distinguishes genuinely different values", () => {
    expect(stableStringify({ sku: "A" })).not.toBe(stableStringify({ sku: "B" }));
  });
  it("handles nesting, arrays and null", () => {
    expect(stableStringify({ a: [1, { z: 1, y: 2 }], n: null })).toBe(
      stableStringify({ n: null, a: [1, { y: 2, z: 1 }] }),
    );
  });
  it("ignores undefined members so an absent key matches an explicit undefined", () => {
    expect(stableStringify({ sku: "A", quantity: undefined })).toBe(stableStringify({ sku: "A" }));
  });
});
