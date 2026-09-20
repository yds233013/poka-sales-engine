import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  assertPlanIsPhysical,
  availableToPromise,
  planFulfillment,
  totalAtp,
} from "@/lib/engines/inventory";
import { inventory, MONDAY } from "../support/factories";

const BASE = { asOf: MONDAY, factoryLeadTimeDays: 30 };

describe("available to promise", () => {
  it("subtracts reserved stock from on hand", () => {
    expect(availableToPromise(inventory("DAL", 9, { reserved: 1 }))).toBe(8);
  });

  it("never returns a negative figure when reserved exceeds on hand", () => {
    expect(availableToPromise(inventory("DAL", 2, { reserved: 5 }))).toBe(0);
  });

  it("totals across locations", () => {
    expect(
      totalAtp([inventory("DAL", 9, { reserved: 1 }), inventory("HOU", 8, { reserved: 1 })]),
    ).toBe(15);
  });
});

describe("business day arithmetic", () => {
  it("skips weekends", () => {
    // Monday + 5 business days lands on the following Monday.
    expect(addBusinessDays(MONDAY, 5).toISOString().slice(0, 10)).toBe("2026-03-09");
  });
  it("returns the same day for zero", () => {
    expect(addBusinessDays(MONDAY, 0).getTime()).toBe(MONDAY.getTime());
  });
});

