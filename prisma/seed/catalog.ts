/**
 * Synthetic industrial catalog — process pumps, drives and accessories.
 *
 * Everything here is invented. The numbers are internally consistent (a
 * larger frame size draws more power, costs more and weighs more) because the
 * whole point of the demonstration is that substitution decisions are
 * non-trivial: families overlap, and picking a part requires comparing half a
 * dozen dimensions rather than matching a category.
 *
 * Base models are written out explicitly; derived variants (cast-iron wetted
 * parts, 230 V builds, jacketed bodies) are generated from them so the catalog
 * reaches realistic breadth without hand-typing a hundred near-duplicates.
 */

export type Lifecycle = "ACTIVE" | "MATURE" | "END_OF_LIFE" | "DISCONTINUED";

export interface ProductDef {
  sku: string;
  name: string;
  categoryCode: string;
  description: string;
  lifecycle: Lifecycle;
  leadTimeDays: number;
  listPrice: number;
  standardCost: number;
  weightKg: number;
  isAccessory?: boolean;
  hazmat?: boolean;
  specs: Record<string, number | string | boolean>;
}

export const CATEGORIES = [
  {
    code: "CP-STD",
    name: "Standard centrifugal process pumps",
    family: "AX Series",
    description:
      "ANSI-dimensioned horizontal end-suction process pumps for general chemical and utility duty up to 120 °C.",
  },
  {
    code: "CP-HT",
    name: "High-temperature centrifugal pumps",
    family: "PX Series",
    description:
      "Heavy-duty centre-line mounted pumps with cartridge seals and cooled bearing housings for thermal fluid and hot process duty.",
  },
  {
    code: "MD-SEAL",
    name: "Magnetic-drive sealless pumps",
    family: "MX Series",
    description:
      "Sealless magnetic-drive pumps for aggressive, toxic or zero-emission chemical service.",
  },
  {
    code: "PD-GEAR",
    name: "Rotary gear pumps",
    family: "RG Series",
    description:
      "Internal gear pumps for viscous fluids — resins, adhesives, heavy oils and asphalt.",
  },
  {
    code: "PD-DIA",
    name: "Air-operated double-diaphragm pumps",
    family: "DG Series",
    description:
      "Air-driven diaphragm pumps for transfer duty where no electrical supply is available or solids are present.",
  },
  {
    code: "VI-PUMP",
    name: "Vertical inline pumps",
    family: "VS Series",
    description:
      "Close-coupled vertical inline pumps for building services and circulation duty in constrained footprints.",
  },
  {
    code: "ACC-ADPT",
    name: "Connection adapters",
    family: "FA Series",
    description: "Flange and thread adapter kits used when a replacement pump has a different connection size.",
  },
  {
    code: "ACC-SEAL",
    name: "Seal and repair kits",
    family: "SK Series",
    description: "Cartridge seals, containment shells and wear-part kits matched to specific pump frames.",
  },
  {
    code: "ACC-DRIVE",
    name: "Drives and controls",
    family: "VFD Series",
    description: "Variable frequency drives and control accessories sized to the pump motor rating.",
  },
  {
    code: "ACC-MOUNT",
    name: "Baseplates and mounting",
    family: "BP Series",
    description: "Fabricated and grouted baseplates, couplings and guards.",
  },
];

const COMMON_ELECTRIC = {
  motor_voltage: "460 V 3ph 60 Hz",
  ip_rating: "IP55",
  duty_cycle: "Continuous",
};

// ───────────────────────── AX Series — standard centrifugal ────────────────

interface AxRow {
  sku: string;
  flow: number;
  head: number;
  pressure: number;
  conn: string;
  kw: number;
  npshr: number;
  length: number;
  width: number;
  height: number;
  list: number;
  cost: number;
  weight: number;
  lifecycle?: Lifecycle;
  lead: number;
}

const AX_ROWS: AxRow[] = [
  { sku: "AX-180", flow: 25, head: 32, pressure: 10, conn: "ANSI 150# flange DN40 1.5in", kw: 5.5, npshr: 2.1, length: 720, width: 320, height: 410, list: 3850, cost: 2310, weight: 88, lead: 28 },
  { sku: "AX-200", flow: 40, head: 40, pressure: 12, conn: "ANSI 150# flange DN50 2in", kw: 7.5, npshr: 2.4, length: 780, width: 340, height: 430, list: 4420, cost: 2652, weight: 104, lead: 28 },
  { sku: "AX-220", flow: 60, head: 46, pressure: 14, conn: "ANSI 150# flange DN50 2in", kw: 11, npshr: 2.8, length: 840, width: 360, height: 455, list: 5180, cost: 3108, weight: 122, lead: 30 },
  { sku: "AX-240", flow: 85, head: 52, pressure: 16, conn: "ANSI 150# flange DN80 3in", kw: 15, npshr: 3.2, length: 910, width: 385, height: 480, list: 6240, cost: 3744, weight: 148, lead: 30 },
  { sku: "AX-260", flow: 110, head: 58, pressure: 16, conn: "ANSI 150# flange DN80 3in", kw: 18.5, npshr: 3.6, length: 980, width: 410, height: 505, list: 7350, cost: 4410, weight: 172, lifecycle: "END_OF_LIFE", lead: 65 },
  { sku: "AX-262", flow: 112, head: 59, pressure: 16, conn: "ANSI 150# flange DN80 3in", kw: 18.5, npshr: 3.5, length: 985, width: 410, height: 505, list: 7580, cost: 4396, weight: 170, lead: 32 },
  { sku: "AX-280", flow: 140, head: 62, pressure: 18, conn: "ANSI 150# flange DN100 4in", kw: 22, npshr: 4.1, length: 1050, width: 440, height: 535, list: 8720, cost: 5232, weight: 205, lead: 32 },
  { sku: "AX-300", flow: 180, head: 68, pressure: 20, conn: "ANSI 150# flange DN100 4in", kw: 30, npshr: 4.6, length: 1140, width: 470, height: 570, list: 10450, cost: 6270, weight: 244, lead: 35 },
  { sku: "AX-320", flow: 230, head: 74, pressure: 20, conn: "ANSI 150# flange DN150 6in", kw: 37, npshr: 5.2, length: 1230, width: 505, height: 610, list: 12800, cost: 7680, weight: 290, lead: 40 },
];

