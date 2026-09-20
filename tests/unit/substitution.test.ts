import { describe, expect, it } from "vitest";
import { rankCandidates, scoreCandidate, selectedCandidate, type RankableCandidate } from "@/lib/engines/substitution";
import { toCents } from "@/lib/money";
import type { CompatibilityVerdict, FulfillmentPlan } from "@/lib/domain/types";
import { MONDAY } from "../support/factories";
import { addBusinessDays } from "@/lib/engines/inventory";

function verdict(safety: CompatibilityVerdict["safety"], score = 90, extras: Partial<CompatibilityVerdict> = {}): CompatibilityVerdict {
  return {
    productId: "p",
    sku: "X",
    safety,
    checks: [],
    hardFailures: safety === "BLOCKED" ? [
      {
        dimension: "temperature",
        label: "Fluid temperature",
        result: "FAIL",
        severity: "HARD",
        requirement: "at least 180 °C",
        actual: "120 °C",
        detail: "Too cold.",
      },
    ] : [],
    warnings: [],
    unknowns: [],
    score: safety === "BLOCKED" ? 0 : score,
    ...extras,
  };
}

function plan(overrides: Partial<FulfillmentPlan> = {}): FulfillmentPlan {
  return {
    requestedQty: 10,
    allocatedQty: 10,
    shortfall: 0,
    canFulfill: true,
    isSplit: false,
    allocations: [
      { warehouseCode: "DAL", warehouseName: "Dallas", quantity: 10, source: "STOCK", readyDate: MONDAY },
    ],
    readyDate: MONDAY,
    meetsDeadline: true,
    notes: [],
    ...overrides,
  };
}

function candidate(sku: string, overrides: Partial<RankableCandidate> = {}): RankableCandidate {
  return {
    productId: `p-${sku}`,
    sku,
    name: `${sku} pump`,
    verdict: overrides.verdict ?? verdict("AUTO_SAFE"),
    linkKind: overrides.linkKind ?? null,
    linkNote: overrides.linkNote ?? null,
    requiresAccessorySku: overrides.requiresAccessorySku ?? null,
    unitPriceCents: overrides.unitPriceCents ?? toCents(9000),
    referencePriceCents: overrides.referencePriceCents ?? toCents(9000),
    plan: overrides.plan ?? plan(),
    leadTimeDays: overrides.leadTimeDays ?? 30,
    isExactMatch: overrides.isExactMatch ?? false,
  };
}

