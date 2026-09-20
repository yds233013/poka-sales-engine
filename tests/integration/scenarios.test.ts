import { afterAll, describe, expect, it } from "vitest";
import { db } from "../support/db";

/**
 * The seeded scenarios are not fixtures with baked-in answers — the seed runs
 * the real orchestrator. These assertions therefore check that the engines,
 * against the real catalog and stock table, still reach the conclusions the
 * demo depends on.
 */

afterAll(async () => {
  await db.$disconnect();
});

async function load(reference: string) {
  return db.salesRequest.findFirstOrThrow({
    where: { reference },
    include: {
      requirements: true,
      approvals: true,
      responses: true,
      quotes: { include: { items: { include: { product: true } } } },
      recommendations: {
        include: { candidates: { include: { product: true, checks: true }, orderBy: { rank: "asc" } } },
      },
      runs: { include: { toolCalls: true } },
    },
  });
}

describe("seeded demo scenarios", () => {
  it("REQ-2038 — exact SKU with stock clears policy and needs no approval", async () => {
    const request = await load("REQ-2038");
    expect(request.recommendations[0].outcome).toBe("EXACT_MATCH");
    expect(request.approvals).toHaveLength(0);
    expect(request.status).toBe("RESPONSE_READY");
    expect(request.responses.length).toBeGreaterThan(0);
  });

  it("REQ-2041 — the requested part fails on temperature and a substitute is proposed", async () => {
    const request = await load("REQ-2041");
    const recommendation = request.recommendations[0];
    expect(recommendation.outcome).toBe("SUBSTITUTE");

    const requested = recommendation.candidates.find((c) => c.product.sku === "AX-220")!;
    expect(requested.verdict).toBe("REJECTED");
    expect(
      requested.checks.some((c) => c.dimension === "temperature" && c.result === "FAIL" && c.severity === "HARD"),
    ).toBe(true);

    const winner = recommendation.candidates.find((c) => c.verdict === "RECOMMENDED")!;
    expect(winner.product.sku).toBe("PX-440");
    expect(winner.checks.every((c) => c.result !== "FAIL")).toBe(true);

    // The alternatives that were ruled out each carry a concrete reason.
    const rejected = recommendation.candidates.filter((c) => c.verdict === "REJECTED");
    expect(rejected.length).toBeGreaterThan(3);
    expect(rejected.every((c) => c.reason.length > 20)).toBe(true);
  });

  it("REQ-2041 — infers connection, material, voltage and footprint from the incumbent", async () => {
    const request = await load("REQ-2041");
    const inferred = request.requirements.filter((r) => r.kind === "INFERRED").map((r) => r.key);
    expect(inferred).toEqual(
      expect.arrayContaining(["inlet_connection", "wetted_material", "motor_voltage", "length_mm"]),
    );
  });

  it("REQ-2035 — several options are technically valid but only one meets the date", async () => {
    const request = await load("REQ-2035");
    const candidates = request.recommendations[0].candidates;
    const clean = candidates.filter((c) => c.checks.every((k) => k.result !== "FAIL"));
    expect(clean.length).toBeGreaterThan(3);

    const winner = candidates.find((c) => c.verdict === "RECOMMENDED")!;
    expect(winner.product.sku).toBe("PX-440");

    // Every other technically-valid option is late.
    const otherValid = clean.filter((c) => c.id !== winner.id);
    expect(otherValid.length).toBeGreaterThan(0);
    expect(otherValid.every((c) => c.reason.includes("misses the requested date"))).toBe(true);
  });

  it("REQ-2030 — a deep standing discount drags margin under policy and routes approvals", async () => {
    const request = await load("REQ-2030");
    const quote = request.quotes[0];
    expect(Number(quote.marginPct)).toBeLessThan(22);

    const kinds = request.approvals.map((a) => a.kind).sort();
    expect(kinds).toEqual(["DISCOUNT_THRESHOLD", "LARGE_QUOTE_VALUE", "MARGIN_FLOOR"]);
    expect(quote.status).toBe("PENDING_APPROVAL");
    expect(request.status).toBe("READY_FOR_APPROVAL");
  });

  it("REQ-2026 — an unmeetable hard requirement blocks the case with no quote", async () => {
    const request = await load("REQ-2026");
    expect(request.recommendations[0].outcome).toBe("NO_VIABLE_OPTION");
    expect(request.status).toBe("BLOCKED");
    expect(request.risk).toBe("BLOCKED");
    expect(request.quotes).toHaveLength(0);
    expect(request.recommendations[0].candidates.every((c) => c.verdict === "REJECTED")).toBe(true);
    expect(request.blockedReason).toMatch(/hard requirement/i);
  });

  it("REQ-2026 — the nearest alloy match is evaluated and rejected on its own merits", async () => {
    const request = await load("REQ-2026");
    // MX-200 is the only Hastelloy pump in the catalog; it must actually have
    // been considered rather than missed by an alphabetical sweep.
    const hastelloy = request.recommendations[0].candidates.find((c) => c.product.sku === "MX-200");
    expect(hastelloy).toBeDefined();
    expect(hastelloy!.checks.some((c) => c.dimension === "temperature" && c.result === "FAIL")).toBe(true);
  });

  it("REQ-2044 — an ambiguous request asks for what is missing instead of guessing", async () => {
    const request = await load("REQ-2044");
    expect(request.recommendations[0].outcome).toBe("INFORMATION_REQUIRED");
    expect(request.quotes).toHaveLength(0);
    expect(request.recommendations[0].candidates).toHaveLength(0);
    expect(request.responses[0].body).toMatch(/How many units are required\?/);
  });

  it("REQ-2028 — a contract price beats the price book and the split is quoted honestly", async () => {
    const request = await load("REQ-2028");
    const line = request.quotes[0].items[0];
    expect(line.priceSource).toBe("CONTRACT");
    expect(Number(line.unitPrice)).toBe(4250);

    const allocations = line.allocations as { warehouseCode: string; quantity: number }[];
    expect(allocations.length).toBeGreaterThan(1);
    expect(allocations.reduce((s, a) => s + a.quantity, 0)).toBe(line.quantity);
  });

  it("REQ-2032 — a discontinued part is replaced, with the adapter quoted as a line", async () => {
    const request = await load("REQ-2032");
    const candidates = request.recommendations[0].candidates;

    const discontinued = candidates.find((c) => c.product.sku === "RG-100")!;
    expect(discontinued.verdict).toBe("REJECTED");
    expect(discontinued.checks.some((c) => c.dimension === "lifecycle" && c.result === "FAIL")).toBe(true);

    const winner = candidates.find((c) => c.verdict === "RECOMMENDED")!;
    expect(winner.product.sku).toBe("RG-120");
    expect(winner.checks.some((c) => c.dimension === "accessory" && c.result === "WARNING")).toBe(true);

    const skus = request.quotes[0].items.map((i) => i.product.sku);
    expect(skus).toContain("FA-4050");
  });

  it("REQ-2036 — an elastomer difference is surfaced and routed to an engineer", async () => {
    const request = await load("REQ-2036");
    const winner = request.recommendations[0].candidates.find((c) => c.verdict === "RECOMMENDED")!;
    expect(winner.product.sku).toBe("DG-52");
    expect(winner.checks.some((c) => c.dimension === "seal" && c.result === "WARNING")).toBe(true);
    expect(request.approvals.map((a) => a.requiredRole)).toContain("APPLICATION_ENGINEER");
  });

  it("REQ-2019 — a completed case carries a released quote and a full audit trail", async () => {
    const request = await load("REQ-2019");
    expect(request.status).toBe("COMPLETED");
    expect(request.quotes[0].status).toBe("APPROVED");
    const events = await db.auditEvent.findMany({ where: { requestId: request.id } });
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        "REQUEST_RECEIVED",
        "RUN_STARTED",
        "RECOMMENDATION_GENERATED",
        "QUOTE_RELEASED",
        "RESPONSE_GENERATED",
        "CASE_COMPLETED",
      ]),
    );
  });

  it("REQ-2046 — an unworked case has no recommendation, quote or response", async () => {
    const request = await load("REQ-2046");
    expect(request.status).toBe("NEW");
    expect(request.recommendations).toHaveLength(0);
    expect(request.quotes).toHaveLength(0);
    expect(request.responses).toHaveLength(0);
  });

  it("records a usable operational trace on every analysed case", async () => {
    const runs = await db.agentRun.findMany({
      include: { toolCalls: true, request: { include: { quotes: true } } },
    });
    expect(runs.length).toBeGreaterThan(5);

    for (const run of runs) {
      expect(run.status).toBe("COMPLETED");
      // A case that stopped for missing information legitimately has a short
      // trace — it resolved the account and went no further. A case that
      // produced a quote must show the full investigation.
      expect(run.toolCalls.length).toBeGreaterThanOrEqual(1);
      if (run.request.quotes.length > 0) {
        const tools = new Set(run.toolCalls.map((c) => c.toolName));
        expect(tools).toContain("check_compatibility");
        expect(tools).toContain("check_inventory");
        expect(tools).toContain("calculate_price");
        expect(tools).toContain("calculate_freight");
        expect(tools).toContain("check_margin");
        expect(tools).toContain("evaluate_approvals");
      }

      for (const call of run.toolCalls) {
        expect(call.summary.length).toBeGreaterThan(10);
        // The trace must read as operations, never as model reasoning.
        expect(call.summary).not.toMatch(/\b(I think|let me|chain of thought|reasoning:)\b/i);
      }
    }
  });
});