function axProduct(row: AxRow): ProductDef {
  return {
    sku: row.sku,
    name: `${row.sku} ANSI process pump, ${row.flow} m³/h`,
    categoryCode: "CP-STD",
    description: `Horizontal end-suction process pump, 316 stainless wetted parts, single cartridge mechanical seal. Rated ${row.flow} m³/h at ${row.head} m head.`,
    lifecycle: row.lifecycle ?? "ACTIVE",
    leadTimeDays: row.lead,
    listPrice: row.list,
    standardCost: row.cost,
    weightKg: row.weight,
    specs: {
      ...COMMON_ELECTRIC,
      max_fluid_temp_c: 120,
      min_fluid_temp_c: -20,
      max_pressure_bar: row.pressure,
      max_viscosity_cp: 200,
      max_flow_m3h: row.flow,
      max_head_m: row.head,
      npshr_m: row.npshr,
      inlet_connection: row.conn,
      outlet_connection: row.conn.replace("DN150 6in", "DN100 4in"),
      wetted_material: "316 stainless steel",
      seal_type: "Single cartridge mechanical seal, carbon/SiC, FKM elastomer",
      bearing_type: "Grease-lubricated deep groove ball",
      motor_power_kw: row.kw,
      hazardous_area_rating: "None — general purpose",
      certifications: "CE, UL 778",
      length_mm: row.length,
      width_mm: row.width,
      height_mm: row.height,
    },
  };
}

/** Cast-iron wetted variant: cheaper, lower temperature ceiling, same hydraulics. */
function castIronVariant(base: ProductDef): ProductDef {
  return {
    ...base,
    sku: `${base.sku}-CI`,
    name: `${base.sku}-CI ANSI process pump, cast iron`,
    description: `${base.description.split(".")[0]}. Cast iron wetted parts for water and non-corrosive utility duty.`,
    listPrice: Math.round(base.listPrice * 0.84),
    standardCost: Math.round(base.standardCost * 0.8),
    weightKg: Math.round(base.weightKg * 1.08),
    specs: {
      ...base.specs,
      wetted_material: "Cast iron ASTM A48",
      max_fluid_temp_c: 110,
      seal_type: "Single cartridge mechanical seal, carbon/SiC, NBR elastomer",
    },
  };
}

/** 230 V build for sites without a 460 V supply. */
function lowVoltageVariant(base: ProductDef): ProductDef {
  return {
    ...base,
    sku: `${base.sku}-LV`,
    name: `${base.sku}-LV ANSI process pump, 230 V`,
    description: `${base.description.split(".")[0]}. 230 V 3-phase build for sites without a 460 V supply.`,
    listPrice: Math.round(base.listPrice * 1.04),
    standardCost: Math.round(base.standardCost * 1.03),
    leadTimeDays: base.leadTimeDays + 10,
    specs: { ...base.specs, motor_voltage: "230 V 3ph 60 Hz" },
  };
}

// ───────────────────────── PX Series — high temperature ────────────────────

interface PxRow {
  sku: string;
  maxTemp: number;
  flow: number;
  head: number;
  pressure: number;
  conn: string;
  kw: number;
  npshr: number;
  length: number;
  list: number;
  cost: number;
  weight: number;
  hazard: string;
  lead: number;
  lifecycle?: Lifecycle;
}

