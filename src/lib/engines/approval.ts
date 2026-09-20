/**
 * Approval policy engine.
 *
 * Evaluates a finished deal against written policy and returns the set of
 * approvals a human must grant before the quote can be sent. The engine is
 * pure: it looks at numbers and verdicts, never at model output.
 *
 * Two rules are enforced structurally elsewhere but originate here:
 *   - `canAutoRelease` is false whenever any requirement exists, and the quote
 *     release path calls it rather than re-deriving the condition.
 *   - A margin below the hard floor produces a requirement that no role can
 *     approve in-app (`ADMIN`), so the deal cannot be released by the sales
 *     manager who created it.
 */

import type {
  ApprovalKind,
  ApprovalRequirement,
  CompatibilityVerdict,
  FulfillmentPlan,
  MarginResult,
  PolicyThresholds,
  RiskLevel,
} from "@/lib/domain/types";
import { formatCurrency, formatPct, type Cents } from "@/lib/money";

export const DEFAULT_THRESHOLDS: PolicyThresholds = {
  maxDiscountPct: 18,
  minMarginPct: 22,
  largeQuoteCents: 5_000_000, // $50,000
  hardMarginFloorPct: 8,
  maxFactoryUnits: 250,
};

export interface ApprovalEvaluationInput {
  thresholds: PolicyThresholds;
  effectiveDiscountPct: number;
  margin: MarginResult;
  quoteTotalCents: Cents;
  /** Compatibility verdict of the product actually being quoted. */
  verdict?: CompatibilityVerdict | null;
  /** True when the quoted SKU is not the SKU the customer asked for. */
  isSubstitution: boolean;
  substitutedFromSku?: string | null;
  substitutedToSku?: string | null;
  plan?: FulfillmentPlan | null;
  freightExpedited: boolean;
  /** True when no service level reaches the site by the requested date. */
  freightMissesDeadline?: boolean;
  /** Estimated arrival and the date the customer asked for, when both exist. */
  estimatedArrival?: Date | null;
  requiredBy?: Date | null;
  freightCents: Cents;
  /** Requirements the extraction step could not resolve. */
  unresolvedRequirements: string[];
  /**
   * Requirements derived from the part the customer already runs rather than
   * stated by them. They are enforced as hard constraints, so an approver
   * needs to see which ones the selection actually rests on.
   */
  inferredRequirements?: string[];
}

function discountRequirement(
  input: ApprovalEvaluationInput,
): ApprovalRequirement | null {
  const { effectiveDiscountPct, thresholds } = input;
  if (effectiveDiscountPct <= thresholds.maxDiscountPct) return null;
  return {
    kind: "DISCOUNT_THRESHOLD",
    requiredRole: "SALES_MANAGER",
    title: `Discount ${formatPct(effectiveDiscountPct)} exceeds the ${formatPct(thresholds.maxDiscountPct, 0)} policy limit`,
    reason: `The blended discount on this quote is ${formatPct(effectiveDiscountPct)}. Policy allows a sales representative to release up to ${formatPct(thresholds.maxDiscountPct, 0)} without sign-off.`,
    proposedAction: `Release the quote at ${formatPct(effectiveDiscountPct)} off list.`,
    commercialImpact: `Quote value ${formatCurrency(input.quoteTotalCents)}; gross margin ${formatPct(input.margin.marginPct)}.`,
    technicalImpact: "None — this is a commercial threshold only.",
    riskNote:
      "Discount precedent. Once granted, the customer will expect the same level on repeat orders of this line.",
    context: {
      effectiveDiscountPct,
      policyLimitPct: thresholds.maxDiscountPct,
      quoteTotalCents: input.quoteTotalCents,
    },
  };
}

