/**
 * Compatibility rules.
 *
 * Each rule binds one extracted requirement key to one product spec key with
 * a comparison operator and a severity. HARD rules block; SOFT rules warn.
 *
 * The severities encode real engineering judgement: getting the temperature
 * rating wrong destroys a seal, so it is HARD. Getting the footprint wrong
 * means a site visit and a new baseplate, which is expensive and annoying but
 * not dangerous, so it is SOFT and goes to a human.
 */

export const COMPATIBILITY_RULES = [
  {
    code: "TEMP-01",
    dimension: "temperature",
    label: "Fluid temperature",
    specKey: "max_fluid_temp_c",
    requirementKey: "max_fluid_temp_c",
    operator: "GTE" as const,
    severity: "HARD" as const,
    appliesTo: [] as string[],
    explanation:
      "Operating a pump above its rated fluid temperature degrades the seal faces and bearing lubrication and voids the warranty.",
  },
  {
    code: "PRES-01",
    dimension: "pressure",
    label: "Discharge pressure",
    specKey: "max_pressure_bar",
    requirementKey: "max_pressure_bar",
    operator: "GTE" as const,
    severity: "HARD" as const,
    appliesTo: [],
    explanation: "The casing pressure rating is a containment limit and cannot be exceeded.",
  },
  {
    code: "FLOW-01",
    dimension: "flow",
    label: "Flow rate",
    specKey: "max_flow_m3h",
    requirementKey: "min_flow_m3h",
    operator: "GTE" as const,
    severity: "HARD" as const,
    appliesTo: [],
    explanation: "A pump that cannot reach the required flow will not meet the process duty.",
  },
  {
    code: "HEAD-01",
    dimension: "head",
    label: "Differential head",
    specKey: "max_head_m",
    requirementKey: "min_head_m",
    operator: "GTE" as const,
    severity: "HARD" as const,
    appliesTo: [],
    explanation: "Insufficient head means the pump cannot deliver against the system curve.",
  },
  {
    code: "VISC-01",
    dimension: "viscosity",
    label: "Viscosity handling",
    specKey: "max_viscosity_cp",
    requirementKey: "max_viscosity_cp",
    operator: "GTE" as const,
    severity: "HARD" as const,
    appliesTo: [],
    explanation:
      "Centrifugal hydraulics lose efficiency rapidly above their rated viscosity; beyond the limit the pump stalls or the motor overloads.",
  },
  {
    code: "NPSH-01",
    dimension: "npsh",
    label: "NPSH margin",
    specKey: "npshr_m",
    requirementKey: "npsha_m",
    operator: "LTE" as const,
    severity: "HARD" as const,
    appliesTo: [],
    explanation:
      "NPSH required must sit below the NPSH available at site or the pump will cavitate and destroy its impeller.",
  },
  {
    code: "CONN-01",
    dimension: "connection",
    label: "Pipe connection",
    specKey: "inlet_connection",
    requirementKey: "inlet_connection",
    operator: "INCLUDES" as const,
    severity: "HARD" as const,
    appliesTo: [],
    explanation:
      "A mismatched flange size cannot be landed on existing pipework without an adapter kit or a re-pipe.",
  },
  {
    code: "MAT-01",
    dimension: "material",
    label: "Wetted material",
    specKey: "wetted_material",
    requirementKey: "wetted_material",
    operator: "INCLUDES" as const,
    severity: "HARD" as const,
    appliesTo: [],
    explanation:
      "Wetted material is a corrosion-compatibility requirement. Substituting a lesser alloy risks rapid through-wall failure.",
  },
  {
    code: "VOLT-01",
    dimension: "voltage",
    label: "Supply voltage",
    specKey: "motor_voltage",
    requirementKey: "motor_voltage",
    operator: "INCLUDES" as const,
    severity: "HARD" as const,
    appliesTo: [],
    explanation: "The motor must match the site supply; a mismatch needs a transformer or a rewound motor.",
  },
  {
    code: "HAZ-01",
    dimension: "hazardous_area",
    label: "Hazardous area rating",
    specKey: "hazardous_area_rating",
    requirementKey: "hazardous_area_rating",
    operator: "INCLUDES" as const,
    severity: "HARD" as const,
    appliesTo: [],
    explanation:
      "Equipment installed in a classified area must carry the corresponding certification. This is a regulatory requirement, not a preference.",
  },
  {
    code: "CERT-01",
    dimension: "certification",
    label: "Certification",
    specKey: "certifications",
    requirementKey: "certifications",
    operator: "INCLUDES" as const,
    severity: "HARD" as const,
    appliesTo: [],
    explanation: "A required third-party certification cannot be waived at the point of sale.",
  },
  {
    code: "SEAL-01",
    dimension: "seal",
    label: "Seal / elastomer",
    specKey: "seal_type",
    requirementKey: "seal_type",
    operator: "INCLUDES" as const,
    severity: "SOFT" as const,
    appliesTo: [],
    explanation:
      "Elastomer compatibility depends on the actual media. A different elastomer may be perfectly serviceable, but an engineer should confirm it against the fluid.",
  },
  {
    code: "DIM-01",
    dimension: "footprint",
    label: "Installed footprint",
    specKey: "length_mm",
    requirementKey: "length_mm",
    operator: "WITHIN_TOLERANCE" as const,
    severity: "SOFT" as const,
    tolerancePct: 8,
    appliesTo: [],
    explanation:
      "A frame that is materially longer than the incumbent will not sit on the existing baseplate and needs a site check before it is quoted.",
  },
  {
    code: "IP-01",
    dimension: "ingress",
    label: "Ingress protection",
    specKey: "ip_rating",
    requirementKey: "ip_rating",
    operator: "INCLUDES" as const,
    severity: "SOFT" as const,
    appliesTo: [],
    explanation: "A lower ingress rating may still be acceptable indoors but should be confirmed.",
  },
];

/** Commercial guardrails. Values are deliberately visible and editable. */
export const POLICY_THRESHOLDS = [
  {
    code: "MAX_DISCOUNT_PCT",
    label: "Maximum discount without approval",
    numericValue: 18,
    unit: "%",
    description:
      "A sales representative may release a quote up to this blended discount off list. Above it, a sales manager signs off.",
  },
  {
    code: "MIN_MARGIN_PCT",
    label: "Minimum gross margin",
    numericValue: 22,
    unit: "%",
    description:
      "Target floor for gross margin after freight is absorbed. Below this, a sales manager signs off.",
  },
  {
    code: "HARD_MARGIN_FLOOR_PCT",
    label: "Hard margin floor",
    numericValue: 8,
    unit: "%",
    description:
      "Deals below this margin cannot be released by sales management — they require commercial director approval.",
  },
  {
    code: "MAX_FACTORY_UNITS",
    label: "Maximum factory build per order",
    numericValue: 250,
    unit: "units",
    description:
      "The largest quantity that may be promised against a single standard factory build. Beyond this the enquiry is a scheduled project and the factory has to confirm a build plan.",
  },
  {
    code: "LARGE_QUOTE_VALUE",
    label: "Large quote review threshold",
    numericValue: 50000,
    unit: "USD",
    description:
      "Quotes above this value are reviewed for credit exposure and delivery commitment before release.",
  },
];
