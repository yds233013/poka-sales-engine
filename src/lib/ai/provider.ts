/**
 * AI provider abstraction.
 *
 * The boundary drawn here is the central architectural claim of this build:
 * the model is used for language, never for arithmetic or policy.
 *
 *   The provider MAY:  read a messy email, propose structured requirements,
 *                      phrase a rationale from evidence it was handed, draft
 *                      a customer-facing reply.
 *   The provider MAY NOT: decide a price, decide whether stock exists, decide
 *                      whether a substitution is safe, or decide whether an
 *                      approval is needed. Those are computed by the engines
 *                      and passed to the provider as facts.
 *
 * The default provider is deterministic and offline, so the application is
 * fully usable with no API key. A real model can be enabled by configuration
 * and its output is validated and reconciled against the deterministic
 * extraction before it is trusted.
 */

import type { RequirementView } from "@/lib/domain/types";
import type { ExtractionContext, ExtractionResult } from "./extract";

export interface AnalyzeRequestInput {
  subject: string;
  body: string;
  context: ExtractionContext;
}

export interface RecommendationSummaryInput {
  outcome:
    | "EXACT_MATCH"
    | "SUBSTITUTE"
    | "SPLIT_FULFILLMENT"
    | "NO_VIABLE_OPTION"
    | "INFORMATION_REQUIRED";
  requestedSku: string | null;
  selectedSku: string | null;
  selectedName: string | null;
  quantity: number | null;
  /** Facts the engines produced. The provider may only rephrase these. */
  facts: string[];
  rejected: { sku: string; reason: string }[];
  warnings: string[];
  openQuestions: string[];
}

export interface RecommendationSummary {
  headline: string;
  rationale: string;
}

export interface DraftResponseInput {
  customerName: string;
  contactName: string | null;
  outcome: RecommendationSummaryInput["outcome"];
  requestedSku: string | null;
  selectedSku: string | null;
  selectedName: string | null;
  quantity: number | null;
  /** Pre-formatted, customer-safe commercial figures. Never includes margin. */
  commercial: {
    unitPrice: string;
    extended: string;
    freight: string;
    total: string;
    validUntil: string;
    estimatedDelivery: string | null;
  } | null;
  availability: string[];
  technicalNotes: string[];
  openQuestions: string[];
  quoteNumber: string | null;
  senderName: string;
}

export interface DraftedResponse {
  subject: string;
  body: string;
}

export interface AIProvider {
  readonly id: string;
  readonly label: string;
  /** True when the provider reaches an external service. */
  readonly remote: boolean;
  analyzeRequest(input: AnalyzeRequestInput): Promise<ExtractionResult>;
  /**
   * Note there is no `planInvestigation`. The tool order is fixed in the
   * orchestrator on purpose: a deterministic pipeline makes two cases
   * comparable in the audit trail and removes any path by which the
   * compatibility or approval step could be skipped. Letting a model choose
   * the order would trade both away for flexibility this domain does not need.
   */
  summarizeRecommendation(input: RecommendationSummaryInput): Promise<RecommendationSummary>;
  draftCustomerResponse(input: DraftResponseInput): Promise<DraftedResponse>;
}

/** Requirements a provider returned that the deterministic pass did not find. */
export function mergeRequirements(
  deterministic: RequirementView[],
  proposed: RequirementView[],
): RequirementView[] {
  const byKey = new Map(deterministic.map((r) => [r.key, r]));
  for (const candidate of proposed) {
    const existing = byKey.get(candidate.key);
    // Deterministic extraction wins wherever it produced a usable value: it is
    // reproducible and auditable. A model may only fill genuine gaps.
    if (!existing || existing.kind === "MISSING") {
      byKey.set(candidate.key, { ...candidate, confidence: Math.min(candidate.confidence, 0.8) });
    }
  }
  return [...byKey.values()];
}
