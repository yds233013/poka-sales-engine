/**
 * Deterministic requirement extraction.
 *
 * This is the engine behind the default ("mock") AI provider, and it is also
 * used to cross-check a real model's output when one is configured. It reads a
 * messy customer message and produces structured requirements with units
 * normalised, each tagged with the verbatim snippet it came from.
 *
 * Three things it deliberately does NOT do:
 *   - guess a number when the customer did not give one (that becomes an
 *     AMBIGUOUS requirement, which the compatibility engine treats as UNKNOWN);
 *   - invent a SKU (part numbers are matched against the catalog by the
 *     resolve_sku tool, not asserted here);
 *   - silently drop a dimension it could not parse (it records it MISSING).
 */

import type { RequirementKind, RequirementView } from "@/lib/domain/types";

export interface ExtractionContext {
  /** Every SKU in the catalog, used to validate part numbers found in text. */
  knownSkus: string[];
  /** Site aliases → site key, so "Dallas plant" resolves to a ship-to. */
  siteAliases: { siteId: string; label: string; tokens: string[] }[];
  /** Reference date for relative deadlines ("within two weeks"). */
  now: Date;
}

export interface ExtractedItem {
  rawText: string;
  sku: string | null;
  quantity: number | null;
  lineNumber: number;
}

export interface ExtractionResult {
  items: ExtractedItem[];
  requirements: RequirementView[];
  requiredBy: Date | null;
  siteId: string | null;
  siteEvidence: string | null;
  /** Short neutral summary for the inbox row. */
  summary: string;
  openQuestions: string[];
}

const SKU_PATTERN = /\b([A-Z]{2,3}-\d{2,4}(?:-[A-Z]{1,2})?)\b/g;

function quote(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf(".", index - 1) + 1);
  const endMarker = text.indexOf(".", index + length);
  const end = endMarker === -1 ? Math.min(text.length, index + length + 80) : endMarker + 1;
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function req(
  key: string,
  label: string,
  kind: RequirementKind,
  fields: Partial<RequirementView>,
): RequirementView {
  return {
    key,
    label,
    kind,
    operator: null,
    numValue: null,
    textValue: null,
    unit: null,
    sourceQuote: null,
    confidence: 1,
    note: null,
    ...fields,
  };
}

// ───────────────────────────── Unit helpers ────────────────────────────────

const F_TO_C = (f: number) => Math.round(((f - 32) * 5) / 9);
const GPM_TO_M3H = (g: number) => Math.round(g * 0.2271 * 10) / 10;
const FT_TO_M = (ft: number) => Math.round(ft * 0.3048 * 10) / 10;
const PSI_TO_BAR = (psi: number) => Math.round(psi * 0.0689476 * 10) / 10;
const IN_TO_DN: Record<string, string> = {
  "1": "DN25",
  "1.5": "DN40",
  "2": "DN50",
  "3": "DN80",
  "4": "DN100",
  "6": "DN150",
};

