/**
 * Technical documentation.
 *
 * A specification sheet is generated for every catalog item directly from its
 * spec values, so the text an operator reads as evidence is guaranteed to
 * agree with the number the compatibility engine compared. Curated documents —
 * replacement guides, bulletins, compatibility notes — are written by hand on
 * top of that, because those are the ones that carry real engineering
 * judgement rather than a restatement of the data sheet.
 *
 * The `SPEC_GROUP_ANCHORS` map is what makes a check citable: a rule that read
 * `max_fluid_temp_c` resolves to the "Process limits" section of that
 * product's spec sheet.
 */

import { SPEC_META } from "./spec-meta";
import type { ProductDef } from "./catalog";

export interface DocSectionDef {
  anchor: string;
  heading: string;
  body: string;
  ordinal: number;
}

export interface DocDef {
  docNumber: string;
  title: string;
  type:
    | "SPEC_SHEET"
    | "INSTALLATION_GUIDE"
    | "COMPATIBILITY_NOTE"
    | "REPLACEMENT_GUIDE"
    | "TECHNICAL_BULLETIN"
    | "SAFETY_NOTICE";
  revision: string;
  publishedAt: Date;
  productSku?: string;
  families: string[];
  summary: string;
  sections: DocSectionDef[];
}

/** Spec group → section anchor within a generated spec sheet. */
export const SPEC_GROUP_ANCHORS: Record<string, { anchor: string; heading: string }> = {
  Process: { anchor: "2.1", heading: "Process limits" },
  Hydraulic: { anchor: "2.2", heading: "Hydraulic performance" },
  Mechanical: { anchor: "3.1", heading: "Mechanical construction" },
  Electrical: { anchor: "3.2", heading: "Electrical supply and motor" },
  Compliance: { anchor: "4.1", heading: "Certification and area classification" },
  Physical: { anchor: "5.1", heading: "Dimensions and weight" },
};

function renderSpecLine(key: string, value: number | string | boolean): string {
  const meta = SPEC_META[key];
  if (!meta) return `${key}: ${String(value)}`;
  const rendered =
    typeof value === "number"
      ? `${value.toLocaleString("en-US")}${meta.unit ? ` ${meta.unit}` : ""}`
      : String(value);
  return `${meta.label}: ${rendered}`;
}

function specSheetNumber(index: number): string {
  return `DS-${(1000 + index).toString()}`;
}

/** One data sheet per catalog item, generated from the item's own spec values. */
export function buildSpecSheets(products: ProductDef[], publishedAt: Date): DocDef[] {
  return products.map((product, index) => {
    const byGroup = new Map<string, string[]>();
    for (const [key, value] of Object.entries(product.specs)) {
      const meta = SPEC_META[key];
      if (!meta) continue;
      const list = byGroup.get(meta.group) ?? [];
      list.push(renderSpecLine(key, value));
      byGroup.set(meta.group, list);
    }

    const sections: DocSectionDef[] = [
      {
        anchor: "1.1",
        heading: "Scope and intended service",
        body: `${product.name}. ${product.description} This data sheet states the published limits for the ${product.sku}. Selection outside these limits requires written application-engineering approval.`,
        ordinal: 0,
      },
    ];

    let ordinal = 1;
    for (const group of ["Process", "Hydraulic", "Mechanical", "Electrical", "Compliance", "Physical"]) {
      const lines = byGroup.get(group);
      if (!lines || lines.length === 0) continue;
      const anchor = SPEC_GROUP_ANCHORS[group];
      sections.push({
        anchor: anchor.anchor,
        heading: anchor.heading,
        body: `${lines.join("\n")}\n\nValues are continuous ratings at the published reference conditions. Intermittent excursions are not covered by this data sheet.`,
        ordinal: ordinal++,
      });
    }

    sections.push({
      anchor: "6.1",
      heading: "Ordering and lead time",
      body: `Standard factory lead time for the ${product.sku} is ${product.leadTimeDays} calendar days from order acknowledgement when stock is not available. Lifecycle status at this revision: ${product.lifecycle.replace("_", " ").toLowerCase()}.`,
      ordinal: ordinal++,
    });

    return {
      docNumber: specSheetNumber(index),
      title: `${product.sku} product data sheet`,
      type: "SPEC_SHEET" as const,
      revision: "Rev C",
      publishedAt,
      productSku: product.sku,
      families: [],
      summary: `Published performance, construction and certification limits for the ${product.sku}.`,
      sections,
    };
  });
}

