import { describe, expect, it } from "vitest";
import {
  assertNotBlocked,
  evaluateCandidate,
  normalizeToken,
  recomputeVerdict,
} from "@/lib/engines/compatibility";
import { product, requirement, rule, spec } from "../support/factories";

const TEMP_RULE = rule({
  code: "TEMP-01",
  dimension: "temperature",
  label: "Fluid temperature",
  specKey: "max_fluid_temp_c",
  requirementKey: "max_fluid_temp_c",
  operator: "GTE",
  severity: "HARD",
});

const CONN_RULE = rule({
  code: "CONN-01",
  dimension: "connection",
  label: "Pipe connection",
  specKey: "inlet_connection",
  requirementKey: "inlet_connection",
  operator: "INCLUDES",
  severity: "HARD",
});

const DIM_RULE = rule({
  code: "DIM-01",
  dimension: "footprint",
  label: "Installed footprint",
  specKey: "length_mm",
  requirementKey: "length_mm",
  operator: "WITHIN_TOLERANCE",
  severity: "SOFT",
  tolerancePct: 8,
});

const NPSH_RULE = rule({
  code: "NPSH-01",
  dimension: "npsh",
  label: "NPSH margin",
  specKey: "npshr_m",
  requirementKey: "npsha_m",
  operator: "LTE",
  severity: "HARD",
});

