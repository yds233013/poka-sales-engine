/**
 * Demo curation.
 *
 * A first-time viewer landing on the overview needs a place to start, and
 * the most complete walkthrough in the seeded data is one specific case: a
 * substitution with rejected alternatives, cited evidence, a split shipment
 * and three approvals. Naming it here is curation, not fabrication — every
 * figure shown alongside it is read from the database at render time, and if
 * the case does not exist the pointer simply does not render.
 */
export const SPOTLIGHT = {
  reference: "REQ-2041",
  pitch:
    "A customer asks for twelve of the pump they already run, after moving the loop to 180 °C. The engine rules their part out, picks a substitute on cited evidence, splits the order across two warehouses and holds the quote for three approvals.",
};