describe("fulfillment planning", () => {
  it("allocates from a single location when one can cover the order", () => {
    const plan = planFulfillment(6, [inventory("ATL", 14, { reserved: 1 })], BASE);
    expect(plan.canFulfill).toBe(true);
    expect(plan.isSplit).toBe(false);
    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0].quantity).toBe(6);
  });

  it("splits across locations when no single site holds enough", () => {
    const plan = planFulfillment(
      12,
      [inventory("DAL", 9, { reserved: 1 }), inventory("HOU", 8, { reserved: 1 })],
      BASE,
    );
    expect(plan.isSplit).toBe(true);
    expect(plan.allocatedQty).toBe(12);
    expect(plan.allocations.map((a) => a.quantity)).toEqual([8, 4]);
  });

  it("prefers one deep location over a split that ships a day sooner", () => {
    const plan = planFulfillment(
      24,
      [
        // Chicago is slower to pick but holds the whole order.
        inventory("CHI", 30, { reserved: 2, handlingDays: 2, freightZone: "MIDWEST" }),
        inventory("EDI", 14, { handlingDays: 1, freightZone: "NORTHEAST" }),
        inventory("ATL", 10, { handlingDays: 1, freightZone: "SOUTHEAST" }),
      ],
      BASE,
    );
    expect(plan.isSplit).toBe(false);
    expect(plan.allocations[0].warehouseCode).toBe("CHI");
  });

  it("does not single-source when doing so would miss the customer's date", () => {
    const plan = planFulfillment(
      10,
      [
        inventory("CHI", 20, { handlingDays: 10 }),
        inventory("DAL", 6, { handlingDays: 1 }),
        inventory("HOU", 6, { handlingDays: 1 }),
      ],
      { ...BASE, requiredBy: addBusinessDays(MONDAY, 3) },
    );
    expect(plan.isSplit).toBe(true);
  });

  it("never allocates reserved stock", () => {
    const records = [inventory("DAL", 10, { reserved: 8 })];
    const plan = planFulfillment(5, records, BASE);
    const fromStock = plan.allocations
      .filter((a) => a.source === "STOCK")
      .reduce((s, a) => s + a.quantity, 0);
    expect(fromStock).toBe(2);
    expect(plan.allocations.some((a) => a.source === "FACTORY")).toBe(true);
    expect(() => assertPlanIsPhysical(plan, records)).not.toThrow();
  });

  it("draws on a confirmed inbound receipt when stock runs out", () => {
    const plan = planFulfillment(
      8,
      [
        inventory("ATL", 0, {
          incoming: [
            { quantity: 12, expectedAt: addBusinessDays(MONDAY, 10), poNumber: "PO-1", confirmed: true },
          ],
        }),
      ],
      BASE,
    );
    expect(plan.allocations[0].source).toBe("INCOMING");
    expect(plan.allocations[0].note).toContain("PO-1");
  });

  it("ignores an unconfirmed inbound receipt", () => {
    const plan = planFulfillment(
      8,
      [
        inventory("ATL", 0, {
          incoming: [
            { quantity: 12, expectedAt: addBusinessDays(MONDAY, 10), poNumber: "PO-1", confirmed: false },
          ],
        }),
      ],
      BASE,
    );
    expect(plan.allocations.every((a) => a.source !== "INCOMING")).toBe(true);
  });

  it("ignores an inbound receipt whose date has already passed", () => {
    const plan = planFulfillment(
      4,
      [
        inventory("ATL", 0, {
          incoming: [
            { quantity: 12, expectedAt: new Date("2026-01-01T00:00:00Z"), poNumber: "OLD", confirmed: true },
          ],
        }),
      ],
      BASE,
    );
    expect(plan.allocations.every((a) => a.source !== "INCOMING")).toBe(true);
  });

  it("falls back to a factory build and dates it from the lead time", () => {
    const plan = planFulfillment(3, [inventory("DAL", 0)], { ...BASE, factoryLeadTimeDays: 30 });
    expect(plan.allocations[0].source).toBe("FACTORY");
    expect(plan.allocations[0].readyDate.getTime()).toBe(addBusinessDays(MONDAY, 30).getTime());
  });

  it("reports a shortfall rather than inventing stock when factory is disallowed", () => {
    const plan = planFulfillment(10, [inventory("DAL", 4)], { ...BASE, allowFactory: false });
    expect(plan.canFulfill).toBe(false);
    expect(plan.shortfall).toBe(6);
    expect(plan.allocatedQty).toBe(4);
  });

  it("flags a plan that lands after the requested date", () => {
    const plan = planFulfillment(2, [inventory("DAL", 0)], {
      ...BASE,
      factoryLeadTimeDays: 60,
      requiredBy: addBusinessDays(MONDAY, 5),
    });
    expect(plan.meetsDeadline).toBe(false);
    expect(plan.notes.join(" ")).toMatch(/after the requested date/);
  });

  it("reports no deadline verdict when the customer gave no date", () => {
    const plan = planFulfillment(2, [inventory("DAL", 5)], BASE);
    expect(plan.meetsDeadline).toBeNull();
  });

  it("rejects a non-positive or fractional quantity", () => {
    expect(() => planFulfillment(0, [inventory("DAL", 5)], BASE)).toThrow();
    expect(() => planFulfillment(-3, [inventory("DAL", 5)], BASE)).toThrow();
    expect(() => planFulfillment(2.5, [inventory("DAL", 5)], BASE)).toThrow();
  });

  it("handles an absurdly large quantity without claiming stock it does not have", () => {
    const records = [inventory("DAL", 9, { reserved: 1 })];
    const plan = planFulfillment(1_000_000, records, { ...BASE, allowFactory: false });
    expect(plan.allocatedQty).toBe(8);
    expect(plan.shortfall).toBe(999_992);
    expect(() => assertPlanIsPhysical(plan, records)).not.toThrow();
  });

  it("catches an impossible allocation through the structural guard", () => {
    const records = [inventory("DAL", 4)];
    const plan = planFulfillment(4, records, BASE);
    plan.allocations[0].quantity = 99; // simulate a downstream bug
    expect(() => assertPlanIsPhysical(plan, records)).toThrow(/exceeds available-to-promise/);
  });

  it("catches a plan whose parts do not sum to the requested quantity", () => {
    const records = [inventory("DAL", 10)];
    const plan = planFulfillment(6, records, BASE);
    plan.shortfall = 3;
    expect(() => assertPlanIsPhysical(plan, records)).toThrow(/does not balance/);
  });

  it("is deterministic — the same inputs produce the same plan", () => {
    const records = () => [
      inventory("DAL", 9, { reserved: 1 }),
      inventory("HOU", 8, { reserved: 1 }),
      inventory("CHI", 5, { handlingDays: 2 }),
    ];
    const a = planFulfillment(12, records(), BASE);
    const b = planFulfillment(12, records(), BASE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
