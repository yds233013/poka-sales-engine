import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

// The lab actions call revalidatePath, which needs a Next request scope.
// Stubbing it lets the action logic be tested for what it actually does.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { db } from "../support/db";
import { runInLab } from "@/app/agent-lab/actions";

const created: string[] = [];

afterEach(async () => {
  const labCases = await db.salesRequest.findMany({ where: { reference: { startsWith: "LAB-" } } });
  const ids = [...created.splice(0), ...labCases.map((c) => c.id)];
  if (ids.length > 0) await db.salesRequest.deleteMany({ where: { id: { in: ids } } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("agent lab run console", () => {
  it("runs a seeded scenario deterministically", async () => {
    const result = await runInLab({ mode: "DETERMINISTIC", scenarioId: "hero-substitution" });
    expect(result.ok).toBe(true);
    expect(result.requestId).toBeTruthy();
    expect(result.runId).toBeTruthy();

    const run = await db.agentRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(run.mode).toBe("DETERMINISTIC");
  }, 60_000);

  it("creates and runs a custom request against a real account", async () => {
    const result = await runInLab({
      mode: "DETERMINISTIC",
      customRfq: {
        accountNumber: "ACC-10044",
        subject: "Custom lab request",
        body: "Please quote 4 x PX-440 for the Dallas plant. Duty is 180 C thermal fluid, DN50, 460 V 3 phase.",
      },
    });
    expect(result.ok).toBe(true);
    const request = await db.salesRequest.findUniqueOrThrow({ where: { id: result.requestId! } });
    expect(request.reference).toMatch(/^LAB-/);
    created.push(request.id);
  }, 60_000);

  it("refuses adaptive mode when no provider is configured, without pretending", async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const result = await runInLab({ mode: "ADAPTIVE_AGENT", scenarioId: "hero-substitution" });
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/unavailable|no model provider/i);
      expect(result.runId).toBeNull();
      // Crucially it does not quietly run the deterministic pipeline instead.
      expect(result.requestId).toBeNull();
    } finally {
      if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it("rejects an unknown account and an unknown scenario", async () => {
    const badAccount = await runInLab({
      mode: "DETERMINISTIC",
      customRfq: { accountNumber: "ACC-99999", subject: "Valid subject", body: "y".repeat(40) },
    });
    expect(badAccount.ok).toBe(false);
    expect(badAccount.message).toMatch(/No account/);

    const badScenario = await runInLab({ mode: "DETERMINISTIC", scenarioId: "not-a-scenario" });
    expect(badScenario.ok).toBe(false);
  });

  it("rejects a request body too short to investigate, with a readable message", async () => {
    const result = await runInLab({
      mode: "DETERMINISTIC",
      customRfq: { accountNumber: "ACC-10044", subject: "Hi", body: "too short" },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/cannot be run/);
    // Not a raw ZodError dump.
    expect(result.message).not.toMatch(/^\[/);
    expect(result.message).toMatch(/subject|body/);
  });
});
