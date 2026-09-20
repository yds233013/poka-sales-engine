/**
 * Investigation state.
 *
 * The agent does not reason out of its conversation history. Every fact it has
 * established lives here, written only by tool results, and every transition is
 * validated. That gives three things the transcript cannot:
 *
 *   - **Grounding.** A claim in the final output is checked against this state,
 *     and state entries only exist because a tool produced them.
 *   - **Loop detection.** Repeating a call that added nothing is visible.
 *   - **Truthful traces.** The operator-facing step list is derived from what
 *     actually landed in state, not from what the model said it did.
 */

import { z } from "zod";

export const TERMINATION_STATUSES = [
  "READY_FOR_APPROVAL",
  "READY_TO_DRAFT",
  "NEEDS_CUSTOMER_CLARIFICATION",
  "NEEDS_INTERNAL_REVIEW",
  "BLOCKED_TECHNICAL",
  "GUARDRAIL_STOP",
  "FAILED",
] as const;
export type TerminationStatus = (typeof TERMINATION_STATUSES)[number];

export const compatibilityFindingSchema = z.object({
  sku: z.string(),
  safety: z.enum(["AUTO_SAFE", "NEEDS_REVIEW", "BLOCKED"]),
  hardFailures: z.array(z.object({ dimension: z.string(), required: z.string(), actual: z.string() })),
  warnings: z.array(z.string()),
  passCount: z.number(),
});

