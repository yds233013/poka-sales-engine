/**
 * Pricing engine.
 *
 * The language model never touches these numbers. Given the same inputs this
 * function returns byte-identical output, which is what makes a quote
 * defensible: the price on the PDF can be re-derived months later from the
 * price book, contract and volume break that were in force.
 *
 * Precedence, best-for-the-customer-wins within policy:
 *   1. Active contract price (a negotiated commitment — always honoured)
 *   2. Price book discount vs. volume break — whichever yields the lower unit
 *      price; they do not stack, because stacking them is how margin leaks
 *   3. List price
 *   4. A manual rep override, which may go below the above but is recorded as
 *      MANUAL so the approval engine can see it
 */

import type { PricedLine, PricingInputs, PriceSource } from "@/lib/domain/types";
import { applyDiscountPct, impliedDiscountPct, type Cents } from "@/lib/money";

export interface VolumeBreak {
  code: string;
  categoryCode: string | null;
  minQty: number;
  discountPct: number;
  description: string;
}

/** Best (highest) volume break whose minimum quantity is met. */
export function selectVolumeBreak(
  quantity: number,
  categoryCode: string,
  breaks: VolumeBreak[],
): VolumeBreak | null {
  const eligible = breaks.filter(
    (b) => quantity >= b.minQty && (b.categoryCode === null || b.categoryCode === categoryCode),
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((best, b) => {
    if (b.discountPct > best.discountPct) return b;
    if (b.discountPct === best.discountPct && b.minQty > best.minQty) return b;
    return best;
  });
}

export function isContractActive(
  effectiveFrom: Date,
  effectiveTo: Date,
  asOf: Date,
): boolean {
  return asOf.getTime() >= effectiveFrom.getTime() && asOf.getTime() <= effectiveTo.getTime();
}

export function priceLine(inputs: PricingInputs): PricedLine {
  const {
    listPriceCents,
    standardCostCents,
    quantity,
    priceBookDiscountPct,
    contractPriceCents,
    contractRef,
    volumeDiscountPct,
    volumeRuleCode,
    manualDiscountPct,
  } = inputs;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`Quantity must be a positive integer, received ${quantity}`);
  }
  if (listPriceCents <= 0) {
    throw new Error(`List price must be positive, received ${listPriceCents}`);
  }

  const considered: PricedLine["considered"] = [
    { source: "LIST", unitPriceCents: listPriceCents, detail: "Published list price" },
  ];

  if (priceBookDiscountPct != null && priceBookDiscountPct > 0) {
    considered.push({
      source: "PRICE_BOOK",
      unitPriceCents: applyDiscountPct(listPriceCents, priceBookDiscountPct),
      detail: `Customer price book, ${priceBookDiscountPct}% off list`,
    });
  }
  if (volumeDiscountPct != null && volumeDiscountPct > 0) {
    considered.push({
      source: "VOLUME_BREAK",
      unitPriceCents: applyDiscountPct(listPriceCents, volumeDiscountPct),
      detail: `Volume break ${volumeRuleCode ?? ""} at ${quantity} units, ${volumeDiscountPct}% off list`.trim(),
    });
  }
  if (contractPriceCents != null && contractPriceCents > 0) {
    considered.push({
      source: "CONTRACT",
      unitPriceCents: contractPriceCents,
      detail: `Contract ${contractRef ?? "—"}`,
    });
  }

  let chosen = considered[0];

  const contract = considered.find((c) => c.source === "CONTRACT");
  if (contract) {
    // A contract is a commitment: it is used even if a volume break would have
    // been cheaper for us to give, and even if it is above the book price.
    chosen = contract;
  } else {
    // Price book and volume break compete; they never stack.
    const competing = considered.filter(
      (c) => c.source === "PRICE_BOOK" || c.source === "VOLUME_BREAK",
    );
    for (const candidate of competing) {
      if (candidate.unitPriceCents < chosen.unitPriceCents) chosen = candidate;
    }
  }

  let unitPriceCents: Cents = chosen.unitPriceCents;
  let priceSource: PriceSource = chosen.source;
  let priceSourceDetail = chosen.detail;

  if (manualDiscountPct != null && manualDiscountPct > 0) {
    const manualPrice = applyDiscountPct(listPriceCents, manualDiscountPct);
    considered.push({
      source: "MANUAL",
      unitPriceCents: manualPrice,
      detail: `Manual override, ${manualDiscountPct}% off list`,
    });
    // A manual override applies whenever the rep entered one — including an
    // override that is *worse* for the customer, which is a legitimate move on
    // a low-margin line. The approval engine sees the source either way.
    unitPriceCents = manualPrice;
    priceSource = "MANUAL";
    priceSourceDetail = `Manual override, ${manualDiscountPct}% off list`;
  }

  if (unitPriceCents < 0) throw new Error("Computed unit price is negative");

  const extendedCents = unitPriceCents * quantity;
  const extendedCostCents = standardCostCents * quantity;

  return {
    quantity,
    listPriceCents,
    unitPriceCents,
    discountPct: impliedDiscountPct(listPriceCents, unitPriceCents),
    priceSource,
    priceSourceDetail,
    extendedCents,
    unitCostCents: standardCostCents,
    extendedCostCents,
    considered,
  };
}

export interface QuoteTotals {
  subtotalCents: Cents;
  listTotalCents: Cents;
  discountTotalCents: Cents;
  freightCents: Cents;
  totalCents: Cents;
  costTotalCents: Cents;
  /** Effective blended discount across all lines. */
  effectiveDiscountPct: number;
}

/**
 * Sum priced lines into quote totals.
 *
 * Every total is derived from the lines — nothing is stored independently and
 * hoped to agree later. `assertTotalsConsistent` re-checks the arithmetic
 * before a quote is persisted.
 */
export function computeQuoteTotals(lines: PricedLine[], freightCents: Cents): QuoteTotals {
  if (freightCents < 0) throw new Error("Freight cannot be negative");
  const subtotalCents = lines.reduce((s, l) => s + l.extendedCents, 0);
  const listTotalCents = lines.reduce((s, l) => s + l.listPriceCents * l.quantity, 0);
  const costTotalCents = lines.reduce((s, l) => s + l.extendedCostCents, 0);
  const discountTotalCents = listTotalCents - subtotalCents;

  return {
    subtotalCents,
    listTotalCents,
    discountTotalCents,
    freightCents,
    totalCents: subtotalCents + freightCents,
    costTotalCents,
    effectiveDiscountPct: impliedDiscountPct(listTotalCents, subtotalCents),
  };
}

/** Structural guard against a quote whose parts do not add up to its total. */
export function assertTotalsConsistent(lines: PricedLine[], totals: QuoteTotals): void {
  const subtotal = lines.reduce((s, l) => s + l.extendedCents, 0);
  if (subtotal !== totals.subtotalCents) {
    throw new Error(`Quote subtotal ${totals.subtotalCents} does not match line sum ${subtotal}`);
  }
  if (totals.subtotalCents + totals.freightCents !== totals.totalCents) {
    throw new Error(
      `Quote total ${totals.totalCents} ≠ subtotal ${totals.subtotalCents} + freight ${totals.freightCents}`,
    );
  }
  for (const line of lines) {
    if (line.unitPriceCents * line.quantity !== line.extendedCents) {
      throw new Error(
        `Line extended ${line.extendedCents} ≠ unit ${line.unitPriceCents} × qty ${line.quantity}`,
      );
    }
  }
}