const PX_ROWS: PxRow[] = [
  { sku: "PX-400", maxTemp: 190, flow: 35, head: 42, pressure: 14, conn: "ANSI 150# flange DN50 2in", kw: 7.5, npshr: 2.6, length: 810, list: 7900, cost: 4977, weight: 132, hazard: "None — general purpose", lead: 35 },
  { sku: "PX-420", maxTemp: 195, flow: 55, head: 46, pressure: 16, conn: "ANSI 150# flange DN40 1.5in", kw: 11, npshr: 2.9, length: 860, list: 8950, cost: 5549, weight: 146, hazard: "None — general purpose", lead: 35 },
  { sku: "PX-422", maxTemp: 195, flow: 58, head: 47, pressure: 16, conn: "ANSI 150# flange DN50 2in", kw: 11, npshr: 2.9, length: 865, list: 9150, cost: 5673, weight: 148, hazard: "None — general purpose", lead: 42 },
  { sku: "PX-440", maxTemp: 205, flow: 75, head: 52, pressure: 18, conn: "ANSI 150# flange DN50 2in", kw: 15, npshr: 3.1, length: 880, list: 9640, cost: 5880, weight: 158, hazard: "None — general purpose", lead: 38 },
  { sku: "PX-460", maxTemp: 230, flow: 95, head: 58, pressure: 20, conn: "ANSI 150# flange DN50 2in", kw: 18.5, npshr: 3.4, length: 1010, list: 13400, cost: 8442, weight: 186, hazard: "ATEX II 3G Zone 2", lead: 45 },
  { sku: "PX-480", maxTemp: 300, flow: 120, head: 64, pressure: 22, conn: "ANSI 150# flange DN80 3in", kw: 22, npshr: 3.9, length: 1090, list: 16900, cost: 10816, weight: 214, hazard: "ATEX II 2G Zone 1", lead: 55 },
  { sku: "PX-500", maxTemp: 350, flow: 150, head: 70, pressure: 25, conn: "ANSI 150# flange DN100 4in", kw: 30, npshr: 4.4, length: 1180, list: 21500, cost: 13975, weight: 258, hazard: "ATEX II 2G Zone 1", lead: 60 },
];

function pxProduct(row: PxRow): ProductDef {
  return {
    sku: row.sku,
    name: `${row.sku} high-temperature process pump, ${row.maxTemp} °C`,
    categoryCode: "CP-HT",
    description: `Centre-line mounted high-temperature process pump with finned bearing housing and high-temperature cartridge seal. Rated to ${row.maxTemp} °C, ${row.flow} m³/h at ${row.head} m head.`,
    lifecycle: row.lifecycle ?? "ACTIVE",
    leadTimeDays: row.lead,
    listPrice: row.list,
    standardCost: row.cost,
    weightKg: row.weight,
    specs: {
      ...COMMON_ELECTRIC,
      max_fluid_temp_c: row.maxTemp,
      min_fluid_temp_c: -20,
      max_pressure_bar: row.pressure,
      max_viscosity_cp: 400,
      max_flow_m3h: row.flow,
      max_head_m: row.head,
      npshr_m: row.npshr,
      inlet_connection: row.conn,
      outlet_connection: row.conn,
      wetted_material: "316 stainless steel",
      seal_type: "High-temperature cartridge seal, SiC/SiC, flexible graphite",
      bearing_type: "Oil-lubricated angular contact, finned housing",
      motor_power_kw: row.kw,
      hazardous_area_rating: row.hazard,
      certifications: "CE, UL 778, API 610 OH2 dimensional",
      length_mm: row.length,
      width_mm: Math.round(row.length * 0.42),
      height_mm: Math.round(row.length * 0.55),
    },
  };
}

// ───────────────────────── MX Series — magnetic drive ──────────────────────

interface MxRow {
  sku: string;
  maxTemp: number;
  flow: number;
  head: number;
  pressure: number;
  conn: string;
  material: string;
  kw: number;
  list: number;
  cost: number;
  weight: number;
  length: number;
  lead: number;
}

const MX_ROWS: MxRow[] = [
  { sku: "MX-120", maxTemp: 120, flow: 12, head: 28, pressure: 10, conn: "ANSI 150# flange DN25 1in", material: "PFA-lined ductile iron", kw: 2.2, list: 6300, cost: 3780, weight: 72, length: 640, lead: 30 },
  { sku: "MX-140", maxTemp: 130, flow: 22, head: 34, pressure: 12, conn: "ANSI 150# flange DN40 1.5in", material: "PFA-lined ductile iron", kw: 4, list: 7450, cost: 4470, weight: 94, length: 700, lead: 30 },
  { sku: "MX-160", maxTemp: 140, flow: 35, head: 40, pressure: 14, conn: "ANSI 150# flange DN50 2in", material: "316 stainless steel", kw: 5.5, list: 8900, cost: 5340, weight: 118, length: 760, lead: 32 },
  { sku: "MX-180", maxTemp: 150, flow: 55, head: 46, pressure: 16, conn: "ANSI 150# flange DN50 2in", material: "316 stainless steel", kw: 7.5, list: 10600, cost: 6360, weight: 142, length: 820, lead: 32 },
  { sku: "MX-200", maxTemp: 120, flow: 70, head: 50, pressure: 18, conn: "ANSI 150# flange DN80 3in", material: "Hastelloy C-276", kw: 11, list: 18200, cost: 11830, weight: 168, length: 880, lead: 70 },
];

