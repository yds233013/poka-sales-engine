/**
 * The adaptive agent's structured result, and the grounding check that
 * decides whether it is allowed to stand.
 *
 * Two separate ideas live here:
 *
 *   1. **Shape.** A Zod schema, validated — not "please reply in JSON".
 *   2. **Grounding.** Every factual claim is checked against investigation
 *      state, which only tool results can write. The model may explain what
 *      the engines found. It may not add to it.
 *
 * Grounding failures are not silently repaired. An ungrounded claim downgrades
 * the run to internal review, because a recommendation nobody can trace is
 * worth less than no recommendation.
 */

import { z } from "zod";
import { TERMINATION_STATUSES, type InvestigationState } from "./state";

export const agentOutcomeSchema = z.object({
  caseId: z.string(),
  status: z.enum(TERMINATION_STATUSES),
  resolvedCustomer: z.string().nullable(),
  resolvedProduct: z.string().nullable(),
  /** Parts evaluated and ruled out, with the reason. */
  alternatives: z
    .array(z.object({ sku: z.string(), verdict: z.string(), reason: z.string().max(400) }))
    .max(20),
  technicalEvidence: z.array(z.string().max(200)).max(20),
  missingInformation: z.array(z.string().max(300)).max(10),
  riskFlags: z.array(z.string().max(200)).max(10),
  recommendationSummary: z.string().min(20).max(2000),
});

export type AgentOutcome = z.infer<typeof agentOutcomeSchema>;

export interface GroundingIssue {
  kind: "UNKNOWN_SKU" | "UNCHECKED_COMPATIBILITY" | "UNGROUNDED_INVENTORY" | "UNGROUNDED_PRICE" | "UNGROUNDED_EVIDENCE";
  detail: string;
}

/** Currency amounts, e.g. `$8,483.20`. */
const MONEY = /\$[\d,]+(?:\.\d{2})?/g;
/** Bare quantity claims like "12 units", "8 in stock", "15 available". */
const STOCK_CLAIM = /\b(\d{1,5})\s+(?:units?|pumps?|pieces?)\s+(?:are\s+)?(?:in stock|available|on hand)\b/gi;
/**
 * Document citations, e.g. `DS-1020 §2.1`.
 *
 * The anchor pattern is written so it cannot swallow a sentence-ending period:
 * `[\d.]+` would turn "…per DS-1020 §2.1." into the anchor "2.1.", and a
 * perfectly good citation would then be reported as fabricated.
 */
const CITATION = /\b([A-Z]{2}-\d{4})\s*§\s*(\d+(?:\.\d+)*)/g;

/**
 * Check a proposed outcome against what was actually established.
 *
 * The checks are deliberately conservative: they look for the specific shapes
 * of claim this domain gets burned by — a price, a stock figure, a citation,
 * a part number — rather than trying to verify prose in general.
 */
export function checkGrounding(
  outcome: AgentOutcome,
  state: InvestigationState,
  knownSkus: Set<string>,
): GroundingIssue[] {
  const issues: GroundingIssue[] = [];
  const prose = [
    outcome.recommendationSummary,
    ...outcome.alternatives.map((a) => a.reason),
    ...outcome.riskFlags,
  ].join("\n");

  // 1. Part numbers must exist in the catalog.
  const citedSkus = new Set(
    [...prose.matchAll(/\b([A-Z]{2,3}-\d{2,4}(?:-[A-Z]{1,2})?)\b/g)].map((m) => m[1].toUpperCase()),
  );
  for (const sku of [outcome.resolvedProduct, ...outcome.alternatives.map((a) => a.sku)]) {
    if (sku) citedSkus.add(sku.toUpperCase());
  }
  for (const sku of citedSkus) {
    if (!knownSkus.has(sku)) {
      issues.push({ kind: "UNKNOWN_SKU", detail: `"${sku}" is not a catalog part number.` });
    }
  }

  // 2. A recommended product must have been through the compatibility engine.
  if (outcome.resolvedProduct) {
    const sku = outcome.resolvedProduct.toUpperCase();
    const finding = state.compatibility.find((c) => c.sku === sku);
    if (!finding) {
      issues.push({
        kind: "UNCHECKED_COMPATIBILITY",
        detail: `${sku} is presented as the recommendation but never went through check_compatibility.`,
      });
    } else if (finding.safety === "BLOCKED") {
      issues.push({
        kind: "UNCHECKED_COMPATIBILITY",
        detail: `${sku} failed a hard requirement (${finding.hardFailures
          .map((f) => f.dimension)
          .join(", ")}) and cannot be recommended.`,
      });
    }
  }

  // 3. A stock claim requires an inventory or fulfillment tool result.
  if (STOCK_CLAIM.test(prose) && state.inventoryChecked.length === 0 && state.fulfillmentPlans.length === 0) {
    issues.push({
      kind: "UNGROUNDED_INVENTORY",
      detail: "The summary states stock availability, but no inventory or fulfillment tool was called.",
    });
  }
  STOCK_CLAIM.lastIndex = 0;

  // 4. A money figure requires a pricing result. Amounts must match one the
  //    pricing engine actually returned — a plausible-looking total is exactly
  //    the failure this is here to catch.
  const amounts = [...prose.matchAll(MONEY)].map((m) => m[0]);
  if (amounts.length > 0) {
    if (state.pricesCalculated.length === 0) {
      issues.push({
        kind: "UNGROUNDED_PRICE",
        detail: `The summary quotes ${amounts[0]}, but calculate_price was never called.`,
      });
    } else {
      const known = new Set(state.pricesCalculated.map((p) => p.unitPrice));
      const unknown = amounts.filter((a) => !known.has(a));
      if (unknown.length > 0 && unknown.length === amounts.length) {
        issues.push({
          kind: "UNGROUNDED_PRICE",
          detail: `None of the amounts in the summary (${unknown.slice(0, 3).join(", ")}) match a price the pricing engine returned.`,
        });
      }
    }
  }

  // 5. A document citation must be one that retrieval actually returned.
  const cited = [...prose.matchAll(CITATION)].map((m) => `${m[1]} §${m[2]}`);
  const retrieved = new Set(state.evidenceCited);
  for (const citation of cited) {
    if (!retrieved.has(citation)) {
      issues.push({
        kind: "UNGROUNDED_EVIDENCE",
        detail: `Citation ${citation} was not returned by any document search in this run.`,
      });
    }
  }

  return issues;
}

/**
 * Strip internal commercial language from anything customer-adjacent.
 * A belt-and-braces echo of the guard in the Anthropic provider.
 */
export const INTERNAL_LANGUAGE = /\bmargin\b|\bgross profit\b|\bstandard cost\b|\bour cost\b|\bcost of goods\b|\bmark-?up\b/i;

export function leaksInternalLanguage(text: string): boolean {
  return INTERNAL_LANGUAGE.test(text);
}