function marginRequirement(input: ApprovalEvaluationInput): ApprovalRequirement | null {
  const { margin, thresholds } = input;
  if (margin.marginPct >= thresholds.minMarginPct) return null;

  const belowHardFloor = margin.marginPct < thresholds.hardMarginFloorPct;
  return {
    kind: "MARGIN_FLOOR",
    requiredRole: belowHardFloor ? "ADMIN" : "SALES_MANAGER",
    title: belowHardFloor
      ? `Gross margin ${formatPct(margin.marginPct)} is below the ${formatPct(thresholds.hardMarginFloorPct, 0)} hard floor`
      : `Gross margin ${formatPct(margin.marginPct)} is below the ${formatPct(thresholds.minMarginPct, 0)} policy minimum`,
    reason: belowHardFloor
      ? `Margin of ${formatPct(margin.marginPct)} falls under the hard floor of ${formatPct(thresholds.hardMarginFloorPct, 0)}. Deals under the floor require commercial director sign-off, not sales management.`
      : `Margin of ${formatPct(margin.marginPct)} falls under the policy minimum of ${formatPct(thresholds.minMarginPct, 0)}.`,
    proposedAction: `Release the quote at ${formatCurrency(input.quoteTotalCents)} yielding ${formatCurrency(margin.marginCents)} gross margin.`,
    commercialImpact: `Goods revenue ${formatCurrency(margin.revenueCents)} against ${formatCurrency(margin.costCents)} cost, giving ${formatCurrency(margin.marginCents)} — ${formatPct(margin.productMarginPct)} on the goods. Freight of ${formatCurrency(margin.freightCostCents)} is billed at cost and carries no margin, so the figure against total invoiced value is ${formatPct(margin.marginPct)}.`,
    technicalImpact: "None — this is a commercial threshold only.",
    riskNote: belowHardFloor
      ? "Below-floor deals are loss-leading after selling cost. Requires an explicit strategic reason."
      : "Sub-target margin. Confirm the account justifies it before releasing.",
    context: {
      marginPct: margin.marginPct,
      policyMinimumPct: thresholds.minMarginPct,
      hardFloorPct: thresholds.hardMarginFloorPct,
      marginCents: margin.marginCents,
      freightCostCents: margin.freightCostCents,
    },
  };
}

