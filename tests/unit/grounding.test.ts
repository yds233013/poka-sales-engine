import { describe, expect, it } from "vitest";
import { checkGrounding, agentOutcomeSchema, leaksInternalLanguage } from "@/lib/agent/adaptive/outcome";
import { applyToolResult, canDraftQuote, emptyState, narrateState } from "@/lib/agent/adaptive/state";

const CATALOG = {
  skus: new Set(["PX-440", "AX-220", "MX-160"]),
  documents: new Set(["DS-1020", "DS-9999", "RG-2207"]),
  caseReferences: new Set(["REQ-2041", "REQ-2036"]),
};

function outcome(overrides: Partial<Parameters<typeof checkGrounding>[0]> = {}) {
  return agentOutcomeSchema.parse({
    caseId: "case-1",
    status: "READY_FOR_APPROVAL",
    resolvedCustomer: "Cardinal Processing Group",
    resolvedProduct: "PX-440",
    alternatives: [],
    technicalEvidence: [],
    missingInformation: [],
    riskFlags: [],
    recommendationSummary: "PX-440 clears every requirement for this duty.",
    ...overrides,
  });
}

/** State as it would be after a competent investigation of PX-440. */
function investigated() {
  let state = emptyState("case-1");
  state = applyToolResult(state, "resolve_customer", { found: true, customerName: "Cardinal", siteName: "Dallas" });
  state = applyToolResult(state, "get_request_state", { quantity: 12, openQuestions: [] });
  state = applyToolResult(state, "check_compatibility", {
    sku: "PX-440",
    safety: "AUTO_SAFE",
    passCount: 6,
    checks: [],
    evidence: [{ documentNumber: "DS-1020", anchor: "2.1" }],
  });
  state = applyToolResult(state, "get_inventory", { sku: "PX-440", totalAvailable: 15 });
  state = applyToolResult(state, "calculate_price", {
    sku: "PX-440",
    unitPrice: "$8,483.20",
    listPrice: "$9,980.00",
    extended: "$101,798.40",
    considered: [{ unitPrice: "$9,481.00" }],
    priceSource: "PRICE_BOOK",
  });
  return state;
}

