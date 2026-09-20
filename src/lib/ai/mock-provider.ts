/**
 * Deterministic local provider — the default.
 *
 * "Mock" understates it: this provider does real work. It runs the rule-based
 * extractor, and composes rationales and customer letters from the facts the
 * engines computed. What it does not do is invent anything. Every sentence it
 * emits is assembled from a value that came out of the database or one of the
 * deterministic engines, which is why the demo remains honest with no API key
 * present.
 */

import type {
  AIProvider,
  AnalyzeRequestInput,
  DraftResponseInput,
  DraftedResponse,
  RecommendationSummary,
  RecommendationSummaryInput,
} from "./provider";
import { extractRequest, type ExtractionResult } from "./extract";

/**
 * Condense a rejection list to the first failure per candidate, capped.
 * The full detail — every failed check on every candidate — is on the page;
 * the rationale only needs to say what was ruled out and roughly why.
 */
function summariseRejections(
  rejected: { sku: string; reason: string }[],
  limit: number,
): string {
  if (rejected.length === 0) return "";
  const shown = rejected.slice(0, limit).map((r) => {
    const first = r.reason.replace(/^Rejected: /, "").split(";")[0].trim().replace(/\.$/, "");
    return `${r.sku} (${first})`;
  });
  const remainder = rejected.length - shown.length;
  const tail =
    remainder > 0
      ? ` A further ${remainder} candidate${remainder === 1 ? " was" : "s were"} evaluated and rejected — each is listed below with its failed checks.`
      : "";
  return `${shown.join("; ")}.${tail}`;
}

