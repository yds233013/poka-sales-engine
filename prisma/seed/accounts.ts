/**
 * Internal users, customer accounts, sites and contacts.
 *
 * All companies, people, addresses and contract references below are
 * invented for this demonstration.
 */

export const USERS = [
  { name: "Dana Whitfield", email: "dana.whitfield@example-distribution.com", role: "SALES_REP" as const, title: "Technical sales representative", initials: "DW" },
  { name: "Marcus Oyelaran", email: "marcus.oyelaran@example-distribution.com", role: "SALES_REP" as const, title: "Technical sales representative", initials: "MO" },
  { name: "Priya Raghavan", email: "priya.raghavan@example-distribution.com", role: "SALES_MANAGER" as const, title: "Regional sales manager", initials: "PR" },
  { name: "Tomas Lindqvist", email: "tomas.lindqvist@example-distribution.com", role: "APPLICATION_ENGINEER" as const, title: "Senior application engineer", initials: "TL" },
  { name: "Ruth Ibekwe", email: "ruth.ibekwe@example-distribution.com", role: "ADMIN" as const, title: "Commercial director", initials: "RI" },
];

export interface SiteDef {
  key: string;
  name: string;
  aliases: string[];
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  freightZone: string;
  isPrimary?: boolean;
}

export interface ContactDef {
  key: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle: string;
  siteKey?: string;
}

export interface CustomerDef {
  accountNumber: string;
  name: string;
  legalName: string;
  industry: string;
  tier: "STRATEGIC" | "KEY" | "STANDARD" | "TRANSACTIONAL";
  paymentTerms: number;
  creditLimit: number;
  priceBookCode: string;
  notes?: string;
  sites: SiteDef[];
  contacts: ContactDef[];
  /** Negotiated per-SKU contract prices. */
  contracts?: { sku: string; price: number; ref: string; fromDaysAgo: number; forDays: number }[];
}

