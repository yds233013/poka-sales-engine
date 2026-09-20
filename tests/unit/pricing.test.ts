import { describe, expect, it } from "vitest";
import {
  assertTotalsConsistent,
  computeQuoteTotals,
  isContractActive,
  priceLine,
  selectVolumeBreak,
  type VolumeBreak,
} from "@/lib/engines/pricing";
import { toCents } from "@/lib/money";

const BREAKS: VolumeBreak[] = [
  { code: "VOL-005", categoryCode: null, minQty: 5, discountPct: 4, description: "" },
  { code: "VOL-010", categoryCode: null, minQty: 10, discountPct: 8, description: "" },
  { code: "VOL-020", categoryCode: null, minQty: 20, discountPct: 12, description: "" },
  { code: "VOL-CPHT-010", categoryCode: "CP-HT", minQty: 10, discountPct: 10, description: "" },
];

const LIST = toCents(9640);
const COST = toCents(5880);

describe("volume breaks", () => {
  it("selects the deepest break the quantity qualifies for", () => {
    expect(selectVolumeBreak(24, "CP-STD", BREAKS)?.code).toBe("VOL-020");
  });
  it("prefers a category-specific break when it is deeper", () => {
    expect(selectVolumeBreak(12, "CP-HT", BREAKS)?.code).toBe("VOL-CPHT-010");
  });
  it("ignores a category break for a different category", () => {
    expect(selectVolumeBreak(12, "CP-STD", BREAKS)?.code).toBe("VOL-010");
  });
  it("returns nothing below the first threshold", () => {
    expect(selectVolumeBreak(4, "CP-STD", BREAKS)).toBeNull();
  });
});

describe("contract validity", () => {
  const from = new Date("2026-01-01T00:00:00Z");
  const to = new Date("2026-12-31T00:00:00Z");
  it("is active inside the window", () => {
    expect(isContractActive(from, to, new Date("2026-06-01T00:00:00Z"))).toBe(true);
  });
  it("is inactive before and after", () => {
    expect(isContractActive(from, to, new Date("2025-06-01T00:00:00Z"))).toBe(false);
    expect(isContractActive(from, to, new Date("2027-06-01T00:00:00Z"))).toBe(false);
  });
});