function num(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

// ───────────────────────────── Field parsers ───────────────────────────────

function extractTemperature(text: string): RequirementView | null {
  const celsius = /(\d{2,3}(?:\.\d+)?)\s*(?:°\s*c|deg\s*c|degrees?\s*c|c)\b/i.exec(text);
  if (celsius) {
    return req("max_fluid_temp_c", "Fluid temperature", "EXPLICIT", {
      operator: "GTE",
      numValue: num(celsius[1]),
      unit: "°C",
      sourceQuote: quote(text, celsius.index, celsius[0].length),
      note: "Pump must be rated at or above this fluid temperature.",
    });
  }
  const fahrenheit = /(\d{2,4}(?:\.\d+)?)\s*(?:°\s*f|deg\s*f|degrees?\s*f)\b/i.exec(text);
  if (fahrenheit) {
    const c = F_TO_C(num(fahrenheit[1]));
    return req("max_fluid_temp_c", "Fluid temperature", "EXPLICIT", {
      operator: "GTE",
      numValue: c,
      unit: "°C",
      sourceQuote: quote(text, fahrenheit.index, fahrenheit[0].length),
      note: `Stated as ${fahrenheit[1]} °F, converted to ${c} °C.`,
    });
  }
  const vague =
    /\b(higher|elevated|hotter|increased)\s+(?:operating\s+)?(?:fluid\s+)?temperature|rated\s+for\s+(?:higher|hotter)\b/i.exec(
      text,
    );
  if (vague) {
    return req("max_fluid_temp_c", "Fluid temperature", "AMBIGUOUS", {
      operator: "GTE",
      sourceQuote: quote(text, vague.index, vague[0].length),
      confidence: 0.3,
      note: "The request asks for a higher temperature rating but does not state a value.",
    });
  }
  return null;
}

function extractFlow(text: string): RequirementView | null {
  const metric = /(\d{1,4}(?:\.\d+)?)\s*(?:m3\/h|m³\/h|m3h|cubic\s*met(?:re|er)s?\s*(?:per|\/)\s*hour)/i.exec(text);
  if (metric) {
    return req("min_flow_m3h", "Flow rate", "EXPLICIT", {
      operator: "GTE",
      numValue: num(metric[1]),
      unit: "m³/h",
      sourceQuote: quote(text, metric.index, metric[0].length),
    });
  }
  const gpm = /(\d{1,5}(?:\.\d+)?)\s*(?:gpm|gallons?\s*(?:per|\/)\s*min(?:ute)?)/i.exec(text);
  if (gpm) {
    const v = GPM_TO_M3H(num(gpm[1]));
    return req("min_flow_m3h", "Flow rate", "EXPLICIT", {
      operator: "GTE",
      numValue: v,
      unit: "m³/h",
      sourceQuote: quote(text, gpm.index, gpm[0].length),
      note: `Stated as ${gpm[1]} gpm, converted to ${v} m³/h.`,
    });
  }
  return null;
}

function extractHead(text: string): RequirementView | null {
  const metric = /(\d{1,3}(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s*(?:of\s*)?head\b/i.exec(text);
  if (metric) {
    return req("min_head_m", "Differential head", "EXPLICIT", {
      operator: "GTE",
      numValue: num(metric[1]),
      unit: "m",
      sourceQuote: quote(text, metric.index, metric[0].length),
    });
  }
  const feet = /(\d{1,4}(?:\.\d+)?)\s*(?:ft|feet|foot)\s*(?:of\s*)?head\b/i.exec(text);
  if (feet) {
    const v = FT_TO_M(num(feet[1]));
    return req("min_head_m", "Differential head", "EXPLICIT", {
      operator: "GTE",
      numValue: v,
      unit: "m",
      sourceQuote: quote(text, feet.index, feet[0].length),
      note: `Stated as ${feet[1]} ft, converted to ${v} m.`,
    });
  }
  return null;
}

function extractPressure(text: string): RequirementView | null {
  const bar = /(\d{1,3}(?:\.\d+)?)\s*bar\b/i.exec(text);
  if (bar) {
    return req("max_pressure_bar", "Discharge pressure", "EXPLICIT", {
      operator: "GTE",
      numValue: num(bar[1]),
      unit: "bar",
      sourceQuote: quote(text, bar.index, bar[0].length),
    });
  }
  const psi = /(\d{1,4}(?:\.\d+)?)\s*psi(?:g)?\b/i.exec(text);
  if (psi) {
    const v = PSI_TO_BAR(num(psi[1]));
    return req("max_pressure_bar", "Discharge pressure", "EXPLICIT", {
      operator: "GTE",
      numValue: v,
      unit: "bar",
      sourceQuote: quote(text, psi.index, psi[0].length),
      note: `Stated as ${psi[1]} psi, converted to ${v} bar.`,
    });
  }
  return null;
}

function extractViscosity(text: string): RequirementView | null {
  const m = /(\d{1,3}(?:[,\d]{0,9})(?:\.\d+)?)\s*(?:cp|cps|centipoise|mpa\.?s)\b/i.exec(text);
  if (!m) return null;
  return req("max_viscosity_cp", "Viscosity", "EXPLICIT", {
    operator: "GTE",
    numValue: num(m[1]),
    unit: "cP",
    sourceQuote: quote(text, m.index, m[0].length),
    note: "Pump must be rated to handle at least this viscosity.",
  });
}

function extractNpsh(text: string): RequirementView | null {
  const m = /npsh[a\s]*(?:available|avail\.?|a)?[^0-9]{0,18}(\d{1,2}(?:\.\d+)?)\s*(m|ft|feet)?/i.exec(text);
  if (!m) return null;
  const rawValue = num(m[1]);
  const value = m[2] && /ft|feet/i.test(m[2]) ? FT_TO_M(rawValue) : rawValue;
  return req("npsha_m", "NPSH available", "EXPLICIT", {
    operator: "LTE",
    numValue: value,
    unit: "m",
    sourceQuote: quote(text, m.index, m[0].length),
    note: "The pump's NPSH required must sit at or below this figure.",
  });
}

function extractMaterial(text: string): RequirementView | null {
  const table: { pattern: RegExp; value: string }[] = [
    { pattern: /hastelloy\s*c[\s-]?276/i, value: "Hastelloy C-276" },
    { pattern: /\b316\s*(?:l)?\s*(?:stainless|ss)\b|\bstainless\s*316\b/i, value: "316 stainless steel" },
    { pattern: /\bpfa[\s-]?lined\b/i, value: "PFA-lined ductile iron" },
    { pattern: /\bcast\s*iron\b/i, value: "Cast iron" },
    { pattern: /\bpolypropylene\b|\bpp\s*body\b/i, value: "Polypropylene" },
  ];
  for (const entry of table) {
    const m = entry.pattern.exec(text);
    if (m) {
      return req("wetted_material", "Wetted material", "EXPLICIT", {
        operator: "INCLUDES",
        textValue: entry.value,
        sourceQuote: quote(text, m.index, m[0].length),
      });
    }
  }
  return null;
}

function extractVoltage(text: string): RequirementView | null {
  const m = /\b(208|230|240|380|400|440|460|480|575|600)\s*v(?:olts?)?\b/i.exec(text);
  if (!m) return null;
  const phase = /\b(3|three)\s*(?:ph|phase)\b/i.test(text) ? "3ph" : null;
  const hz = /\b(50|60)\s*hz\b/i.exec(text);
  const parts = [`${m[1]} V`];
  if (phase) parts.push(phase);
  if (hz) parts.push(`${hz[1]} Hz`);
  return req("motor_voltage", "Supply voltage", "EXPLICIT", {
    operator: "INCLUDES",
    textValue: parts.join(" "),
    sourceQuote: quote(text, m.index, m[0].length),
  });
}

function extractHazardousArea(text: string): RequirementView | null {
  const atex = /\batex\b[^.]{0,40}?\bzone\s*([0-2])\b|\bzone\s*([0-2])\b[^.]{0,30}?\batex\b|\bzone\s*([0-2])\b/i.exec(text);
  if (atex) {
    const zone = atex[1] ?? atex[2] ?? atex[3];
    return req("hazardous_area_rating", "Hazardous area rating", "EXPLICIT", {
      operator: "INCLUDES",
      textValue: `ATEX Zone ${zone}`,
      sourceQuote: quote(text, atex.index, atex[0].length),
      note: "Area classification is a regulatory requirement and cannot be traded off.",
    });
  }
  const nec = /class\s*i\s*,?\s*div(?:ision)?\s*([12])/i.exec(text);
  if (nec) {
    const zone = nec[1] === "1" ? "Zone 1" : "Zone 2";
    return req("hazardous_area_rating", "Hazardous area rating", "EXPLICIT", {
      operator: "INCLUDES",
      textValue: `ATEX ${zone}`,
      sourceQuote: quote(text, nec.index, nec[0].length),
      note: `Stated as Class I Division ${nec[1]}; mapped to the equivalent ATEX ${zone}.`,
    });
  }
  return null;
}

function extractCertifications(text: string): RequirementView | null {
  const table: { pattern: RegExp; value: string }[] = [
    { pattern: /\bapi\s*610\b/i, value: "API 610" },
    { pattern: /\bul\s*778\b|\bul\s*listed\b/i, value: "UL 778" },
    { pattern: /\b3-?a\s*sanitary\b/i, value: "3-A" },
    { pattern: /\bce\s*mark(?:ed|ing)?\b/i, value: "CE" },
  ];
  for (const entry of table) {
    const m = entry.pattern.exec(text);
    if (m) {
      return req("certifications", "Certification", "EXPLICIT", {
        operator: "INCLUDES",
        textValue: entry.value,
        sourceQuote: quote(text, m.index, m[0].length),
        note: "A named third-party certification cannot be waived at the point of sale.",
      });
    }
  }
  return null;
}

function extractIngressRating(text: string): RequirementView | null {
  const m = /\bip\s?(\d{2})\b/i.exec(text);
  if (!m) return null;
  return req("ip_rating", "Ingress protection", "EXPLICIT", {
    operator: "INCLUDES",
    textValue: `IP${m[1]}`,
    sourceQuote: quote(text, m.index, m[0].length),
  });
}

function extractConnection(text: string): RequirementView | null {
  const dn = /\bdn\s*(\d{2,3})\b/i.exec(text);
  if (dn) {
    return req("inlet_connection", "Pipe connection", "EXPLICIT", {
      operator: "INCLUDES",
      textValue: `DN${dn[1]}`,
      sourceQuote: quote(text, dn.index, dn[0].length),
    });
  }
  const inches = /\b(1|1\.5|2|3|4|6)\s*(?:"|in\b|inch(?:es)?)\s*(?:ansi\s*)?(?:150#?\s*)?(?:flange|connection|line|pipe|suction)/i.exec(
    text,
  );
  if (inches && IN_TO_DN[inches[1]]) {
    return req("inlet_connection", "Pipe connection", "EXPLICIT", {
      operator: "INCLUDES",
      textValue: IN_TO_DN[inches[1]],
      sourceQuote: quote(text, inches.index, inches[0].length),
      note: `Stated as ${inches[1]} in, matched to ${IN_TO_DN[inches[1]]}.`,
    });
  }
  return null;
}

function extractSeal(text: string): RequirementView | null {
  const table: { pattern: RegExp; value: string }[] = [
    { pattern: /\bptfe\b/i, value: "PTFE" },
    { pattern: /\bepdm\b/i, value: "EPDM" },
    { pattern: /\bfkm\b|\bviton\b/i, value: "FKM" },
    { pattern: /\bsantoprene\b/i, value: "Santoprene" },
    { pattern: /\bsealless\b|\bmag(?:netic)?[\s-]?drive\b|\bzero\s*emission\b/i, value: "Sealless" },
  ];
  for (const entry of table) {
    const m = entry.pattern.exec(text);
    if (m) {
      return req("seal_type", "Seal / elastomer", "EXPLICIT", {
        operator: "INCLUDES",
        textValue: entry.value,
        sourceQuote: quote(text, m.index, m[0].length),
      });
    }
  }
  return null;
}

// ─────────────────────────────── Deadlines ─────────────────────────────────

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};

export function extractDeadline(text: string, now: Date): { date: Date; quote: string } | null {
  const relative =
    /\b(?:within|in|inside|no later than)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(day|week|month)s?\b/i.exec(
      text,
    );
  if (relative) {
    const rawCount = relative[1].toLowerCase();
    const count = WORD_NUMBERS[rawCount] ?? Number(rawCount);
    const unit = relative[2].toLowerCase();
    const days = unit === "day" ? count : unit === "week" ? count * 7 : count * 30;
    const date = new Date(now.getTime() + days * 86400000);
    date.setUTCHours(0, 0, 0, 0);
    return { date, quote: quote(text, relative.index, relative[0].length) };
  }

  const absolute =
    /\b(?:by|before|on or before|no later than|needed?\s+by|due)\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,?\s*\d{4})?)/i.exec(
      text,
    );
  if (absolute) {
    const parsed = new Date(`${absolute[1]}${/\d{4}/.test(absolute[1]) ? "" : ` ${now.getUTCFullYear()}`} UTC`);
    if (!Number.isNaN(parsed.getTime())) {
      // A month already past this year means they mean next year.
      if (parsed.getTime() < now.getTime() - 30 * 86400000) {
        parsed.setUTCFullYear(parsed.getUTCFullYear() + 1);
      }
      parsed.setUTCHours(0, 0, 0, 0);
      return { date: parsed, quote: quote(text, absolute.index, absolute[0].length) };
    }
  }

  const shutdown = /\b(?:shutdown|outage|turnaround)\s+(?:window\s+)?(?:starts?|begins?|opens?)\s+(?:on\s+)?((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2})/i.exec(
    text,
  );
  if (shutdown) {
    const parsed = new Date(`${shutdown[1]} ${now.getUTCFullYear()} UTC`);
    if (!Number.isNaN(parsed.getTime())) {
      if (parsed.getTime() < now.getTime()) parsed.setUTCFullYear(parsed.getUTCFullYear() + 1);
      parsed.setUTCHours(0, 0, 0, 0);
      return { date: parsed, quote: quote(text, shutdown.index, shutdown[0].length) };
    }
  }
  return null;
}

