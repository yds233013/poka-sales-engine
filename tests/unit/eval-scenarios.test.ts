import { describe, expect, it } from "vitest";
import { EVAL_SCENARIOS } from "@/lib/eval/scenario";
import { TOOL_CONTRACTS } from "@/lib/mcp/contracts";
import { estimateCostUsd } from "@/lib/agent/adaptive/runtime";

/**
 * Tool names in a scenario are matched against `ToolCall.toolName` strings, so
 * a typo does not fail — it silently passes forever. These tests make the
 * scenario file answerable: every tool a scenario requires or forbids has to
 * be a name something can actually emit.
 */

/** Names the deterministic pipeline records that are not MCP tools. */
const PIPELINE_ONLY_TOOLS = new Set([
  "apply_adapter",
  "screen_candidates",
  "check_inventory",
  "calculate_freight",
  "check_margin",
  "evaluate_approvals",
  "draft_customer_response",
]);

const EMITTABLE = new Set([...Object.keys(TOOL_CONTRACTS), ...PIPELINE_ONLY_TOOLS]);

describe("evaluation scenarios", () => {
  it("has a unique id for every scenario", () => {
    const ids = EVAL_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only names tools that something can actually emit", () => {
    for (const scenario of EVAL_SCENARIOS) {
      for (const tool of [...(scenario.requiredTools ?? []), ...(scenario.forbiddenTools ?? [])]) {
        expect(EMITTABLE.has(tool), `${scenario.id} names unknown tool "${tool}"`).toBe(true);
      }
    }
  });

  it("never requires and forbids the same tool", () => {
    for (const scenario of EVAL_SCENARIOS) {
      const required = new Set(scenario.requiredTools ?? []);
      for (const forbidden of scenario.forbiddenTools ?? []) {
        expect(required.has(forbidden), `${scenario.id} both requires and forbids "${forbidden}"`).toBe(false);
      }
    }
  });

  it("requires at least one tool the adaptive agent can choose, where it requires any", () => {
    // A scenario whose required tools are all pipeline-internal would measure
    // the finalizer rather than the agent's investigation.
    for (const scenario of EVAL_SCENARIOS) {
      if (!scenario.requiredTools?.length) continue;
      expect(
        scenario.requiredTools.some((t) => t in TOOL_CONTRACTS),
        `${scenario.id} requires only pipeline-internal tools`,
      ).toBe(true);
    }
  });

  it("gives every scenario either a seeded reference or an inline RFQ", () => {
    for (const scenario of EVAL_SCENARIOS) {
      expect(Boolean(scenario.reference) || Boolean(scenario.rfq), scenario.id).toBe(true);
    }
  });

  it("covers the lettered adaptive scenarios A through H exactly once", () => {
    const letters = EVAL_SCENARIOS.map((s) => /^([A-H])\. /.exec(s.title)?.[1])
      .filter((l): l is string => Boolean(l))
      .sort();
    expect(letters).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
  });
});

describe("cost accounting", () => {
  it("prices a run from the model's published rates", () => {
    // 1M input at $3 + 1M output at $15.
    expect(estimateCostUsd("claude-sonnet-5", 1_000_000, 1_000_000)).toBeCloseTo(18, 6);
    expect(estimateCostUsd("claude-sonnet-5", 1200, 180)).toBeCloseTo(0.0036 + 0.0027, 6);
  });

  it("reports nothing rather than zero when usage is unknown", () => {
    expect(estimateCostUsd("claude-sonnet-5", 0, 0)).toBeNull();
  });

  it("reports nothing for a model it has no rate card for", () => {
    expect(estimateCostUsd("some-other-model", 1000, 1000)).toBeNull();
  });
});
