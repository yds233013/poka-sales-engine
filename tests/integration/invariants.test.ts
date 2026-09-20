import { afterAll, describe, expect, it } from "vitest";
import { db } from "../support/db";

/**
 * Whole-database invariants.
 *
 * These are the claims the product makes about itself, checked against every
 * row the seed produced rather than against one hand-picked case. If any of
 * them can be broken, the application is not trustworthy regardless of how the
 * individual scenarios look.
 */

afterAll(async () => {
  await db.$disconnect();
});

describe("quote arithmetic", () => {
  it("every quote total equals its own lines plus freight", async () => {
    const quotes = await db.quote.findMany({ include: { items: true } });
    expect(quotes.length).toBeGreaterThan(0);

    for (const quote of quotes) {
      const cents = (v: { toString(): string }) => Math.round(Number(v.toString()) * 100);
      const lineSum = quote.items.reduce((s, i) => s + cents(i.extended), 0);
      expect(lineSum, `subtotal of ${quote.quoteNumber}`).toBe(cents(quote.subtotal));
      expect(cents(quote.subtotal) + cents(quote.freightCost), `total of ${quote.quoteNumber}`).toBe(
        cents(quote.total),
      );

      for (const item of quote.items) {
        expect(cents(item.unitPrice) * item.quantity, `line ${item.lineNumber} of ${quote.quoteNumber}`).toBe(
          cents(item.extended),
        );
        expect(item.quantity).toBeGreaterThan(0);
        expect(Number(item.unitPrice)).toBeGreaterThan(0);
        expect(Number(item.unitPrice)).toBeLessThanOrEqual(Number(item.listPrice));
      }
    }
  });

  it("every quote's margin equals goods revenue minus goods cost", async () => {
    const quotes = await db.quote.findMany();
    for (const quote of quotes) {
      const cents = (v: { toString(): string }) => Math.round(Number(v.toString()) * 100);
      // Freight is billed at cost, so it contributes to neither side.
      expect(cents(quote.marginAmount), `margin of ${quote.quoteNumber}`).toBe(
        cents(quote.subtotal) - cents(quote.costTotal),
      );
      // And the stated percentage is that margin over everything invoiced.
      const expectedPct =
        Math.round(
          (cents(quote.marginAmount) / (cents(quote.subtotal) + cents(quote.freightCost))) * 10000,
        ) / 100;
      expect(Number(quote.marginPct), `margin % of ${quote.quoteNumber}`).toBeCloseTo(expectedPct, 1);
    }
  });

  it("no quote is priced below cost without an admin-level approval on it", async () => {
    const quotes = await db.quote.findMany({ include: { approvals: true } });
    for (const quote of quotes) {
      if (Number(quote.marginPct) >= 8) continue;
      expect(
        quote.approvals.some((a) => a.requiredRole === "ADMIN"),
        `${quote.quoteNumber} is below the hard floor without commercial director sign-off`,
      ).toBe(true);
    }
  });
});

describe("inventory honesty", () => {
  it("no quote line allocates more than available-to-promise plus confirmed inbound", async () => {
    const items = await db.quoteItem.findMany({
      include: {
        product: { include: { inventory: { include: { warehouse: true, incoming: true } } } },
        quote: true,
      },
    });
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      const allocations = item.allocations as { warehouseCode: string; quantity: number; source: string }[];
      expect(allocations.reduce((s, a) => s + a.quantity, 0)).toBe(item.quantity);

      for (const allocation of allocations) {
        if (allocation.source === "FACTORY") continue;
        const position = item.product.inventory.find((i) => i.warehouse.code === allocation.warehouseCode);
        expect(position, `${item.product.sku} allocated from unknown ${allocation.warehouseCode}`).toBeDefined();
        const ceiling =
          Math.max(0, position!.onHand - position!.reserved) +
          position!.incoming.filter((i) => i.confirmed).reduce((s, i) => s + i.quantity, 0);
        expect(
          allocation.quantity,
          `${item.product.sku} at ${allocation.warehouseCode} on ${item.quote.quoteNumber}`,
        ).toBeLessThanOrEqual(ceiling);
      }
    }
  });
});

