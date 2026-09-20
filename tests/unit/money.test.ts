import { describe, expect, it } from "vitest";
import {
  applyDiscountPct,
  impliedDiscountPct,
  pctOf,
  roundCents,
  toCents,
  centsToNumber,
  formatCurrency,
} from "@/lib/money";

describe("money", () => {
  it("converts dollars to integer cents without float drift", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents("8483.20")).toBe(848320);
    expect(toCents(1234.565)).toBe(123457);
  });

  it("rejects values that are not finite", () => {
    expect(() => toCents(Number.NaN)).toThrow();
    expect(() => toCents("not a number")).toThrow();
  });

  it("rounds away from zero symmetrically", () => {
    expect(roundCents(2.5)).toBe(3);
    expect(roundCents(-2.5)).toBe(-3);
  });

  it("applies a discount with a single rounding point", () => {
    expect(applyDiscountPct(964000, 12)).toBe(848320);
    // 12% then 8% must NOT equal 20% — discounts are never stacked by callers,
    // and this documents why that matters.
    expect(applyDiscountPct(applyDiscountPct(100000, 12), 8)).not.toBe(
      applyDiscountPct(100000, 20),
    );
  });

  it("refuses a discount outside 0-100", () => {
    expect(() => applyDiscountPct(1000, -1)).toThrow();
    expect(() => applyDiscountPct(1000, 101)).toThrow();
  });

  it("derives the implied discount from list and unit price", () => {
    expect(impliedDiscountPct(964000, 848320)).toBe(12);
    expect(impliedDiscountPct(0, 100)).toBe(0);
  });

  it("treats a zero denominator as zero percent rather than NaN", () => {
    expect(pctOf(100, 0)).toBe(0);
  });

  it("round-trips through the display format", () => {
    expect(formatCurrency(848320)).toBe("$8,483.20");
    expect(centsToNumber(848320)).toBe(8483.2);
  });
});
