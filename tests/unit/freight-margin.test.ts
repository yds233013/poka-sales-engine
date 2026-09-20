import { describe, expect, it } from "vitest";
import { estimateDelivery, quoteFreight, toShipments } from "@/lib/engines/freight";
import { computeMargin } from "@/lib/engines/margin";
import { addBusinessDays } from "@/lib/engines/inventory";
import { toCents } from "@/lib/money";
import { MONDAY } from "../support/factories";
import type { Allocation, FreightRuleView } from "@/lib/domain/types";

function rule(
  originZone: string,
  destZone: string,
  service: FreightRuleView["service"],
  base: number,
  perKg: number,
  transit: number,
): FreightRuleView {
  return {
    code: `FR-${originZone}-${destZone}-${service}`,
    originZone,
    destZone,
    service,
    baseChargeCents: toCents(base),
    perKgCents: perKg * 100,
    transitDays: transit,
    hazmatSurchargeCents: toCents(85),
  };
}

const RULES: FreightRuleView[] = [
  rule("SOUTH_CENTRAL", "SOUTH_CENTRAL", "GROUND", 145, 0.38, 2),
  rule("SOUTH_CENTRAL", "SOUTH_CENTRAL", "EXPEDITED", 276, 0.91, 1),
  rule("SOUTH_CENTRAL", "SOUTH_CENTRAL", "AIR", 493, 2.09, 1),
  rule("MIDWEST", "SOUTH_CENTRAL", "GROUND", 210, 0.55, 3),
  rule("MIDWEST", "SOUTH_CENTRAL", "EXPEDITED", 399, 1.32, 1),
];

const ZONES = { DAL: "SOUTH_CENTRAL", HOU: "SOUTH_CENTRAL", CHI: "MIDWEST", FACTORY: "MIDWEST" };

function allocation(code: string, quantity: number, readyIn = 1): Allocation {
  return {
    warehouseCode: code,
    warehouseName: `${code} warehouse`,
    quantity,
    source: "STOCK",
    readyDate: addBusinessDays(MONDAY, readyIn),
  };
}

function shipments(unitWeightKg: number, ...allocations: Allocation[]) {
  return toShipments([{ unitWeightKg, allocations }]);
}