function sentenceList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export class MockProvider implements AIProvider {
  readonly id = "mock";
  readonly label = "Deterministic local provider";
  readonly remote = false;

  async analyzeRequest(input: AnalyzeRequestInput): Promise<ExtractionResult> {
    return extractRequest(`${input.subject}. ${input.body}`, input.context);
  }

  async summarizeRecommendation(
    input: RecommendationSummaryInput,
  ): Promise<RecommendationSummary> {
    const { outcome, requestedSku, selectedSku, quantity } = input;

    if (outcome === "INFORMATION_REQUIRED") {
      return {
        headline: "Not enough information to make a recommendation",
        rationale: `The request cannot be turned into a selection as written. ${
          input.openQuestions.length > 0
            ? `The following need answering first: ${sentenceList(input.openQuestions)}`
            : "Key details are missing."
        } No part has been proposed, because doing so would mean guessing at duty conditions.`,
      };
    }

    if (outcome === "NO_VIABLE_OPTION") {
      const summary = summariseRejections(input.rejected, 3);
      const rejectedText = summary ? ` The closest the catalog comes: ${summary}` : "";
      return {
        headline: `No catalog product satisfies this requirement${requestedSku ? `, including the requested ${requestedSku}` : ""}`,
        rationale: `${input.facts.join(" ")}${rejectedText} This enquiry needs application engineering rather than a catalog selection.`,
      };
    }

    const headline =
      outcome === "EXACT_MATCH"
        ? `${quantity} × ${selectedSku} as requested, available from stock`
        : outcome === "SPLIT_FULFILLMENT"
          ? `${quantity} × ${selectedSku} available, shipped from more than one location`
          : `${selectedSku} in place of ${requestedSku}`;

    const rationaleParts: string[] = [];
    if (outcome === "SUBSTITUTE" && requestedSku) {
      rationaleParts.push(
        `The requested ${requestedSku} does not satisfy this duty, so ${selectedSku} is proposed in its place.`,
      );
    }
    rationaleParts.push(...input.facts);
    const rejections = summariseRejections(input.rejected, 3);
    if (rejections) {
      rationaleParts.push(`Alternatives considered and set aside: ${rejections}`);
    }
    if (input.warnings.length > 0) {
      rationaleParts.push(`Open points for review: ${sentenceList(input.warnings)}.`);
    }

    return { headline, rationale: rationaleParts.join(" ") };
  }

  async draftCustomerResponse(input: DraftResponseInput): Promise<DraftedResponse> {
    const greeting = input.contactName ? `Hi ${input.contactName.split(" ")[0]},` : "Hello,";

    if (input.outcome === "INFORMATION_REQUIRED") {
      return {
        subject: "Your enquiry — a few details needed before we quote",
        body: [
          greeting,
          "",
          "Thanks for the enquiry. Before we put a quotation together I need to pin down a few details, so that what we propose is right for the duty rather than a best guess:",
          "",
          ...input.openQuestions.map((q, i) => `${i + 1}. ${q}`),
          "",
          "As soon as I have those I can come back with a firm selection, pricing and availability.",
          "",
          "Best regards,",
          input.senderName,
        ].join("\n"),
      };
    }

    if (input.outcome === "NO_VIABLE_OPTION") {
      return {
        subject: `${input.requestedSku ?? "Your enquiry"} — not suitable for this duty`,
        body: [
          greeting,
          "",
          `Thanks for the enquiry. I've had this looked at against the duty you described, and I don't want to quote something that isn't right for it.`,
          "",
          ...input.technicalNotes.map((n) => `• ${n}`),
          "",
          "Nothing in our standard catalogue covers this combination, so rather than offer a near-miss I'd like to put you in front of our application engineering team, who handle specials of this type. If you can send the full duty sheet — media, concentration, operating and design temperature, and the area classification for the installation — I'll get that moving.",
          "",
          "Best regards,",
          input.senderName,
        ].join("\n"),
      };
    }

    const lines: string[] = [greeting, ""];
    lines.push("Thanks for the enquiry. Here's where we've landed.");
    lines.push("");

    if (input.outcome === "SUBSTITUTE" && input.requestedSku) {
      lines.push(
        `The ${input.requestedSku} isn't suitable for the duty you've described, so we're proposing the ${input.selectedSku} instead:`,
      );
    } else {
      lines.push(`We can supply the ${input.selectedSku} as requested:`);
    }
    lines.push("");
    lines.push(`• ${input.quantity} × ${input.selectedSku} — ${input.selectedName ?? ""}`.trimEnd());

    if (input.commercial) {
      lines.push(`• Unit price: ${input.commercial.unitPrice}`);
      lines.push(`• Line total: ${input.commercial.extended}`);
      lines.push(`• Freight: ${input.commercial.freight}`);
      lines.push(`• Total: ${input.commercial.total}`);
    }
    lines.push("");

    if (input.availability.length > 0) {
      lines.push("Availability");
      for (const note of input.availability) lines.push(`• ${note}`);
      lines.push("");
    }

    if (input.technicalNotes.length > 0) {
      lines.push("Technical notes");
      for (const note of input.technicalNotes) lines.push(`• ${note}`);
      lines.push("");
    }

    if (input.openQuestions.length > 0) {
      lines.push("To confirm before we proceed");
      for (const question of input.openQuestions) lines.push(`• ${question}`);
      lines.push("");
    }

    if (input.commercial) {
      lines.push(
        `Quotation ${input.quoteNumber ?? ""} is valid until ${input.commercial.validUntil}.`.replace("  ", " "),
      );
      if (input.commercial.estimatedDelivery) {
        lines.push(`Estimated delivery to site: ${input.commercial.estimatedDelivery}.`);
      }
      lines.push("");
    }

    lines.push("Happy to walk through any of this on a call.");
    lines.push("");
    lines.push("Best regards,");
    lines.push(input.senderName);

    return {
      subject:
        input.outcome === "SUBSTITUTE" && input.requestedSku
          ? `${input.requestedSku} replacement — ${input.selectedSku} quotation${input.quoteNumber ? ` ${input.quoteNumber}` : ""}`
          : `${input.selectedSku} quotation${input.quoteNumber ? ` ${input.quoteNumber}` : ""}`,
      body: lines.join("\n"),
    };
  }
}
