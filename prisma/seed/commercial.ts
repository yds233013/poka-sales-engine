/**
 * Warehouses, stock positions, price books, discount rules and freight rates.
 *
 * Stock is generated from a seeded PRNG so a re-seed reproduces the same
 * catalog-wide picture, then specific positions are overridden by hand. Those
 * overrides are what make the demo scenarios real rather than staged: the
 * "out of stock" case is out of stock because the inventory table says zero,
 * and the split shipment splits because no single site holds enough.
 */

export interface WarehouseDef {
  code: string;
  name: string;
  city: string;
  state: string;
  freightZone: string;
  handlingDays: number;
}

export const WAREHOUSES: WarehouseDef[] = [
  { code: "DAL", name: "Dallas distribution centre", city: "Dallas", state: "TX", freightZone: "SOUTH_CENTRAL", handlingDays: 1 },
  { code: "HOU", name: "Houston distribution centre", city: "Houston", state: "TX", freightZone: "SOUTH_CENTRAL", handlingDays: 1 },
  { code: "ATL", name: "Atlanta distribution centre", city: "Atlanta", state: "GA", freightZone: "SOUTHEAST", handlingDays: 1 },
  { code: "CHI", name: "Chicago central warehouse", city: "Elk Grove Village", state: "IL", freightZone: "MIDWEST", handlingDays: 2 },
  { code: "EDI", name: "Edison distribution centre", city: "Edison", state: "NJ", freightZone: "NORTHEAST", handlingDays: 1 },
  { code: "RNO", name: "Reno distribution centre", city: "Reno", state: "NV", freightZone: "WEST", handlingDays: 2 },
];

/** The factory ships from the Midwest plant when nothing is in stock. */
export const FACTORY_ZONE = "MIDWEST";

export const ZONES = ["SOUTH_CENTRAL", "SOUTHEAST", "MIDWEST", "NORTHEAST", "WEST"] as const;
export type Zone = (typeof ZONES)[number];

/** Relative haul distance between zones — drives base rate and transit days. */
const ZONE_DISTANCE: Record<Zone, Record<Zone, 0 | 1 | 2 | 3>> = {
  SOUTH_CENTRAL: { SOUTH_CENTRAL: 0, SOUTHEAST: 1, MIDWEST: 1, NORTHEAST: 2, WEST: 2 },
  SOUTHEAST: { SOUTH_CENTRAL: 1, SOUTHEAST: 0, MIDWEST: 1, NORTHEAST: 1, WEST: 3 },
  MIDWEST: { SOUTH_CENTRAL: 1, SOUTHEAST: 1, MIDWEST: 0, NORTHEAST: 1, WEST: 2 },
  NORTHEAST: { SOUTH_CENTRAL: 2, SOUTHEAST: 1, MIDWEST: 1, NORTHEAST: 0, WEST: 3 },
  WEST: { SOUTH_CENTRAL: 2, SOUTHEAST: 3, MIDWEST: 2, NORTHEAST: 3, WEST: 0 },
};

const GROUND_BY_DISTANCE = [
  { base: 145, perKg: 0.38, transit: 2 },
  { base: 210, perKg: 0.55, transit: 3 },
  { base: 295, perKg: 0.78, transit: 5 },
  { base: 380, perKg: 0.96, transit: 6 },
] as const;

export interface FreightRuleDef {
  code: string;
  originZone: string;
  destZone: string;
  service: "GROUND" | "EXPEDITED" | "AIR";
  baseCharge: number;
  perKg: number;
  transitDays: number;
  hazmatSurcharge: number;
}

/** Full origin × destination × service matrix, derived from zone distance. */
export function buildFreightRules(): FreightRuleDef[] {
  const rules: FreightRuleDef[] = [];
  for (const origin of ZONES) {
    for (const dest of ZONES) {
      const distance = ZONE_DISTANCE[origin][dest];
      const ground = GROUND_BY_DISTANCE[distance];
      rules.push({
        code: `FR-${origin}-${dest}-GND`,
        originZone: origin,
        destZone: dest,
        service: "GROUND",
        baseCharge: ground.base,
        perKg: ground.perKg,
        transitDays: ground.transit,
        hazmatSurcharge: 85,
      });
      rules.push({
        code: `FR-${origin}-${dest}-EXP`,
        originZone: origin,
        destZone: dest,
        service: "EXPEDITED",
        baseCharge: Math.round(ground.base * 1.9),
        perKg: Math.round(ground.perKg * 2.4 * 100) / 100,
        transitDays: Math.max(1, ground.transit - 2),
        hazmatSurcharge: 140,
      });
      rules.push({
        code: `FR-${origin}-${dest}-AIR`,
        originZone: origin,
        destZone: dest,
        service: "AIR",
        baseCharge: Math.round(ground.base * 3.4),
        perKg: Math.round(ground.perKg * 5.5 * 100) / 100,
        transitDays: 1,
        hazmatSurcharge: 420,
      });
    }
  }
  return rules;
}

