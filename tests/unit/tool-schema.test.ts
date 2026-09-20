import { describe, expect, it } from "vitest";
import { toolDefinitions, estimateCostUsd } from "@/lib/agent/adaptive/runtime";
import { TOOL_CONTRACTS } from "@/lib/mcp/contracts";

/**
 * The schema the model is shown has to carry the constraints the validator
 * enforces.
 *
 * This is not a style point. In live validation the agent repeatedly sent a
 * `reason` longer than the limit, was rejected with -32602, and burned a turn
 * recovering — because the JSON Schema advertised `{type: "string"}` for a
 * field that was really "20 to 1200 characters". A bound the validator keeps
 * secret is a trap rather than a contract.
 */
describe("tool schemas exposed to the model", () => {
  const byName: Record<string, ReturnType<typeof toolDefinitions>[number]> = Object.fromEntries(
    toolDefinitions().map((t) => [t.name, t]),
  );

  it("publishes array bounds", () => {
    const questions = (byName.request_clarification.input_schema.properties as Record<string, Record<string, unknown>>)
      .questions;
    expect(questions.minItems).toBe(1);
    expect(questions.maxItems).toBe(6);
  });

  it("publishes string bounds, including inside arrays", () => {
    const props = byName.request_clarification.input_schema.properties as Record<string, Record<string, unknown>>;
    expect((props.questions.items as Record<string, unknown>).maxLength).toBe(500);
    expect(props.reason.minLength).toBe(20);
    expect(props.reason.maxLength).toBe(1200);
  });

  it("publishes numeric bounds and integrality", () => {
    const quantity = (byName.calculate_price.input_schema.properties as Record<string, Record<string, unknown>>)
      .quantity;
    expect(quantity.type).toBe("integer");
    expect(quantity.minimum).toBe(1);
    expect(quantity.maximum).toBe(100_000);
  });

  it("carries every contract to the model with a description", () => {
    for (const name of Object.keys(TOOL_CONTRACTS)) {
      const tool = byName[name];
      expect(tool, `${name} is not exposed`).toBeDefined();
      expect((tool.description ?? "").length).toBeGreaterThan(40);
    }
  });

  it("leaves no constrained string field without a published bound", () => {
    // A silent bound is the exact defect this suite exists to prevent, so the
    // rule is enforced across every tool rather than the two that regressed.
    for (const tool of toolDefinitions()) {
      const props = (tool.input_schema.properties ?? {}) as Record<string, Record<string, unknown>>;
      for (const [field, node] of Object.entries(props)) {
        if (node.type === "string" && node.maxLength === undefined && node.enum === undefined) {
          throw new Error(`${tool.name}.${field} is an unbounded string in the published schema`);
        }
      }
    }
  });
});

describe("cost accounting with prompt caching", () => {
  it("prices cache writes at 1.25x and cache reads at 0.1x", () => {
    // 1M cache-write tokens at Sonnet's $3 input rate.
    expect(estimateCostUsd("claude-sonnet-5", 0, 0, 1_000_000, 0)).toBeCloseTo(3.75, 6);
    expect(estimateCostUsd("claude-sonnet-5", 0, 0, 0, 1_000_000)).toBeCloseTo(0.3, 6);
  });

  it("counts cached tokens rather than ignoring them", () => {
    // A run billed almost entirely through the cache must not report as free.
    const cost = estimateCostUsd("claude-sonnet-5", 14, 4367, 15646, 56259);
    expect(cost).not.toBeNull();
    expect(cost!).toBeGreaterThan(0.1);
  });

  it("still reports nothing when no usage was measured at all", () => {
    expect(estimateCostUsd("claude-sonnet-5", 0, 0, 0, 0)).toBeNull();
  });
});
