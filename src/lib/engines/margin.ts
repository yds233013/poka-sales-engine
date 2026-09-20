/**
 * Margin engine.
 *
 * Freight on this quote is a **pass-through**: the customer is billed exactly
 * what the carrier charges (see `engines/freight.ts` — no markup is applied),
 * and that charge appears as its own line on the quotation. So freight
 * contributes revenue and cost in equal measure and nets to zero in the
 * margin:
 *
 *     gross margin      = goods revenue − goods cost
 *     gross margin %    = gross margin ÷ (goods revenue + freight billed)
 *
 * Subtracting the freight cost while ignoring the freight revenue — which an
 * earlier version of this file did — understates every deal by the whole
 * freight charge. On a long-haul split that is several points of margin, which
 * is enough to manufacture a policy breach that does not exist and escalate a
 * commercial director over an arithmetic artefact.
 *
 * Two percentages are reported because they answer different questions:
 * `productMarginPct` is how well the goods were sold; `marginPct` is what the
 * deal is worth against everything invoiced, which is how it lands on the P&L.
 */

import type { MarginResult } from "@/lib/domain/types";
import { pctOf, type Cents } from "@/lib/money";

export function computeMargin(
  goodsRevenueCents: Cents,
  goodsCostCents: Cents,
  freightCents: Cents,
): MarginResult {
  if (goodsRevenueCents < 0 || goodsCostCents < 0 || freightCents < 0) {
    throw new Error("Margin inputs cannot be negative");
  }

  const marginCents = goodsRevenueCents - goodsCostCents;
  const invoicedCents = goodsRevenueCents + freightCents;

  return {
    revenueCents: goodsRevenueCents,
    costCents: goodsCostCents,
    freightCostCents: freightCents,
    marginCents,
    marginPct: pctOf(marginCents, invoicedCents),
    productMarginCents: marginCents,
    productMarginPct: pctOf(marginCents, goodsRevenueCents),
  };
}
