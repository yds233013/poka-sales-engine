/**
 * Prisma row → engine view mappers.
 *
 * The engines take plain data. These functions are the only place Prisma
 * shapes are converted, which keeps the Decimal→cents conversion in one
 * reviewable spot.
 */

import type { InventoryRecord, ProductView, SpecValue, RequirementView, CompatibilityRuleView, FreightRuleView } from "@/lib/domain/types";
import { toCents } from "@/lib/money";
import { dec, decOrNull, type Decimalish } from "@/lib/decimal";

export { dec, decOrNull };

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string;
  lifecycle: string;
  leadTimeDays: number;
  listPrice: Decimalish;
  standardCost: Decimalish;
  weightKg: Decimalish;
  isAccessory: boolean;
  hazmat: boolean;
  category: { code: string; family: string };
  specs: {
    key: string;
    label: string;
    type: string;
    numValue: Decimalish;
    minValue: Decimalish;
    maxValue: Decimalish;
    textValue: string | null;
    boolValue: boolean | null;
    unit: string | null;
  }[];
}

export function toProductView(row: ProductRow): ProductView {
  const specs: Record<string, SpecValue> = {};
  for (const spec of row.specs) {
    specs[spec.key] = {
      key: spec.key,
      label: spec.label,
      type: spec.type as SpecValue["type"],
      numValue: decOrNull(spec.numValue),
      minValue: decOrNull(spec.minValue),
      maxValue: decOrNull(spec.maxValue),
      textValue: spec.textValue,
      boolValue: spec.boolValue,
      unit: spec.unit,
    };
  }
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    categoryCode: row.category.code,
    family: row.category.family,
    description: row.description,
    lifecycle: row.lifecycle as ProductView["lifecycle"],
    leadTimeDays: row.leadTimeDays,
    listPriceCents: toCents(dec(row.listPrice)),
    standardCostCents: toCents(dec(row.standardCost)),
    weightKg: dec(row.weightKg),
    isAccessory: row.isAccessory,
    hazmat: row.hazmat,
    specs,
  };
}

interface InventoryRow {
  onHand: number;
  reserved: number;
  safetyStock: number;
  warehouse: {
    code: string;
    name: string;
    city: string;
    state: string;
    freightZone: string;
    handlingDays: number;
  };
  incoming: { quantity: number; expectedAt: Date; poNumber: string; confirmed: boolean }[];
}

export function toInventoryRecord(row: InventoryRow): InventoryRecord {
  return {
    warehouseCode: row.warehouse.code,
    warehouseName: row.warehouse.name,
    city: row.warehouse.city,
    state: row.warehouse.state,
    freightZone: row.warehouse.freightZone,
    handlingDays: row.warehouse.handlingDays,
    onHand: row.onHand,
    reserved: row.reserved,
    safetyStock: row.safetyStock,
    incoming: row.incoming.map((i) => ({
      quantity: i.quantity,
      expectedAt: i.expectedAt,
      poNumber: i.poNumber,
      confirmed: i.confirmed,
    })),
  };
}

interface RequirementRow {
  key: string;
  label: string;
  kind: string;
  operator: string | null;
  numValue: Decimalish;
  textValue: string | null;
  unit: string | null;
  sourceQuote: string | null;
  confidence: Decimalish;
  note: string | null;
}

export function toRequirementView(row: RequirementRow): RequirementView {
  return {
    key: row.key,
    label: row.label,
    kind: row.kind as RequirementView["kind"],
    operator: row.operator as RequirementView["operator"],
    numValue: decOrNull(row.numValue),
    textValue: row.textValue,
    unit: row.unit,
    sourceQuote: row.sourceQuote,
    confidence: dec(row.confidence),
    note: row.note,
  };
}

interface RuleRow {
  code: string;
  dimension: string;
  label: string;
  specKey: string;
  requirementKey: string;
  operator: string;
  severity: string;
  tolerancePct: Decimalish;
  appliesTo: string[];
  explanation: string;
}

export function toRuleView(row: RuleRow): CompatibilityRuleView {
  return {
    code: row.code,
    dimension: row.dimension,
    label: row.label,
    specKey: row.specKey,
    requirementKey: row.requirementKey,
    operator: row.operator as CompatibilityRuleView["operator"],
    severity: row.severity as CompatibilityRuleView["severity"],
    tolerancePct: decOrNull(row.tolerancePct),
    appliesTo: row.appliesTo,
    explanation: row.explanation,
  };
}

interface FreightRow {
  code: string;
  originZone: string;
  destZone: string;
  service: string;
  baseCharge: Decimalish;
  perKg: Decimalish;
  transitDays: number;
  hazmatSurcharge: Decimalish;
}

export function toFreightRuleView(row: FreightRow): FreightRuleView {
  return {
    code: row.code,
    originZone: row.originZone,
    destZone: row.destZone,
    service: row.service as FreightRuleView["service"],
    baseChargeCents: toCents(dec(row.baseCharge)),
    perKgCents: dec(row.perKg) * 100,
    transitDays: row.transitDays,
    hazmatSurchargeCents: toCents(dec(row.hazmatSurcharge)),
  };
}
