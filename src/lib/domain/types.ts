/**
 * Plain-data types shared by the deterministic engines.
 *
 * The engines never import Prisma. They take these structures, return these
 * structures, and are therefore unit-testable without a database — which is
 * what makes it practical to write adversarial tests for pricing, ATP and
 * approval policy.
 */

import type { Cents } from "@/lib/money";

export type CheckResult = "PASS" | "FAIL" | "WARNING" | "UNKNOWN" | "NOT_APPLICABLE";
export type RuleSeverity = "HARD" | "SOFT";
export type RuleOperator = "GTE" | "LTE" | "EQ" | "NEQ" | "INCLUDES" | "WITHIN_TOLERANCE";
export type SafetyClass = "AUTO_SAFE" | "NEEDS_REVIEW" | "BLOCKED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";
export type SubstitutionKind =
  | "DIRECT_REPLACEMENT"
  | "SUCCESSOR"
  | "UPGRADE"
  | "ALTERNATE"
  | "ACCESSORY_REQUIRED";

// ─────────────────────────── Catalog ────────────────────────────

export interface SpecValue {
  key: string;
  label: string;
  type: "NUMERIC" | "RANGE" | "ENUM" | "BOOLEAN" | "TEXT";
  numValue?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  textValue?: string | null;
  boolValue?: boolean | null;
  unit?: string | null;
}

export interface ProductView {
  id: string;
  sku: string;
  name: string;
  categoryCode: string;
  family: string;
  description: string;
  lifecycle: "ACTIVE" | "MATURE" | "END_OF_LIFE" | "DISCONTINUED";
  leadTimeDays: number;
  listPriceCents: Cents;
  standardCostCents: Cents;
  weightKg: number;
  isAccessory: boolean;
  hazmat: boolean;
  specs: Record<string, SpecValue>;
}

// ──────────────────────── Requirements ──────────────────────────

export type RequirementKind = "EXPLICIT" | "INFERRED" | "AMBIGUOUS" | "MISSING";

export interface RequirementView {
  key: string;
  label: string;
  kind: RequirementKind;
  operator?: RuleOperator | null;
  numValue?: number | null;
  textValue?: string | null;
  unit?: string | null;
  sourceQuote?: string | null;
  confidence: number;
  note?: string | null;
}

// ─────────────────────── Compatibility ──────────────────────────

export interface CompatibilityRuleView {
  code: string;
  dimension: string;
  label: string;
  specKey: string;
  requirementKey: string;
  operator: RuleOperator;
  severity: RuleSeverity;
  tolerancePct?: number | null;
  appliesTo: string[];
  explanation: string;
}

export interface CheckOutcome {
  dimension: string;
  label: string;
  result: CheckResult;
  severity: RuleSeverity;
  /** What the customer asked for, rendered for display. */
  requirement: string;
  /** What the product actually provides, rendered for display. */
  actual: string;
  detail: string;
  ruleCode?: string;
  /** Spec key the value was read from — drives the evidence link. */
  specKey?: string;
}

export interface CompatibilityVerdict {
  productId: string;
  sku: string;
  /** BLOCKED when any HARD rule failed — this candidate can never be offered. */
  safety: SafetyClass;
  checks: CheckOutcome[];
  hardFailures: CheckOutcome[];
  warnings: CheckOutcome[];
  unknowns: CheckOutcome[];
  /** Ordering score for viable candidates only; never a substitute for checks. */
  score: number;
}

// ───────────────────────── Inventory ────────────────────────────

export interface InventoryRecord {
  warehouseCode: string;
  warehouseName: string;
  city: string;
  state: string;
  freightZone: string;
  handlingDays: number;
  onHand: number;
  reserved: number;
  safetyStock: number;
  incoming: { quantity: number; expectedAt: Date; poNumber: string; confirmed: boolean }[];
}

export interface Allocation {
  warehouseCode: string;
  warehouseName: string;
  quantity: number;
  /** "STOCK" draws on available-to-promise; "INCOMING" waits for a receipt. */
  source: "STOCK" | "INCOMING" | "FACTORY";
  readyDate: Date;
  note?: string;
}

export interface FulfillmentPlan {
  requestedQty: number;
  allocatedQty: number;
  shortfall: number;
  /** True only when every unit has a source. */
  canFulfill: boolean;
  /** True when allocation spans more than one warehouse. */
  isSplit: boolean;
  allocations: Allocation[];
  /** Date the last unit is ready to ship. */
  readyDate: Date | null;
  meetsDeadline: boolean | null;
  notes: string[];
}