function mxProduct(row: MxRow): ProductDef {
  return {
    sku: row.sku,
    name: `${row.sku} magnetic-drive sealless pump, ${row.flow} m³/h`,
    categoryCode: "MD-SEAL",
    description: `Sealless magnetic-drive pump with ${row.material} wetted parts and silicon carbide bushings. Zero-emission duty for aggressive or toxic media.`,
    lifecycle: "ACTIVE",
    leadTimeDays: row.lead,
    listPrice: row.list,
    standardCost: row.cost,
    weightKg: row.weight,
    specs: {
      ...COMMON_ELECTRIC,
      max_fluid_temp_c: row.maxTemp,
      min_fluid_temp_c: -30,
      max_pressure_bar: row.pressure,
      max_viscosity_cp: 150,
      max_flow_m3h: row.flow,
      max_head_m: row.head,
      npshr_m: 3.8,
      inlet_connection: row.conn,
      outlet_connection: row.conn,
      wetted_material: row.material,
      seal_type: "Sealless — magnetic coupling, no dynamic seal",
      bearing_type: "Product-lubricated silicon carbide",
      motor_power_kw: row.kw,
      hazardous_area_rating: "ATEX II 2G Zone 1",
      certifications: "CE, ATEX 2014/34/EU, UL 778",
      length_mm: row.length,
      width_mm: Math.round(row.length * 0.44),
      height_mm: Math.round(row.length * 0.52),
    },
  };
}

// ───────────────────────── RG Series — gear pumps ──────────────────────────

interface RgRow {
  sku: string;
  maxTemp: number;
  flow: number;
  pressure: number;
  conn: string;
  viscosity: number;
  material: string;
  kw: number;
  list: number;
  cost: number;
  weight: number;
  length: number;
  lead: number;
  lifecycle?: Lifecycle;
}

const RG_ROWS: RgRow[] = [
  { sku: "RG-60", maxTemp: 180, flow: 8, pressure: 12, conn: "ANSI 150# flange DN25 1in", viscosity: 50000, material: "Cast iron ASTM A48", kw: 2.2, list: 4100, cost: 2460, weight: 64, length: 580, lead: 25 },
  { sku: "RG-80", maxTemp: 180, flow: 16, pressure: 14, conn: "ANSI 150# flange DN40 1.5in", viscosity: 50000, material: "Cast iron ASTM A48", kw: 4, list: 5300, cost: 3180, weight: 86, length: 640, lead: 25 },
  { sku: "RG-100", maxTemp: 200, flow: 28, pressure: 16, conn: "ANSI 150# flange DN40 1.5in", viscosity: 80000, material: "316 stainless steel", kw: 5.5, list: 7800, cost: 4680, weight: 112, length: 700, lead: 60, lifecycle: "DISCONTINUED" },
  { sku: "RG-120", maxTemp: 200, flow: 45, pressure: 16, conn: "ANSI 150# flange DN50 2in", viscosity: 80000, material: "316 stainless steel", kw: 7.5, list: 9900, cost: 5940, weight: 138, length: 745, lead: 30 },
];

function rgProduct(row: RgRow): ProductDef {
  return {
    sku: row.sku,
    name: `${row.sku} internal gear pump, ${row.flow} m³/h`,
    categoryCode: "PD-GEAR",
    description: `Internal gear pump for viscous media up to ${row.viscosity.toLocaleString()} cP. ${row.material} construction with hardened rotor and idler.`,
    lifecycle: row.lifecycle ?? "ACTIVE",
    leadTimeDays: row.lead,
    listPrice: row.list,
    standardCost: row.cost,
    weightKg: row.weight,
    specs: {
      ...COMMON_ELECTRIC,
      max_fluid_temp_c: row.maxTemp,
      min_fluid_temp_c: -10,
      max_pressure_bar: row.pressure,
      max_viscosity_cp: row.viscosity,
      max_flow_m3h: row.flow,
      max_head_m: Math.round(row.pressure * 10.2),
      npshr_m: 2.2,
      inlet_connection: row.conn,
      outlet_connection: row.conn,
      wetted_material: row.material,
      seal_type: "Single mechanical seal, carbon/SiC, FKM elastomer",
      bearing_type: "Bronze journal, product lubricated",
      motor_power_kw: row.kw,
      hazardous_area_rating: "None — general purpose",
      certifications: "CE, UL 778",
      length_mm: row.length,
      width_mm: Math.round(row.length * 0.46),
      height_mm: Math.round(row.length * 0.58),
    },
  };
}

/** Steam-jacketed variant for media that must stay hot in the pump body. */
function jacketedVariant(base: ProductDef): ProductDef {
  return {
    ...base,
    sku: `${base.sku}-J`,
    name: `${base.name.replace(base.sku, `${base.sku}-J`)} , steam jacketed`,
    description: `${base.description} Steam-jacketed body and jacketed cover for media that must be kept above ambient.`,
    listPrice: Math.round(base.listPrice * 1.28),
    standardCost: Math.round(base.standardCost * 1.3),
    weightKg: Math.round(base.weightKg * 1.15),
    leadTimeDays: base.leadTimeDays + 14,
    specs: {
      ...base.specs,
      max_fluid_temp_c: Number(base.specs.max_fluid_temp_c) + 30,
      length_mm: Math.round(Number(base.specs.length_mm) * 1.06),
    },
  };
}

// ───────────────────────── DG Series — diaphragm ───────────────────────────

interface DgRow {
  sku: string;
  maxTemp: number;
  flow: number;
  pressure: number;
  conn: string;
  material: string;
  elastomer: string;
  list: number;
  cost: number;
  weight: number;
  length: number;
}

