import { describe, expect, it } from "vitest";
import { checkGrounding, agentOutcomeSchema, leaksInternalLanguage } from "@/lib/agent/adaptive/outcome";
import { applyToolResult, canDraftQuote, emptyState, narrateState } from "@/lib/agent/adaptive/state";

const KNOWN = new Set(["PX-440", "AX-220", "MX-160"]);

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
    priceSource: "PRICE_BOOK",
  });
  return state;
}

describe("grounding checks", () => {
  it("passes a fully supported summary", () => {
    expect(checkGrounding(outcome(), investigated(), KNOWN)).toHaveLength(0);
  });

  it("rejects a part number that is not in the catalog", () => {
    const issues = checkGrounding(
      outcome({ resolvedProduct: "ZX-999", recommendationSummary: "ZX-999 is the right part here." }),
      investigated(),
      KNOWN,
    );
    expect(issues.some((i) => i.kind === "UNKNOWN_SKU")).toBe(true);
  });

  it("rejects a recommendation that never went through the compatibility engine", () => {
    const state = emptyState("case-1");
    const issues = checkGrounding(outcome(), state, KNOWN);
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
    const issues = checkGrounding(outcome(), state, KNOWN);
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
      KNOWN,
    );
    expect(issues.some((i) => i.kind === "UNGROUNDED_INVENTORY")).toBe(true);
  });

  it("rejects a price the pricing engine never returned", () => {
    const issues = checkGrounding(
      outcome({ recommendationSummary: "Priced at $1,234.56 per unit for this account." }),
      investigated(),
      KNOWN,
    );
    expect(issues.some((i) => i.kind === "UNGROUNDED_PRICE")).toBe(true);
  });

  it("accepts a price that matches what the pricing engine returned", () => {
    const issues = checkGrounding(
      outcome({ recommendationSummary: "Priced at $8,483.20 per unit via the customer price book." }),
      investigated(),
      KNOWN,
    );
    expect(issues.filter((i) => i.kind === "UNGROUNDED_PRICE")).toHaveLength(0);
  });

  it("rejects a citation that document search never returned", () => {
    const issues = checkGrounding(
      outcome({ recommendationSummary: "Rated to 205 °C per DS-9999 §7.3." }),
      investigated(),
      KNOWN,
    );
    expect(issues.some((i) => i.kind === "UNGROUNDED_EVIDENCE")).toBe(true);
  });

  it("accepts a citation retrieval actually produced", () => {
    const issues = checkGrounding(
      outcome({ recommendationSummary: "Rated to 205 °C per DS-1020 §2.1." }),
      investigated(),
      KNOWN,
    );
    expect(issues.filter((i) => i.kind === "UNGROUNDED_EVIDENCE")).toHaveLength(0);
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