describe("freight engine", () => {
  it("rates a single leg on ground service", () => {
    const quote = quoteFreight({
      shipments: shipments(158, allocation("DAL", 12)),
      zoneByWarehouse: ZONES,
      destinationZone: "SOUTH_CENTRAL",
      hazmat: false,
      rules: RULES,
      asOf: MONDAY,
    });
    // 145 base + 0.38 × (158 × 12 = 1896 kg) = 145 + 720.48
    expect(quote.totalCents).toBe(toCents(865.48));
    expect(quote.legs).toHaveLength(1);
    expect(quote.expedited).toBe(false);
  });

  it("rates every leg of a split shipment separately", () => {
    const quote = quoteFreight({
      shipments: shipments(158, allocation("DAL", 8), allocation("HOU", 4)),
      zoneByWarehouse: ZONES,
      destinationZone: "SOUTH_CENTRAL",
      hazmat: false,
      rules: RULES,
      asOf: MONDAY,
    });
    expect(quote.legs).toHaveLength(2);
    // Two base charges, not one — a split really does cost more.
    expect(quote.totalCents).toBe(toCents(145 * 2 + 0.38 * 158 * 12));
    expect(quote.notes.join(" ")).toMatch(/splits into 2 legs/);
  });

  it("adds the hazmat surcharge only when the line is hazmat", () => {
    const plain = quoteFreight({
      shipments: shipments(10, allocation("DAL", 1)),
      zoneByWarehouse: ZONES,
      destinationZone: "SOUTH_CENTRAL",
      hazmat: false,
      rules: RULES,
      asOf: MONDAY,
    });
    const hazmat = quoteFreight({
      shipments: shipments(10, allocation("DAL", 1)),
      zoneByWarehouse: ZONES,
      destinationZone: "SOUTH_CENTRAL",
      hazmat: true,
      rules: RULES,
      asOf: MONDAY,
    });
    expect(hazmat.totalCents - plain.totalCents).toBe(toCents(85));
    expect(hazmat.legs[0].hazmatApplied).toBe(true);
  });

  it("upgrades service when ground would arrive after the requested date", () => {
    const quote = quoteFreight({
      shipments: shipments(50, allocation("CHI", 10, 1)),
      zoneByWarehouse: ZONES,
      destinationZone: "SOUTH_CENTRAL",
      hazmat: false,
      rules: RULES,
      requiredBy: addBusinessDays(MONDAY, 3),
      asOf: MONDAY,
    });
    expect(quote.expedited).toBe(true);
    expect(quote.service).toBe("EXPEDITED");
    expect(quote.notes.join(" ")).toMatch(/rated at expedited service/);
  });

  it("stays on ground when ground already meets the date", () => {
    const quote = quoteFreight({
      shipments: shipments(50, allocation("DAL", 4, 1)),
      zoneByWarehouse: ZONES,
      destinationZone: "SOUTH_CENTRAL",
      hazmat: false,
      rules: RULES,
      requiredBy: addBusinessDays(MONDAY, 20),
      asOf: MONDAY,
    });
    expect(quote.expedited).toBe(false);
    expect(quote.service).toBe("GROUND");
  });

  it("says so when even the fastest service misses the date", () => {
    const quote = quoteFreight({
      shipments: shipments(50, allocation("CHI", 10, 40)),
      zoneByWarehouse: ZONES,
      destinationZone: "SOUTH_CENTRAL",
      hazmat: false,
      rules: RULES,
      requiredBy: addBusinessDays(MONDAY, 5),
      asOf: MONDAY,
    });
    expect(quote.notes.join(" ")).toMatch(/is after the requested date/);
  });

  it("refuses to rate a shipment with no rule for the lane", () => {
    expect(() =>
      quoteFreight({
        shipments: shipments(10, allocation("DAL", 1)),
        zoneByWarehouse: ZONES,
        destinationZone: "WEST",
        hazmat: false,
        rules: RULES,
        asOf: MONDAY,
      }),
    ).toThrow(/No freight rule/);
  });

  it("refuses an unknown warehouse rather than guessing a zone", () => {
    expect(() =>
      quoteFreight({
        shipments: shipments(10, allocation("ZZZ", 1)),
        zoneByWarehouse: ZONES,
        destinationZone: "SOUTH_CENTRAL",
        hazmat: false,
        rules: RULES,
        asOf: MONDAY,
      }),
    ).toThrow(/No freight zone/);
  });

  it("rejects a non-positive weight", () => {
    expect(() =>
      quoteFreight({
        shipments: [
        { warehouseCode: "DAL", warehouseName: "DAL warehouse", weightKg: 0, readyDate: MONDAY },
      ],
        zoneByWarehouse: ZONES,
        destinationZone: "SOUTH_CENTRAL",
        hazmat: false,
        rules: RULES,
        asOf: MONDAY,
      }),
    ).toThrow();
  });

  it("returns an empty quote when there is nothing to ship", () => {
    const quote = quoteFreight({
      shipments: shipments(10, ),
      zoneByWarehouse: ZONES,
      destinationZone: "SOUTH_CENTRAL",
      hazmat: false,
      rules: RULES,
      asOf: MONDAY,
    });
    expect(quote.totalCents).toBe(0);
  });

  it("dates delivery from the latest leg", () => {
    const legs = shipments(20, allocation("DAL", 8, 1), allocation("HOU", 4, 6));
    const quote = quoteFreight({
      shipments: legs,
      zoneByWarehouse: ZONES,
      destinationZone: "SOUTH_CENTRAL",
      hazmat: false,
      rules: RULES,
      asOf: MONDAY,
    });
    const delivery = estimateDelivery(legs, quote);
    expect(delivery!.getTime()).toBe(addBusinessDays(addBusinessDays(MONDAY, 6), 2).getTime());
  });
});