// ────────────────────────────── Price books ────────────────────────────────

export const PRICE_BOOKS = [
  {
    code: "PB-LIST",
    name: "Published list",
    description: "No standing discount. Applied to transactional accounts and first orders.",
    defaultDiscountPct: 0,
  },
  {
    code: "PB-STD",
    name: "Standard distributor",
    description: "Default commercial terms for established accounts.",
    defaultDiscountPct: 8,
  },
  {
    code: "PB-KEY",
    name: "Key account",
    description: "Negotiated terms for accounts above roughly $500k annual spend.",
    defaultDiscountPct: 12,
  },
  {
    code: "PB-STRAT",
    name: "Strategic partner",
    description:
      "Deepest standing discount, tied to a multi-year volume commitment. Margin on these accounts is intentionally thin and is monitored deal by deal.",
    defaultDiscountPct: 26,
  },
  {
    code: "PB-MUNI",
    name: "Municipal and public sector",
    description: "Cooperative-contract pricing for municipal water and wastewater buyers.",
    defaultDiscountPct: 15,
  },
];

export const DISCOUNT_RULES = [
  { code: "VOL-005", scope: "QUANTITY", categoryCode: null, minQty: 5, discountPct: 4, description: "5 units or more of any catalog line." },
  { code: "VOL-010", scope: "QUANTITY", categoryCode: null, minQty: 10, discountPct: 8, description: "10 units or more of any catalog line." },
  { code: "VOL-020", scope: "QUANTITY", categoryCode: null, minQty: 20, discountPct: 12, description: "20 units or more of any catalog line." },
  { code: "VOL-050", scope: "QUANTITY", categoryCode: null, minQty: 50, discountPct: 17, description: "50 units or more of any catalog line." },
  { code: "VOL-CPHT-010", scope: "QUANTITY", categoryCode: "CP-HT", minQty: 10, discountPct: 10, description: "10 or more high-temperature pumps — additional factory support." },
  { code: "VOL-ACC-010", scope: "QUANTITY", categoryCode: "ACC-SEAL", minQty: 10, discountPct: 14, description: "10 or more seal kits on one order." },
];

// ─────────────────────────────── Inventory ─────────────────────────────────

/** Deterministic PRNG so re-seeding reproduces the same stock picture. */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export interface StockOverride {
  sku: string;
  positions: { warehouse: string; onHand: number; reserved?: number; safetyStock?: number }[];
  /** Confirmed inbound receipts, expressed as days from the seed date. */
  incoming?: { warehouse: string; quantity: number; inDays: number; poNumber: string; confirmed?: boolean }[];
  /** When set, every warehouse not listed above is forced to zero. */
  exclusive?: boolean;
}

/**
 * Hand-set stock positions. Each one exists to make a specific demo scenario
 * behave the way a real stock position would.
 */