// ─────────────────────────────── Line items ────────────────────────────────

/**
 * Quantity patterns, most specific first.
 *
 * Buyers write quantity in a dozen ways and rarely next to the part number —
 * "Please quote 2 units" can sit four paragraphs below the SKU. The extractor
 * therefore searches progressively wider windows before giving up, and
 * records MISSING rather than guessing if none of them hit.
 */
// The negative lookbehind is essential: without it "AX-220 units" yields a
// quantity of 220, because the frame size looks exactly like a count.
const NOT_PART_OF_SKU = "(?<![-\\w.])";

const QUANTITY_PATTERNS: RegExp[] = [
  new RegExp(`${NOT_PART_OF_SKU}(\\d{1,4})\\s*(?:x|×)\\s*[A-Z]{2,3}-\\d{2,4}`, "i"),
  // "12 AX-220" — a count sitting directly against a part number, with no
  // multiplication sign between them. Ordinary in buyer prose and previously
  // unmatched, which made an availability request look like it had no
  // quantity at all.
  new RegExp(`${NOT_PART_OF_SKU}(\\d{1,4})\\s+[A-Z]{2,3}-\\d{2,4}\\b`, "i"),
  new RegExp(`${NOT_PART_OF_SKU}(\\d{1,4})\\s*(?:off|units?|pcs?|pieces?|ea)\\b`, "i"),
  new RegExp(`\\b(?:qty|quantity)\\s*[:=]?\\s*${NOT_PART_OF_SKU}(\\d{1,4})\\b`, "i"),
  new RegExp(
    `\\b(?:quote|supply|order|price(?:\\s*up)?|need|require|send)\\s+(?:me\\s+)?${NOT_PART_OF_SKU}(\\d{1,4})\\b`,
    "i",
  ),
  new RegExp(`${NOT_PART_OF_SKU}(\\d{1,4})\\s+(?:replacement|spare|new)?\\s*(?:gear\\s+)?pumps?\\b`, "i"),
  new RegExp(`${NOT_PART_OF_SKU}(\\d{1,4})\\s*(?:more|additional)\\b`, "i"),
];

