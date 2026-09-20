/**
 * Canonical specification vocabulary.
 *
 * Every product spec, every extracted requirement and every compatibility
 * rule keys off this table. Keeping units and labels in one place is what
 * lets the compatibility engine compare "180 °C" from an email against a
 * catalog value without free-text parsing at comparison time.
 */

export type SpecType = "NUMERIC" | "RANGE" | "ENUM" | "BOOLEAN" | "TEXT";

export interface SpecMeta {
  label: string;
  type: SpecType;
  unit?: string;
  /** Shown in the product detail panel under this heading. */
  group: "Process" | "Hydraulic" | "Mechanical" | "Electrical" | "Compliance" | "Physical";
}

export const SPEC_META: Record<string, SpecMeta> = {
  max_fluid_temp_c: { label: "Max fluid temperature", type: "NUMERIC", unit: "°C", group: "Process" },
  min_fluid_temp_c: { label: "Min fluid temperature", type: "NUMERIC", unit: "°C", group: "Process" },
  max_pressure_bar: { label: "Max discharge pressure", type: "NUMERIC", unit: "bar", group: "Process" },
  max_viscosity_cp: { label: "Max viscosity", type: "NUMERIC", unit: "cP", group: "Process" },
  max_flow_m3h: { label: "Max flow rate", type: "NUMERIC", unit: "m³/h", group: "Hydraulic" },
  max_head_m: { label: "Max head", type: "NUMERIC", unit: "m", group: "Hydraulic" },
  npshr_m: { label: "NPSH required", type: "NUMERIC", unit: "m", group: "Hydraulic" },
  inlet_connection: { label: "Inlet connection", type: "TEXT", group: "Mechanical" },
  outlet_connection: { label: "Outlet connection", type: "TEXT", group: "Mechanical" },
  wetted_material: { label: "Wetted material", type: "TEXT", group: "Mechanical" },
  seal_type: { label: "Seal / elastomer", type: "TEXT", group: "Mechanical" },
  bearing_type: { label: "Bearing arrangement", type: "TEXT", group: "Mechanical" },
  motor_voltage: { label: "Supply voltage", type: "TEXT", group: "Electrical" },
  motor_power_kw: { label: "Motor rating", type: "NUMERIC", unit: "kW", group: "Electrical" },
  ip_rating: { label: "Ingress protection", type: "TEXT", group: "Electrical" },
  hazardous_area_rating: { label: "Hazardous area rating", type: "TEXT", group: "Compliance" },
  certifications: { label: "Certifications", type: "TEXT", group: "Compliance" },
  duty_cycle: { label: "Duty", type: "TEXT", group: "Compliance" },
  length_mm: { label: "Overall length", type: "NUMERIC", unit: "mm", group: "Physical" },
  width_mm: { label: "Overall width", type: "NUMERIC", unit: "mm", group: "Physical" },
  height_mm: { label: "Overall height", type: "NUMERIC", unit: "mm", group: "Physical" },
  provides_connection: { label: "Adapts connection to", type: "TEXT", group: "Mechanical" },
  fits_families: { label: "Fits families", type: "TEXT", group: "Mechanical" },
};

export function specUnit(key: string): string | undefined {
  return SPEC_META[key]?.unit;
}

export function specLabel(key: string): string {
  return SPEC_META[key]?.label ?? key;
}
