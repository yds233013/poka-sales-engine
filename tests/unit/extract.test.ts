import { describe, expect, it } from "vitest";
import { extractDeadline, extractItems, extractRequest, inferFromIncumbent } from "@/lib/ai/extract";
import type { ExtractionContext } from "@/lib/ai/extract";

const SKUS = ["AX-220", "AX-200-CI", "PX-440", "RG-100", "DG-50", "MX-160", "VS-250"];
const NOW = new Date("2026-09-19T09:00:00.000Z");

const context: ExtractionContext = {
  knownSkus: SKUS,
  siteAliases: [
    { siteId: "s1", label: "Dallas plant", tokens: ["Dallas", "DFW plant", "Line 4"] },
    { siteId: "s2", label: "Akron plant", tokens: ["Akron"] },
  ],
  now: NOW,
};

const value = (result: ReturnType<typeof extractRequest>, key: string) =>
  result.requirements.find((r) => r.key === key);

describe("part number and quantity extraction", () => {
  it("finds a catalog part number and its quantity", () => {
    const items = extractItems("Please quote 12 x AX-220 for the Dallas plant.", SKUS);
    expect(items).toEqual([expect.objectContaining({ sku: "AX-220", quantity: 12 })]);
  });

  it("does not mistake the frame size in a part number for a quantity", () => {
    const items = extractItems("We currently run AX-220 units there. Need 12 delivered.", SKUS);
    expect(items[0].quantity).toBe(12);
  });

  it("finds a quantity stated far away from the part number", () => {
    const items = extractItems(
      "Our maintenance system has AX-220 listed against this position.\n\nSeveral paragraphs later.\n\nPlease quote 2 units.",
      SKUS,
    );
    expect(items[0].quantity).toBe(2);
  });

  it("handles a hyphenated variant part number", () => {
    expect(extractItems("Please quote 4 off AX-200-CI", SKUS)[0]).toMatchObject({
      sku: "AX-200-CI",
      quantity: 4,
    });
  });

  it("ignores a part number that is not in the catalog", () => {
    expect(extractItems("Need 5 x ZZ-999 please", SKUS)).toEqual([
      expect.objectContaining({ sku: null, quantity: 5 }),
    ]);
  });

  it("reports no quantity rather than guessing one", () => {
    expect(extractItems("Can you price the AX-220 for us?", SKUS)[0].quantity).toBeNull();
  });
});