const DG_ROWS: DgRow[] = [
  { sku: "DG-25", maxTemp: 90, flow: 6, pressure: 7, conn: "ANSI 150# flange DN25 1in", material: "Polypropylene", elastomer: "Santoprene diaphragm", list: 1850, cost: 1110, weight: 14, length: 340 },
  { sku: "DG-40", maxTemp: 95, flow: 14, pressure: 7, conn: "ANSI 150# flange DN40 1.5in", material: "Polypropylene", elastomer: "Santoprene diaphragm", list: 2480, cost: 1488, weight: 22, length: 400 },
  { sku: "DG-50", maxTemp: 120, flow: 24, pressure: 8, conn: "ANSI 150# flange DN50 2in", material: "316 stainless steel", elastomer: "PTFE diaphragm", list: 3950, cost: 2370, weight: 34, length: 460 },
  { sku: "DG-52", maxTemp: 120, flow: 26, pressure: 8, conn: "ANSI 150# flange DN50 2in", material: "316 stainless steel", elastomer: "EPDM diaphragm", list: 3780, cost: 2268, weight: 33, length: 462 },
  { sku: "DG-80", maxTemp: 120, flow: 48, pressure: 8, conn: "ANSI 150# flange DN80 3in", material: "316 stainless steel", elastomer: "PTFE diaphragm", list: 5600, cost: 3360, weight: 52, length: 540 },
];

function dgProduct(row: DgRow): ProductDef {
  return {
    sku: row.sku,
    name: `${row.sku} air-operated diaphragm pump, ${row.flow} m³/h`,
    categoryCode: "PD-DIA",
    description: `Air-operated double-diaphragm transfer pump, ${row.material} body with ${row.elastomer.toLowerCase()}. Runs dry and handles entrained solids.`,
    lifecycle: "ACTIVE",
    leadTimeDays: 18,
    listPrice: row.list,
    standardCost: row.cost,
    weightKg: row.weight,
    specs: {
      max_fluid_temp_c: row.maxTemp,
      min_fluid_temp_c: 0,
      max_pressure_bar: row.pressure,
      max_viscosity_cp: 20000,
      max_flow_m3h: row.flow,
      max_head_m: Math.round(row.pressure * 10.2),
      npshr_m: 1.2,
      inlet_connection: row.conn,
      outlet_connection: row.conn,
      wetted_material: row.material,
      seal_type: row.elastomer,
      bearing_type: "None — reciprocating diaphragm",
      motor_voltage: "Not applicable — compressed air driven",
      motor_power_kw: 0,
      ip_rating: "Not applicable — no electrical parts",
      hazardous_area_rating: "ATEX II 2G Zone 1",
      certifications: "CE, ATEX 2014/34/EU",
      duty_cycle: "Intermittent",
      length_mm: row.length,
      width_mm: Math.round(row.length * 0.6),
      height_mm: Math.round(row.length * 0.85),
    },
  };
}

// ───────────────────────── VS Series — vertical inline ─────────────────────

interface VsRow {
  sku: string;
  flow: number;
  head: number;
  pressure: number;
  conn: string;
  kw: number;
  list: number;
  cost: number;
  weight: number;
  height: number;
}

const VS_ROWS: VsRow[] = [
  { sku: "VS-210", flow: 45, head: 40, pressure: 16, conn: "ANSI 150# flange DN50 2in", kw: 7.5, list: 5900, cost: 3540, weight: 96, height: 880 },
  { sku: "VS-230", flow: 70, head: 48, pressure: 16, conn: "ANSI 150# flange DN80 3in", kw: 11, list: 7100, cost: 4260, weight: 124, height: 950 },
  { sku: "VS-250", flow: 100, head: 55, pressure: 18, conn: "ANSI 150# flange DN80 3in", kw: 15, list: 8600, cost: 5590, weight: 156, height: 1020 },
  { sku: "VS-270", flow: 140, head: 62, pressure: 20, conn: "ANSI 150# flange DN100 4in", kw: 18.5, list: 10900, cost: 7085, weight: 192, height: 1110 },
];

function vsProduct(row: VsRow): ProductDef {
  return {
    sku: row.sku,
    name: `${row.sku} vertical inline pump, ${row.flow} m³/h`,
    categoryCode: "VI-PUMP",
    description: `Close-coupled vertical inline pump. Suction and discharge on a common centre line so it drops into a straight pipe run without a baseplate.`,
    lifecycle: "ACTIVE",
    leadTimeDays: 24,
    listPrice: row.list,
    standardCost: row.cost,
    weightKg: row.weight,
    specs: {
      ...COMMON_ELECTRIC,
      max_fluid_temp_c: 140,
      min_fluid_temp_c: -10,
      max_pressure_bar: row.pressure,
      max_viscosity_cp: 150,
      max_flow_m3h: row.flow,
      max_head_m: row.head,
      npshr_m: 2.9,
      inlet_connection: row.conn,
      outlet_connection: row.conn,
      wetted_material: "316 stainless steel",
      seal_type: "Single cartridge mechanical seal, carbon/SiC, EPDM elastomer",
      bearing_type: "Motor bearings, no separate bearing frame",
      motor_power_kw: row.kw,
      hazardous_area_rating: "None — general purpose",
      certifications: "CE, UL 778",
      length_mm: Math.round(row.height * 0.34),
      width_mm: Math.round(row.height * 0.34),
      height_mm: row.height,
    },
  };
}