/**
 * Number words, so "twelve AX-220" reads the same as "12 AX-220".
 *
 * Normalising to digits before matching means every pattern above gains word
 * support at once, rather than each one growing an alternation. Only counts a
 * buyer plausibly writes out are listed — past twenty, people use digits.
 */
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, dozen: 12,
};

const NUMBER_WORD_PATTERN = new RegExp(`\\b(?:a\\s+)?(${Object.keys(NUMBER_WORDS).join("|")})\\b`, "gi");

function normaliseNumberWords(text: string): string {
  return text.replace(NUMBER_WORD_PATTERN, (match, word: string) => {
    const value = NUMBER_WORDS[word.toLowerCase()];
    return value === undefined ? match : String(value);
  });
}

function findQuantity(text: string): number | null {
  for (const pattern of QUANTITY_PATTERNS) {
    const match = pattern.exec(text) ?? pattern.exec(normaliseNumberWords(text));
    if (match) {
      const value = Number(match[1]);
      if (Number.isInteger(value) && value > 0 && value < 10000) return value;
    }
  }
  return null;
}

export function extractItems(text: string, knownSkus: string[]): ExtractedItem[] {
  const known = new Set(knownSkus);

  // Collect every occurrence of every catalog part number.
  const occurrences = new Map<string, number[]>();
  for (const match of text.matchAll(SKU_PATTERN)) {
    const sku = match[1].toUpperCase();
    if (!known.has(sku)) continue;
    const list = occurrences.get(sku) ?? [];
    list.push(match.index);
    occurrences.set(sku, list);
  }

  const items: ExtractedItem[] = [];
  let line = 1;

  for (const [sku, indices] of occurrences) {
    let quantity: number | null = null;
    // Widen the search around each mention before falling back to the whole
    // message — a nearby number is far more likely to be the right one.
    for (const radius of [70, 160]) {
      for (const index of indices) {
        const window = text.slice(Math.max(0, index - radius), index + sku.length + radius);
        quantity = findQuantity(window);
        if (quantity !== null) break;
      }
      if (quantity !== null) break;
    }
    items.push({
      rawText: quote(text, indices[0], sku.length),
      sku,
      quantity,
      lineNumber: line++,
    });
  }

  // A single part number with no quantity anywhere near it: the quantity is
  // very likely stated once, somewhere in the message.
  if (items.length === 1 && items[0].quantity === null) {
    items[0].quantity = findQuantity(text);
  }

  if (items.length === 0) {
    const quantity = findQuantity(text);
    if (quantity !== null) {
      const marker = new RegExp(`\\b${quantity}\\b`).exec(text);
      items.push({
        rawText: marker ? quote(text, marker.index, String(quantity).length) : String(quantity),
        sku: null,
        quantity,
        lineNumber: 1,
      });
    }
  }
  return items;
}

