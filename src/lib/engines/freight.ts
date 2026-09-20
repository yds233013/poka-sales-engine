/**
 * Freight engine.
 *
 * Rated per shipping leg, because a split fulfillment ships from two
 * warehouses and therefore incurs two charges. Quoting one charge for a
 * two-truck shipment is a margin leak that only shows up after the order is
 * booked, so the split is priced honestly here.
 */

import type {
  Allocation,
  FreightLeg,
  FreightQuote,
  FreightRuleView,
  FreightService,
  FreightShipment,
} from "@/lib/domain/types";
import { roundCents, type Cents } from "@/lib/money";
import { addBusinessDays, startOfDay } from "./inventory";

const SERVICE_ORDER: FreightService[] = ["GROUND", "EXPEDITED", "AIR"];

export interface FreightInputs {
  /** One entry per warehouse the order ships from, with its total weight. */
  shipments: FreightShipment[];
  /** Warehouse code → freight zone. FACTORY resolves to the plant zone. */
  zoneByWarehouse: Record<string, string>;
  destinationZone: string;
  hazmat: boolean;
  rules: FreightRuleView[];
  requiredBy?: Date | null;
  asOf: Date;
}

/**
 * Collapse every line's allocations into one consignment per warehouse.
 * Quoting two base charges for two boxes picked off the same dock would
 * overstate the cost as surely as quoting one charge for two trucks
 * understates it.
 */
export function toShipments(
  lines: { unitWeightKg: number; allocations: Allocation[] }[],
): FreightShipment[] {
  const byWarehouse = new Map<string, FreightShipment>();
  for (const line of lines) {
    for (const allocation of line.allocations) {
      const existing = byWarehouse.get(allocation.warehouseCode);
      const weight = line.unitWeightKg * allocation.quantity;
      if (existing) {
        existing.weightKg += weight;
        if (allocation.readyDate.getTime() > existing.readyDate.getTime()) {
          existing.readyDate = allocation.readyDate;
        }
      } else {
        byWarehouse.set(allocation.warehouseCode, {
          warehouseCode: allocation.warehouseCode,
          warehouseName: allocation.warehouseName,
          weightKg: weight,
          readyDate: allocation.readyDate,
        });
      }
    }
  }
  return [...byWarehouse.values()].sort((a, b) =>
    a.warehouseCode.localeCompare(b.warehouseCode),
  );
}

function rateLeg(
  rule: FreightRuleView,
  weightKg: number,
  hazmat: boolean,
  originWarehouse: string,
): FreightLeg {
  const variable = roundCents(rule.perKgCents * weightKg);
  const hazmatCents = hazmat ? rule.hazmatSurchargeCents : 0;
  return {
    originZone: rule.originZone,
    originWarehouse,
    weightKg: Math.round(weightKg * 100) / 100,
    service: rule.service,
    ruleCode: rule.code,
    costCents: rule.baseChargeCents + variable + hazmatCents,
    transitDays: rule.transitDays,
    hazmatApplied: hazmat && hazmatCents > 0,
  };
}

function findRule(
  rules: FreightRuleView[],
  originZone: string,
  destZone: string,
  service: FreightService,
): FreightRuleView | null {
  return (
    rules.find(
      (r) => r.originZone === originZone && r.destZone === destZone && r.service === service,
    ) ?? null
  );
}

/**
 * Rate a shipment. If a deadline is supplied and ground transit misses it,
 * the engine upgrades service one step at a time and reports `expedited` so
 * the approval engine can gate the extra cost.
 */
export function quoteFreight(inputs: FreightInputs): FreightQuote {
  const { shipments, zoneByWarehouse, destinationZone, hazmat, rules } = inputs;
  const notes: string[] = [];

  if (shipments.length === 0) {
    return {
      legs: [],
      totalCents: 0,
      service: "GROUND",
      maxTransitDays: 0,
      expedited: false,
      notes: ["No allocations to ship."],
    };
  }
  if (shipments.some((s) => s.weightKg <= 0)) {
    throw new Error("Every shipment must have a positive weight to rate freight");
  }

  const deadline = inputs.requiredBy ? startOfDay(inputs.requiredBy) : null;

  const attempt = (service: FreightService): { legs: FreightLeg[]; arrival: Date } | null => {
    const legs: FreightLeg[] = [];
    let latestArrival = startOfDay(inputs.asOf);

    for (const shipment of shipments) {
      const originZone = zoneByWarehouse[shipment.warehouseCode];
      if (!originZone) throw new Error(`No freight zone for warehouse ${shipment.warehouseCode}`);
      const rule = findRule(rules, originZone, destinationZone, service);
      if (!rule) return null;
      legs.push(rateLeg(rule, shipment.weightKg, hazmat, shipment.warehouseCode));
      const arrival = addBusinessDays(startOfDay(shipment.readyDate), rule.transitDays);
      if (arrival.getTime() > latestArrival.getTime()) latestArrival = arrival;
    }
    return { legs, arrival: latestArrival };
  };

  let chosenService: FreightService = "GROUND";
  let result = attempt("GROUND");
  let expedited = false;

  if (!result) {
    throw new Error(
      `No freight rule from the allocated warehouses to zone ${destinationZone} on ground service`,
    );
  }

  if (deadline && result.arrival.getTime() > deadline.getTime()) {
    for (const service of SERVICE_ORDER.slice(1)) {
      const faster = attempt(service);
      if (!faster) continue;
      chosenService = service;
      result = faster;
      expedited = true;
      if (faster.arrival.getTime() <= deadline.getTime()) break;
    }
    if (expedited) {
      notes.push(
        `Ground service would arrive after the requested date, so the quote is rated at ${chosenService.toLowerCase()} service.`,
      );
    }
    if (result.arrival.getTime() > deadline.getTime()) {
      notes.push(
        `Even at ${chosenService.toLowerCase()} service the estimated arrival ${result.arrival
          .toISOString()
          .slice(0, 10)} is after the requested date.`,
      );
    }
  }

  if (result.legs.length > 1) {
    notes.push(
      `Shipment splits into ${result.legs.length} legs (${result.legs
        .map((l) => l.originWarehouse)
        .join(", ")}), each rated separately.`,
    );
  }

  const totalCents: Cents = result.legs.reduce((s, l) => s + l.costCents, 0);

  return {
    legs: result.legs,
    totalCents,
    service: chosenService,
    maxTransitDays: Math.max(...result.legs.map((l) => l.transitDays)),
    expedited,
    notes,
  };
}

/**
 * Estimated delivery date implied by a freight quote.
 *
 * Deliberately the LATEST leg, not the earliest: where a site plans a single
 * commissioning window, the date that governs is when the last box arrives.
 */
export function estimateDelivery(
  shipments: FreightShipment[],
  quote: FreightQuote,
): Date | null {
  if (shipments.length === 0 || quote.legs.length === 0) return null;
  let latest = 0;
  for (const shipment of shipments) {
    const leg = quote.legs.find((l) => l.originWarehouse === shipment.warehouseCode);
    const transit = leg?.transitDays ?? quote.maxTransitDays;
    const arrival = addBusinessDays(startOfDay(shipment.readyDate), transit);
    if (arrival.getTime() > latest) latest = arrival.getTime();
  }
  return new Date(latest);
}