// ───────────────────────────── Accessories ─────────────────────────────────

interface AccessoryDef {
  sku: string;
  name: string;
  categoryCode: string;
  description: string;
  list: number;
  cost: number;
  weight: number;
  lead: number;
  specs: Record<string, number | string | boolean>;
  hazmat?: boolean;
}

const ACCESSORIES: AccessoryDef[] = [
  {
    sku: "FA-4050",
    name: "FA-4050 flange adapter kit, DN50 to DN40",
    categoryCode: "ACC-ADPT",
    description:
      "Machined 316 stainless reducing flange set with gaskets and fasteners. Adapts a DN50 pump connection to existing DN40 pipework without re-piping.",
    list: 420,
    cost: 210,
    weight: 6.4,
    lead: 10,
    specs: {
      provides_connection: "ANSI 150# flange DN40 1.5in DN50 2in",
      wetted_material: "316 stainless steel",
      max_pressure_bar: 20,
      max_fluid_temp_c: 250,
      fits_families: "AX Series, PX Series, RG Series",
    },
  },
  {
    sku: "FA-5080",
    name: "FA-5080 flange adapter kit, DN80 to DN50",
    categoryCode: "ACC-ADPT",
    description:
      "Reducing flange set adapting a DN80 pump connection to DN50 pipework. 316 stainless, gasket and fastener set included.",
    list: 480,
    cost: 240,
    weight: 8.2,
    lead: 10,
    specs: {
      provides_connection: "ANSI 150# flange DN50 2in DN80 3in",
      wetted_material: "316 stainless steel",
      max_pressure_bar: 20,
      max_fluid_temp_c: 250,
      fits_families: "AX Series, PX Series, VS Series",
    },
  },
  {
    sku: "FA-8010",
    name: "FA-8010 flange adapter kit, DN100 to DN80",
    categoryCode: "ACC-ADPT",
    description: "Reducing flange set adapting a DN100 pump connection to DN80 pipework.",
    list: 560,
    cost: 280,
    weight: 11.5,
    lead: 12,
    specs: {
      provides_connection: "ANSI 150# flange DN80 3in DN100 4in",
      wetted_material: "316 stainless steel",
      max_pressure_bar: 20,
      max_fluid_temp_c: 250,
      fits_families: "AX Series, PX Series, VS Series",
    },
  },
];

const SEAL_KITS: { sku: string; fits: string; list: number; cost: number; temp: number }[] = [
  { sku: "SK-2000", fits: "AX-200", list: 590, cost: 295, temp: 120 },
  { sku: "SK-2200", fits: "AX-220", list: 640, cost: 320, temp: 120 },
  { sku: "SK-2400", fits: "AX-240", list: 710, cost: 355, temp: 120 },
  { sku: "SK-2600", fits: "AX-260 / AX-262", list: 780, cost: 390, temp: 120 },
  { sku: "SK-2800", fits: "AX-280", list: 850, cost: 425, temp: 120 },
  { sku: "SK-4000", fits: "PX-400", list: 980, cost: 490, temp: 200 },
  { sku: "SK-4200", fits: "PX-420 / PX-422", list: 1060, cost: 530, temp: 200 },
  { sku: "SK-4400", fits: "PX-440", list: 1180, cost: 590, temp: 220 },
  { sku: "SK-4600", fits: "PX-460", list: 1340, cost: 670, temp: 240 },
  { sku: "SK-4800", fits: "PX-480 / PX-500", list: 1620, cost: 810, temp: 350 },
  { sku: "SK-1600", fits: "MX-160 / MX-180", list: 1450, cost: 725, temp: 150 },
  { sku: "SK-1200", fits: "MX-120 / MX-140", list: 1180, cost: 590, temp: 130 },
  { sku: "SK-6000", fits: "RG-60 / RG-80", list: 520, cost: 260, temp: 180 },
  { sku: "SK-6100", fits: "RG-100 / RG-120", list: 680, cost: 340, temp: 200 },
  { sku: "SK-0050", fits: "DG-50 / DG-52 / DG-80", list: 410, cost: 205, temp: 120 },
];

const DRIVES: { sku: string; kw: number; list: number; cost: number }[] = [
  { sku: "VFD-055", kw: 5.5, list: 1480, cost: 888 },
  { sku: "VFD-075", kw: 7.5, list: 1740, cost: 1044 },
  { sku: "VFD-110", kw: 11, list: 2350, cost: 1410 },
  { sku: "VFD-150", kw: 15, list: 2980, cost: 1788 },
  { sku: "VFD-185", kw: 18.5, list: 3540, cost: 2124 },
  { sku: "VFD-220", kw: 22, list: 4120, cost: 2472 },
  { sku: "VFD-300", kw: 30, list: 5350, cost: 3210 },
];

