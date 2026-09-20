/**
 * Margin engine.
 *
 * Freight is treated as a cost of sale rather than a marked-up revenue line.
 * That is a deliberate policy choice for this build: it means a long-haul
 * split shipment genuinely erodes deal margin, which is the behaviour the
 * approval engine needs to see.
 */

import type { MarginResult } from "@/lib/domain/types";
import { pctOf, type Cents } from "@/lib/money";

export function computeMargin(
  revenueCents: Cents,
  productCostCents: Cents,
  freightCostCents: Cents,
): MarginResult {
  if (revenueCents < 0 || productCostCents < 0 || freightCostCents < 0) {
    throw new Error("Margin inputs cannot be negative");
  }
  const productMarginCents = revenueCents - productCostCents;
  const marginCents = revenueCents - productCostCents - freightCostCents;
  const totalRevenue = revenueCents + freightCostCents;

  return {
    revenueCents,
    costCents: productCostCents,
    freightCostCents,
    marginCents,
    // Margin percent is taken against total invoiced value (goods + freight),
    // which is how the deal actually lands on the P&L.
    marginPct: pctOf(marginCents, totalRevenue),
    productMarginCents,
    productMarginPct: pctOf(productMarginCents, revenueCents),
  };
}
