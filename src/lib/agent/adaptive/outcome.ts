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
  kind:
    | "UNKNOWN_SKU"
    | "UNCHECKED_COMPATIBILITY"
    | "UNGROUNDED_INVENTORY"
    | "UNGROUNDED_PRICE"
    | "UNGROUNDED_EVIDENCE"
    | "INTERNAL_LANGUAGE_LEAK";
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
export interface GroundingCatalog {
  /** Every part number in the catalog. */
  skus: Set<string>;
  /**
   * Every document number on file. Without this, a correct citation like
   * "DS-1020" is shaped exactly like a part number and gets reported as a
   * fabricated SKU — which would fail the happy path rather than protect it.
   */
  documents: Set<string>;
}

export function checkGrounding(
  outcome: AgentOutcome,
  state: InvestigationState,
  catalog: GroundingCatalog,
): GroundingIssue[] {
  const issues: GroundingIssue[] = [];
  // `missingInformation` is included deliberately: those questions are drafted
  // into the letter that goes to the customer, so an ungrounded part number or
  // price inside one is every bit as damaging as one in the summary.
  const prose = [
    outcome.recommendationSummary,
    ...outcome.alternatives.map((a) => a.reason),
    ...outcome.riskFlags,
    ...outcome.missingInformation,
  ].join("\n");

  // 1. Part-number-shaped tokens must be a real part or a real document.
  const citedTokens = new Set(
    [...prose.matchAll(/\b([A-Z]{2,3}-\d{2,4}(?:-[A-Z]{1,2})?)\b/g)].map((m) => m[1].toUpperCase()),
  );
  for (const token of citedTokens) {
    if (catalog.skus.has(token) || catalog.documents.has(token)) continue;
    issues.push({
      kind: "UNKNOWN_SKU",
      detail: `"${token}" is neither a catalog part number nor a document on file.`,
    });
  }
  // Structured fields are stricter: these are asserted to be products, so a
  // document number is not an acceptable value even though it is on file.
  for (const sku of [outcome.resolvedProduct, ...outcome.alternatives.map((a) => a.sku)]) {
    if (!sku) continue;
    const upper = sku.toUpperCase();
    if (!catalog.skus.has(upper)) {
      issues.push({ kind: "UNKNOWN_SKU", detail: `"${upper}" is not a catalog part number.` });
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

  // 3. A stock claim must match a figure a tool actually returned. Checking
  //    only that *an* inventory tool ran would let "180 units in stock" pass
  //    on the strength of a lookup that said 6 — which is the exact failure
  //    this check exists for.
  STOCK_CLAIM.lastIndex = 0;
  const stockClaims = [...prose.matchAll(STOCK_CLAIM)].map((m) => Number(m[1]));
  STOCK_CLAIM.lastIndex = 0;
  if (stockClaims.length > 0) {
    if (state.inventoryChecked.length === 0 && state.fulfillmentPlans.length === 0) {
      issues.push({
        kind: "UNGROUNDED_INVENTORY",
        detail: "The summary states stock availability, but no inventory or fulfillment tool was called.",
      });
    } else {
      const supported = new Set<number>([
        ...state.inventoryChecked.map((i) => i.totalAvailable),
        ...state.fulfillmentPlans.map((p) => p.allocatedQty),
      ]);
      for (const claim of stockClaims) {
        if (!supported.has(claim)) {
          issues.push({
            kind: "UNGROUNDED_INVENTORY",
            detail: `The summary claims ${claim} units are available; no inventory or fulfillment result returned that figure (saw ${
              [...supported].join(", ") || "none"
            }).`,
          });
        }
      }
    }
  }

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
      // Every figure, not merely one of them. A summary that pairs a real unit
      // price with an invented total is the dangerous case, and an
      // any-one-matches rule would wave it straight through.
      const known = new Set(
        state.pricesCalculated.flatMap((p) => [p.unitPrice, p.listPrice, p.extended, ...p.considered]),
      );
      known.delete("");
      const normalise = (value: string) => value.replace(/\s/g, "");
      const knownNormalised = new Set([...known].map(normalise));
      for (const amount of new Set(amounts)) {
        if (!knownNormalised.has(normalise(amount))) {
          issues.push({
            kind: "UNGROUNDED_PRICE",
            detail: `${amount} does not match any figure the pricing engine returned for this case.`,
          });
        }
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

  // 6. Internal commercial language must not reach anything the customer sees.
  //    Clarification questions are drafted straight into the customer letter.
  for (const question of outcome.missingInformation) {
    if (leaksInternalLanguage(question)) {
      issues.push({
        kind: "INTERNAL_LANGUAGE_LEAK",
        detail: `A question intended for the customer uses internal commercial language: "${question.slice(0, 120)}"`,
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