const MOUNTS: { sku: string; name: string; list: number; cost: number; weight: number; fits: string }[] = [
  { sku: "BP-200", name: "BP-200 grouted baseplate, frame 2", list: 940, cost: 564, weight: 78, fits: "AX-180, AX-200, AX-220" },
  { sku: "BP-300", name: "BP-300 grouted baseplate, frame 3", list: 1180, cost: 708, weight: 104, fits: "AX-240, AX-260, AX-262, PX-400, PX-420, PX-422, PX-440" },
  { sku: "BP-400", name: "BP-400 grouted baseplate, frame 4", list: 1460, cost: 876, weight: 138, fits: "AX-280, AX-300, PX-460, PX-480" },
  { sku: "CP-100", name: "CP-100 spacer coupling and guard, frame 2-3", list: 620, cost: 372, weight: 14, fits: "AX Series, PX Series" },
  { sku: "CP-200", name: "CP-200 spacer coupling and guard, frame 4", list: 780, cost: 468, weight: 19, fits: "AX Series, PX Series" },
  { sku: "ST-050", name: "ST-050 suction strainer, DN50", list: 340, cost: 204, weight: 5, fits: "DN50 suction lines" },
  { sku: "ST-080", name: "ST-080 suction strainer, DN80", list: 420, cost: 252, weight: 7, fits: "DN80 suction lines" },
  { sku: "ST-100", name: "ST-100 suction strainer, DN100", list: 520, cost: 312, weight: 9, fits: "DN100 suction lines" },
];

function buildAccessories(): ProductDef[] {
  const out: ProductDef[] = ACCESSORIES.map((a) => ({
    sku: a.sku,
    name: a.name,
    categoryCode: a.categoryCode,
    description: a.description,
    lifecycle: "ACTIVE" as Lifecycle,
    leadTimeDays: a.lead,
    listPrice: a.list,
    standardCost: a.cost,
    weightKg: a.weight,
    isAccessory: true,
    hazmat: a.hazmat,
    specs: a.specs,
  }));

  for (const kit of SEAL_KITS) {
    out.push({
      sku: kit.sku,
      name: `${kit.sku} cartridge seal and wear-part kit`,
      categoryCode: "ACC-SEAL",
      description: `Complete cartridge seal, gasket and wear-ring kit for ${kit.fits}. Supplied as a matched set to preserve the original seal face pairing.`,
      lifecycle: "ACTIVE",
      leadTimeDays: 14,
      listPrice: kit.list,
      standardCost: kit.cost,
      weightKg: 3.2,
      isAccessory: true,
      specs: {
        fits_families: kit.fits,
        max_fluid_temp_c: kit.temp,
        wetted_material: "316 stainless steel",
      },
    });
  }

  for (const drive of DRIVES) {
    out.push({
      sku: drive.sku,
      name: `${drive.sku} variable frequency drive, ${drive.kw} kW`,
      categoryCode: "ACC-DRIVE",
      description: `IP55 wall-mount variable frequency drive rated ${drive.kw} kW at 460 V 3-phase, with integrated EMC filter and pump control macro.`,
      lifecycle: "ACTIVE",
      leadTimeDays: 21,
      listPrice: drive.list,
      standardCost: drive.cost,
      weightKg: Math.round(drive.kw * 1.4 * 10) / 10,
      isAccessory: true,
      specs: {
        motor_power_kw: drive.kw,
        motor_voltage: "460 V 3ph 60 Hz",
        ip_rating: "IP55",
        certifications: "CE, UL 61800-5-1",
        hazardous_area_rating: "None — general purpose",
      },
    });
  }

  for (const mount of MOUNTS) {
    out.push({
      sku: mount.sku,
      name: mount.name,
      categoryCode: "ACC-MOUNT",
      description: `${mount.name}. Fits ${mount.fits}.`,
      lifecycle: "ACTIVE",
      leadTimeDays: 16,
      listPrice: mount.list,
      standardCost: mount.cost,
      weightKg: mount.weight,
      isAccessory: true,
      specs: { fits_families: mount.fits },
    });
  }

  return out;
}

// ───────────────────────────── Assembly ────────────────────────────────────

export function buildCatalog(): ProductDef[] {
  const ax = AX_ROWS.map(axProduct);
  const axCastIron = ax
    .filter((p) => ["AX-200", "AX-220", "AX-240", "AX-262", "AX-280"].includes(p.sku))
    .map(castIronVariant);
  const axLowVoltage = ax
    .filter((p) => ["AX-200", "AX-220", "AX-240"].includes(p.sku))
    .map(lowVoltageVariant);

  const px = PX_ROWS.map(pxProduct);
  const mx = MX_ROWS.map(mxProduct);
  const rg = RG_ROWS.map(rgProduct);
  const rgJacketed = rg.filter((p) => ["RG-80", "RG-120"].includes(p.sku)).map(jacketedVariant);
  const dg = DG_ROWS.map(dgProduct);
  const vs = VS_ROWS.map(vsProduct);

  return [
    ...ax,
    ...axCastIron,
    ...axLowVoltage,
    ...px,
    ...mx,
    ...rg,
    ...rgJacketed,
    ...dg,
    ...vs,
    ...buildAccessories(),
  ];
}

