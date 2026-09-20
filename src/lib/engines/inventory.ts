/**
 * Inventory / available-to-promise engine.
 *
 * Available to promise is `onHand - reserved`, never `onHand`. Quoting stock
 * that is already allocated to someone else's order is the single easiest way
 * for this kind of system to lie to a customer, so the subtraction happens in
 * exactly one place and everything else calls it.
 *
 * Allocation is deliberately deterministic: warehouses are sorted by how soon
 * they can ship, then by proximity (same freight zone first), then by code for
 * a stable tie-break. The same inputs always produce the same plan.
 */

import type { Allocation, FulfillmentPlan, InventoryRecord } from "@/lib/domain/types";

export function availableToPromise(record: InventoryRecord): number {
  return Math.max(0, record.onHand - record.reserved);
}

export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  let remaining = Math.max(0, Math.round(days));
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  // Nothing ships on a Saturday. Adding zero days to a weekend date has to
  // roll forward too, or a same-day pick lands on a closed dock.
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

export function startOfDay(d: Date): Date {
  const c = new Date(d.getTime());
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

export interface PlanOptions {
  /** Today, injected so tests and seeds are reproducible. */
  asOf: Date;
  /** Customer deadline, if one was extracted. */
  requiredBy?: Date | null;
  /** Freight zone of the ship-to site — used to prefer nearby stock. */
  destinationZone?: string | null;
  /** Factory lead time, used as the last resort source. */
  factoryLeadTimeDays: number;
  /** Allow drawing on confirmed incoming receipts. */
  allowIncoming?: boolean;
  /** Allow a factory build to cover the remainder. */
  allowFactory?: boolean;
  /**
   * Largest quantity a factory build may be promised for in one order.
   * Without a ceiling the planner absorbs any remainder — so `canFulfill` was
   * always true and `shortfall` always zero, and a 9,999-unit enquiry produced
   * a quotation stating a single lead time for the lot as if it were routine.
   */
  maxFactoryUnits?: number;
}

interface Source {
  warehouseCode: string;
  warehouseName: string;
  quantity: number;
  readyDate: Date;
  kind: "STOCK" | "INCOMING" | "FACTORY";
  zone: string;
  note?: string;
}

/**
 * Build a fulfillment plan for one SKU.
 *
 * Returns a plan even when it cannot be fulfilled — `shortfall` and
 * `canFulfill` carry that, rather than throwing, because "we can cover 8 of
 * 12 by the 30th" is useful information for a salesperson.
 */
export function planFulfillment(
  requestedQty: number,
  records: InventoryRecord[],
  options: PlanOptions,
): FulfillmentPlan {
  if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
    throw new Error(`Requested quantity must be a positive integer, received ${requestedQty}`);
  }

  const asOf = startOfDay(options.asOf);
  const notes: string[] = [];
  const sources: Source[] = [];

  for (const record of records) {
    const atp = availableToPromise(record);
    if (atp > 0) {
      sources.push({
        warehouseCode: record.warehouseCode,
        warehouseName: record.warehouseName,
        quantity: atp,
        readyDate: addBusinessDays(asOf, record.handlingDays),
        kind: "STOCK",
        zone: record.freightZone,
      });
    }
    if (record.reserved > 0 && record.onHand > 0) {
      notes.push(
        `${record.warehouseCode}: ${record.onHand} on hand but ${record.reserved} reserved — ${atp} available to promise.`,
      );
    }
    if (options.allowIncoming !== false) {
      for (const inbound of record.incoming) {
        if (!inbound.confirmed) continue;
        if (inbound.expectedAt.getTime() < asOf.getTime()) continue;
        sources.push({
          warehouseCode: record.warehouseCode,
          warehouseName: record.warehouseName,
          quantity: inbound.quantity,
          readyDate: addBusinessDays(startOfDay(inbound.expectedAt), record.handlingDays),
          kind: "INCOMING",
          zone: record.freightZone,
          note: `Inbound receipt ${inbound.poNumber} due ${inbound.expectedAt.toISOString().slice(0, 10)}`,
        });
      }
    }
  }

  const destZone = options.destinationZone ?? null;
  sources.sort((a, b) => {
    const dateDelta = a.readyDate.getTime() - b.readyDate.getTime();
    if (dateDelta !== 0) return dateDelta;
    if (a.kind !== b.kind) return a.kind === "STOCK" ? -1 : 1;
    if (destZone) {
      const aLocal = a.zone === destZone ? 0 : 1;
      const bLocal = b.zone === destZone ? 0 : 1;
      if (aLocal !== bLocal) return aLocal - bLocal;
    }
    // Prefer the deeper position so small pockets of stock stay intact.
    if (a.quantity !== b.quantity) return b.quantity - a.quantity;
    return a.warehouseCode.localeCompare(b.warehouseCode);
  });

  const allocations: Allocation[] = [];
  let remaining = requestedQty;

  // A single delivery beats two, even when splitting would ship a day sooner:
  // a split means two receipts, two freight legs and two chances to go wrong.
  // So if one location holds the whole order and still lands inside the
  // customer's date, take it and stop.
  const soloCandidates = sources
    .filter((s) => s.kind === "STOCK" && s.quantity >= requestedQty)
    .filter((s) => {
      if (!options.requiredBy) return true;
      return s.readyDate.getTime() <= startOfDay(options.requiredBy).getTime();
    })
    .sort((a, b) => {
      if (destZone) {
        const aLocal = a.zone === destZone ? 0 : 1;
        const bLocal = b.zone === destZone ? 0 : 1;
        if (aLocal !== bLocal) return aLocal - bLocal;
      }
      const dateDelta = a.readyDate.getTime() - b.readyDate.getTime();
      if (dateDelta !== 0) return dateDelta;
      return a.warehouseCode.localeCompare(b.warehouseCode);
    });

  if (soloCandidates.length > 0) {
    const solo = soloCandidates[0];
    allocations.push({
      warehouseCode: solo.warehouseCode,
      warehouseName: solo.warehouseName,
      quantity: requestedQty,
      source: "STOCK",
      readyDate: solo.readyDate,
    });
    remaining = 0;
    if (sources.some((s) => s.kind === "STOCK" && s.warehouseCode !== solo.warehouseCode && s.readyDate < solo.readyDate)) {
      notes.push(
        `${solo.warehouseCode} can cover the full quantity on its own, so the order is kept as a single shipment rather than split to save a day.`,
      );
    }
  }

  for (const source of sources) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, source.quantity);
    if (take <= 0) continue;
    allocations.push({
      warehouseCode: source.warehouseCode,
      warehouseName: source.warehouseName,
      quantity: take,
      source: source.kind,
      readyDate: source.readyDate,
      note: source.note,
    });
    remaining -= take;
  }

  if (remaining > 0 && options.allowFactory !== false) {
    const ceiling = options.maxFactoryUnits ?? Number.POSITIVE_INFINITY;
    const buildable = Math.min(remaining, ceiling);
    if (buildable > 0) {
      allocations.push({
        warehouseCode: "FACTORY",
        warehouseName: "Factory build",
        quantity: buildable,
        source: "FACTORY",
        readyDate: addBusinessDays(asOf, options.factoryLeadTimeDays),
        note: `Built to order, standard factory lead time ${options.factoryLeadTimeDays} days`,
      });
      remaining -= buildable;
    }
    if (remaining > 0) {
      notes.push(
        `A further ${remaining} units are beyond what a single factory build covers (${ceiling} per order). A quantity this size is a scheduled project, not a catalog order, and needs the factory to confirm a build plan.`,
      );
    }
  }

  const allocatedQty = allocations.reduce((sum, a) => sum + a.quantity, 0);
  const shortfall = Math.max(0, requestedQty - allocatedQty);
  const readyDate =
    allocations.length > 0
      ? new Date(Math.max(...allocations.map((a) => a.readyDate.getTime())))
      : null;

  // A split is anything that reaches the customer as more than one delivery.
  // Counting only stock locations hid the commonest case of all — part from
  // the shelf, the rest built at the factory weeks later — from the approval
  // engine, while the screen showed the operator "split shipment".
  const origins = new Set(allocations.map((a) => a.warehouseCode));
  const isSplit = origins.size > 1;

  if (isSplit) {
    notes.push(
      `Requested quantity cannot be covered from one source — the plan draws on ${[...origins].join(", ")} and will reach site as ${origins.size} deliveries.`,
    );
  }

  let meetsDeadline: boolean | null = null;
  if (options.requiredBy && readyDate) {
    meetsDeadline = readyDate.getTime() <= startOfDay(options.requiredBy).getTime();
    if (!meetsDeadline) {
      notes.push(
        `Earliest ship-ready date ${readyDate.toISOString().slice(0, 10)} is after the requested date ${startOfDay(options.requiredBy).toISOString().slice(0, 10)}.`,
      );
    }
  }

  return {
    requestedQty,
    allocatedQty,
    shortfall,
    canFulfill: shortfall === 0,
    isSplit,
    allocations,
    readyDate,
    meetsDeadline,
    notes,
  };
}