export const STOCK_OVERRIDES: StockOverride[] = [
  // Hero case: 12 units needed, no single site holds them.
  {
    sku: "PX-440",
    exclusive: true,
    positions: [
      { warehouse: "DAL", onHand: 9, reserved: 1, safetyStock: 2 },
      { warehouse: "HOU", onHand: 8, reserved: 1, safetyStock: 2 },
      { warehouse: "CHI", onHand: 2, reserved: 2, safetyStock: 2 },
    ],
    incoming: [{ warehouse: "CHI", quantity: 15, inDays: 33, poNumber: "PO-448120" }],
  },
  // Dedicated split-fulfillment case.
  {
    sku: "AX-220",
    exclusive: true,
    positions: [
      { warehouse: "DAL", onHand: 9, reserved: 2, safetyStock: 3 },
      { warehouse: "HOU", onHand: 8, reserved: 2, safetyStock: 3 },
      { warehouse: "CHI", onHand: 4, reserved: 0, safetyStock: 3 },
      { warehouse: "EDI", onHand: 3, reserved: 3, safetyStock: 2 },
    ],
  },
  // End-of-life lines with no stock left.
  { sku: "AX-260", exclusive: true, positions: [] },
  { sku: "RG-100", exclusive: true, positions: [] },
  {
    sku: "PX-420",
    exclusive: true,
    positions: [],
    incoming: [{ warehouse: "CHI", quantity: 6, inDays: 41, poNumber: "PO-449003" }],
  },
  {
    sku: "PX-422",
    exclusive: true,
    positions: [],
    incoming: [{ warehouse: "CHI", quantity: 20, inDays: 24, poNumber: "PO-448771" }],
  },
  { sku: "PX-480", exclusive: true, positions: [] },
  { sku: "PX-500", exclusive: true, positions: [] },
  { sku: "MX-200", exclusive: true, positions: [] },
  {
    sku: "DG-50",
    exclusive: true,
    positions: [],
    incoming: [{ warehouse: "ATL", quantity: 12, inDays: 38, poNumber: "PO-449210" }],
  },
  // Successor and alternate lines that are well stocked.
  {
    sku: "AX-262",
    exclusive: true,
    positions: [
      { warehouse: "ATL", onHand: 12, reserved: 0, safetyStock: 2 },
      { warehouse: "CHI", onHand: 9, reserved: 1, safetyStock: 2 },
      { warehouse: "DAL", onHand: 4, reserved: 0, safetyStock: 2 },
    ],
  },
  {
    sku: "MX-160",
    exclusive: true,
    positions: [
      { warehouse: "ATL", onHand: 14, reserved: 1, safetyStock: 3 },
      { warehouse: "CHI", onHand: 6, reserved: 0, safetyStock: 2 },
      { warehouse: "EDI", onHand: 4, reserved: 0, safetyStock: 2 },
    ],
  },
  {
    sku: "RG-120",
    exclusive: true,
    positions: [
      { warehouse: "CHI", onHand: 9, reserved: 1, safetyStock: 2 },
      { warehouse: "EDI", onHand: 5, reserved: 0, safetyStock: 1 },
    ],
  },
  {
    sku: "DG-52",
    exclusive: true,
    positions: [
      { warehouse: "ATL", onHand: 18, reserved: 2, safetyStock: 4 },
      { warehouse: "EDI", onHand: 12, reserved: 0, safetyStock: 3 },
    ],
  },
  {
    sku: "VS-250",
    exclusive: true,
    positions: [
      { warehouse: "CHI", onHand: 30, reserved: 2, safetyStock: 5 },
      { warehouse: "EDI", onHand: 14, reserved: 0, safetyStock: 4 },
      { warehouse: "ATL", onHand: 10, reserved: 0, safetyStock: 3 },
    ],
  },
  {
    sku: "PX-460",
    exclusive: true,
    positions: [
      { warehouse: "DAL", onHand: 2, reserved: 0, safetyStock: 1 },
      { warehouse: "CHI", onHand: 3, reserved: 0, safetyStock: 1 },
    ],
  },
  {
    sku: "PX-400",
    exclusive: true,
    positions: [
      { warehouse: "CHI", onHand: 6, reserved: 0, safetyStock: 2 },
      { warehouse: "EDI", onHand: 3, reserved: 0, safetyStock: 1 },
    ],
  },
  {
    sku: "AX-200-CI",
    exclusive: true,
    positions: [
      { warehouse: "CHI", onHand: 12, reserved: 1, safetyStock: 3 },
      { warehouse: "RNO", onHand: 8, reserved: 0, safetyStock: 2 },
      { warehouse: "DAL", onHand: 5, reserved: 0, safetyStock: 2 },
    ],
  },
  {
    sku: "AX-280",
    exclusive: true,
    positions: [
      { warehouse: "CHI", onHand: 7, reserved: 1, safetyStock: 2 },
      { warehouse: "EDI", onHand: 5, reserved: 0, safetyStock: 2 },
      { warehouse: "ATL", onHand: 3, reserved: 0, safetyStock: 1 },
    ],
  },
  {
    sku: "FA-4050",
    exclusive: true,
    positions: [
      { warehouse: "CHI", onHand: 40, reserved: 0, safetyStock: 10 },
      { warehouse: "DAL", onHand: 25, reserved: 0, safetyStock: 8 },
      { warehouse: "ATL", onHand: 30, reserved: 0, safetyStock: 8 },
    ],
  },
];

/**
 * Baseline stock for everything not explicitly overridden. Accessories carry
 * deeper stock than pumps, and the two Texas sites are smaller than Chicago —
 * which is what produces realistic split behaviour across the catalog.
 */
export function baselineStock(
  sku: string,
  categoryCode: string,
  isAccessory: boolean,
  warehouseCode: string,
  rand: () => number,
): { onHand: number; reserved: number; safetyStock: number } {
  const siteScale: Record<string, number> = {
    CHI: 1.6,
    ATL: 1.1,
    EDI: 1.0,
    DAL: 0.75,
    HOU: 0.7,
    RNO: 0.5,
  };
  const base = isAccessory ? 22 : categoryCode === "PD-DIA" ? 16 : 9;
  const raw = Math.floor(base * (siteScale[warehouseCode] ?? 1) * (0.35 + rand() * 1.3));
  const onHand = Math.max(0, raw);
  const reserved = onHand > 3 ? Math.floor(rand() * Math.min(4, onHand - 2)) : 0;
  const safetyStock = Math.max(1, Math.round(onHand * 0.18));
  void sku;
  return { onHand, reserved, safetyStock };
}