/**
 * Curated engineering relationships. These narrow the candidate set; they do
 * not authorise a substitution — the compatibility engine still has to pass
 * every hard rule before any of these can be offered.
 */
export const SUBSTITUTION_LINKS: {
  from: string;
  to: string;
  kind: "DIRECT_REPLACEMENT" | "SUCCESSOR" | "UPGRADE" | "ALTERNATE" | "ACCESSORY_REQUIRED";
  note: string;
  requiresSku?: string;
}[] = [
  { from: "AX-260", to: "AX-262", kind: "SUCCESSOR", note: "AX-262 is the drop-in factory successor to the end-of-life AX-260. Same footprint, same connections, revised impeller with a marginally higher best-efficiency point." },
  { from: "AX-220", to: "PX-440", kind: "UPGRADE", note: "Standard route when an AX-220 duty moves above 120 °C. Shares the DN50 connection and sits within the AX-220 baseplate envelope." },
  { from: "AX-220", to: "PX-420", kind: "UPGRADE", note: "Higher-temperature alternative. Note the DN40 suction — existing DN50 pipework needs an adapter." },
  { from: "AX-220", to: "PX-400", kind: "UPGRADE", note: "Lowest-cost high-temperature option, but hydraulically smaller than the AX-220." },
  { from: "AX-220", to: "PX-460", kind: "UPGRADE", note: "Where duty may rise beyond 205 °C later. Larger frame — confirm the baseplate before quoting." },
  { from: "AX-220", to: "MX-180", kind: "ALTERNATE", note: "Sealless alternative where emissions matter more than temperature headroom." },
  { from: "AX-240", to: "PX-480", kind: "UPGRADE", note: "Hot hydrocarbon duty with ATEX Zone 1 certification." },
  { from: "AX-240", to: "AX-262", kind: "ALTERNATE", note: "Next frame down if the duty point allows; not a like-for-like hydraulic replacement." },
  { from: "AX-200", to: "AX-220", kind: "UPGRADE", note: "Next frame up on the same baseplate family." },
  { from: "PX-420", to: "PX-440", kind: "ALTERNATE", note: "Larger frame with a DN50 suction; preferred when the pipework is DN50." },
  { from: "PX-420", to: "PX-422", kind: "DIRECT_REPLACEMENT", note: "PX-422 is the DN50-connection build of the PX-420 hydraulic. Identical performance curve." },
  { from: "PX-400", to: "PX-440", kind: "UPGRADE", note: "Where the duty point has grown beyond the PX-400 curve." },
  { from: "RG-100", to: "RG-120", kind: "ACCESSORY_REQUIRED", note: "RG-120 replaces the discontinued RG-100 but carries a DN50 connection against the RG-100's DN40. Supply with the FA-4050 adapter kit to land on existing pipework.", requiresSku: "FA-4050" },
  { from: "RG-100", to: "RG-80", kind: "ALTERNATE", note: "Smaller frame — only valid if the duty point is below 16 m³/h." },
  { from: "RG-80", to: "RG-80-J", kind: "UPGRADE", note: "Steam-jacketed build for media that congeals at ambient." },
  { from: "DG-50", to: "DG-52", kind: "ALTERNATE", note: "Same body and hydraulics with an EPDM diaphragm instead of PTFE. Chemical compatibility must be confirmed against the actual media." },
  { from: "DG-50", to: "DG-80", kind: "UPGRADE", note: "Next size up, DN80 connection." },
  { from: "MX-160", to: "MX-180", kind: "UPGRADE", note: "Next frame up with the same DN50 connection." },
  { from: "MX-180", to: "MX-200", kind: "UPGRADE", note: "Hastelloy C-276 wetted parts for severe corrosive duty. Larger DN80 connection and a 70-day lead time." },
  { from: "VS-230", to: "VS-250", kind: "UPGRADE", note: "Next frame up on the same DN80 connection." },
  { from: "VS-250", to: "VS-270", kind: "UPGRADE", note: "Larger frame, DN100 connection." },
  { from: "AX-300", to: "AX-320", kind: "UPGRADE", note: "Largest frame in the AX family." },
];

/** Accessories that must or may accompany a pump. */
export const ACCESSORY_LINKS: {
  host: string;
  accessory: string;
  required: boolean;
  reason: string;
}[] = [
  { host: "RG-120", accessory: "FA-4050", required: false, reason: "Required only when replacing an RG-100 on existing DN40 pipework." },
  { host: "PX-440", accessory: "SK-4400", required: false, reason: "Recommended spare cartridge seal — 26-week factory lead time if ordered after failure." },
  { host: "PX-440", accessory: "BP-300", required: false, reason: "Grouted baseplate for a new installation; not needed when reusing an existing AX-220 baseplate." },
  { host: "AX-220", accessory: "SK-2200", required: false, reason: "Recommended spare cartridge seal." },
  { host: "AX-262", accessory: "SK-2600", required: false, reason: "Recommended spare cartridge seal." },
  { host: "MX-160", accessory: "SK-1600", required: false, reason: "Containment shell and bushing kit — the standard 3-year overhaul item." },
  { host: "DG-52", accessory: "SK-0050", required: false, reason: "Diaphragm and check-valve kit." },
];