/** Total available-to-promise across all locations, ignoring incoming. */
export function totalAtp(records: InventoryRecord[]): number {
  return records.reduce((sum, r) => sum + availableToPromise(r), 0);
}

/**
 * Sanity check applied before a plan is allowed to become a quote. Catches
 * any future bug where an allocation exceeds what the warehouse actually has.
 */
export function assertPlanIsPhysical(
  plan: FulfillmentPlan,
  records: InventoryRecord[],
  asOf?: Date,
): void {
  const byWarehouse = new Map<string, number>();
  for (const a of plan.allocations) {
    if (a.source === "FACTORY") continue;
    byWarehouse.set(a.warehouseCode, (byWarehouse.get(a.warehouseCode) ?? 0) + a.quantity);
  }
  for (const [code, qty] of byWarehouse) {
    const record = records.find((r) => r.warehouseCode === code);
    if (!record) throw new Error(`Allocation references unknown warehouse ${code}`);
    // Count only the inbound the planner is itself allowed to draw on —
    // a ceiling that includes receipts already in the past is a weaker
    // assertion than the code it is supposed to guard.
    const usableInbound = record.incoming
      .filter((i) => i.confirmed)
      .filter((i) => !asOf || i.expectedAt.getTime() >= startOfDay(asOf).getTime())
      .reduce((s, i) => s + i.quantity, 0);
    const ceiling = availableToPromise(record) + usableInbound;
    if (qty > ceiling) {
      throw new Error(
        `Allocation of ${qty} at ${code} exceeds available-to-promise plus confirmed inbound (${ceiling})`,
      );
    }
  }
  const total = plan.allocations.reduce((s, a) => s + a.quantity, 0);
  if (total + plan.shortfall !== plan.requestedQty) {
    throw new Error(
      `Fulfillment plan does not balance: ${total} allocated + ${plan.shortfall} short ≠ ${plan.requestedQty} requested`,
    );
  }
}