describe("margin engine", () => {
  it("treats freight as a cost of sale", () => {
    const margin = computeMargin(toCents(101798.4), toCents(70560), toCents(1010.48));
    expect(margin.marginCents).toBe(toCents(101798.4) - toCents(70560) - toCents(1010.48));
    // Percentage is taken against total invoiced value, goods plus freight.
    expect(margin.marginPct).toBeCloseTo(29.4, 1);
  });

  it("reports margin before freight separately", () => {
    const margin = computeMargin(toCents(1000), toCents(600), toCents(100));
    expect(margin.productMarginPct).toBe(40);
    expect(margin.marginPct).toBeLessThan(margin.productMarginPct);
  });

  it("returns a negative margin rather than clamping it", () => {
    const margin = computeMargin(toCents(500), toCents(600), toCents(50));
    expect(margin.marginCents).toBeLessThan(0);
    expect(margin.marginPct).toBeLessThan(0);
  });

  it("rejects negative inputs", () => {
    expect(() => computeMargin(-1, 0, 0)).toThrow();
    expect(() => computeMargin(0, -1, 0)).toThrow();
    expect(() => computeMargin(0, 0, -1)).toThrow();
  });

  it("does not divide by zero on an empty deal", () => {
    const margin = computeMargin(0, 0, 0);
    expect(margin.marginPct).toBe(0);
  });
});

describe("shipment consolidation", () => {
  it("merges lines shipping from the same warehouse into one leg", () => {
    const merged = toShipments([
      { unitWeightKg: 138, allocations: [allocation("EDI", 4)] },
      { unitWeightKg: 6.4, allocations: [allocation("EDI", 8)] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].weightKg).toBeCloseTo(138 * 4 + 6.4 * 8, 2);
  });

  it("keeps lines shipping from different warehouses as separate legs", () => {
    const merged = toShipments([
      { unitWeightKg: 138, allocations: [allocation("EDI", 4)] },
      { unitWeightKg: 6.4, allocations: [allocation("ATL", 8)] },
    ]);
    expect(merged.map((s) => s.warehouseCode).sort()).toEqual(["ATL", "EDI"]);
  });

  it("takes the latest ready date when merging a warehouse", () => {
    const merged = toShipments([
      { unitWeightKg: 10, allocations: [allocation("DAL", 2, 1)] },
      { unitWeightKg: 10, allocations: [allocation("DAL", 2, 9)] },
    ]);
    expect(merged[0].readyDate.getTime()).toBe(addBusinessDays(MONDAY, 9).getTime());
  });

  it("charges an accessory shipped from a second warehouse its own freight", () => {
    const together = quoteFreight({
      shipments: toShipments([
        { unitWeightKg: 138, allocations: [allocation("DAL", 4)] },
        { unitWeightKg: 6.4, allocations: [allocation("DAL", 8)] },
      ]),
      zoneByWarehouse: ZONES,
      destinationZone: "SOUTH_CENTRAL",
      hazmat: false,
      rules: RULES,
      asOf: MONDAY,
    });
    const apart = quoteFreight({
      shipments: toShipments([
        { unitWeightKg: 138, allocations: [allocation("DAL", 4)] },
        { unitWeightKg: 6.4, allocations: [allocation("HOU", 8)] },
      ]),
      zoneByWarehouse: ZONES,
      destinationZone: "SOUTH_CENTRAL",
      hazmat: false,
      rules: RULES,
      asOf: MONDAY,
    });
    expect(together.legs).toHaveLength(1);
    expect(apart.legs).toHaveLength(2);
    // The second dock costs a second base charge, and nothing ships free.
    expect(apart.totalCents).toBeGreaterThan(together.totalCents);
  });
});