// ────────────────────────── Pricing ─────────────────────────────

export type PriceSource = "CONTRACT" | "PRICE_BOOK" | "VOLUME_BREAK" | "LIST" | "MANUAL";

export interface PricingInputs {
  listPriceCents: Cents;
  standardCostCents: Cents;
  quantity: number;
  /** Discount percent from the customer's assigned price book. */
  priceBookDiscountPct?: number | null;
  /** Negotiated contract price per unit, if one is active today. */
  contractPriceCents?: Cents | null;
  contractRef?: string | null;
  /** Best applicable volume break percent. */
  volumeDiscountPct?: number | null;
  volumeRuleCode?: string | null;
  /** Rep-entered override percent off list. */
  manualDiscountPct?: number | null;
}

export interface PricedLine {
  quantity: number;
  listPriceCents: Cents;
  unitPriceCents: Cents;
  discountPct: number;
  priceSource: PriceSource;
  priceSourceDetail: string;
  extendedCents: Cents;
  unitCostCents: Cents;
  extendedCostCents: Cents;
  /** Every candidate price considered, for audit. */
  considered: { source: PriceSource; unitPriceCents: Cents; detail: string }[];
}

// ────────────────────────── Freight ─────────────────────────────

export type FreightService = "GROUND" | "EXPEDITED" | "AIR";

export interface FreightRuleView {
  code: string;
  originZone: string;
  destZone: string;
  service: FreightService;
  baseChargeCents: Cents;
  perKgCents: number;
  transitDays: number;
  hazmatSurchargeCents: Cents;
}

/**
 * One physical consignment leaving one warehouse. Lines that ship from the
 * same site are merged into a single shipment before rating — a pump and its
 * adapter kit picked at the same dock go on one truck.
 */
export interface FreightShipment {
  warehouseCode: string;
  warehouseName: string;
  weightKg: number;
  readyDate: Date;
}

export interface FreightLeg {
  originZone: string;
  originWarehouse: string;
  weightKg: number;
  service: FreightService;
  ruleCode: string;
  costCents: Cents;
  transitDays: number;
  hazmatApplied: boolean;
}

export interface FreightQuote {
  legs: FreightLeg[];
  totalCents: Cents;
  service: FreightService;
  maxTransitDays: number;
  /** True only when a faster service was bought AND it makes the date. */
  expedited: boolean;
  /** True when no service level reaches the site in time. */
  missesDeadline: boolean;
  estimatedArrival: Date | null;
  notes: string[];
}

// ─────────────────────────── Margin ─────────────────────────────

export interface MarginResult {
  /** Goods revenue — the quote subtotal, excluding freight. */
  revenueCents: Cents;
  /** Cost of goods sold. */
  costCents: Cents;
  /** Freight, billed to the customer at cost. Nets to zero in the margin. */
  freightCostCents: Cents;
  marginCents: Cents;
  /** Margin against everything invoiced, goods plus freight. */
  marginPct: number;
  productMarginCents: Cents;
  /** Margin against goods revenue alone — how well the goods were sold. */
  productMarginPct: number;
}

// ───────────────────────── Approvals ────────────────────────────

export type ApprovalKind =
  | "DELIVERY_DATE_MISS"
  | "DISCOUNT_THRESHOLD"
  | "MARGIN_FLOOR"
  | "TECHNICAL_SUBSTITUTION"
  | "COMPATIBILITY_WARNING"
  | "EXPEDITED_FREIGHT"
  | "LARGE_QUOTE_VALUE"
  | "TECHNICAL_UNCERTAINTY"
  | "SPLIT_FULFILLMENT";

export type UserRole = "SALES_REP" | "SALES_MANAGER" | "APPLICATION_ENGINEER" | "ADMIN";

export interface PolicyThresholds {
  /** Discount percent above which a manager must sign off. */
  maxDiscountPct: number;
  /** Gross margin percent below which a manager must sign off. */
  minMarginPct: number;
  /** Quote total above which a manager must sign off. */
  largeQuoteCents: Cents;
  /** Margin percent below which the deal is refused outright. */
  hardMarginFloorPct: number;
  /** Largest quantity a single factory build may be promised for. */
  maxFactoryUnits: number;
}

export interface ApprovalRequirement {
  kind: ApprovalKind;
  requiredRole: UserRole;
  title: string;
  reason: string;
  proposedAction: string;
  commercialImpact: string;
  technicalImpact: string;
  riskNote: string;
  context: Record<string, unknown>;
}
