import { afterAll, describe, expect, it } from "vitest";
import { db } from "../support/db";
import { EVAL_SCENARIOS, scenarioById } from "@/lib/eval/scenario";
import { runScenario, prepareScenarioCase } from "@/lib/eval/runner";
import { FakeModelClient, substitutionScript } from "../support/fake-model";

afterAll(async () => {
  await db.$disconnect();
});

describe("scenario suite", () => {
  it("every scenario states domain truth without prescribing a tool order", () => {
    expect(EVAL_SCENARIOS.length).toBeGreaterThanOrEqual(10);
    for (const scenario of EVAL_SCENARIOS) {
      expect(scenario.id).toMatch(/^[a-z0-9-]+$/);
      expect(scenario.demonstrates.length).toBeGreaterThan(30);
      expect(scenario.expected.outcomes.length).toBeGreaterThan(0);
      expect(Boolean(scenario.reference) || Boolean(scenario.rfq)).toBe(true);
      // requiredTools is for evidence, not obedience — it should never be a
      // full pipeline.
      expect((scenario.requiredTools ?? []).length).toBeLessThanOrEqual(3);
    }
  });

  it("includes scenarios built to make tool selection differ", () => {
    const adaptive = EVAL_SCENARIOS.filter((s) => s.id.startsWith("adaptive-"));
    expect(adaptive.length).toBeGreaterThanOrEqual(5);
    // At least some must forbid work the request gives no reason to do.
    expect(adaptive.some((s) => (s.forbiddenTools ?? []).length > 0)).toBe(true);
  });

  it("resolves scenarios by id", () => {
    expect(scenarioById("hero-substitution")).not.toBeNull();
    expect(scenarioById("does-not-exist")).toBeNull();
  });
});

describe("deterministic baseline", () => {
  it("passes every seeded scenario", async () => {
    const seeded = EVAL_SCENARIOS.filter((s) => s.reference !== null);
    for (const scenario of seeded) {
      const result = await runScenario(db, scenario, "DETERMINISTIC");
      const failed = result.checks.filter((c) => !c.passed);
      expect(
        failed.map((f) => `${f.name}: ${f.detail}`),
        `${scenario.id} should pass the deterministic baseline`,
      ).toEqual([]);
      expect(result.status).toBe("PASS");
    }
  }, 120_000);

  it("scores an unsafe run as a failure rather than quietly passing", async () => {
    // A scenario asserting the wrong part is selected must fail.
    const scenario = {
      ...EVAL_SCENARIOS[0],
      id: "deliberately-wrong",
      expected: { ...EVAL_SCENARIOS[0].expected, selectedSku: "MX-120" },
    };
    const result = await runScenario(db, scenario, "DETERMINISTIC");
    expect(result.status).toBe("FAIL");
    expect(result.checks.some((c) => c.name === "selected-sku" && !c.passed)).toBe(true);
  }, 60_000);

  it("detects a tool the scenario says should not have been needed", async () => {
    const scenario = {
      ...EVAL_SCENARIOS[0],
      id: "forbids-a-used-tool",
      forbiddenTools: ["check_compatibility"],
    };
    const result = await runScenario(db, scenario, "DETERMINISTIC");
    expect(result.metrics.unnecessaryCalls).toBeGreaterThan(0);
    expect(result.checks.some((c) => c.name === "unnecessary-tools" && !c.passed)).toBe(true);
  }, 60_000);

  it("detects a required tool that was never called", async () => {
    const scenario = {
      ...EVAL_SCENARIOS[3], // ambiguous request — stops before most tools
      id: "requires-unused-tool",
      requiredTools: ["calculate_freight"],
    };
    const result = await runScenario(db, scenario, "DETERMINISTIC");
    expect(result.metrics.missingRequiredTools).toContain("calculate_freight");
    expect(result.checks.some((c) => c.name === "required-tools" && !c.passed)).toBe(true);
  }, 60_000);
});

describe("adaptive evaluation", () => {
  it("reports NOT_RUN without credentials instead of fabricating metrics", async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const result = await runScenario(db, EVAL_SCENARIOS[0], "ADAPTIVE_AGENT");
      expect(result.status).toBe("NOT_RUN");
      expect(result.notRunReason).toMatch(/ANTHROPIC_API_KEY/);
      // Nothing is claimed: no outcome, no tool counts, no cost.
      expect(result.outcome).toBeNull();
      expect(result.selectedSku).toBeNull();
      expect(result.checks).toHaveLength(0);
      expect(result.metrics.toolCalls).toBe(0);
      expect(result.metrics.estimatedCostUsd).toBeNull();
    } finally {
      if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it("scores a real adaptive run and records model-attributed metrics", async () => {
    const result = await runScenario(db, EVAL_SCENARIOS[0], "ADAPTIVE_AGENT", {
      modelClient: new FakeModelClient(substitutionScript("AX-220", "PX-440")),
      model: "claude-sonnet-5",
    });
    expect(result.status).toBe("PASS");
    expect(result.selectedSku).toBe("PX-440");
    expect(result.metrics.modelInitiatedCalls).toBeGreaterThan(0);
    expect(result.metrics.turnCount).toBeGreaterThan(0);
    expect(result.metrics.groundingIssues).toBe(0);
    expect(result.metrics.safetyViolations).toBe(0);
    expect(result.toolSequence).toContain("check_compatibility");
  }, 60_000);

  it("counts only model-chosen calls when scoring adaptive tool selection", async () => {
    const result = await runScenario(db, EVAL_SCENARIOS[0], "ADAPTIVE_AGENT", {
      modelClient: new FakeModelClient(substitutionScript("AX-220", "PX-440")),
      model: "claude-sonnet-5",
    });
    // The finalizer's own calls must not be charged to the agent's judgement.
    expect(result.metrics.modelInitiatedCalls).toBeLessThan(result.metrics.toolCalls);
  }, 60_000);
});

describe("ephemeral scenario cases", () => {
  it("creates and cleans up a freeform RFQ case", async () => {
    const scenario = EVAL_SCENARIOS.find((s) => s.rfq)!;
    const { requestId, ephemeral } = await prepareScenarioCase(db, scenario);
    expect(ephemeral).toBe(true);
    const created = await db.salesRequest.findUnique({ where: { id: requestId } });
    expect(created?.rawBody).toBe(scenario.rfq!.body);
    await db.salesRequest.delete({ where: { id: requestId } });
  });
});