export const CUSTOMERS: CustomerDef[] = [
  {
    accountNumber: "ACC-10044",
    name: "Cardinal Processing Group",
    legalName: "Cardinal Processing Group, Inc.",
    industry: "Specialty chemicals",
    tier: "KEY",
    paymentTerms: 45,
    creditLimit: 750000,
    priceBookCode: "PB-KEY",
    notes:
      "Four US plants. Standardised on the AX Series for utility duty since 2019. Maintenance team refers to production lines by number in correspondence.",
    sites: [
      { key: "dallas", name: "Dallas plant", aliases: ["Dallas", "DFW plant", "Line 1", "Line 2", "Line 3", "Line 4"], addressLine1: "4820 Sylvan Ridge Road", city: "Dallas", state: "TX", postalCode: "75247", freightZone: "SOUTH_CENTRAL", isPrimary: true },
      { key: "akron", name: "Akron plant", aliases: ["Akron", "Ohio plant"], addressLine1: "1190 Ardmore Works Drive", city: "Akron", state: "OH", postalCode: "44306", freightZone: "MIDWEST" },
      { key: "bayonne", name: "Bayonne terminal", aliases: ["Bayonne", "East terminal"], addressLine1: "77 Constable Hook Road", city: "Bayonne", state: "NJ", postalCode: "07002", freightZone: "NORTHEAST" },
    ],
    contacts: [
      { key: "hollis", name: "Ben Hollis", email: "b.hollis@cardinalprocessing.example", phone: "+1 214 555 0142", jobTitle: "Maintenance superintendent", siteKey: "dallas" },
      { key: "frazier", name: "Nadia Frazier", email: "n.frazier@cardinalprocessing.example", jobTitle: "Procurement lead", siteKey: "dallas" },
    ],
  },
  {
    accountNumber: "ACC-10077",
    name: "Atlas Industrial Services",
    legalName: "Atlas Industrial Services, LLC",
    industry: "Contract manufacturing",
    tier: "STRATEGIC",
    paymentTerms: 60,
    creditLimit: 2500000,
    priceBookCode: "PB-STRAT",
    notes:
      "Three-year volume commitment signed last year. Deep standing discount — deal margin is monitored individually and most orders route through sales management.",
    sites: [
      { key: "cleveland", name: "Cleveland works", aliases: ["Cleveland", "Main works"], addressLine1: "3400 Harvard Industrial Parkway", city: "Cleveland", state: "OH", postalCode: "44105", freightZone: "MIDWEST", isPrimary: true },
      { key: "gary", name: "Gary facility", aliases: ["Gary", "Indiana"], addressLine1: "900 Buchanan Street", city: "Gary", state: "IN", postalCode: "46402", freightZone: "MIDWEST" },
    ],
    contacts: [
      { key: "duarte", name: "Elena Duarte", email: "e.duarte@atlasindustrial.example", phone: "+1 216 555 0188", jobTitle: "Category manager, rotating equipment", siteKey: "cleveland" },
    ],
  },
  {
    accountNumber: "ACC-10102",
    name: "Cascade Foods",
    legalName: "Cascade Foods Corporation",
    industry: "Food and beverage",
    tier: "STANDARD",
    paymentTerms: 30,
    creditLimit: 300000,
    priceBookCode: "PB-STD",
    sites: [
      { key: "charlotte", name: "Charlotte processing plant", aliases: ["Charlotte", "NC plant"], addressLine1: "6100 Westinghouse Boulevard", city: "Charlotte", state: "NC", postalCode: "28273", freightZone: "SOUTHEAST", isPrimary: true },
    ],
    contacts: [
      { key: "arroyo", name: "Samuel Arroyo", email: "s.arroyo@cascadefoods.example", phone: "+1 704 555 0119", jobTitle: "Plant engineer", siteKey: "charlotte" },
    ],
  },
  {
    accountNumber: "ACC-10156",
    name: "Northgate Paper",
    legalName: "Northgate Paper Mills, Inc.",
    industry: "Pulp and paper",
    tier: "KEY",
    paymentTerms: 45,
    creditLimit: 900000,
    priceBookCode: "PB-KEY",
    notes: "Thermal fluid systems throughout the dryer section. Shutdown windows are fixed and immovable.",
    sites: [
      { key: "greenbay", name: "Green Bay mill", aliases: ["Green Bay", "Mill 2", "No. 2 machine"], addressLine1: "2255 Quarry Road", city: "Green Bay", state: "WI", postalCode: "54302", freightZone: "MIDWEST", isPrimary: true },
    ],
    contacts: [
      { key: "kowalski", name: "Irene Kowalski", email: "i.kowalski@northgatepaper.example", phone: "+1 920 555 0164", jobTitle: "Reliability engineer", siteKey: "greenbay" },
    ],
  },
  {
    accountNumber: "ACC-10188",
    name: "Gulf Coast Refining",
    legalName: "Gulf Coast Refining & Terminals, LP",
    industry: "Refining",
    tier: "KEY",
    paymentTerms: 45,
    creditLimit: 1800000,
    priceBookCode: "PB-KEY",
    notes:
      "Classified areas throughout. Every enquiry carries an area classification and a materials specification — neither is negotiable.",
    sites: [
      { key: "portarthur", name: "Port Arthur refinery", aliases: ["Port Arthur", "Unit 7", "Acid plant"], addressLine1: "5001 Savannah Avenue", city: "Port Arthur", state: "TX", postalCode: "77640", freightZone: "SOUTH_CENTRAL", isPrimary: true },
    ],
    contacts: [
      { key: "okafor", name: "Daniel Okafor", email: "d.okafor@gulfcoastrefining.example", phone: "+1 409 555 0177", jobTitle: "Rotating equipment engineer", siteKey: "portarthur" },
    ],
  },
  {
    accountNumber: "ACC-10205",
    name: "Redwood Municipal Water",
    legalName: "Redwood Municipal Water District",
    industry: "Municipal water",
    tier: "STANDARD",
    paymentTerms: 30,
    creditLimit: 500000,
    priceBookCode: "PB-MUNI",
    notes: "Buys under a cooperative purchasing contract. Award documentation must reference the contract number.",
    sites: [
      { key: "redwood", name: "Redwood pumping station 3", aliases: ["Station 3", "PS-3", "Redwood"], addressLine1: "1801 Bayshore Access Road", city: "Redwood City", state: "CA", postalCode: "94063", freightZone: "WEST", isPrimary: true },
    ],
    contacts: [
      { key: "mbeki", name: "Grace Mbeki", email: "g.mbeki@redwoodwater.example", phone: "+1 650 555 0133", jobTitle: "Operations supervisor", siteKey: "redwood" },
    ],
  },
  {
    accountNumber: "ACC-10233",
    name: "Keystone Coatings",
    legalName: "Keystone Coatings & Resins, Inc.",
    industry: "Coatings and adhesives",
    tier: "STANDARD",
    paymentTerms: 30,
    creditLimit: 400000,
    priceBookCode: "PB-STD",
    notes: "High-viscosity resin transfer. Runs gear pumps almost exclusively.",
    sites: [
      { key: "lancaster", name: "Lancaster resin plant", aliases: ["Lancaster", "Resin plant", "Blend house"], addressLine1: "480 Greenfield Industrial Drive", city: "Lancaster", state: "PA", postalCode: "17601", freightZone: "NORTHEAST", isPrimary: true },
    ],
    contacts: [
      { key: "novak", name: "Peter Novak", email: "p.novak@keystonecoatings.example", phone: "+1 717 555 0151", jobTitle: "Process engineer", siteKey: "lancaster" },
    ],
  },
  {
    accountNumber: "ACC-10261",
    name: "Tidewater Processing",
    legalName: "Tidewater Processing Company",
    industry: "Specialty chemicals",
    tier: "STANDARD",
    paymentTerms: 30,
    creditLimit: 350000,
    priceBookCode: "PB-STD",
    sites: [
      { key: "savannah", name: "Savannah plant", aliases: ["Savannah", "GA plant", "Tank farm"], addressLine1: "220 Grange Road", city: "Savannah", state: "GA", postalCode: "31408", freightZone: "SOUTHEAST", isPrimary: true },
    ],
    contacts: [
      { key: "halloran", name: "Maeve Halloran", email: "m.halloran@tidewaterprocessing.example", phone: "+1 912 555 0146", jobTitle: "Maintenance planner", siteKey: "savannah" },
    ],
  },
  {
    accountNumber: "ACC-10290",
    name: "Sierra Mining Supply",
    legalName: "Sierra Mining Supply Co.",
    industry: "Mining",
    tier: "TRANSACTIONAL",
    paymentTerms: 15,
    creditLimit: 120000,
    priceBookCode: "PB-LIST",
    notes: "Occasional buyer. No standing discount.",
    sites: [
      { key: "elko", name: "Elko yard", aliases: ["Elko", "Nevada yard"], addressLine1: "3355 Mountain City Highway", city: "Elko", state: "NV", postalCode: "89801", freightZone: "WEST", isPrimary: true },
    ],
    contacts: [
      { key: "reyes", name: "Curtis Reyes", email: "c.reyes@sierraminingsupply.example", jobTitle: "Purchasing agent", siteKey: "elko" },
    ],
  },
  {
    accountNumber: "ACC-10318",
    name: "Brightwater Utilities",
    legalName: "Brightwater Utilities Authority",
    industry: "Municipal water",
    tier: "STANDARD",
    paymentTerms: 30,
    creditLimit: 600000,
    priceBookCode: "PB-MUNI",
    sites: [
      { key: "trenton", name: "Trenton treatment works", aliases: ["Trenton", "WWTP"], addressLine1: "900 Duck Island Road", city: "Trenton", state: "NJ", postalCode: "08611", freightZone: "NORTHEAST", isPrimary: true },
    ],
    contacts: [
      { key: "abara", name: "Joy Abara", email: "j.abara@brightwaterutilities.example", jobTitle: "Assistant chief operator", siteKey: "trenton" },
    ],
    contracts: [
      { sku: "VS-230", price: 5680, ref: "CTR-BW-2291", fromDaysAgo: 300, forDays: 730 },
      { sku: "AX-220", price: 4250, ref: "CTR-BW-2291", fromDaysAgo: 300, forDays: 730 },
    ],
  },
];
