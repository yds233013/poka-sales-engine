/**
 * Small builders for engine inputs, so a test only states the field it cares
 * about and the rest stays realistic.
 */

import type {
  CompatibilityRuleView,
  InventoryRecord,
  ProductView,
  RequirementView,
  SpecValue,
} from "@/lib/domain/types";
import { toCents } from "@/lib/money";

export function spec(key: string, value: number | string, unit?: string): SpecValue {
  return {
    key,
    label: key,
    type: typeof value === "number" ? "NUMERIC" : "TEXT",
    numValue: typeof value === "number" ? value : null,
    textValue: typeof value === "string" ? value : null,
    minValue: null,
    maxValue: null,
    boolValue: null,
    unit: unit ?? null,
  };
}

export function product(overrides: Partial<ProductView> & { sku: string }): ProductView {
  return {
    id: overrides.id ?? `p-${overrides.sku}`,
    sku: overrides.sku,
    name: overrides.name ?? `${overrides.sku} pump`,
    categoryCode: overrides.categoryCode ?? "CP-STD",
    family: overrides.family ?? "AX Series",
    description: overrides.description ?? "",
    lifecycle: overrides.lifecycle ?? "ACTIVE",
    leadTimeDays: overrides.leadTimeDays ?? 30,
    listPriceCents: overrides.listPriceCents ?? toCents(5000),
    standardCostCents: overrides.standardCostCents ?? toCents(3000),
    weightKg: overrides.weightKg ?? 100,
    isAccessory: overrides.isAccessory ?? false,
    hazmat: overrides.hazmat ?? false,
    specs: overrides.specs ?? {},
  };
}

export function requirement(
  key: string,
  overrides: Partial<RequirementView> = {},
): RequirementView {
  return {
    key,
    label: overrides.label ?? key,
    kind: overrides.kind ?? "EXPLICIT",
    operator: overrides.operator ?? null,
    numValue: overrides.numValue ?? null,
    textValue: overrides.textValue ?? null,
    unit: overrides.unit ?? null,
    sourceQuote: overrides.sourceQuote ?? null,
    confidence: overrides.confidence ?? 1,
    note: overrides.note ?? null,
  };
}

export function rule(
  overrides: Partial<CompatibilityRuleView> & { code: string; specKey: string; requirementKey: string },
): CompatibilityRuleView {
  return {
    code: overrides.code,
    dimension: overrides.dimension ?? overrides.code.toLowerCase(),
    label: overrides.label ?? overrides.code,
    specKey: overrides.specKey,
    requirementKey: overrides.requirementKey,
    operator: overrides.operator ?? "GTE",
    severity: overrides.severity ?? "HARD",
    tolerancePct: overrides.tolerancePct ?? null,
    appliesTo: overrides.appliesTo ?? [],
    explanation: overrides.explanation ?? "Because the rule says so.",
  };
}

export function inventory(
  warehouseCode: string,
  onHand: number,
  overrides: Partial<InventoryRecord> = {},
): InventoryRecord {
  return {
    warehouseCode,
    warehouseName: overrides.warehouseName ?? `${warehouseCode} warehouse`,
    city: overrides.city ?? "Somewhere",
    state: overrides.state ?? "TX",
    freightZone: overrides.freightZone ?? "SOUTH_CENTRAL",
    handlingDays: overrides.handlingDays ?? 1,
    onHand,
    reserved: overrides.reserved ?? 0,
    safetyStock: overrides.safetyStock ?? 0,
    incoming: overrides.incoming ?? [],
  };
}

/** A fixed Monday, so business-day arithmetic in tests is predictable. */
export const MONDAY = new Date("2026-03-02T00:00:00.000Z");