describe("line pricing", () => {
  it("falls back to list with no terms at all", () => {
    const line = priceLine({ listPriceCents: LIST, standardCostCents: COST, quantity: 3 });
    expect(line.priceSource).toBe("LIST");
    expect(line.unitPriceCents).toBe(LIST);
    expect(line.discountPct).toBe(0);
  });

  it("applies the price book discount", () => {
    const line = priceLine({
      listPriceCents: LIST,
      standardCostCents: COST,
      quantity: 12,
      priceBookDiscountPct: 12,
    });
    expect(line.priceSource).toBe("PRICE_BOOK");
    expect(line.unitPriceCents).toBe(toCents(8483.2));
    expect(line.extendedCents).toBe(toCents(8483.2) * 12);
  });

  it("never stacks the price book and a volume break", () => {
    const line = priceLine({
      listPriceCents: LIST,
      standardCostCents: COST,
      quantity: 12,
      priceBookDiscountPct: 12,
      volumeDiscountPct: 10,
      volumeRuleCode: "VOL-CPHT-010",
    });
    // 12% wins outright; the combined 20.8% is never produced.
    expect(line.discountPct).toBe(12);
    expect(line.priceSource).toBe("PRICE_BOOK");
  });

  it("takes the volume break when it is the better of the two", () => {
    const line = priceLine({
      listPriceCents: LIST,
      standardCostCents: COST,
      quantity: 24,
      priceBookDiscountPct: 8,
      volumeDiscountPct: 12,
      volumeRuleCode: "VOL-020",
    });
    expect(line.priceSource).toBe("VOLUME_BREAK");
    expect(line.discountPct).toBe(12);
  });

  it("honours an active contract even when a book discount would be deeper", () => {
    const line = priceLine({
      listPriceCents: toCents(5180),
      standardCostCents: toCents(3108),
      quantity: 12,
      priceBookDiscountPct: 15,
      contractPriceCents: toCents(4250),
      contractRef: "CTR-BW-2291",
      volumeDiscountPct: 8,
    });
    expect(line.priceSource).toBe("CONTRACT");
    expect(line.unitPriceCents).toBe(toCents(4250));
    expect(line.priceSourceDetail).toContain("CTR-BW-2291");
  });

  it("records every price it considered for the audit trail", () => {
    const line = priceLine({
      listPriceCents: LIST,
      standardCostCents: COST,
      quantity: 12,
      priceBookDiscountPct: 12,
      volumeDiscountPct: 10,
      volumeRuleCode: "VOL-CPHT-010",
    });
    expect(line.considered.map((c) => c.source).sort()).toEqual([
      "LIST",
      "PRICE_BOOK",
      "VOLUME_BREAK",
    ]);
  });

  it("applies a manual override and labels it as one", () => {
    const line = priceLine({
      listPriceCents: LIST,
      standardCostCents: COST,
      quantity: 12,
      priceBookDiscountPct: 12,
      manualDiscountPct: 30,
    });
    expect(line.priceSource).toBe("MANUAL");
    expect(line.discountPct).toBe(30);
  });

  it("rejects an invalid quantity", () => {
    expect(() => priceLine({ listPriceCents: LIST, standardCostCents: COST, quantity: 0 })).toThrow();
    expect(() => priceLine({ listPriceCents: LIST, standardCostCents: COST, quantity: -5 })).toThrow();
    expect(() => priceLine({ listPriceCents: LIST, standardCostCents: COST, quantity: 1.5 })).toThrow();
  });

  it("rejects a non-positive list price", () => {
    expect(() => priceLine({ listPriceCents: 0, standardCostCents: COST, quantity: 1 })).toThrow();
  });

  it("rejects a discount above 100%", () => {
    expect(() =>
      priceLine({ listPriceCents: LIST, standardCostCents: COST, quantity: 1, manualDiscountPct: 120 }),
    ).toThrow();
  });

  it("is reproducible", () => {
    const inputs = {
      listPriceCents: LIST,
      standardCostCents: COST,
      quantity: 12,
      priceBookDiscountPct: 12,
    };
    expect(JSON.stringify(priceLine(inputs))).toBe(JSON.stringify(priceLine(inputs)));
  });
});

describe("quote totals", () => {
  const lines = [
    priceLine({ listPriceCents: LIST, standardCostCents: COST, quantity: 12, priceBookDiscountPct: 12 }),
    priceLine({ listPriceCents: toCents(420), standardCostCents: toCents(210), quantity: 8, priceBookDiscountPct: 8 }),
  ];

  it("derives every total from the lines", () => {
    const totals = computeQuoteTotals(lines, toCents(1010.48));
    expect(totals.subtotalCents).toBe(lines[0].extendedCents + lines[1].extendedCents);
    expect(totals.totalCents).toBe(totals.subtotalCents + totals.freightCents);
    expect(totals.discountTotalCents).toBe(totals.listTotalCents - totals.subtotalCents);
    expect(() => assertTotalsConsistent(lines, totals)).not.toThrow();
  });

  it("rejects negative freight", () => {
    expect(() => computeQuoteTotals(lines, -100)).toThrow();
  });

  it("catches a total that no longer matches its lines", () => {
    const totals = computeQuoteTotals(lines, 0);
    totals.totalCents += 1;
    expect(() => assertTotalsConsistent(lines, totals)).toThrow(/≠ subtotal/);
  });

  it("catches a line whose extended value was tampered with", () => {
    const totals = computeQuoteTotals(lines, 0);
    const broken = [{ ...lines[0], extendedCents: lines[0].extendedCents + 500 }, lines[1]];
    expect(() => assertTotalsConsistent(broken, totals)).toThrow();
  });

  it("produces a zero blended discount when everything is at list", () => {
    const listOnly = [priceLine({ listPriceCents: LIST, standardCostCents: COST, quantity: 2 })];
    expect(computeQuoteTotals(listOnly, 0).effectiveDiscountPct).toBe(0);
  });
});
