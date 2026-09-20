/**
 * Substitution engine.
 *
 * Candidate discovery is curated-first: engineering maintains explicit
 * replacement links, and those are evaluated before the engine falls back to
 * scanning the category. Category membership alone is never a reason to offer
 * a part — every candidate, curated or not, goes through the compatibility
 * engine before it can be ranked.
 *
 * Ranking only ever orders candidates that already cleared every hard rule.
 * A BLOCKED candidate is retained in the result set (the UI shows rejected
 * options and why) but can never be selected.
 */

import type {
  CompatibilityVerdict,
  FulfillmentPlan,
  SubstitutionKind,
} from "@/lib/domain/types";
import type { Cents } from "@/lib/money";

export interface RankableCandidate {
  productId: string;
  sku: string;
  name: string;
  verdict: CompatibilityVerdict;
  /** Curated relationship to the requested part, when one exists. */
  linkKind?: SubstitutionKind | null;
  linkNote?: string | null;
  requiresAccessorySku?: string | null;
  unitPriceCents: Cents;
  /** Price of the part the customer originally asked for, for comparison. */
  referencePriceCents?: Cents | null;
  plan: FulfillmentPlan;
  leadTimeDays: number;
  isExactMatch: boolean;
}

export type CandidateVerdict = "RECOMMENDED" | "VIABLE" | "REJECTED" | "REQUIRES_REVIEW";

export interface RankedCandidate extends RankableCandidate {
  verdictLabel: CandidateVerdict;
  /**
   * True when the promoted candidate still carries warnings or unverified
   * dimensions. Promotion overwrites the label with RECOMMENDED, and without
   * this the UI would show a selection with open technical points as though
   * it were clean.
   */
  hasOpenPoints: boolean;
  rank: number;
  score: number;
  reason: string;
}

const LINK_BONUS: Record<SubstitutionKind, number> = {
  DIRECT_REPLACEMENT: 22,
  SUCCESSOR: 18,
  UPGRADE: 10,
  ALTERNATE: 6,
  ACCESSORY_REQUIRED: 2,
};

/**
 * Score a candidate that has already passed every hard requirement.
 *
 * Deliberately weighted toward "can we actually deliver this": a part that is
 * technically perfect but arrives three weeks late is worse for the customer
 * than a slightly pricier one sitting in the local warehouse.
 */
export function scoreCandidate(candidate: RankableCandidate): number {
  if (candidate.verdict.safety === "BLOCKED") return 0;

  let score = candidate.verdict.score; // 0-100 from the compatibility matrix

  if (candidate.isExactMatch) score += 30;
  if (candidate.linkKind) score += LINK_BONUS[candidate.linkKind];

  // Deliverability.
  if (candidate.plan.canFulfill) score += 20;
  else score -= 25;
  if (candidate.plan.meetsDeadline === true) score += 18;
  if (candidate.plan.meetsDeadline === false) score -= 30;
  if (candidate.plan.isSplit) score -= 6;
  if (candidate.plan.allocations.some((a) => a.source === "FACTORY")) score -= 12;
  if (candidate.plan.allocations.some((a) => a.source === "INCOMING")) score -= 6;

  // Commercial: penalise a materially pricier part relative to the incumbent.
  if (candidate.referencePriceCents && candidate.referencePriceCents > 0) {
    const deltaPct =
      ((candidate.unitPriceCents - candidate.referencePriceCents) /
        candidate.referencePriceCents) *
      100;
    if (deltaPct > 0) score -= Math.min(20, deltaPct * 0.45);
    else score += Math.min(6, -deltaPct * 0.1);
  }

  if (candidate.requiresAccessorySku) score -= 8;

  return Math.round(score * 100) / 100;
}