describe("compatibility engine", () => {
  it("passes a product that exceeds a hard numeric requirement", () => {
    const verdict = evaluateCandidate(
      product({ sku: "PX-440", specs: { max_fluid_temp_c: spec("max_fluid_temp_c", 205, "°C") } }),
      [requirement("max_fluid_temp_c", { operator: "GTE", numValue: 180, unit: "°C" })],
      [TEMP_RULE],
    );
    expect(verdict.safety).toBe("AUTO_SAFE");
    expect(verdict.checks[0].result).toBe("PASS");
    expect(verdict.hardFailures).toHaveLength(0);
  });

  it("blocks a product that misses a hard numeric requirement", () => {
    const verdict = evaluateCandidate(
      product({ sku: "AX-220", specs: { max_fluid_temp_c: spec("max_fluid_temp_c", 120, "°C") } }),
      [requirement("max_fluid_temp_c", { operator: "GTE", numValue: 180, unit: "°C" })],
      [TEMP_RULE],
    );
    expect(verdict.safety).toBe("BLOCKED");
    expect(verdict.hardFailures).toHaveLength(1);
    expect(verdict.score).toBe(0);
    expect(() => assertNotBlocked(verdict)).toThrow(/Refusing to proceed with AX-220/);
  });

  it("treats a boundary value as satisfying a GTE requirement", () => {
    const verdict = evaluateCandidate(
      product({ sku: "EXACT", specs: { max_fluid_temp_c: spec("max_fluid_temp_c", 180, "°C") } }),
      [requirement("max_fluid_temp_c", { operator: "GTE", numValue: 180 })],
      [TEMP_RULE],
    );
    expect(verdict.checks[0].result).toBe("PASS");
  });

  it("never reports a missing spec as a pass", () => {
    const verdict = evaluateCandidate(
      product({ sku: "NOSPEC", specs: {} }),
      [requirement("max_fluid_temp_c", { operator: "GTE", numValue: 180 })],
      [TEMP_RULE],
    );
    expect(verdict.checks[0].result).toBe("UNKNOWN");
    expect(verdict.safety).toBe("NEEDS_REVIEW");
    // Unknown is not blocked — it goes to a human rather than being refused.
    expect(() => assertNotBlocked(verdict)).not.toThrow();
  });

  it("treats an ambiguous requirement as unverified, never as satisfied", () => {
    const verdict = evaluateCandidate(
      product({ sku: "PX-440", specs: { max_fluid_temp_c: spec("max_fluid_temp_c", 205, "°C") } }),
      [
        requirement("max_fluid_temp_c", {
          kind: "AMBIGUOUS",
          operator: "GTE",
          note: "no value stated",
          confidence: 0.3,
        }),
      ],
      [TEMP_RULE],
    );
    expect(verdict.checks[0].result).toBe("UNKNOWN");
    expect(verdict.unknowns).toHaveLength(1);
  });

  it("skips a rule when the requirement is absent rather than inventing one", () => {
    const verdict = evaluateCandidate(
      product({ sku: "PX-440", specs: { max_fluid_temp_c: spec("max_fluid_temp_c", 205) } }),
      [],
      [TEMP_RULE],
    );
    expect(verdict.checks).toHaveLength(0);
    expect(verdict.safety).toBe("AUTO_SAFE");
  });

  it("skips a rule when the requirement was recorded as MISSING", () => {
    const verdict = evaluateCandidate(
      product({ sku: "PX-440", specs: { max_fluid_temp_c: spec("max_fluid_temp_c", 205) } }),
      [requirement("max_fluid_temp_c", { kind: "MISSING" })],
      [TEMP_RULE],
    );
    expect(verdict.checks).toHaveLength(0);
  });

  it("matches a connection requirement inside a longer catalog string", () => {
    const verdict = evaluateCandidate(
      product({
        sku: "PX-440",
        specs: { inlet_connection: spec("inlet_connection", "ANSI 150# flange DN50 2in") },
      }),
      [requirement("inlet_connection", { operator: "INCLUDES", textValue: "DN50" })],
      [CONN_RULE],
    );
    expect(verdict.checks[0].result).toBe("PASS");
  });

  it("fails a connection requirement the catalog string does not contain", () => {
    const verdict = evaluateCandidate(
      product({
        sku: "PX-420",
        specs: { inlet_connection: spec("inlet_connection", "ANSI 150# flange DN40 1.5in") },
      }),
      [requirement("inlet_connection", { operator: "INCLUDES", textValue: "DN50" })],
      [CONN_RULE],
    );
    expect(verdict.safety).toBe("BLOCKED");
  });

  it("does not let DN50 match DN500 or vice versa", () => {
    const verdict = evaluateCandidate(
      product({ sku: "BIG", specs: { inlet_connection: spec("inlet_connection", "flange DN500") } }),
      [requirement("inlet_connection", { operator: "INCLUDES", textValue: "DN50" })],
      [CONN_RULE],
    );
    expect(verdict.checks[0].result).toBe("FAIL");
  });

  it("warns rather than blocks when a soft tolerance is exceeded", () => {
    const verdict = evaluateCandidate(
      product({ sku: "PX-460", specs: { length_mm: spec("length_mm", 1010, "mm") } }),
      [requirement("length_mm", { operator: "WITHIN_TOLERANCE", numValue: 840, unit: "mm" })],
      [DIM_RULE],
    );
    expect(verdict.checks[0].result).toBe("WARNING");
    expect(verdict.safety).toBe("NEEDS_REVIEW");
    expect(() => assertNotBlocked(verdict)).not.toThrow();
  });

  it("passes inside the soft tolerance band", () => {
    const verdict = evaluateCandidate(
      product({ sku: "PX-440", specs: { length_mm: spec("length_mm", 880, "mm") } }),
      [requirement("length_mm", { operator: "WITHIN_TOLERANCE", numValue: 840, unit: "mm" })],
      [DIM_RULE],
    );
    expect(verdict.checks[0].result).toBe("PASS");
  });

  it("compares NPSH in the correct direction", () => {
    // NPSH required must be BELOW NPSH available.
    const ok = evaluateCandidate(
      product({ sku: "OK", specs: { npshr_m: spec("npshr_m", 2.8, "m") } }),
      [requirement("npsha_m", { operator: "LTE", numValue: 3.5, unit: "m" })],
      [NPSH_RULE],
    );
    const bad = evaluateCandidate(
      product({ sku: "BAD", specs: { npshr_m: spec("npshr_m", 4.2, "m") } }),
      [requirement("npsha_m", { operator: "LTE", numValue: 3.5, unit: "m" })],
      [NPSH_RULE],
    );
    expect(ok.checks[0].result).toBe("PASS");
    expect(bad.checks[0].result).toBe("FAIL");
  });

  it("only applies a rule to the categories it is scoped to", () => {
    const scoped = rule({ ...TEMP_RULE, appliesTo: ["CP-HT"] });
    const verdict = evaluateCandidate(
      product({ sku: "AX-220", categoryCode: "CP-STD", specs: { max_fluid_temp_c: spec("max_fluid_temp_c", 120) } }),
      [requirement("max_fluid_temp_c", { operator: "GTE", numValue: 180 })],
      [scoped],
    );
    expect(verdict.checks).toHaveLength(0);
  });

  it("hard-fails a discontinued product and warns on end of life", () => {
    const discontinued = evaluateCandidate(
      product({ sku: "RG-100", lifecycle: "DISCONTINUED" }),
      [],
      [],
    );
    const eol = evaluateCandidate(product({ sku: "AX-260", lifecycle: "END_OF_LIFE" }), [], []);
    expect(discontinued.safety).toBe("BLOCKED");
    expect(eol.safety).toBe("NEEDS_REVIEW");
  });

  it("reports every dimension it tested, including the passes", () => {
    const verdict = evaluateCandidate(
      product({
        sku: "PX-440",
        specs: {
          max_fluid_temp_c: spec("max_fluid_temp_c", 205),
          inlet_connection: spec("inlet_connection", "ANSI 150# flange DN50 2in"),
          length_mm: spec("length_mm", 880),
        },
      }),
      [
        requirement("max_fluid_temp_c", { operator: "GTE", numValue: 180 }),
        requirement("inlet_connection", { operator: "INCLUDES", textValue: "DN50" }),
        requirement("length_mm", { operator: "WITHIN_TOLERANCE", numValue: 840 }),
      ],
      [TEMP_RULE, CONN_RULE, DIM_RULE],
    );
    expect(verdict.checks).toHaveLength(3);
    expect(verdict.checks.every((c) => c.result === "PASS")).toBe(true);
  });

  it("recomputes safety and score from a patched check set", () => {
    const verdict = evaluateCandidate(
      product({ sku: "RG-120", specs: { inlet_connection: spec("inlet_connection", "DN50") } }),
      [requirement("inlet_connection", { operator: "INCLUDES", textValue: "DN40" })],
      [CONN_RULE],
    );
    expect(verdict.safety).toBe("BLOCKED");

    // Simulates the adapter override in the orchestrator.
    verdict.checks[0].result = "PASS";
    verdict.checks.push({
      dimension: "accessory",
      label: "Adapter required",
      result: "WARNING",
      severity: "SOFT",
      requirement: "direct fit",
      actual: "fits via FA-4050",
      detail: "",
    });
    recomputeVerdict(verdict, 10);
    expect(verdict.safety).toBe("NEEDS_REVIEW");
    expect(verdict.score).toBeGreaterThan(0);
  });

  it("normalises inch marks and punctuation when comparing tokens", () => {
    expect(normalizeToken('2" flange')).toBe("2in flange");
    expect(normalizeToken("ANSI 150#  flange  DN50")).toBe("ansi 150 flange dn50");
  });
});
