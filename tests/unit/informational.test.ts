import { describe, expect, it } from "vitest";
import { canRespondWithInformation, applyToolResult, emptyState } from "@/lib/agent/adaptive/state";
import { checkGrounding, agentOutcomeSchema, leaksInternalLanguage } from "@/lib/agent/adaptive/outcome";
import { TOOL_CONTRACTS } from "@/lib/mcp/contracts";

/**
 * The informational terminal path.
 *
 * A tool whose whole job is to state facts is the obvious place for a
 * grounding bypass to appear, so these tests are written from the attacker's
 * side: what would it take to get an unsupported assertion out of this tool
 * and in front of a customer?
 */

const CATALOG = {
  skus: new Set(["MX-160", "PX-440", "AX-220"]),
  documents: new Set(["DS-1026", "DS-1020"]),
  caseReferences: new Set(["REQ-2041"]),
};

/** State after a competent technical investigation of the MX-160. */
function investigated() {
  let state = emptyState("case-1");
  state = applyToolResult(state, "get_request_state", { quantity: null, openQuestions: [] });
  state = applyToolResult(state, "resolve_sku", { found: true, requested: "MX-160", sku: "MX-160" });
  state = applyToolResult(state, "search_technical_docs", {
    sections: [{ documentNumber: "DS-1026", anchor: "2.1" }],
  });
  state = applyToolResult(state, "check_compatibility", {
    sku: "MX-160",
    safety: "BLOCKED",
    passCount: 5,
    checks: [
      { dimension: "temperature", result: "FAIL", severity: "HARD", required: "≥ 175 °C", actual: "140 °C", label: "Fluid temperature" },
    ],
    evidence: [{ documentNumber: "DS-1026", anchor: "2.1" }],
  });
  return state;
}

function answer(overrides: Record<string, unknown> = {}) {
  return agentOutcomeSchema.parse({
    caseId: "case-1",
    status: "INFORMATION_PROVIDED",
    resolvedCustomer: "Cardinal Processing Group",
    resolvedProduct: null,
    alternatives: [],
    technicalEvidence: ["DS-1026 §2.1"],
    claims: ["The MX-160 is rated to a maximum fluid temperature of 140 °C."],
    missingInformation: [],
    riskFlags: [],
    recommendationSummary: "The MX-160 is rated to 140 °C, so it cannot run continuously at 175 °C.",
    ...overrides,
  });
}