describe("grounding checks", () => {
  it("passes a fully supported summary", () => {
    expect(checkGrounding(outcome(), investigated(), CATALOG)).toHaveLength(0);
  });

  it("rejects a part number that is not in the catalog", () => {
    const issues = checkGrounding(
      outcome({ resolvedProduct: "ZX-999", recommendationSummary: "ZX-999 is the right part here." }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNKNOWN_SKU")).toBe(true);
  });

  it("rejects a recommendation that never went through the compatibility engine", () => {
    const state = emptyState("case-1");
    const issues = checkGrounding(outcome(), state, CATALOG);
    expect(issues.some((i) => i.kind === "UNCHECKED_COMPATIBILITY")).toBe(true);
  });

  it("rejects a recommendation that failed a hard requirement", () => {
    let state = investigated();
    state = applyToolResult(state, "check_compatibility", {
      sku: "PX-440",
      safety: "BLOCKED",
      passCount: 3,
      checks: [
        { dimension: "temperature", result: "FAIL", severity: "HARD", required: "≥ 180 °C", actual: "120 °C", label: "Fluid temperature" },
      ],
      evidence: [],
    });
    const issues = checkGrounding(outcome(), state, CATALOG);
    expect(issues.some((i) => i.kind === "UNCHECKED_COMPATIBILITY" && /hard requirement/i.test(i.detail))).toBe(true);
  });

  it("rejects a stock claim when no inventory tool was called", () => {
    let state = emptyState("case-1");
    state = applyToolResult(state, "check_compatibility", {
      sku: "PX-440", safety: "AUTO_SAFE", passCount: 6, checks: [], evidence: [],
    });
    const issues = checkGrounding(
      outcome({ recommendationSummary: "We have 40 units in stock and can ship immediately." }),
      state,
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNGROUNDED_INVENTORY")).toBe(true);
  });

  it("rejects a price the pricing engine never returned", () => {
    const issues = checkGrounding(
      outcome({ recommendationSummary: "Priced at $1,234.56 per unit for this account." }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNGROUNDED_PRICE")).toBe(true);
  });

  it("accepts a price that matches what the pricing engine returned", () => {
    const issues = checkGrounding(
      outcome({ recommendationSummary: "Priced at $8,483.20 per unit via the customer price book." }),
      investigated(),
      CATALOG,
    );
    expect(issues.filter((i) => i.kind === "UNGROUNDED_PRICE")).toHaveLength(0);
  });

  it("rejects a citation that document search never returned", () => {
    const issues = checkGrounding(
      outcome({ recommendationSummary: "Rated to 205 °C per DS-9999 §7.3." }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNGROUNDED_EVIDENCE")).toBe(true);
  });

  it("accepts a citation retrieval actually produced", () => {
    const issues = checkGrounding(
      outcome({ recommendationSummary: "Rated to 205 °C per DS-1020 §2.1." }),
      investigated(),
      CATALOG,
    );
    expect(issues.filter((i) => i.kind === "UNGROUNDED_EVIDENCE")).toHaveLength(0);
  });

  it("does not mistake a document number for a fabricated part number", () => {
    // DS-1020 is shaped exactly like a SKU. Treating it as one would fail the
    // happy path every time the agent cited its evidence properly.
    const issues = checkGrounding(
      outcome({ recommendationSummary: "Rated to 205 °C per DS-1020 §2.1, which clears this duty." }),
      investigated(),
      CATALOG,
    );
    expect(issues).toHaveLength(0);
  });

  it("rejects a token that is neither a part number nor a document", () => {
    const issues = checkGrounding(
      outcome({ recommendationSummary: "See ZZ-4321 §1.1 for the rating." }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNKNOWN_SKU" && /ZZ-4321/.test(i.detail))).toBe(true);
  });

  it("rejects an invented total even when the unit price beside it is real", () => {
    // The dangerous shape: one true number lending credibility to a false one.
    const issues = checkGrounding(
      outcome({
        recommendationSummary: "Unit price is $8,483.20, so the order comes to $99,999.99 all in.",
      }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNGROUNDED_PRICE" && /99,999\.99/.test(i.detail))).toBe(true);
  });

  it("accepts the extended total and list price the engine returned", () => {
    const issues = checkGrounding(
      outcome({
        recommendationSummary: "List is $9,980.00, your price $8,483.20, extended $101,798.40 for the order.",
      }),
      investigated(),
      CATALOG,
    );
    expect(issues.filter((i) => i.kind === "UNGROUNDED_PRICE")).toHaveLength(0);
  });

  it("rejects a stock figure no tool returned, even though inventory was checked", () => {
    const issues = checkGrounding(
      outcome({ recommendationSummary: "We have 180 units in stock and can ship immediately." }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNGROUNDED_INVENTORY" && /180/.test(i.detail))).toBe(true);
  });

  it("accepts the stock figure the inventory tool returned", () => {
    const issues = checkGrounding(
      outcome({ recommendationSummary: "15 units are in stock across the network." }),
      investigated(),
      CATALOG,
    );
    expect(issues.filter((i) => i.kind === "UNGROUNDED_INVENTORY")).toHaveLength(0);
  });

  it("grades clarification questions, which are drafted to the customer", () => {
    const issues = checkGrounding(
      outcome({
        status: "NEEDS_CUSTOMER_CLARIFICATION",
        resolvedProduct: null,
        missingInformation: ["Can you confirm you want the ZX-999 rather than the PX-440?"],
        recommendationSummary: "We need one detail before quoting this.",
      }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNKNOWN_SKU" && /ZX-999/.test(i.detail))).toBe(true);
  });

  it("refuses to send internal commercial language to a customer", () => {
    const issues = checkGrounding(
      outcome({
        status: "NEEDS_CUSTOMER_CLARIFICATION",
        resolvedProduct: null,
        missingInformation: ["Could you confirm the volume so we can check our margin on this?"],
        recommendationSummary: "We need one detail before quoting this.",
      }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "INTERNAL_LANGUAGE_LEAK")).toBe(true);
  });

  it("accepts a case reference the account's history actually contains", () => {
    // Live failure: an agent that consulted get_customer_history and wrote
    // "you last ordered these on REQ-2036" had that reported as a fabricated
    // part number, because a case reference is shaped exactly like one.
    const issues = checkGrounding(
      outcome({ recommendationSummary: "Same duty as REQ-2036, which this account ordered previously." }),
      investigated(),
      CATALOG,
    );
    expect(issues).toHaveLength(0);
  });

  it("still rejects a case reference that does not exist", () => {
    const issues = checkGrounding(
      outcome({ recommendationSummary: "As agreed on REQ-9999 last quarter." }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNKNOWN_SKU" && /REQ-9999/.test(i.detail))).toBe(true);
  });

  it("lets the agent name a part it established does not exist", () => {
    // Live failure: answering "PX-450 is not one of ours" requires naming
    // PX-450, and the check treated that as an invented part number.
    let state = investigated();
    state = applyToolResult(state, "resolve_sku", { found: false, requested: "PX-450", sku: null });
    const issues = checkGrounding(
      outcome({ recommendationSummary: "PX-450 is not a part we list; the nearest equivalent is the PX-440." }),
      state,
      CATALOG,
    );
    expect(issues).toHaveLength(0);
  });

  it("still rejects a part number no tool ever looked up", () => {
    const issues = checkGrounding(
      outcome({ recommendationSummary: "The PX-999 would also suit this duty." }),
      investigated(),
      CATALOG,
    );
    expect(issues.some((i) => i.kind === "UNKNOWN_SKU" && /PX-999/.test(i.detail))).toBe(true);
  });

  it("lets the finalizer's verdict override a stale pre-adapter reading", () => {
    // Live failure: the agent saw RG-120 fail on `connection`, the finalizer
    // fitted the adapter that resolves it and recommended RG-120 correctly,
    // and grounding rejected the run by grading the earlier snapshot.
    let state = investigated();
    state = applyToolResult(state, "check_compatibility", {
      sku: "PX-440",
      safety: "BLOCKED",
      passCount: 4,
      checks: [
        { dimension: "connection", result: "FAIL", severity: "HARD", required: "DN80", actual: "DN50", label: "Connection" },
      ],
      evidence: [],
    });
    const issues = checkGrounding(outcome(), state, CATALOG, {
      sku: "PX-440",
      hardFailureDimensions: [],
    });
    expect(issues.filter((i) => i.kind === "UNCHECKED_COMPATIBILITY")).toHaveLength(0);
  });

  it("still rejects a selection the finalizer itself hard-failed", () => {
    const issues = checkGrounding(outcome(), investigated(), CATALOG, {
      sku: "PX-440",
      hardFailureDimensions: ["temperature"],
    });
    expect(issues.some((i) => i.kind === "UNCHECKED_COMPATIBILITY" && /temperature/.test(i.detail))).toBe(true);
  });

  it("flags internal commercial language", () => {
    expect(leaksInternalLanguage("This gives us 30% margin")).toBe(true);
    expect(leaksInternalLanguage("Our standard cost is lower")).toBe(true);
    expect(leaksInternalLanguage("The unit price is $8,483.20")).toBe(false);
  });
});

describe("investigation state", () => {
  it("only records facts a tool actually returned", () => {
    const state = emptyState("case-1");
    const after = applyToolResult(state, "totally_unknown_tool", { sku: "PX-440", totalAvailable: 999 });
    expect(after).toEqual(state);
  });

  it("does not record a SKU that failed to resolve", () => {
    const after = applyToolResult(emptyState("c"), "resolve_sku", { found: false, sku: null });
    expect(after.resolvedSkus).toHaveLength(0);
  });

  it("replaces rather than duplicates a re-checked product", () => {
    let state = emptyState("c");
    const payload = (safety: string) => ({ sku: "PX-440", safety, passCount: 6, checks: [], evidence: [] });
    state = applyToolResult(state, "check_compatibility", payload("BLOCKED"));
    state = applyToolResult(state, "check_compatibility", payload("AUTO_SAFE"));
    expect(state.compatibility).toHaveLength(1);
    expect(state.compatibility[0].safety).toBe("AUTO_SAFE");
  });

  it("refuses a quote draft before the account is resolved", () => {
    expect(canDraftQuote(emptyState("c"), ["PX-440"])).toMatchObject({ ok: false });
  });

  it("refuses a quote draft for a candidate that was never compatibility-checked", () => {
    const result = canDraftQuote(investigated(), ["PX-440", "PX-460"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/PX-460/);
  });

  it("refuses a quote draft when every candidate is blocked", () => {
    let state = investigated();
    state = applyToolResult(state, "check_compatibility", {
      sku: "PX-440", safety: "BLOCKED", passCount: 1,
      checks: [{ dimension: "temperature", result: "FAIL", severity: "HARD", required: "x", actual: "y", label: "Fluid temperature" }],
      evidence: [],
    });
    const result = canDraftQuote(state, ["PX-440"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/escalate_for_review/);
  });

  it("allows a quote draft once the preconditions hold", () => {
    expect(canDraftQuote(investigated(), ["PX-440"])).toEqual({ ok: true });
  });

  it("narrates only work that actually happened", () => {
    const steps = narrateState(investigated());
    expect(steps.join(" ")).toMatch(/Resolved Cardinal/);
    expect(steps.join(" ")).toMatch(/Validated PX-440/);
    // Nothing was priced into a quote, so nothing claims a quote exists.
    expect(steps.join(" ")).not.toMatch(/quote/i);
    expect(narrateState(emptyState("c"))).toHaveLength(0);
  });
});
