/**
 * Optional Claude-backed provider.
 *
 * Enabled with AI_PROVIDER=anthropic and an API key. It is a strict superset
 * of the deterministic provider's behaviour, not a replacement for it:
 *
 *   - Extraction runs deterministically first. The model is asked only to
 *     propose requirements the rules missed, and its proposals are validated
 *     against a schema and merged with deterministic values winning.
 *   - Rationale and customer-letter drafting are handed the facts the engines
 *     computed and told to rephrase, not to add.
 *   - Every call falls back to the deterministic provider on any error,
 *     timeout or schema violation, so enabling a key can degrade latency but
 *     can never break the workflow.
 *
 * No pricing, inventory, compatibility or approval decision passes through
 * this class.
 */

import { z } from "zod";
import type {
  AIProvider,
  AnalyzeRequestInput,
  DraftResponseInput,
  DraftedResponse,
  RecommendationSummary,
  RecommendationSummaryInput,
} from "./provider";
import { mergeRequirements } from "./provider";
import type { ExtractionResult } from "./extract";
import { MockProvider } from "./mock-provider";
import type { RequirementView } from "@/lib/domain/types";

/**
 * Requirement keys the model is allowed to propose. Anything else is dropped:
 * an unconstrained key can invent a dimension the compatibility engine then
 * enforces against a number the customer never gave.
 */
const ALLOWED_KEYS = [
  "max_fluid_temp_c",
  "min_flow_m3h",
  "min_head_m",
  "max_pressure_bar",
  "max_viscosity_cp",
  "npsha_m",
  "inlet_connection",
  "wetted_material",
  "motor_voltage",
  "hazardous_area_rating",
  "certifications",
  "seal_type",
  "ip_rating",
  "length_mm",
] as const;

const requirementSchema = z.object({
  key: z.enum(ALLOWED_KEYS),
  label: z.string(),
  kind: z.enum(["EXPLICIT", "INFERRED", "AMBIGUOUS", "MISSING"]),
  operator: z.enum(["GTE", "LTE", "EQ", "NEQ", "INCLUDES", "WITHIN_TOLERANCE"]).nullable().optional(),
  numValue: z.number().finite().min(-1000).max(1_000_000).nullable().optional(),
  textValue: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  sourceQuote: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  note: z.string().nullable().optional(),
});

const analysisSchema = z.object({
  requirements: z.array(requirementSchema).max(24),
  openQuestions: z.array(z.string()).max(8),
  summary: z.string().max(240),
});

const summarySchema = z.object({
  headline: z.string().max(160),
  rationale: z.string().max(2400),
});

const draftSchema = z.object({
  subject: z.string().max(200),
  body: z.string().max(6000),
});

const TIMEOUT_MS = 30_000;

interface AnthropicMessageResponse {
  content: { type: string; text?: string }[];
}