describe("preconditions for answering", () => {
  it("accepts an answer built from evidence this run retrieved", () => {
    expect(
      canRespondWithInformation(investigated(), { evidenceRefs: ["DS-1026 §2.1"], skus: ["MX-160"] }),
    ).toEqual({ ok: true });
  });

  it("accepts a citation the model annotated with the section heading", () => {
    // Live failure: the agent cited "DS-1026 §2.1 - Process limits" — the
    // right section with its own heading attached — and was refused by an
    // exact string match that listed "DS-1026 §2.1" as available in the same
    // message. The document and anchor identify a section; the label does not.
    expect(
      canRespondWithInformation(investigated(), {
        evidenceRefs: ["DS-1026 §2.1 - Process limits"],
        skus: ["MX-160"],
      }),
    ).toEqual({ ok: true });
  });

  it("refuses a citation no tool in this run produced", () => {
    const result = canRespondWithInformation(investigated(), {
      evidenceRefs: ["DS-9999 §4.4"],
      skus: ["MX-160"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/DS-9999/);
  });

  it("refuses an answer that cites nothing at all", () => {
    const result = canRespondWithInformation(investigated(), { evidenceRefs: [], skus: ["MX-160"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/must cite the evidence/i);
  });

  it("refuses a part number this run never looked up", () => {
    const result = canRespondWithInformation(investigated(), {
      evidenceRefs: ["DS-1026 §2.1"],
      skus: ["PX-440"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/PX-440 was never looked up/);
  });

  it("refuses before the case requirements have been read", () => {
    const result = canRespondWithInformation(emptyState("c"), {
      evidenceRefs: ["DS-1026 §2.1"],
      skus: [],
    });
    expect(result.ok).toBe(false);
  });
});

describe("grounding an informational answer", () => {
  it("accepts a technical answer supported by what the engine returned", () => {
    expect(checkGrounding(answer(), investigated(), CATALOG)).toHaveLength(0);
  });

  it("rejects an unsupported technical claim", () => {
    // A citation the run never retrieved, asserted inside a claim rather than
    // the summary — claims are graded too, or the one outcome that is purely
    // assertion would be the one nobody checks.
    const issues = checkGrounding(
      answer({ claims: ["The MX-160 is rated to 200 °C per DS-4242 §9.9."] }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNGROUNDED_EVIDENCE")).toBe(true);
  });

  it("rejects a fabricated inventory claim", () => {
    const issues = checkGrounding(
      answer({ claims: ["We have 40 units in stock and can ship immediately."] }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNGROUNDED_INVENTORY")).toBe(true);
  });

  it("rejects a fabricated price", () => {
    // No pricing tool ran, and on this path none can.
    const issues = checkGrounding(
      answer({ claims: ["The MX-160 is $4,200 per unit on your price book."] }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNGROUNDED_PRICE")).toBe(true);
  });

  it("rejects a fabricated part number", () => {
    const issues = checkGrounding(
      answer({ claims: ["The MX-999 would suit this duty instead."] }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNKNOWN_SKU" && /MX-999/.test(i.detail))).toBe(true);
  });

  it("rejects internal commercial language in a customer-facing answer", () => {
    const issues = checkGrounding(
      answer({ recommendationSummary: "We can do this but the margin is thin at this volume." }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "INTERNAL_LANGUAGE_LEAK")).toBe(true);
  });
});

describe("commercial language in a technical answer", () => {
  // Live validation caught this: the guard rejected a correct technical
  // answer for saying there was no safety margin above the rating. "Margin"
  // is what an engineer calls the gap to a limit, and a technical answer is
  // the one place that phrasing is most natural.
  it("allows margin in its engineering sense", () => {
    for (const text of [
      "That leaves no safety margin above the published rating.",
      "There is very little margin for error at 175 °C.",
      "The design margin on the seal is minimal.",
      "Thermal margins are tight at that duty.",
    ]) {
      expect(leaksInternalLanguage(text), text).toBe(false);
    }
  });

  it("still blocks margin in its commercial sense", () => {
    for (const text of [
      "Our margin on this deal is 30%.",
      "The margin is thin at this volume.",
      "Our margins are already stretched.",
      "The gross profit is thin here.",
      "Standard cost is lower than list.",
    ]) {
      expect(leaksInternalLanguage(text), text).toBe(true);
    }
  });
});

describe("what the informational tool cannot do", () => {
  it("takes no input that could carry a price, quantity or stock figure", () => {
    const keys = Object.keys(TOOL_CONTRACTS.respond_with_information.input.shape);
    expect(keys.sort()).toEqual(["answer", "claims", "evidenceRefs", "skus", "uncertainty"]);
    for (const key of keys) {
      expect(key).not.toMatch(/price|quantity|stock|discount|margin|approve|release/i);
    }
  });

  it("returns no quote, price or approval in its output contract", () => {
    const keys = Object.keys(TOOL_CONTRACTS.respond_with_information.output.shape);
    for (const key of keys) {
      expect(key).not.toMatch(/quote|price|approval|release|total/i);
    }
  });

  it("demands at least one claim and one citation at the schema level", () => {
    const base = { answer: "x".repeat(40), claims: ["The MX-160 is rated to 140 C."], evidenceRefs: ["DS-1026 §2.1"], skus: [] };
    expect(TOOL_CONTRACTS.respond_with_information.input.safeParse(base).success).toBe(true);
    expect(
      TOOL_CONTRACTS.respond_with_information.input.safeParse({ ...base, evidenceRefs: [] }).success,
    ).toBe(false);
    expect(TOOL_CONTRACTS.respond_with_information.input.safeParse({ ...base, claims: [] }).success).toBe(false);
  });
});