describe("deadline extraction", () => {
  it("reads a relative window in words", () => {
    expect(extractDeadline("delivered within two weeks", NOW)!.date.toISOString().slice(0, 10)).toBe(
      "2026-10-03",
    );
  });
  it("reads a relative window in digits", () => {
    expect(extractDeadline("needed in 10 days", NOW)!.date.toISOString().slice(0, 10)).toBe(
      "2026-09-29",
    );
  });
  it("reads an absolute date", () => {
    expect(extractDeadline("everything on site by Oct 12", NOW)!.date.toISOString().slice(0, 10)).toBe(
      "2026-10-12",
    );
  });
  it("reads a shutdown window", () => {
    expect(
      extractDeadline("Our shutdown window opens Nov 3 and nothing moves after", NOW)!.date
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-11-03");
  });
  it("rolls a past month forward to next year", () => {
    expect(extractDeadline("needed by Feb 2", NOW)!.date.getUTCFullYear()).toBe(2027);
  });
  it("returns nothing when no date is stated", () => {
    expect(extractDeadline("no rush on this one", NOW)).toBeNull();
  });
});

describe("technical requirement extraction", () => {
  it("reads a temperature in Celsius", () => {
    const result = extractRequest("Loop will sit at 180 C continuous. Quote 4 units.", context);
    expect(value(result, "max_fluid_temp_c")).toMatchObject({ kind: "EXPLICIT", numValue: 180 });
  });

  it("converts Fahrenheit to Celsius and says so", () => {
    const result = extractRequest("Service runs at 356 °F. Quote 4 units.", context);
    const temp = value(result, "max_fluid_temp_c")!;
    expect(temp.numValue).toBe(180);
    expect(temp.note).toMatch(/converted/);
  });

  it("marks a vague temperature as ambiguous rather than inventing a number", () => {
    const result = extractRequest(
      "need something rated for higher temperature. Quote 12 units.",
      context,
    );
    const temp = value(result, "max_fluid_temp_c")!;
    expect(temp.kind).toBe("AMBIGUOUS");
    expect(temp.numValue).toBeNull();
    expect(result.openQuestions.join(" ")).toMatch(/maximum fluid temperature/);
  });

  it("converts gpm to m³/h and ft to m", () => {
    const result = extractRequest("Duty is 265 gpm at 150 ft head. Quote 2 units.", context);
    expect(value(result, "min_flow_m3h")!.numValue).toBeCloseTo(60.2, 1);
    expect(value(result, "min_head_m")!.numValue).toBeCloseTo(45.7, 1);
  });

  it("converts psi to bar", () => {
    const result = extractRequest("Discharge is 203 psig. Quote 2 units.", context);
    expect(value(result, "max_pressure_bar")!.numValue).toBeCloseTo(14, 1);
  });

  it("reads a viscosity with a thousands separator", () => {
    const result = extractRequest("Media is around 60,000 cP at temperature. Quote 4 units.", context);
    expect(value(result, "max_viscosity_cp")!.numValue).toBe(60000);
  });

  it("reads NPSH available and orients it as an upper bound on NPSH required", () => {
    const result = extractRequest("NPSH available at site is 3.5 m. Quote 2 units.", context);
    const npsh = value(result, "npsha_m")!;
    expect(npsh.numValue).toBe(3.5);
    expect(npsh.operator).toBe("LTE");
  });

  it("recognises alloys, and does not confuse one for another", () => {
    expect(
      value(extractRequest("Wetted parts Hastelloy C-276. Quote 2 units.", context), "wetted_material")!
        .textValue,
    ).toBe("Hastelloy C-276");
    expect(
      value(extractRequest("316 stainless wetted parts. Quote 2 units.", context), "wetted_material")!
        .textValue,
    ).toBe("316 stainless steel");
  });

  it("reads voltage with phase and frequency", () => {
    const result = extractRequest("Supply is 460 V 3 phase 60 Hz. Quote 2 units.", context);
    expect(value(result, "motor_voltage")!.textValue).toBe("460 V 3ph 60 Hz");
  });

  it("reads an ATEX zone and maps a NEC division to it", () => {
    expect(
      value(extractRequest("Area is ATEX Zone 0. Quote 2 units.", context), "hazardous_area_rating")!
        .textValue,
    ).toBe("ATEX Zone 0");
    const nec = value(
      extractRequest("Installation is Class I Div 1. Quote 2 units.", context),
      "hazardous_area_rating",
    )!;
    expect(nec.textValue).toBe("ATEX Zone 1");
    expect(nec.note).toMatch(/Class I Division 1/);
  });

  it("reads a connection in DN or inches", () => {
    expect(
      value(extractRequest("Existing DN50 pipework. Quote 2 units.", context), "inlet_connection")!
        .textValue,
    ).toBe("DN50");
    expect(
      value(extractRequest('2" ANSI 150# flange connection. Quote 2 units.', context), "inlet_connection")!
        .textValue,
    ).toBe("DN50");
  });

  it("attaches the verbatim snippet each value came from", () => {
    const result = extractRequest("The loop will sit at 180 C continuous. Quote 4 units.", context);
    expect(value(result, "max_fluid_temp_c")!.sourceQuote).toContain("180 C");
  });

  it("records missing quantity, date and destination rather than dropping them", () => {
    const result = extractRequest("need a few of the bigger pumps, high temperature", context);
    expect(value(result, "quantity")!.kind).toBe("MISSING");
    expect(value(result, "required_by")!.kind).toBe("MISSING");
    expect(value(result, "ship_to")!.kind).toBe("MISSING");
    expect(result.openQuestions.length).toBeGreaterThanOrEqual(2);
  });

  it("resolves a ship-to site from an alias", () => {
    const result = extractRequest("Deliver to the Dallas plant. Quote 2 units.", context);
    expect(result.siteId).toBe("s1");
  });

  it("survives an empty message without throwing", () => {
    const result = extractRequest("", context);
    expect(result.items).toHaveLength(0);
    expect(value(result, "quantity")!.kind).toBe("MISSING");
  });

  it("survives a message that is only punctuation", () => {
    expect(() => extractRequest("!!! ??? ...", context)).not.toThrow();
  });
});

describe("inference from the incumbent part", () => {
  const incumbentSpecs = {
    inlet_connection: { textValue: "ANSI 150# flange DN50 2in" },
    wetted_material: { textValue: "316 stainless steel" },
    motor_voltage: { textValue: "460 V 3ph 60 Hz" },
    length_mm: { numValue: 840 },
    max_flow_m3h: { numValue: 60 },
  };

  it("derives connection, material, voltage, footprint and duty", () => {
    const inferred = inferFromIncumbent("AX-220", incumbentSpecs, []);
    expect(inferred.map((r) => r.key).sort()).toEqual([
      "inlet_connection",
      "length_mm",
      "min_flow_m3h",
      "motor_voltage",
      "wetted_material",
    ]);
    expect(inferred.every((r) => r.kind === "INFERRED")).toBe(true);
    expect(inferred.every((r) => r.confidence < 1)).toBe(true);
  });

  it("never overrides something the customer stated explicitly", () => {
    const inferred = inferFromIncumbent("AX-220", incumbentSpecs, [
      {
        key: "wetted_material",
        label: "Wetted material",
        kind: "EXPLICIT",
        operator: "INCLUDES",
        numValue: null,
        textValue: "Hastelloy C-276",
        unit: null,
        sourceQuote: null,
        confidence: 1,
        note: null,
      },
    ]);
    expect(inferred.some((r) => r.key === "wetted_material")).toBe(false);
  });

  it("does not infer a supply voltage from an air-driven pump", () => {
    const inferred = inferFromIncumbent(
      "DG-50",
      { motor_voltage: { textValue: "Not applicable — compressed air driven" } },
      [],
    );
    expect(inferred.some((r) => r.key === "motor_voltage")).toBe(false);
  });

  it("only infers viscosity when the incumbent is genuinely a viscous-duty pump", () => {
    expect(
      inferFromIncumbent("AX-220", { max_viscosity_cp: { numValue: 200 } }, []).some(
        (r) => r.key === "max_viscosity_cp",
      ),
    ).toBe(false);
    expect(
      inferFromIncumbent("RG-100", { max_viscosity_cp: { numValue: 80000 } }, []).some(
        (r) => r.key === "max_viscosity_cp",
      ),
    ).toBe(true);
  });
});