function plural(count: number, noun: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? noun : (pluralForm ?? `${noun}s`)}`;
}

function describe(candidate: RankableCandidate, label: CandidateVerdict): string {
  const v = candidate.verdict;
  if (label === "REJECTED") {
    const reasons = v.hardFailures.map((f) => `${f.label.toLowerCase()} — ${f.actual} vs required ${f.requirement}`);
    if (reasons.length > 0) {
      return `Rejected: ${reasons.join("; ")}.`;
    }
    if (!candidate.plan.canFulfill) {
      return `Rejected: only ${candidate.plan.allocatedQty} of ${candidate.plan.requestedQty} units can be sourced.`;
    }
    return "Rejected: does not meet a hard requirement.";
  }

  const parts: string[] = [];
  if (candidate.isExactMatch) parts.push("Exact part requested");
  else if (candidate.linkKind) {
    parts.push(
      candidate.linkKind === "DIRECT_REPLACEMENT"
        ? "Engineering-approved direct replacement"
        : candidate.linkKind === "SUCCESSOR"
          ? "Factory successor to the requested part"
          : candidate.linkKind === "UPGRADE"
            ? "Higher-rated part from the same family"
            : candidate.linkKind === "ACCESSORY_REQUIRED"
              ? "Compatible with an adapter"
              : "Alternate from the same family",
    );
  } else {
    parts.push("Catalog match on the extracted requirements");
  }

  parts.push(`${v.checks.filter((c) => c.result === "PASS").length} checks pass`);

  if (candidate.plan.canFulfill) {
    parts.push(
      candidate.plan.isSplit
        ? `${candidate.plan.requestedQty} units available across ${new Set(candidate.plan.allocations.map((a) => a.warehouseCode)).size} locations`
        : `${candidate.plan.requestedQty} units available from ${candidate.plan.allocations[0]?.warehouseCode ?? "stock"}`,
    );
  } else {
    parts.push(`${plural(candidate.plan.shortfall, "unit")} short`);
  }

  if (candidate.plan.meetsDeadline === false) parts.push("misses the requested date");
  if (v.warnings.length > 0) parts.push(plural(v.warnings.length, "warning"));
  if (v.unknowns.length > 0) parts.push(plural(v.unknowns.length, "unverified dimension"));
  if (candidate.requiresAccessorySku) parts.push(`requires ${candidate.requiresAccessorySku}`);

  return `${parts.join("; ")}.`;
}

/**
 * Classify and order candidates.
 *
 * A candidate is REJECTED if a hard rule failed or it cannot be sourced at
 * all. It is REQUIRES_REVIEW if it is technically viable but carries a
 * warning or an unverified dimension. Exactly one candidate may be
 * RECOMMENDED, and only if nothing blocks it.
 */
export function rankCandidates(candidates: RankableCandidate[]): RankedCandidate[] {
  const scored: { candidate: RankableCandidate; score: number; label: CandidateVerdict }[] = candidates.map((candidate) => {
    const blocked = candidate.verdict.safety === "BLOCKED";
    const unsourceable = candidate.plan.allocatedQty === 0;
    const score = blocked || unsourceable ? 0 : scoreCandidate(candidate);

    let label: CandidateVerdict;
    if (blocked || unsourceable) label = "REJECTED";
    else if (candidate.verdict.safety === "NEEDS_REVIEW") label = "REQUIRES_REVIEW";
    else label = "VIABLE";

    return { candidate, score, label };
  });

  scored.sort((a, b) => {
    const band = deliverabilityBand(a) - deliverabilityBand(b);
    if (band !== 0) return band;
    if (a.label === "REJECTED") {
      // Among rejects, show the near-misses first: an operator scanning the
      // list wants "this one failed on a single dimension" at the top, and an
      // engineering-linked part ahead of an incidental catalog match.
      const failDelta = a.candidate.verdict.hardFailures.length - b.candidate.verdict.hardFailures.length;
      if (failDelta !== 0) return failDelta;
      const linkDelta = (a.candidate.linkKind ? 0 : 1) - (b.candidate.linkKind ? 0 : 1);
      if (linkDelta !== 0) return linkDelta;
      return a.candidate.sku.localeCompare(b.candidate.sku);
    }
    if (b.score !== a.score) return b.score - a.score;
    return a.candidate.sku.localeCompare(b.candidate.sku);
  });

  // Promote the best selectable candidate.
  //
  // Deliverability is ranked above technical score on purpose. A part that
  // arrives after the date the customer gave is not the recommendation, even
  // if it is the better engineering fit — the operator should see that trade
  // explicitly rather than have it buried in a score. A candidate that cannot
  // cover the quantity at all is never promoted.
  const winner =
    scored.find((s) => deliverabilityBand(s) === 0) ?? scored.find((s) => deliverabilityBand(s) === 1);
  const winnerNeededReview = winner?.label === "REQUIRES_REVIEW";
  if (winner) winner.label = "RECOMMENDED";

  return scored.map((s, index) => ({
    ...s.candidate,
    verdictLabel: s.label,
    hasOpenPoints:
      s === winner
        ? winnerNeededReview
        : s.label === "REQUIRES_REVIEW",
    rank: index + 1,
    score: s.score,
    reason: describe(s.candidate, s.label === "RECOMMENDED" ? "VIABLE" : s.label),
  }));
}

/**
 * 0 — usable and lands inside the customer's date (or no date was given)
 * 1 — usable but late
 * 2 — technically usable but cannot cover the quantity
 * 3 — rejected outright
 */
function deliverabilityBand(entry: { candidate: RankableCandidate; label: CandidateVerdict }): number {
  if (entry.label === "REJECTED") return 3;
  if (!entry.candidate.plan.canFulfill) return 2;
  return entry.candidate.plan.meetsDeadline === false ? 1 : 0;
}

/** The single candidate a quote may be built from, or null. */
export function selectedCandidate(ranked: RankedCandidate[]): RankedCandidate | null {
  const chosen = ranked.find((r) => r.verdictLabel === "RECOMMENDED") ?? null;
  if (chosen && chosen.verdict.safety === "BLOCKED") {
    throw new Error(
      `Internal invariant violated: ${chosen.sku} was selected despite a hard compatibility failure`,
    );
  }
  return chosen;
}