function resolveSite(text: string, aliases: ExtractionContext["siteAliases"]) {
  const haystack = text.toLowerCase();
  let best: { siteId: string; label: string; token: string } | null = null;
  for (const site of aliases) {
    for (const token of site.tokens) {
      const needle = token.toLowerCase();
      if (needle.length < 3) continue;
      if (haystack.includes(needle)) {
        if (!best || needle.length > best.token.length) {
          best = { siteId: site.siteId, label: site.label, token: needle };
        }
      }
    }
  }
  return best;
}

// ─────────────────────────────── Entry point ───────────────────────────────

export function extractRequest(text: string, context: ExtractionContext): ExtractionResult {
  const items = extractItems(text, context.knownSkus);
  const requirements: RequirementView[] = [];
  const openQuestions: string[] = [];

  const parsers = [
    extractTemperature,
    extractFlow,
    extractHead,
    extractPressure,
    extractViscosity,
    extractNpsh,
    extractMaterial,
    extractVoltage,
    extractHazardousArea,
    extractCertifications,
    extractIngressRating,
    extractConnection,
    extractSeal,
  ];
  for (const parse of parsers) {
    const result = parse(text);
    if (result) requirements.push(result);
  }

  // Quantity.
  const totalQty = items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);
  if (totalQty > 0) {
    requirements.push(
      req("quantity", "Quantity", "EXPLICIT", {
        numValue: totalQty,
        unit: "units",
        sourceQuote: items.find((i) => i.quantity)?.rawText ?? null,
      }),
    );
  } else {
    requirements.push(
      req("quantity", "Quantity", "MISSING", {
        confidence: 0,
        note: "No quantity is stated anywhere in the request.",
      }),
    );
    openQuestions.push("How many units are required?");
  }

  // Deadline.
  const deadline = extractDeadline(text, context.now);
  if (deadline) {
    requirements.push(
      req("required_by", "Required by", "EXPLICIT", {
        textValue: deadline.date.toISOString().slice(0, 10),
        sourceQuote: deadline.quote,
      }),
    );
  } else {
    requirements.push(
      req("required_by", "Required by", "MISSING", {
        confidence: 0,
        note: "No delivery date or window is stated. Availability is assessed against stock only.",
      }),
    );
    openQuestions.push("When are the units required on site?");
  }

  // Ship-to.
  const site = resolveSite(text, context.siteAliases);
  if (site) {
    requirements.push(
      req("ship_to", "Ship-to location", "EXPLICIT", {
        textValue: site.label,
        sourceQuote: site.token,
      }),
    );
  } else {
    requirements.push(
      req("ship_to", "Ship-to location", "MISSING", {
        confidence: 0,
        note: "No destination named; the account's primary site is assumed.",
      }),
    );
  }

  const temperature = requirements.find((r) => r.key === "max_fluid_temp_c");
  if (temperature?.kind === "AMBIGUOUS") {
    openQuestions.push(
      "What is the actual maximum fluid temperature? The request asks for a higher rating but gives no figure.",
    );
  }

  const incumbent = items.find((i) => i.sku);
  if (incumbent?.sku) {
    requirements.push(
      req("incumbent_sku", "Referenced part", "EXPLICIT", {
        textValue: incumbent.sku,
        sourceQuote: incumbent.rawText,
        note: "Part number named in the request; used as the reference for inferred requirements.",
      }),
    );
  }

  const summary = buildSummary(items, requirements, deadline?.date ?? null);

  return {
    items,
    requirements,
    requiredBy: deadline?.date ?? null,
    siteId: site?.siteId ?? null,
    siteEvidence: site?.token ?? null,
    summary,
    openQuestions,
  };
}