/**
 * Hand-written documents. These carry the judgement that a generated data
 * sheet cannot: why a substitution is normally acceptable, what to watch for,
 * and where the boundary of the recommendation sits.
 */
export function buildCuratedDocs(publishedAt: Date): DocDef[] {
  const d = (daysAgo: number) => new Date(publishedAt.getTime() - daysAgo * 86400000);

  return [
    {
      docNumber: "RG-2207",
      title: "Replacing AX Series pumps on elevated-temperature duty",
      type: "REPLACEMENT_GUIDE",
      revision: "Rev D",
      publishedAt: d(220),
      families: ["AX Series", "PX Series"],
      summary:
        "Selection route when an existing AX Series installation moves above the 120 °C ceiling of the AX hydraulic.",
      sections: [
        {
          anchor: "1.0",
          heading: "Why the AX Series stops at 120 °C",
          body: "The AX Series uses a grease-lubricated bearing frame and a single cartridge seal with FKM secondary elastomers. Both are limited by the elastomer, not the casing: FKM loses compression set above approximately 200 °C, and the grease film breaks down well before that at the bearing temperatures reached by a close-coupled hot duty. The published 120 °C continuous limit carries margin for a hot-standby excursion. It is not a conservative number that can be exceeded on advice.",
          ordinal: 0,
        },
        {
          anchor: "2.0",
          heading: "Standard replacement route: AX-220 to PX-440",
          body: "For an AX-220 duty moving into the 150–205 °C band, the PX-440 is the standard selection. It shares the DN50 ANSI 150# suction and discharge connections, so existing pipework lands without modification, and the PX-440 overall length of 880 mm sits within 5% of the AX-220's 840 mm — inside the tolerance for reusing an existing grouted baseplate, subject to a site check of the coupling gap. The PX-440 carries a finned bearing housing with oil lubrication and a SiC/SiC cartridge seal with flexible graphite secondaries, which is what buys the temperature headroom.",
          ordinal: 1,
        },
        {
          anchor: "2.1",
          heading: "Where the PX-440 is not the answer",
          body: "Above 205 °C continuous, step to the PX-460 (230 °C) or PX-480 (300 °C). Be aware that the PX-460 is a longer frame at 1010 mm and will not reuse an AX-220 baseplate. Below 55 m³/h the PX-400 is the cheaper selection, but it will not cover an AX-220 duty point at full flow. The PX-420 is hydraulically adequate for most AX-220 duties but carries a DN40 suction, which means either an adapter kit or a re-pipe on a DN50 line — quote the PX-422 instead where the pipework is DN50.",
          ordinal: 2,
        },
        {
          anchor: "3.0",
          heading: "Items that must be confirmed before order",
          body: "Confirm NPSH available at the site. The PX-440 requires 3.1 m against the AX-220's 2.8 m, and a suction-limited installation that was marginal with the AX-220 will cavitate with the PX-440. Confirm the coupling and guard are rated for the PX frame — the AX spacer coupling CP-100 fits, but the guard bracket differs. Confirm insulation and personnel protection: a 180 °C casing is a burn hazard the AX installation did not present.",
          ordinal: 3,
        },
      ],
    },
    {
      docNumber: "TB-3141",
      title: "Technical bulletin: AX-260 end of life and AX-262 transition",
      type: "TECHNICAL_BULLETIN",
      revision: "Rev A",
      publishedAt: d(140),
      families: ["AX Series"],
      summary: "The AX-260 is end of life. The AX-262 is the drop-in successor.",
      sections: [
        {
          anchor: "1.0",
          heading: "Status",
          body: "AX-260 production ended at the close of the previous model year. Remaining stock is being sold down and the factory lead time for a new build has moved to 65 days. Spare-parts support continues for seven years; the SK-2600 seal kit covers both the AX-260 and the AX-262.",
          ordinal: 0,
        },
        {
          anchor: "2.0",
          heading: "AX-262 as a drop-in replacement",
          body: "The AX-262 retains the AX-260 casing, connections (DN80 ANSI 150#), baseplate bolt pattern and shaft centre height. The impeller has been re-profiled, moving the best-efficiency point slightly right: 112 m³/h against 110 m³/h, and 59 m of head against 58 m. NPSH required improves marginally from 3.6 m to 3.5 m. For any duty point the AX-260 served, the AX-262 is a direct substitution requiring no site modification.",
          ordinal: 1,
        },
        {
          anchor: "3.0",
          heading: "Commercial note",
          body: "The AX-262 lists 3.1% above the AX-260. Where a customer holds a contract price against the AX-260 part number, the contract does not automatically transfer — raise it with the account manager before quoting.",
          ordinal: 2,
        },
      ],
    },
    {
      docNumber: "CN-5088",
      title: "Compatibility note: elastomer selection for DG Series diaphragm pumps",
      type: "COMPATIBILITY_NOTE",
      revision: "Rev B",
      publishedAt: d(300),
      families: ["DG Series"],
      summary: "PTFE and EPDM diaphragms are not interchangeable without a media check.",
      sections: [
        {
          anchor: "1.0",
          heading: "PTFE against EPDM",
          body: "PTFE diaphragms are chemically near-universal and are the default specification on the DG-50 and DG-80. EPDM, fitted to the DG-52, is materially cheaper and has better flex life, but it is attacked by mineral oils, aromatic and chlorinated hydrocarbons, and concentrated oxidising acids. EPDM is entirely appropriate for water, dilute caustic, alcohols and most aqueous process streams.",
          ordinal: 0,
        },
        {
          anchor: "2.0",
          heading: "How to treat a DG-50 to DG-52 substitution",
          body: "The DG-52 is hydraulically equivalent to the DG-50 and shares its body, connections and footprint. The substitution is a pure elastomer change. It must not be made on the strength of the part number alone: the actual pumped media has to be named and checked against the EPDM compatibility table before the substitution is offered. Where the media is unknown or the customer's process is mixed-service, quote the DG-50 with PTFE.",
          ordinal: 1,
        },
      ],
    },
    {
      docNumber: "CN-5120",
      title: "Compatibility note: adapting an RG-120 onto RG-100 pipework",
      type: "COMPATIBILITY_NOTE",
      revision: "Rev A",
      publishedAt: d(95),
      families: ["RG Series", "FA Series"],
      summary: "The FA-4050 adapter kit lands a DN50 RG-120 on an existing DN40 line.",
      sections: [
        {
          anchor: "1.0",
          heading: "Connection difference",
          body: "The discontinued RG-100 carries DN40 ANSI 150# connections. Its replacement, the RG-120, carries DN50. On a retrofit the pipework is almost always DN40, so the RG-120 cannot be landed directly.",
          ordinal: 0,
        },
        {
          anchor: "2.0",
          heading: "FA-4050 adapter kit",
          body: "The FA-4050 is a machined 316 stainless reducing flange set with gaskets and fasteners, rated to 20 bar and 250 °C — comfortably beyond the RG-120's 16 bar and 200 °C limits. Fitted, it presents a DN40 face to the existing line. Two kits are required per pump, one on suction and one on discharge.",
          ordinal: 1,
        },
        {
          anchor: "3.0",
          heading: "Consequences an engineer must sign off",
          body: "The reduction raises suction velocity. On a viscous duty near the RG-120's flow ceiling this can push NPSH required beyond what the installation provides. The adapter also adds roughly 90 mm to overall installed length per end, which may exceed the available run between existing flanges. Both need confirming against the site before the substitution is quoted.",
          ordinal: 2,
        },
      ],
    },
    {
      docNumber: "SN-7001",
      title: "Safety notice: hazardous area classification and equipment certification",
      type: "SAFETY_NOTICE",
      revision: "Rev C",
      publishedAt: d(410),
      families: ["AX Series", "PX Series", "MX Series", "DG Series", "RG Series", "VS Series"],
      summary: "Area classification is a regulatory requirement and cannot be traded off commercially.",
      sections: [
        {
          anchor: "1.0",
          heading: "Zones and equipment categories",
          body: "Zone 0 describes an atmosphere in which an explosive mixture is present continuously or for long periods and requires Category 1 equipment. Zone 1 describes an atmosphere in which such a mixture is likely in normal operation and requires Category 2 equipment. Zone 2 covers a mixture that is unlikely, and brief if it occurs, and accepts Category 3 equipment. Equipment certified for Zone 1 is not certified for Zone 0.",
          ordinal: 0,
        },
        {
          anchor: "2.0",
          heading: "No commercial override",
          body: "There is no circumstance in which equipment may be supplied into a classified area below the required category, whatever the commercial pressure or the customer's own assurance. Where the catalog does not hold a certified part for the stated zone, the correct answer is that the requirement cannot be met from stock product and the enquiry goes to application engineering for a special. Nothing in this catalog is certified for Zone 0.",
          ordinal: 1,
        },
      ],
    },
    {
      docNumber: "CN-5210",
      title: "Compatibility note: wetted material selection for acid service",
      type: "COMPATIBILITY_NOTE",
      revision: "Rev B",
      publishedAt: d(180),
      families: ["MX Series", "PX Series", "AX Series"],
      summary: "316 stainless is not a substitute for Hastelloy C-276 in concentrated acid service.",
      sections: [
        {
          anchor: "1.0",
          heading: "316 stainless steel limits",
          body: "316 stainless is the catalog default and is appropriate for the great majority of aqueous, caustic and mild process duty. It is not appropriate for concentrated sulphuric acid above ambient temperature, for hydrochloric acid at any concentration, or for wet chlorine. In hot concentrated sulphuric service 316 corrodes at rates measured in millimetres per year, which on a pump casing means through-wall failure inside a single production campaign.",
          ordinal: 0,
        },
        {
          anchor: "2.0",
          heading: "Hastelloy C-276",
          body: "The MX-200 is the only catalog item with Hastelloy C-276 wetted parts. It is rated to 120 °C and carries ATEX II 2G Zone 1 certification, with a 70-day factory lead time. Above 120 °C in concentrated acid service there is no catalog selection: the enquiry is a special and must go to application engineering. Offering a 316 stainless pump against a stated Hastelloy requirement is not a commercial decision that can be made in the field.",
          ordinal: 1,
        },
      ],
    },
    {
      docNumber: "IG-9044",
      title: "Installation guide: split-shipment orders and site receiving",
      type: "INSTALLATION_GUIDE",
      revision: "Rev A",
      publishedAt: d(60),
      families: ["AX Series", "PX Series", "VS Series"],
      summary: "Practical notes when an order is filled from more than one distribution centre.",
      sections: [
        {
          anchor: "1.0",
          heading: "Matched serial batches",
          body: "Pumps shipped from different distribution centres may come from different production batches. For a multi-pump installation on a common header this is normally immaterial, but where pumps are to run in parallel on a shared duty, confirm that impeller trim is identical across the batches — a trim difference of a few millimetres produces uneven load sharing.",
          ordinal: 0,
        },
        {
          anchor: "2.0",
          heading: "Receiving and commissioning",
          body: "Split shipments arrive on separate deliveries and often on different days. Where the site plans a single commissioning window, the estimated arrival of the later leg — not the earlier — is the date that governs. Quote the later date to the customer.",
          ordinal: 1,
        },
      ],
    },
    {
      docNumber: "TB-3180",
      title: "Technical bulletin: NPSH margin on high-temperature retrofits",
      type: "TECHNICAL_BULLETIN",
      revision: "Rev A",
      publishedAt: d(75),
      families: ["PX Series", "AX Series"],
      summary: "The most common failure mode on a hot retrofit is suction-side, not temperature.",
      sections: [
        {
          anchor: "1.0",
          heading: "Why hot duty erodes NPSH available",
          body: "NPSH available falls as fluid temperature rises, because vapour pressure rises with it. A suction arrangement that comfortably supported an AX-220 on 60 °C water can be marginal on the same pump at 150 °C, before any change of pump is considered. A retrofit that also raises NPSH required — as every step up the PX range does — compounds the problem.",
          ordinal: 0,
        },
        {
          anchor: "2.0",
          heading: "What to ask for",
          body: "Where a request moves an existing installation to a higher temperature, NPSH available at the new operating condition is a required input, not an optional one. If the customer has not stated it, it should be asked for rather than assumed. A selection made without it rests on an unverified dimension and should be flagged as such.",
          ordinal: 1,
        },
      ],
    },
  ];
}