function substitutionRequirement(
  input: ApprovalEvaluationInput,
): ApprovalRequirement | null {
  if (!input.isSubstitution) return null;
  const warnings = input.verdict?.warnings ?? [];
  const unknowns = input.verdict?.unknowns ?? [];
  const clean = warnings.length === 0 && unknowns.length === 0;

  // A clean, fully-verified substitution is still a change to what the
  // customer asked for, but it does not need an engineer — a sales manager
  // acknowledging the swap is proportionate.
  return {
    kind: clean ? "TECHNICAL_SUBSTITUTION" : "COMPATIBILITY_WARNING",
    requiredRole: clean ? "SALES_MANAGER" : "APPLICATION_ENGINEER",
    title: clean
      ? `Substituting ${input.substitutedToSku} for the requested ${input.substitutedFromSku}`
      : `Substitution ${input.substitutedFromSku} → ${input.substitutedToSku} carries ${warnings.length + unknowns.length} open technical point(s)`,
    reason: clean
      ? `The customer asked for ${input.substitutedFromSku}. Every hard compatibility requirement is satisfied by ${input.substitutedToSku}, but the quoted part differs from the request.`
      : `${input.substitutedToSku} passes all hard requirements, but the following need an engineer's judgement: ${[...warnings, ...unknowns]
          .map((c) => `${c.label} (${c.result.toLowerCase()})`)
          .join(", ")}.`,
    proposedAction: `Quote ${input.substitutedToSku} in place of ${input.substitutedFromSku}.`,
    commercialImpact: `Quote value ${formatCurrency(input.quoteTotalCents)} at ${formatPct(input.margin.marginPct)} margin.`,
    technicalImpact: [
      clean
        ? "All hard compatibility checks pass against the extracted requirements."
        : [...warnings, ...unknowns].map((c) => `${c.label}: ${c.detail}`).join(" "),
      input.inferredRequirements && input.inferredRequirements.length > 0
        ? `Note that ${input.inferredRequirements.length} of those requirements were derived from the ${input.substitutedFromSku} rather than stated by the customer (${input.inferredRequirements.join(", ")}). If anything about the installation has changed, the selection changes with it.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    riskNote: clean
      ? "Customer may have a qualification or spare-parts reason for the original part number."
      : "An unverified dimension on a process pump can mean a failed installation and a warranty claim. Confirm against the site's actual duty conditions.",
    context: {
      from: input.substitutedFromSku,
      to: input.substitutedToSku,
      warnings: warnings.map((w) => ({ label: w.label, detail: w.detail })),
      unknowns: unknowns.map((u) => ({ label: u.label, detail: u.detail })),
      inferredRequirements: input.inferredRequirements ?? [],
    },
  };
}

function warningRequirement(input: ApprovalEvaluationInput): ApprovalRequirement | null {
  // Only raised when the product is NOT a substitution — a substituted part
  // already carries its own requirement covering the same warnings.
  if (input.isSubstitution) return null;
  const warnings = input.verdict?.warnings ?? [];
  const unknowns = input.verdict?.unknowns ?? [];
  if (warnings.length === 0 && unknowns.length === 0) return null;

  return {
    kind: "COMPATIBILITY_WARNING",
    requiredRole: "APPLICATION_ENGINEER",
    title: `${warnings.length + unknowns.length} technical point(s) need engineering review`,
    reason: [...warnings, ...unknowns]
      .map((c) => `${c.label}: ${c.detail}`)
      .join(" "),
    proposedAction: "Confirm the selection is valid for the customer's actual duty conditions.",
    commercialImpact: `Quote value ${formatCurrency(input.quoteTotalCents)}.`,
    technicalImpact: [...warnings, ...unknowns].map((c) => `${c.label}: ${c.actual} against ${c.requirement}`).join("; "),
    riskNote:
      "Proceeding without resolving these means the recommendation rests on data the system could not verify.",
    context: {
      warnings: warnings.map((w) => ({ label: w.label, detail: w.detail })),
      unknowns: unknowns.map((u) => ({ label: u.label, detail: u.detail })),
    },
  };
}

function freightRequirement(input: ApprovalEvaluationInput): ApprovalRequirement | null {
  if (!input.freightExpedited) return null;
  return {
    kind: "EXPEDITED_FREIGHT",
    requiredRole: "SALES_MANAGER",
    title: `Expedited freight of ${formatCurrency(input.freightCents)} required to hit the delivery date`,
    reason:
      "Ground service would arrive after the customer's requested date, so the quote is rated at an expedited service level.",
    proposedAction: `Absorb ${formatCurrency(input.freightCents)} of expedited freight into the quote.`,
    commercialImpact: `Freight is billed to the customer at cost, so it carries no margin: the extra ${formatCurrency(input.freightCents)} lands on the customer's invoice, not on ours. Deal margin is ${formatPct(input.margin.marginPct)}.`,
    technicalImpact: "None.",
    riskNote:
      "If the customer will accept a later date, ground service recovers the freight difference.",
    context: { freightCents: input.freightCents, marginPct: input.margin.marginPct },
  };
}

/**
 * The quote will arrive after the date the customer gave.
 *
 * This used to surface only as a side effect of a freight upgrade, which meant
 * a lane with no expedited service produced a letter promising a late date
 * with nobody in the loop. Lateness is a commitment a person makes, not a
 * calculation, so it gets its own requirement.
 */
function deadlineRequirement(input: ApprovalEvaluationInput): ApprovalRequirement | null {
  const late =
    input.freightMissesDeadline === true ||
    input.plan?.meetsDeadline === false ||
    Boolean(
      input.estimatedArrival &&
        input.requiredBy &&
        input.estimatedArrival.getTime() > input.requiredBy.getTime(),
    );
  if (!late) return null;

  const arrival = input.estimatedArrival?.toISOString().slice(0, 10) ?? "an unconfirmed date";
  const wanted = input.requiredBy?.toISOString().slice(0, 10) ?? "the requested date";

  return {
    kind: "DELIVERY_DATE_MISS",
    requiredRole: "SALES_MANAGER",
    title: `Estimated delivery ${arrival} is after the customer's date of ${wanted}`,
    reason: `No combination of stock and service level puts this on site by ${wanted}. The earliest realistic arrival is ${arrival}.`,
    proposedAction: `Offer ${arrival} and confirm the customer can accept it.`,
    commercialImpact: `Quote value ${formatCurrency(input.quoteTotalCents)}. A missed date on a shutdown or outage is usually a lost order rather than a late one.`,
    technicalImpact: "None — this is an availability constraint.",
    riskNote:
      "Sending a quotation that silently misses a stated deadline is how a customer finds out on the day. Agree the date before the quote goes out.",
    context: {
      estimatedArrival: input.estimatedArrival?.toISOString() ?? null,
      requiredBy: input.requiredBy?.toISOString() ?? null,
      shortfall: input.plan?.shortfall ?? 0,
    },
  };
}

function largeValueRequirement(input: ApprovalEvaluationInput): ApprovalRequirement | null {
  if (input.quoteTotalCents <= input.thresholds.largeQuoteCents) return null;
  return {
    kind: "LARGE_QUOTE_VALUE",
    requiredRole: "SALES_MANAGER",
    title: `Quote value ${formatCurrency(input.quoteTotalCents)} exceeds the ${formatCurrency(input.thresholds.largeQuoteCents)} review threshold`,
    reason:
      "Quotes above the review threshold are checked for credit exposure and delivery commitment before release.",
    proposedAction: `Release a ${formatCurrency(input.quoteTotalCents)} quote.`,
    commercialImpact: `Gross margin ${formatCurrency(input.margin.marginCents)} (${formatPct(input.margin.marginPct)}).`,
    technicalImpact: "None.",
    riskNote: "Confirm credit limit headroom and that the delivery plan is realistic at this size.",
    context: { quoteTotalCents: input.quoteTotalCents },
  };
}

function splitRequirement(input: ApprovalEvaluationInput): ApprovalRequirement | null {
  const plan = input.plan;
  if (!plan || !plan.isSplit) return null;
  return {
    kind: "SPLIT_FULFILLMENT",
    requiredRole: "SALES_MANAGER",
    title: `Order ships from ${new Set(plan.allocations.map((a) => a.warehouseCode)).size} locations`,
    reason: `No single location holds ${plan.requestedQty} units. The plan draws on ${plan.allocations
      .map((a) => `${a.quantity} from ${a.warehouseCode}`)
      .join(", ")}.`,
    proposedAction: "Commit to a split shipment with separately rated freight legs.",
    commercialImpact: `Multi-leg freight of ${formatCurrency(input.freightCents)} is absorbed in the quote.`,
    technicalImpact: "None — identical part number from each location.",
    riskNote:
      "Customer receiving goods in two deliveries may raise a receiving or installation scheduling issue.",
    context: {
      allocations: plan.allocations.map((a) => ({
        warehouse: a.warehouseCode,
        quantity: a.quantity,
        source: a.source,
      })),
    },
  };
}

function uncertaintyRequirement(input: ApprovalEvaluationInput): ApprovalRequirement | null {
  if (input.unresolvedRequirements.length === 0) return null;
  return {
    kind: "TECHNICAL_UNCERTAINTY",
    requiredRole: "APPLICATION_ENGINEER",
    title: `${input.unresolvedRequirements.length} requirement(s) could not be resolved from the request`,
    reason: `The request does not state: ${input.unresolvedRequirements.join(", ")}. These were not guessed.`,
    proposedAction: "Confirm the missing values with the customer or accept the selection as-is.",
    commercialImpact: "None until the quote is released.",
    technicalImpact: "Selection is based on incomplete duty data.",
    riskNote: "Selecting on incomplete duty data is the most common cause of a returned pump.",
    context: { unresolved: input.unresolvedRequirements },
  };
}

/**
 * Evaluate a deal and return every approval it needs. Order is stable:
 * technical requirements first, then commercial.
 */
export function evaluateApprovals(input: ApprovalEvaluationInput): ApprovalRequirement[] {
  const evaluators = [
    substitutionRequirement,
    warningRequirement,
    uncertaintyRequirement,
    deadlineRequirement,
    marginRequirement,
    discountRequirement,
    largeValueRequirement,
    freightRequirement,
    splitRequirement,
  ];

  const out: ApprovalRequirement[] = [];
  const seen = new Set<ApprovalKind>();
  for (const evaluate of evaluators) {
    const requirement = evaluate(input);
    if (!requirement) continue;
    if (seen.has(requirement.kind)) continue;
    seen.add(requirement.kind);
    out.push(requirement);
  }
  return out;
}

/**
 * The single source of truth for "can this quote go out without a human?".
 * Callers must use this rather than re-deriving the condition.
 */
export function canAutoRelease(requirements: ApprovalRequirement[]): boolean {
  return requirements.length === 0;
}

/** Risk level shown on the inbox row, derived from the same evaluation. */
export function deriveRisk(
  requirements: ApprovalRequirement[],
  verdict?: CompatibilityVerdict | null,
): RiskLevel {
  if (verdict?.safety === "BLOCKED") return "BLOCKED";
  if (requirements.length === 0) return "LOW";
  const highKinds: ApprovalKind[] = [
    "MARGIN_FLOOR",
    "COMPATIBILITY_WARNING",
    "TECHNICAL_UNCERTAINTY",
    "DELIVERY_DATE_MISS",
  ];
  if (requirements.some((r) => highKinds.includes(r.kind))) return "HIGH";
  return "MEDIUM";
}

/**
 * Structural guard: throws if a quote is released while approvals are open.
 * Called by the release action, not by the UI, so the rule holds regardless
 * of which surface triggers it.
 */
export function assertReleaseAllowed(
  openApprovals: { id: string; status: string; title: string }[],
): void {
  const blocking = openApprovals.filter(
    (a) => a.status === "PENDING" || a.status === "CHANGES_REQUESTED",
  );
  if (blocking.length > 0) {
    throw new Error(
      `Cannot release: ${blocking.length} approval(s) still open — ${blocking.map((a) => a.title).join("; ")}`,
    );
  }
  if (openApprovals.some((a) => a.status === "REJECTED")) {
    throw new Error("Cannot release: an approval on this quote was rejected.");
  }
}