function buildSummary(
  items: ExtractedItem[],
  requirements: RequirementView[],
  deadline: Date | null,
): string {
  const qty = requirements.find((r) => r.key === "quantity")?.numValue ?? null;
  const sku = items.find((i) => i.sku)?.sku ?? null;
  const temp = requirements.find((r) => r.key === "max_fluid_temp_c");

  const parts: string[] = [];
  if (qty && sku) parts.push(`${qty} × ${sku}`);
  else if (sku) parts.push(`${sku}, quantity not stated`);
  else if (qty) parts.push(`${qty} units, part not identified`);
  else parts.push("Part and quantity not identified");

  if (temp?.kind === "EXPLICIT" && temp.numValue) parts.push(`${temp.numValue} °C duty`);
  else if (temp?.kind === "AMBIGUOUS") parts.push("higher temperature rating requested, value not stated");

  if (deadline) parts.push(`required by ${deadline.toISOString().slice(0, 10)}`);

  return parts.join(", ");
}

/**
 * Requirements inferred from the part the customer already runs.
 *
 * This is the single highest-value inference in the system: a customer who
 * says "we currently use the AX-220" has implicitly told you the connection
 * size, the wetted material, the site voltage and the space available. Each
 * is marked INFERRED so the operator can see it was derived rather than
 * stated, and can strike it if the site has changed.
 */