export class AnthropicProvider implements AIProvider {
  readonly id: string;
  readonly label: string;
  readonly remote = true;
  private readonly fallback = new MockProvider();

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.id = model;
    this.label = `Claude (${model})`;
  }

  private async call(system: string, user: string, maxTokens = 2000): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const json = (await response.json()) as AnthropicMessageResponse;
      const text = json.content?.find((c) => c.type === "text")?.text;
      return text ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private parseJson<T>(raw: string | null, schema: z.ZodType<T>): T | null {
    if (!raw) return null;
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
    const candidate = fenced ? fenced[1] : raw;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    try {
      const parsed = schema.safeParse(JSON.parse(candidate.slice(start, end + 1)));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async analyzeRequest(input: AnalyzeRequestInput): Promise<ExtractionResult> {
    const deterministic = await this.fallback.analyzeRequest(input);

    const system = [
      "You read inbound industrial-distribution enquiries and extract structured requirements.",
      "You are one half of a hybrid system: a rule-based extractor has already run and its results are authoritative.",
      "Your job is ONLY to propose requirements the rules missed, and to flag genuine ambiguity.",
      "",
      "Hard rules:",
      "- Never invent a numeric value the customer did not state. If a dimension is implied but unquantified, return it with kind AMBIGUOUS and no numValue.",
      "- Never propose a part number. Part numbers are resolved against the catalog separately.",
      "- sourceQuote must be a verbatim substring of the message.",
      "- Valid keys: max_fluid_temp_c, min_flow_m3h, min_head_m, max_pressure_bar, max_viscosity_cp,",
      "  npsha_m, inlet_connection, wetted_material, motor_voltage, hazardous_area_rating,",
      "  certifications, seal_type, ip_rating, length_mm.",
      "- Units: temperature °C, flow m³/h, head m, pressure bar, viscosity cP, length mm.",
      "",
      'Respond with JSON only: {"requirements":[...],"openQuestions":[...],"summary":"..."}',
    ].join("\n");

    const user = [
      `Subject: ${input.subject}`,
      `Message: ${input.body}`,
      "",
      "Requirements the rule-based extractor already found (do not repeat these):",
      deterministic.requirements
        .filter((r) => r.kind !== "MISSING")
        .map((r) => `- ${r.key}: ${r.numValue ?? r.textValue ?? "—"}`)
        .join("\n") || "- none",
    ].join("\n");

    const parsed = this.parseJson(await this.call(system, user), analysisSchema);
    if (!parsed) return deterministic;

    const proposed: RequirementView[] = parsed.requirements.map((r) => ({
      key: r.key,
      label: r.label,
      kind: r.kind,
      operator: r.operator ?? null,
      numValue: r.numValue ?? null,
      textValue: r.textValue ?? null,
      unit: r.unit ?? null,
      sourceQuote: r.sourceQuote ?? null,
      confidence: r.confidence,
      note: r.note ?? null,
    }));

    // Drop anything that is not demonstrably grounded in the message. A
    // fabricated citation is the one failure mode that would poison the
    // evidence trail — and an omitted one is the same failure with less
    // effort, so a missing quote is treated as ungrounded rather than waved
    // through. AMBIGUOUS proposals are exempt: by definition they report that
    // something was implied rather than stated, and they can never satisfy a
    // rule, only force a human to look.
    const haystack = `${input.subject} ${input.body}`.toLowerCase();
    const grounded = proposed.filter((r) => {
      if (r.kind === "AMBIGUOUS" || r.kind === "MISSING") return true;
      if (!r.sourceQuote) return false;
      // Match the whole quote, not a truncated prefix — anything appended past
      // the cut would otherwise ride along unverified.
      return haystack.includes(r.sourceQuote.toLowerCase().trim());
    });

    return {
      ...deterministic,
      requirements: mergeRequirements(deterministic.requirements, grounded),
      openQuestions: [...new Set([...deterministic.openQuestions, ...parsed.openQuestions])],
    };
  }

  async summarizeRecommendation(
    input: RecommendationSummaryInput,
  ): Promise<RecommendationSummary> {
    const baseline = await this.fallback.summarizeRecommendation(input);

    const system = [
      "You write the one-paragraph rationale a technical salesperson reads on a recommendation.",
      "You are given facts computed by deterministic engines. Rephrase them clearly.",
      "",
      "Hard rules:",
      "- Use ONLY the supplied facts. Add no number, claim, product or date that is not in them.",
      "- Do not state margin, cost or any internal commercial figure.",
      "- Name rejected alternatives and why they were rejected.",
      "- Plain professional English, no marketing language, no bullet points.",
      "",
      'Respond with JSON only: {"headline":"...","rationale":"..."}',
    ].join("\n");

    const user = [
      `Outcome: ${input.outcome}`,
      `Requested: ${input.requestedSku ?? "not identified"}`,
      `Selected: ${input.selectedSku ?? "none"}${input.quantity ? ` × ${input.quantity}` : ""}`,
      "",
      "Facts:",
      ...input.facts.map((f) => `- ${f}`),
      "",
      "Rejected alternatives:",
      ...input.rejected.map((r) => `- ${r.sku}: ${r.reason}`),
      "",
      "Warnings:",
      ...input.warnings.map((w) => `- ${w}`),
    ].join("\n");

    const parsed = this.parseJson(await this.call(system, user), summarySchema);
    if (!parsed) return baseline;

    // Guard: internal commercial language in either field discards the whole
    // response in favour of the deterministic one.
    const leak = /\bmargin\b|\bcost\b|\bmark-?up\b/i;
    if (leak.test(parsed.rationale) || leak.test(parsed.headline)) return baseline;
    return parsed;
  }

  async draftCustomerResponse(input: DraftResponseInput): Promise<DraftedResponse> {
    const baseline = await this.fallback.draftCustomerResponse(input);

    const system = [
      "You draft the email a technical salesperson sends back to an industrial customer.",
      "",
      "Hard rules:",
      "- Use ONLY the supplied facts and figures. Invent nothing — no dates, prices, lead times or product claims.",
      "- Never mention margin, cost, internal policy, approvals or how the recommendation was produced.",
      "- Direct, professional, no marketing language. Short paragraphs.",
      "- Where a substitution is proposed, say plainly why the requested part is not suitable.",
      "",
      'Respond with JSON only: {"subject":"...","body":"..."}',
    ].join("\n");

    const user = [
      `Customer: ${input.customerName}`,
      `Contact: ${input.contactName ?? "unknown"}`,
      `Outcome: ${input.outcome}`,
      `Requested part: ${input.requestedSku ?? "not identified"}`,
      `Proposed part: ${input.selectedSku ?? "none"}${input.quantity ? ` × ${input.quantity}` : ""}`,
      input.commercial
        ? `Commercials: unit ${input.commercial.unitPrice}, line total ${input.commercial.extended}, freight ${input.commercial.freight}, total ${input.commercial.total}, valid until ${input.commercial.validUntil}${input.commercial.estimatedDelivery ? `, estimated delivery ${input.commercial.estimatedDelivery}` : ""}`
        : "Commercials: none — no quotation",
      `Quote number: ${input.quoteNumber ?? "none"}`,
      "",
      "Availability:",
      ...input.availability.map((a) => `- ${a}`),
      "Technical notes:",
      ...input.technicalNotes.map((t) => `- ${t}`),
      "Questions to ask:",
      ...input.openQuestions.map((q) => `- ${q}`),
      "",
      `Sign off as: ${input.senderName}`,
    ].join("\n");

    const parsed = this.parseJson(await this.call(system, user, 2400), draftSchema);
    if (!parsed) return baseline;

    // Guard: never let an internal figure reach a customer-facing draft.
    const leak = /\bmargin\b|\bgross profit\b|\bstandard cost\b|\bour cost\b|\bcost of goods\b/i;
    if (leak.test(parsed.body) || leak.test(parsed.subject)) return baseline;
    return parsed;
  }
}