export const investigationStateSchema = z.object({
  requestId: z.string(),
  /** Set once resolve_customer has run. */
  customer: z
    .object({ name: z.string(), accountNumber: z.string(), site: z.string().nullable(), freightZone: z.string().nullable() })
    .nullable(),
  /** Requirements as extracted deterministically — never written by the model. */
  requirementsLoaded: z.boolean(),
  quantity: z.number().nullable(),
  /** Part numbers confirmed to exist in the catalog. */
  resolvedSkus: z.array(z.string()),
  /** Part numbers the customer named that do not exist. */
  unresolvedSkus: z.array(z.string()),
  /** Products seen via catalog search or substitute discovery. */
  candidatesConsidered: z.array(z.string()),
  compatibility: z.array(compatibilityFindingSchema),
  inventoryChecked: z.array(z.object({ sku: z.string(), totalAvailable: z.number() })),
  fulfillmentPlans: z.array(
    z.object({
      sku: z.string(),
      canFulfill: z.boolean(),
      isSplit: z.boolean(),
      meetsDeadline: z.boolean().nullable(),
      allocatedQty: z.number(),
    }),
  ),
  /**
   * Every money figure the pricing engine returned, not just the winner. An
   * outcome may legitimately mention the list price it discounted from or the
   * extended total, and grounding has to be able to recognise those.
   */
  pricesCalculated: z.array(
    z.object({
      sku: z.string(),
      unitPrice: z.string(),
      source: z.string(),
      listPrice: z.string(),
      extended: z.string(),
      considered: z.array(z.string()),
    }),
  ),
  /** Document sections retrieved, as `DS-1020 §2.1`. */
  evidenceCited: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export type InvestigationState = z.infer<typeof investigationStateSchema>;

export function emptyState(requestId: string): InvestigationState {
  return {
    requestId,
    customer: null,
    requirementsLoaded: false,
    quantity: null,
    resolvedSkus: [],
    unresolvedSkus: [],
    candidatesConsidered: [],
    compatibility: [],
    inventoryChecked: [],
    fulfillmentPlans: [],
    pricesCalculated: [],
    evidenceCited: [],
    openQuestions: [],
  };
}

const unique = (values: string[]) => [...new Set(values)];

/**
 * Fold a tool result into state.
 *
 * Deliberately total and boring: one switch, no inference, nothing derived
 * from model text. If a tool did not return a fact, the fact does not enter
 * state, and a claim about it will later fail grounding.
 */
export function applyToolResult(
  state: InvestigationState,
  toolName: string,
  output: unknown,
): InvestigationState {
  const next = { ...state };
  const data = (output ?? {}) as Record<string, never>;
  const read = <T>(key: string): T | undefined => (data as Record<string, unknown>)[key] as T | undefined;

  switch (toolName) {
    case "resolve_customer": {
      if (read<boolean>("found")) {
        next.customer = {
          name: read<string>("customerName") ?? "",
          accountNumber: read<string>("accountNumber") ?? "",
          site: read<string>("siteName") ?? null,
          freightZone: read<string>("freightZone") ?? null,
        };
      }
      break;
    }
    case "get_request_state": {
      next.requirementsLoaded = true;
      next.quantity = read<number | null>("quantity") ?? null;
      next.openQuestions = unique([...next.openQuestions, ...(read<string[]>("openQuestions") ?? [])]);
      break;
    }
    case "resolve_sku": {
      const sku = read<string | null>("sku");
      if (read<boolean>("found") && sku) next.resolvedSkus = unique([...next.resolvedSkus, sku]);
      break;
    }
    case "search_catalog": {
      const matches = read<{ sku: string }[]>("matches") ?? [];
      next.candidatesConsidered = unique([...next.candidatesConsidered, ...matches.map((m) => m.sku)]);
      break;
    }
    case "get_product": {
      const sku = read<string | null>("sku");
      if (sku) next.candidatesConsidered = unique([...next.candidatesConsidered, sku]);
      break;
    }
    case "find_substitutes": {
      const curated = read<{ sku: string }[]>("curated") ?? [];
      const screened = read<{ sku: string }[]>("screened") ?? [];
      next.candidatesConsidered = unique([
        ...next.candidatesConsidered,
        ...curated.map((c) => c.sku),
        ...screened.map((s) => s.sku),
      ]);
      break;
    }
    case "search_technical_docs": {
      const sections = read<{ documentNumber: string; anchor: string }[]>("sections") ?? [];
      next.evidenceCited = unique([
        ...next.evidenceCited,
        ...sections.map((s) => `${s.documentNumber} §${s.anchor}`),
      ]);
      break;
    }
    case "check_compatibility": {
      const sku = read<string>("sku");
      if (!sku) break;
      const checks =
        read<{ dimension: string; result: string; severity: string; required: string; actual: string; label: string }[]>(
          "checks",
        ) ?? [];
      const finding = {
        sku,
        safety: (read<string>("safety") ?? "NEEDS_REVIEW") as "AUTO_SAFE" | "NEEDS_REVIEW" | "BLOCKED",
        hardFailures: checks
          .filter((c) => c.result === "FAIL" && c.severity === "HARD")
          .map((c) => ({ dimension: c.dimension, required: c.required, actual: c.actual })),
        warnings: checks.filter((c) => c.result === "WARNING" || c.result === "UNKNOWN").map((c) => c.label),
        passCount: read<number>("passCount") ?? 0,
      };
      next.compatibility = [...next.compatibility.filter((c) => c.sku !== sku), finding];
      next.candidatesConsidered = unique([...next.candidatesConsidered, sku]);
      const evidence = read<{ documentNumber: string | null; anchor: string | null }[]>("evidence") ?? [];
      next.evidenceCited = unique([
        ...next.evidenceCited,
        ...evidence.filter((e) => e.documentNumber).map((e) => `${e.documentNumber} §${e.anchor}`),
      ]);
      break;
    }
    case "get_inventory": {
      const sku = read<string>("sku");
      if (!sku) break;
      next.inventoryChecked = [
        ...next.inventoryChecked.filter((i) => i.sku !== sku),
        { sku, totalAvailable: read<number>("totalAvailable") ?? 0 },
      ];
      break;
    }
    case "build_fulfillment_plan": {
      const sku = read<string>("sku");
      if (!sku) break;
      next.fulfillmentPlans = [
        ...next.fulfillmentPlans.filter((p) => p.sku !== sku),
        {
          sku,
          canFulfill: read<boolean>("canFulfill") ?? false,
          isSplit: read<boolean>("isSplit") ?? false,
          meetsDeadline: read<boolean | null>("meetsDeadline") ?? null,
          allocatedQty: Math.max(0, (read<number>("requestedQty") ?? 0) - (read<number>("shortfall") ?? 0)),
        },
      ];
      break;
    }
    case "calculate_price": {
      const sku = read<string>("sku");
      if (!sku) break;
      next.pricesCalculated = [
        ...next.pricesCalculated.filter((p) => p.sku !== sku),
        {
          sku,
          unitPrice: read<string>("unitPrice") ?? "",
          source: read<string>("priceSource") ?? "",
          listPrice: read<string>("listPrice") ?? "",
          extended: read<string>("extended") ?? "",
          considered: (read<{ unitPrice: string }[]>("considered") ?? []).map((c) => c.unitPrice),
        },
      ];
      break;
    }
    default:
      break;
  }

  return next;
}

/**
 * Preconditions for concluding with a quote draft.
 *
 * The deterministic finalizer will re-check everything anyway; this exists so
 * the agent gets a useful refusal *before* it burns a terminal action, and so
 * "concluded without ever checking compatibility" is impossible rather than
 * merely unlikely.
 */
export function canDraftQuote(
  state: InvestigationState,
  candidateSkus: string[],
): { ok: true } | { ok: false; reason: string } {
  if (!state.customer) {
    return { ok: false, reason: "The account has not been resolved. Call resolve_customer first." };
  }
  if (!state.requirementsLoaded) {
    return { ok: false, reason: "The case requirements have not been read. Call get_request_state first." };
  }
  if (state.quantity === null) {
    return {
      ok: false,
      reason: "No quantity was established for this request, so nothing can be quoted. Use request_clarification.",
    };
  }
  const unchecked = candidateSkus.filter((sku) => !state.compatibility.some((c) => c.sku === sku));
  if (unchecked.length > 0) {
    return {
      ok: false,
      reason: `Compatibility has not been checked for ${unchecked.join(", ")}. Every candidate must go through check_compatibility before it can be quoted.`,
    };
  }
  const blocked = candidateSkus.filter((sku) =>
    state.compatibility.some((c) => c.sku === sku && c.safety === "BLOCKED"),
  );
  if (blocked.length === candidateSkus.length) {
    // Naming the parts and the dimensions they failed on is what lets the
    // model recover — and it is what makes the refusal legible in the trace.
    const detail = blocked
      .map((sku) => {
        const finding = state.compatibility.find((c) => c.sku === sku);
        const dimensions = finding?.hardFailures.map((f) => f.dimension).join(", ");
        return dimensions ? `${sku} (${dimensions})` : sku;
      })
      .join("; ");
    return {
      ok: false,
      reason: `Every candidate failed a hard compatibility requirement — ${detail}. Nothing here can be quoted. Find another candidate, or use escalate_for_review.`,
    };
  }
  return { ok: true };
}

/**
 * The operator-facing step list.
 *
 * Built from state, so it can only describe work that actually happened.
 */
export function narrateState(state: InvestigationState): string[] {
  const steps: string[] = [];
  if (state.customer) steps.push(`Resolved ${state.customer.name}${state.customer.site ? ` — ${state.customer.site}` : ""}`);
  if (state.requirementsLoaded) {
    steps.push(`Read the extracted requirements${state.quantity ? ` (${state.quantity} units)` : ""}`);
  }
  if (state.resolvedSkus.length > 0) steps.push(`Confirmed part number(s) ${state.resolvedSkus.join(", ")}`);
  if (state.unresolvedSkus.length > 0) steps.push(`Could not resolve ${state.unresolvedSkus.join(", ")}`);
  if (state.candidatesConsidered.length > 0) {
    steps.push(`Considered ${state.candidatesConsidered.length} candidate product(s)`);
  }
  if (state.evidenceCited.length > 0) steps.push(`Retrieved ${state.evidenceCited.length} document section(s)`);
  for (const finding of state.compatibility) {
    steps.push(
      finding.safety === "BLOCKED"
        ? `Eliminated ${finding.sku} — ${finding.hardFailures.map((f) => f.dimension).join(", ")}`
        : `Validated ${finding.sku} (${finding.passCount} checks pass${finding.warnings.length ? `, ${finding.warnings.length} warning(s)` : ""})`,
    );
  }
  for (const plan of state.fulfillmentPlans) {
    steps.push(
      plan.canFulfill
        ? `Planned fulfillment for ${plan.sku}${plan.isSplit ? " across multiple locations" : ""}`
        : `${plan.sku} cannot cover the requested quantity`,
    );
  }
  for (const price of state.pricesCalculated) steps.push(`Priced ${price.sku} via ${price.source.toLowerCase()}`);
  return steps;
}