describe("technical safety", () => {
  it("no recommended candidate carries a failed hard requirement", async () => {
    const winners = await db.recommendationCandidate.findMany({
      where: { verdict: "RECOMMENDED" },
      include: { checks: true, product: true },
    });
    expect(winners.length).toBeGreaterThan(0);
    for (const winner of winners) {
      const hardFailures = winner.checks.filter((c) => c.result === "FAIL" && c.severity === "HARD");
      expect(hardFailures, `${winner.product.sku} was recommended despite a hard failure`).toHaveLength(0);
    }
  });

  it("every quoted product was the recommended candidate on its case", async () => {
    const quotes = await db.quote.findMany({
      include: {
        items: { include: { product: true } },
        request: {
          include: {
            recommendations: {
              include: { candidates: { include: { product: true } } },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    for (const quote of quotes) {
      const recommendation = quote.request.recommendations[0];
      const winner = recommendation.candidates.find((c) => c.verdict === "RECOMMENDED");
      expect(winner).toBeDefined();
      const mainLine = quote.items.find((i) => i.productId === winner!.productId);
      expect(mainLine, `${quote.quoteNumber} does not quote its own recommended part`).toBeDefined();
    }
  });

  it("every rejected candidate carries an explanation of why", async () => {
    const rejected = await db.recommendationCandidate.findMany({
      where: { verdict: "REJECTED" },
      include: { checks: true },
    });
    expect(rejected.length).toBeGreaterThan(10);
    for (const candidate of rejected) {
      expect(candidate.reason.length).toBeGreaterThan(20);
      const explains =
        candidate.checks.some((c) => c.result === "FAIL") || /shortfall|only \d+ of \d+/.test(candidate.reason);
      expect(explains, `candidate ${candidate.id} was rejected with no stated cause`).toBe(true);
    }
  });

  it("every compatibility check states both sides of the comparison", async () => {
    const checks = await db.candidateCheck.findMany({ take: 500 });
    for (const check of checks) {
      expect(check.requirement.length).toBeGreaterThan(0);
      expect(check.actual.length).toBeGreaterThan(0);
      expect(check.detail.length).toBeGreaterThan(10);
    }
  });
});

describe("evidence", () => {
  it("every document citation resolves to a real seeded section", async () => {
    const evidence = await db.evidence.findMany({
      where: { kind: "document" },
      include: { section: { include: { document: true } } },
    });
    expect(evidence.length).toBeGreaterThan(20);
    for (const item of evidence) {
      expect(item.section, `evidence ${item.id} cites a document section that does not exist`).not.toBeNull();
      expect(item.section!.body.length).toBeGreaterThan(20);
    }
  });

  it("a spec citation agrees with the catalog value it claims", async () => {
    // Pick the temperature claims and check each against the product row.
    const evidence = await db.evidence.findMany({
      where: { claim: { contains: "fluid temperature" } },
      take: 40,
    });
    expect(evidence.length).toBeGreaterThan(0);

    for (const item of evidence) {
      const match = /^([A-Z0-9-]+) fluid temperature: (\d+(?:\.\d+)?) °C/.exec(item.claim);
      if (!match) continue;
      const spec = await db.productSpec.findFirst({
        where: { key: "max_fluid_temp_c", product: { sku: match[1] } },
      });
      expect(spec, `claim cites unknown SKU ${match[1]}`).not.toBeNull();
      expect(Number(spec!.numValue), `claim about ${match[1]} disagrees with the catalog`).toBe(
        Number(match[2]),
      );
    }
  });
});

describe("customer-facing output", () => {
  it("no customer response contains an internal commercial figure", async () => {
    const responses = await db.customerResponse.findMany({ include: { request: { include: { quotes: true } } } });
    expect(responses.length).toBeGreaterThan(0);

    for (const response of responses) {
      const text = `${response.subject} ${response.body}`.toLowerCase();
      expect(text, `response on ${response.requestId} mentions margin`).not.toMatch(
        /\bmargin\b|\bgross profit\b|\bstandard cost\b|\bour cost\b|\bcost of goods\b|\bmark-?up\b/,
      );

      // And the literal cost figure must not appear either.
      for (const quote of response.request.quotes) {
        const cost = Number(quote.costTotal).toLocaleString("en-US", { minimumFractionDigits: 2 });
        expect(response.body).not.toContain(cost);
      }
    }
  });

  it("no customer response exists for a case with an open approval", async () => {
    const requests = await db.salesRequest.findMany({
      include: { approvals: true, responses: true, quotes: true },
    });
    for (const request of requests) {
      const open = request.approvals.filter((a) => a.status === "PENDING" || a.status === "CHANGES_REQUESTED");
      if (open.length === 0) continue;
      // A blocked or information-required case has a response but no quote —
      // that is a clarification letter, not an offer, and it is allowed.
      if (request.quotes.length === 0) continue;
      expect(
        request.responses,
        `${request.reference} has a customer draft while ${open.length} approval(s) are open`,
      ).toHaveLength(0);
    }
  });

  it("a quote is only marked sent on a case that was actually closed", async () => {
    const quotes = await db.quote.findMany({ include: { request: true } });
    for (const quote of quotes) {
      if (quote.status !== "SENT") continue;
      expect(quote.request.status, `${quote.quoteNumber} is sent on an open case`).toBe("COMPLETED");
    }
  });

  it("no released quote exists on a case with an open approval", async () => {
    const quotes = await db.quote.findMany({ include: { approvals: true } });
    for (const quote of quotes) {
      if (quote.status !== "APPROVED" && quote.status !== "SENT") continue;
      const open = quote.approvals.filter((a) => a.status === "PENDING" || a.status === "CHANGES_REQUESTED");
      expect(open, `${quote.quoteNumber} was released with approvals outstanding`).toHaveLength(0);
    }
  });
});

describe("audit trail", () => {
  it("every case that produced a recommendation says so on the record", async () => {
    const requests = await db.salesRequest.findMany({
      include: { recommendations: true, auditEvents: true },
    });
    for (const request of requests) {
      if (request.recommendations.length === 0) continue;
      const types = request.auditEvents.map((e) => e.type);
      expect(types, `${request.reference} has no run-started event`).toContain("RUN_STARTED");
      expect(
        types.some((t) =>
          ["RECOMMENDATION_GENERATED", "RECOMMENDATION_BLOCKED", "INFORMATION_REQUESTED"].includes(t),
        ),
        `${request.reference} has no recommendation outcome event`,
      ).toBe(true);
    }
  });

  it("every approval decision is attributed to a named person", async () => {
    const decided = await db.approval.findMany({
      where: { status: { in: ["APPROVED", "REJECTED", "CHANGES_REQUESTED"] } },
      include: { decidedBy: true },
    });
    expect(decided.length).toBeGreaterThan(0);
    for (const approval of decided) {
      expect(approval.decidedBy, `approval ${approval.id} has no decider`).not.toBeNull();
      expect(approval.decidedAt).not.toBeNull();
    }
  });
});