export function inferFromIncumbent(
  incumbentSku: string,
  incumbentSpecs: Record<string, { textValue?: string | null; numValue?: number | null; unit?: string | null }>,
  existing: RequirementView[],
): RequirementView[] {
  const have = new Set(existing.filter((r) => r.kind !== "MISSING").map((r) => r.key));
  const inferred: RequirementView[] = [];

  const push = (
    key: string,
    label: string,
    fields: Partial<RequirementView>,
    note: string,
  ) => {
    if (have.has(key)) return;
    inferred.push(
      req(key, label, "INFERRED", { ...fields, confidence: 0.75, sourceQuote: `Currently running ${incumbentSku}`, note }),
    );
  };

  const conn = incumbentSpecs.inlet_connection?.textValue;
  if (conn) {
    const dn = /DN\d{2,3}/i.exec(conn);
    if (dn) {
      push(
        "inlet_connection",
        "Pipe connection",
        { operator: "INCLUDES", textValue: dn[0].toUpperCase() },
        `Existing pipework is assumed to match the ${incumbentSku} connection (${dn[0].toUpperCase()}).`,
      );
    }
  }

  const material = incumbentSpecs.wetted_material?.textValue;
  if (material) {
    push(
      "wetted_material",
      "Wetted material",
      { operator: "INCLUDES", textValue: material },
      `Assumed unchanged from the ${incumbentSku}. Strike this if the process chemistry has changed.`,
    );
  }

  const voltage = incumbentSpecs.motor_voltage?.textValue;
  if (voltage && !/not applicable/i.test(voltage)) {
    push(
      "motor_voltage",
      "Supply voltage",
      { operator: "INCLUDES", textValue: voltage },
      `Site supply assumed to match the ${incumbentSku}.`,
    );
  }

  const length = incumbentSpecs.length_mm?.numValue;
  if (length) {
    push(
      "length_mm",
      "Installed footprint",
      { operator: "WITHIN_TOLERANCE", numValue: length, unit: "mm" },
      `Replacement should sit within the ${incumbentSku} footprint (${length} mm) to reuse the existing baseplate.`,
    );
  }

  const flow = incumbentSpecs.max_flow_m3h?.numValue;
  if (flow) {
    push(
      "min_flow_m3h",
      "Flow rate",
      { operator: "GTE", numValue: flow, unit: "m³/h" },
      `Duty assumed to match the ${incumbentSku} rating (${flow} m³/h). Confirm the actual duty point.`,
    );
  }

  const viscosity = incumbentSpecs.max_viscosity_cp?.numValue;
  if (viscosity && viscosity >= 1000) {
    push(
      "max_viscosity_cp",
      "Viscosity",
      { operator: "GTE", numValue: viscosity, unit: "cP" },
      `Assumed from the ${incumbentSku} rating (${viscosity.toLocaleString()} cP).`,
    );
  }

  const seal = incumbentSpecs.seal_type?.textValue;
  if (seal && /ptfe|epdm|santoprene/i.test(seal)) {
    const elastomer = /ptfe/i.test(seal) ? "PTFE" : /epdm/i.test(seal) ? "EPDM" : "Santoprene";
    push(
      "seal_type",
      "Seal / elastomer",
      { operator: "INCLUDES", textValue: elastomer },
      `Assumed unchanged from the ${incumbentSku} (${elastomer}). Elastomer choice depends on the actual media.`,
    );
  }

  return inferred;
}
