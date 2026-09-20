import { describe, expect, it } from "vitest";
import {
  assertReleaseAllowed,
  canAutoRelease,
  deriveRisk,
  DEFAULT_THRESHOLDS,
  evaluateApprovals,
  type ApprovalEvaluationInput,
} from "@/lib/engines/approval";
import { computeMargin } from "@/lib/engines/margin";
import { toCents } from "@/lib/money";
import type { CompatibilityVerdict, FulfillmentPlan } from "@/lib/domain/types";
import { MONDAY } from "../support/factories";

function verdict(overrides: Partial<CompatibilityVerdict> = {}): CompatibilityVerdict {
  return {
    productId: "p1",
    sku: "PX-440",
    safety: "AUTO_SAFE",
    checks: [],
    hardFailures: [],
    warnings: [],
    unknowns: [],
    score: 100,
    ...overrides,
  };
}

function plan(overrides: Partial<FulfillmentPlan> = {}): FulfillmentPlan {
  return {
    requestedQty: 12,
    allocatedQty: 12,
    shortfall: 0,
    canFulfill: true,
    isSplit: false,
    allocations: [
      { warehouseCode: "DAL", warehouseName: "Dallas", quantity: 12, source: "STOCK", readyDate: MONDAY },
    ],
    readyDate: MONDAY,
    meetsDeadline: true,
    notes: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<ApprovalEvaluationInput> = {}): ApprovalEvaluationInput {
  return {
    thresholds: DEFAULT_THRESHOLDS,
    effectiveDiscountPct: 12,
    margin: computeMargin(toCents(40000), toCents(26000), toCents(400)),
    quoteTotalCents: toCents(40400),
    verdict: verdict(),
    isSubstitution: false,
    plan: plan(),
    freightExpedited: false,
    freightCents: toCents(400),
    unresolvedRequirements: [],
    ...overrides,
  };
}

describe("approval policy", () => {
  it("clears a clean in-policy deal with no approvals", () => {
    const requirements = evaluateApprovals(baseInput());
    expect(requirements).toHaveLength(0);
    expect(canAutoRelease(requirements)).toBe(true);
    expect(deriveRisk(requirements)).toBe("LOW");
  });

  it("requires sign-off once the discount passes the policy limit", () => {
    const requirements = evaluateApprovals(baseInput({ effectiveDiscountPct: 26 }));
    const discount = requirements.find((r) => r.kind === "DISCOUNT_THRESHOLD");
    expect(discount).toBeDefined();
    expect(discount!.requiredRole).toBe("SALES_MANAGER");
    expect(canAutoRelease(requirements)).toBe(false);
  });

  it("does not fire exactly at the discount limit", () => {
    const requirements = evaluateApprovals(baseInput({ effectiveDiscountPct: 18 }));
    expect(requirements.some((r) => r.kind === "DISCOUNT_THRESHOLD")).toBe(false);
  });

  it("requires sign-off when margin falls below the policy minimum", () => {
    const requirements = evaluateApprovals(
      baseInput({ margin: computeMargin(toCents(152736), toCents(134160), toCents(1568)) }),
    );
    const margin = requirements.find((r) => r.kind === "MARGIN_FLOOR");
    expect(margin).toBeDefined();
    expect(margin!.requiredRole).toBe("SALES_MANAGER");
  });

  it("escalates past sales management below the hard margin floor", () => {
    const requirements = evaluateApprovals(
      baseInput({ margin: computeMargin(toCents(100000), toCents(96000), toCents(500)) }),
    );
    const margin = requirements.find((r) => r.kind === "MARGIN_FLOOR");
    expect(margin!.requiredRole).toBe("ADMIN");
    expect(margin!.title).toMatch(/hard floor/);
  });

  it("escalates a loss-making deal rather than letting it through", () => {
    const requirements = evaluateApprovals(
      baseInput({ margin: computeMargin(toCents(1000), toCents(2000), toCents(100)) }),
    );
    expect(requirements.find((r) => r.kind === "MARGIN_FLOOR")!.requiredRole).toBe("ADMIN");
  });

  it("treats a clean substitution as a sales-manager acknowledgement", () => {
    const requirements = evaluateApprovals(
      baseInput({ isSubstitution: true, substitutedFromSku: "AX-220", substitutedToSku: "PX-440" }),
    );
    const sub = requirements.find((r) => r.kind === "TECHNICAL_SUBSTITUTION");
    expect(sub).toBeDefined();
    expect(sub!.requiredRole).toBe("SALES_MANAGER");
  });

  it("escalates a substitution carrying a warning to an engineer", () => {
    const warned = verdict({
      safety: "NEEDS_REVIEW",
      warnings: [
        {
          dimension: "seal",
          label: "Seal / elastomer",
          result: "WARNING",
          severity: "SOFT",
          requirement: "PTFE",
          actual: "EPDM",
          detail: "Elastomer differs.",
        },
      ],
    });
    const requirements = evaluateApprovals(
      baseInput({
        isSubstitution: true,
        substitutedFromSku: "DG-50",
        substitutedToSku: "DG-52",
        verdict: warned,
      }),
    );
    const found = requirements.find((r) => r.kind === "COMPATIBILITY_WARNING");
    expect(found!.requiredRole).toBe("APPLICATION_ENGINEER");
    expect(requirements.some((r) => r.kind === "TECHNICAL_SUBSTITUTION")).toBe(false);
  });

  it("raises a warning approval on a non-substitution that carries one", () => {
    const warned = verdict({
      safety: "NEEDS_REVIEW",
      unknowns: [
        {
          dimension: "npsh",
          label: "NPSH margin",
          result: "UNKNOWN",
          severity: "HARD",
          requirement: "≤ NPSH available",
          actual: "not published",
          detail: "Cannot verify.",
        },
      ],
    });
    const requirements = evaluateApprovals(baseInput({ verdict: warned }));
    expect(requirements.find((r) => r.kind === "COMPATIBILITY_WARNING")!.requiredRole).toBe(
      "APPLICATION_ENGINEER",
    );
  });

  it("requires an engineer when a requirement could not be resolved", () => {
    const requirements = evaluateApprovals(
      baseInput({ unresolvedRequirements: ["fluid temperature"] }),
    );
    expect(requirements.find((r) => r.kind === "TECHNICAL_UNCERTAINTY")!.requiredRole).toBe(
      "APPLICATION_ENGINEER",
    );
  });

  it("gates expedited freight", () => {
    const requirements = evaluateApprovals(
      baseInput({ freightExpedited: true, freightCents: toCents(2400) }),
    );
    expect(requirements.some((r) => r.kind === "EXPEDITED_FREIGHT")).toBe(true);
  });

  it("gates a quote above the large-value threshold", () => {
    const requirements = evaluateApprovals(baseInput({ quoteTotalCents: toCents(102808.88) }));
    expect(requirements.some((r) => r.kind === "LARGE_QUOTE_VALUE")).toBe(true);
  });

  it("gates a split shipment", () => {
    const requirements = evaluateApprovals(
      baseInput({
        plan: plan({
          isSplit: true,
          allocations: [
            { warehouseCode: "DAL", warehouseName: "Dallas", quantity: 8, source: "STOCK", readyDate: MONDAY },
            { warehouseCode: "HOU", warehouseName: "Houston", quantity: 4, source: "STOCK", readyDate: MONDAY },
          ],
        }),
      }),
    );
    expect(requirements.some((r) => r.kind === "SPLIT_FULFILLMENT")).toBe(true);
  });

  it("never emits the same approval kind twice", () => {
    const requirements = evaluateApprovals(
      baseInput({
        effectiveDiscountPct: 40,
        margin: computeMargin(toCents(1000), toCents(950), toCents(20)),
        isSubstitution: true,
        quoteTotalCents: toCents(200000),
        freightExpedited: true,
        plan: plan({ isSplit: true }),
        unresolvedRequirements: ["npsh available"],
      }),
    );
    expect(new Set(requirements.map((r) => r.kind)).size).toBe(requirements.length);
  });

  it("puts technical approvals ahead of commercial ones", () => {
    const requirements = evaluateApprovals(
      baseInput({
        isSubstitution: true,
        effectiveDiscountPct: 30,
        margin: computeMargin(toCents(1000), toCents(900), toCents(20)),
      }),
    );
    const kinds = requirements.map((r) => r.kind);
    expect(kinds.indexOf("TECHNICAL_SUBSTITUTION")).toBeLessThan(kinds.indexOf("DISCOUNT_THRESHOLD"));
  });

  it("derives risk from the approvals and the verdict", () => {
    expect(deriveRisk([], verdict({ safety: "BLOCKED" }))).toBe("BLOCKED");
    expect(deriveRisk(evaluateApprovals(baseInput({ quoteTotalCents: toCents(80000) })))).toBe("MEDIUM");
    expect(
      deriveRisk(
        evaluateApprovals(baseInput({ margin: computeMargin(toCents(1000), toCents(900), 0) })),
      ),
    ).toBe("HIGH");
  });
});

describe("release gate", () => {
  it("allows release when every approval is decided and approved", () => {
    expect(() =>
      assertReleaseAllowed([
        { id: "1", status: "APPROVED", title: "a" },
        { id: "2", status: "APPROVED", title: "b" },
      ]),
    ).not.toThrow();
  });

  it("allows release when there were no approvals at all", () => {
    expect(() => assertReleaseAllowed([])).not.toThrow();
  });

  it("refuses release while an approval is still pending", () => {
    expect(() =>
      assertReleaseAllowed([
        { id: "1", status: "APPROVED", title: "a" },
        { id: "2", status: "PENDING", title: "Margin below floor" },
      ]),
    ).toThrow(/1 approval\(s\) still open/);
  });

  it("refuses release when changes were requested", () => {
    expect(() =>
      assertReleaseAllowed([{ id: "1", status: "CHANGES_REQUESTED", title: "Adapter fit" }]),
    ).toThrow(/still open/);
  });

  it("refuses release when any approval was rejected", () => {
    expect(() =>
      assertReleaseAllowed([{ id: "1", status: "REJECTED", title: "Discount" }]),
    ).toThrow(/rejected/);
  });
});