describe("candidate ranking", () => {
  it("never selects a candidate that failed a hard requirement", () => {
    const ranked = rankCandidates([
      candidate("AX-220", { verdict: verdict("BLOCKED"), isExactMatch: true }),
      candidate("PX-440"),
    ]);
    expect(ranked.find((r) => r.sku === "AX-220")!.verdictLabel).toBe("REJECTED");
    expect(selectedCandidate(ranked)!.sku).toBe("PX-440");
  });

  it("scores a blocked candidate at zero regardless of everything else", () => {
    expect(
      scoreCandidate(candidate("AX-220", { verdict: verdict("BLOCKED"), isExactMatch: true })),
    ).toBe(0);
  });

  it("prefers the option that meets the customer's date over a better technical fit", () => {
    const ranked = rankCandidates([
      // Technically stronger and cheaper, but late.
      candidate("PX-422", {
        verdict: verdict("AUTO_SAFE", 100),
        unitPriceCents: toCents(8000),
        plan: plan({ meetsDeadline: false }),
      }),
      candidate("PX-440", { verdict: verdict("AUTO_SAFE", 84) }),
    ]);
    expect(selectedCandidate(ranked)!.sku).toBe("PX-440");
    expect(ranked[1].sku).toBe("PX-422");
  });

  it("prefers the exact part the customer asked for, all else equal", () => {
    const ranked = rankCandidates([
      candidate("PX-440"),
      candidate("VS-250", { isExactMatch: true }),
    ]);
    expect(selectedCandidate(ranked)!.sku).toBe("VS-250");
  });

  it("promotes a candidate that only carries warnings, and keeps the warning visible", () => {
    const warned = verdict("NEEDS_REVIEW", 71, {
      warnings: [
        {
          dimension: "seal",
          label: "Seal / elastomer",
          result: "WARNING",
          severity: "SOFT",
          requirement: "PTFE",
          actual: "EPDM",
          detail: "differs",
        },
      ],
    });
    const ranked = rankCandidates([
      candidate("DG-52", { verdict: warned, linkKind: "ALTERNATE" }),
      candidate("DG-50", { isExactMatch: true, plan: plan({ meetsDeadline: false }) }),
    ]);
    const winner = selectedCandidate(ranked)!;
    expect(winner.sku).toBe("DG-52");
    expect(winner.reason).toMatch(/1 warning/);
  });

  it("never promotes a candidate that cannot cover the quantity", () => {
    const ranked = rankCandidates([
      candidate("PX-440", { plan: plan({ canFulfill: false, allocatedQty: 4, shortfall: 6 }) }),
    ]);
    expect(selectedCandidate(ranked)).toBeNull();
  });

  it("rejects a candidate that cannot be sourced at all", () => {
    const ranked = rankCandidates([
      candidate("PX-440", {
        plan: plan({ canFulfill: false, allocatedQty: 0, shortfall: 10, allocations: [] }),
      }),
    ]);
    expect(ranked[0].verdictLabel).toBe("REJECTED");
    expect(ranked[0].reason).toMatch(/only 0 of 10/);
  });

  it("returns nothing selectable when every candidate is blocked", () => {
    const ranked = rankCandidates([
      candidate("A", { verdict: verdict("BLOCKED") }),
      candidate("B", { verdict: verdict("BLOCKED") }),
    ]);
    expect(selectedCandidate(ranked)).toBeNull();
    expect(ranked.every((r) => r.verdictLabel === "REJECTED")).toBe(true);
  });

  it("orders rejects by how close they came", () => {
    const twoFailures = verdict("BLOCKED");
    twoFailures.hardFailures = [...twoFailures.hardFailures, { ...twoFailures.hardFailures[0], dimension: "material", label: "Wetted material" }];
    const ranked = rankCandidates([
      candidate("FAR", { verdict: twoFailures }),
      candidate("NEAR", { verdict: verdict("BLOCKED") }),
    ]);
    expect(ranked[0].sku).toBe("NEAR");
  });

  it("penalises a materially more expensive alternative", () => {
    const cheap = scoreCandidate(candidate("A", { unitPriceCents: toCents(9000), referencePriceCents: toCents(9000) }));
    const pricey = scoreCandidate(candidate("B", { unitPriceCents: toCents(13400), referencePriceCents: toCents(9000) }));
    expect(pricey).toBeLessThan(cheap);
  });

  it("penalises a factory build and an inbound receipt against ready stock", () => {
    const stock = scoreCandidate(candidate("A"));
    const factory = scoreCandidate(
      candidate("B", {
        plan: plan({
          allocations: [
            { warehouseCode: "FACTORY", warehouseName: "Factory", quantity: 10, source: "FACTORY", readyDate: addBusinessDays(MONDAY, 30) },
          ],
        }),
      }),
    );
    expect(factory).toBeLessThan(stock);
  });

  it("penalises a selection that needs an adapter", () => {
    const plain = scoreCandidate(candidate("A"));
    const adapted = scoreCandidate(candidate("B", { requiresAccessorySku: "FA-4050" }));
    expect(adapted).toBeLessThan(plain);
  });

  it("throws if a blocked candidate is somehow marked recommended", () => {
    const ranked = rankCandidates([candidate("PX-440")]);
    ranked[0].verdict = verdict("BLOCKED");
    expect(() => selectedCandidate(ranked)).toThrow(/invariant violated/);
  });

  it("produces a stable ranking for identical inputs", () => {
    const build = () => [candidate("A"), candidate("B"), candidate("C")];
    expect(rankCandidates(build()).map((r) => r.sku)).toEqual(
      rankCandidates(build()).map((r) => r.sku),
    );
  });
});
