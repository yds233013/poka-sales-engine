/**
 * The agent's tools.
 *
 * Each one is a thin, typed wrapper around a database read plus a
 * deterministic engine. None of them calls a language model. This is the
 * layer the operational trace is built from, so each returns a plain-English
 * `summary` alongside its structured output, and attaches the evidence for
 * anything it asserts.
 */

import type { PrismaClient } from "@/generated/prisma";
import type {
  Allocation,
  CompatibilityVerdict,
  FreightQuote,
  FulfillmentPlan,
  MarginResult,
  PolicyThresholds,
  PricedLine,
  ProductView,
  RequirementView,
} from "@/lib/domain/types";
import { evaluateCandidate } from "@/lib/engines/compatibility";
import { assertPlanIsPhysical, planFulfillment, totalAtp } from "@/lib/engines/inventory";
import { priceLine, selectVolumeBreak, isContractActive, type VolumeBreak } from "@/lib/engines/pricing";
import { estimateDelivery, quoteFreight, toShipments } from "@/lib/engines/freight";
import { computeMargin } from "@/lib/engines/margin";
import { evaluateApprovals, DEFAULT_THRESHOLDS, type ApprovalEvaluationInput } from "@/lib/engines/approval";
import { centsToNumber, formatCurrency, formatPct, toCents } from "@/lib/money";
import { SPEC_GROUP_ANCHORS } from "../../../prisma/seed/docs";
import { SPEC_META } from "../../../prisma/seed/spec-meta";
import type { EvidenceDraft, ToolBus, ToolResult } from "./toolbus";
import {
  dec,
  toFreightRuleView,
  toInventoryRecord,
  toProductView,
  toRuleView,
} from "./mappers";

const PRODUCT_INCLUDE = { category: true, specs: true } as const;

// ─────────────────────────── resolve_customer ──────────────────────────────

export interface ResolvedCustomer {
  customerId: string | null;
  customerName: string | null;
  accountNumber: string | null;
  tier: string | null;
  siteId: string | null;
  siteName: string | null;
  siteZone: string | null;
  contactId: string | null;
  contactName: string | null;
  priceBookCode: string | null;
  priceBookDiscountPct: number | null;
  paymentTerms: number | null;
}

/**
 * Pick the contact the message actually came from.
 *
 * Order matters: a name or address appearing in the message beats the contact
 * attached to the ship-to site, which beats the account's first contact.
 * Getting this wrong means addressing the reply to the wrong person, which is
 * exactly the kind of small wrongness that destroys trust in an assistant.
 */
function matchContact<T extends { name: string; email: string; siteId: string | null }>(
  contacts: T[],
  bodyText: string | null,
  siteId: string | null,
): { contact: T | null; matchedOn: "message" | "site" | "account" | "none" } {
  if (bodyText) {
    const haystack = bodyText.toLowerCase();
    for (const contact of contacts) {
      const surname = contact.name.split(/\s+/).slice(-1)[0].toLowerCase();
      const local = contact.email.split("@")[0].toLowerCase();
      if (
        haystack.includes(contact.name.toLowerCase()) ||
        haystack.includes(contact.email.toLowerCase()) ||
        (surname.length > 3 && haystack.includes(surname)) ||
        (local.length > 4 && haystack.includes(local))
      ) {
        return { contact, matchedOn: "message" };
      }
    }
  }
  const atSite = siteId ? contacts.find((c) => c.siteId === siteId) : undefined;
  if (atSite) return { contact: atSite, matchedOn: "site" };
  if (contacts[0]) return { contact: contacts[0], matchedOn: "account" };
  return { contact: null, matchedOn: "none" };
}

export async function resolveCustomer(
  bus: ToolBus,
  input: { customerId: string | null; siteHint: string | null; bodyText?: string | null },
): Promise<ResolvedCustomer> {
  return bus.run("resolve_customer", { customerId: input.customerId, siteHint: input.siteHint }, async (ctx) => {
    if (!input.customerId) {
      return {
        output: emptyCustomer(),
        summary: "No account could be matched to this message — the request is unidentified.",
        status: "EMPTY",
        safety: "NEEDS_REVIEW",
      } satisfies ToolResult<ResolvedCustomer>;
    }

    const customer = await ctx.prisma.customer.findUnique({
      where: { id: input.customerId },
      include: { sites: true, contacts: true, priceBook: true },
    });
    if (!customer) {
      return {
        output: emptyCustomer(),
        summary: `Account ${input.customerId} is not in the customer master.`,
        status: "EMPTY",
        safety: "NEEDS_REVIEW",
      } satisfies ToolResult<ResolvedCustomer>;
    }

    const site =
      (input.siteHint && customer.sites.find((s) => s.id === input.siteHint)) ||
      customer.sites.find((s) => s.isPrimary) ||
      customer.sites[0] ||
      null;
    const { contact, matchedOn } = matchContact(
      customer.contacts,
      input.bodyText ?? null,
      site?.id ?? null,
    );

    const output: ResolvedCustomer = {
      customerId: customer.id,
      customerName: customer.name,
      accountNumber: customer.accountNumber,
      tier: customer.tier,
      siteId: site?.id ?? null,
      siteName: site?.name ?? null,
      siteZone: site?.freightZone ?? null,
      contactId: contact?.id ?? null,
      contactName: contact?.name ?? null,
      priceBookCode: customer.priceBook?.code ?? null,
      priceBookDiscountPct: customer.priceBook ? dec(customer.priceBook.defaultDiscountPct) : null,
      paymentTerms: customer.paymentTerms,
    };

    return {
      output,
      summary: `Resolved ${customer.name} (${customer.accountNumber}, ${customer.tier.toLowerCase()} tier)${
        site ? ` shipping to ${site.name}, ${site.city} ${site.state}` : ""
      }${
        contact
          ? `. Contact ${contact.name}${
              matchedOn === "message"
                ? " — named in the message"
                : matchedOn === "site"
                  ? " — the contact on file for that site"
                  : " — the account's primary contact, not named in the message"
            }`
          : ". No contact on file"
      }.`,
      evidence: [
        {
          kind: "account",
          label: `${customer.name} — ${customer.accountNumber}`,
          claim: `${customer.name} is on the ${customer.priceBook?.name ?? "published list"} price book with ${customer.paymentTerms}-day terms.`,
          recordRef: `customers/${customer.id}`,
        },
      ],
    } satisfies ToolResult<ResolvedCustomer>;
  });
}

function emptyCustomer(): ResolvedCustomer {
  return {
    customerId: null, customerName: null, accountNumber: null, tier: null,
    siteId: null, siteName: null, siteZone: null, contactId: null, contactName: null,
    priceBookCode: null, priceBookDiscountPct: null, paymentTerms: null,
  };
}

// ───────────────────────────── resolve_sku ─────────────────────────────────

export interface ResolvedSku {
  found: boolean;
  productId: string | null;
  sku: string | null;
  name: string | null;
  lifecycle: string | null;
  categoryCode: string | null;
  /** Near matches when the exact part number is not in the catalog. */
  suggestions: { sku: string; name: string }[];
}

export async function resolveSku(bus: ToolBus, input: { rawSku: string }): Promise<ResolvedSku> {
  return bus.run("resolve_sku", input, async (ctx) => {
    const normalized = input.rawSku.trim().toUpperCase();
    const product = await ctx.prisma.product.findUnique({
      where: { sku: normalized },
      include: PRODUCT_INCLUDE,
    });

    if (product) {
      const hit: ResolvedSku = {
        found: true,
        productId: product.id,
        sku: product.sku,
        name: product.name,
        lifecycle: product.lifecycle,
        categoryCode: product.category.code,
        suggestions: [],
      };
      return {
        output: hit,
        summary: `Part number ${product.sku} resolved to "${product.name}" (${product.lifecycle.replace("_", " ").toLowerCase()}).`,
        evidence: [
          {
            kind: "spec",
            label: `${product.sku} catalog record`,
            claim: `${product.sku} is an active catalog item in category ${product.category.name}.`,
            recordRef: `products/${product.id}`,
          },
        ],
      } satisfies ToolResult<ResolvedSku>;
    }

    const prefix = normalized.split("-")[0];
    const near = await ctx.prisma.product.findMany({
      where: { sku: { startsWith: prefix } },
      select: { sku: true, name: true },
      take: 5,
      orderBy: { sku: "asc" },
    });

    return {
      output: { found: false, productId: null, sku: null, name: null, lifecycle: null, categoryCode: null, suggestions: near },
      summary: `Part number "${input.rawSku}" is not in the catalog.${
        near.length > 0 ? ` Closest entries: ${near.map((n) => n.sku).join(", ")}.` : ""
      }`,
      status: "EMPTY",
      safety: "NEEDS_REVIEW",
    } satisfies ToolResult<ResolvedSku>;
  });
}

// ──────────────────────────── search_catalog ───────────────────────────────

export async function searchCatalog(
  bus: ToolBus,
  input: { categoryCodes?: string[]; text?: string; excludeAccessories?: boolean; limit?: number },
): Promise<ProductView[]> {
  return bus.run("search_catalog", input, async (ctx) => {
    const rows = await ctx.prisma.product.findMany({
      where: {
        ...(input.categoryCodes?.length ? { category: { code: { in: input.categoryCodes } } } : {}),
        ...(input.excludeAccessories ? { isAccessory: false } : {}),
        ...(input.text
          ? {
              OR: [
                { sku: { contains: input.text, mode: "insensitive" as const } },
                { name: { contains: input.text, mode: "insensitive" as const } },
                { description: { contains: input.text, mode: "insensitive" as const } },
              ],
            }
          : {}),
        lifecycle: { not: "DISCONTINUED" },
      },
      include: PRODUCT_INCLUDE,
      take: input.limit ?? 60,
      orderBy: { sku: "asc" },
    });

    const products = rows.map(toProductView);
    return {
      output: products,
      summary: `Catalog search returned ${products.length} item(s)${
        input.categoryCodes?.length ? ` in ${input.categoryCodes.join(", ")}` : ""
      }.`,
      status: products.length === 0 ? "EMPTY" : "OK",
    } satisfies ToolResult<ProductView[]>;
  });
}

// ──────────────────────── search_technical_docs ────────────────────────────

export interface DocHit {
  documentId: string;
  docNumber: string;
  title: string;
  type: string;
  revision: string;
  sectionId: string;
  anchor: string;
  heading: string;
  excerpt: string;
}

export async function searchTechnicalDocs(
  bus: ToolBus,
  input: { query: string; sku?: string | null; families?: string[]; limit?: number },
): Promise<DocHit[]> {
  return bus.run("search_technical_docs", input, async (ctx) => {
    const terms = input.query
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9-]/gi, ""))
      .filter((t) => t.length > 2);

    const sections = await ctx.prisma.documentSection.findMany({
      where: {
        OR: [
          ...(input.sku ? [{ document: { product: { sku: input.sku } } }] : []),
          ...(input.families?.length ? [{ document: { families: { hasSome: input.families } } }] : []),
          ...terms.map((t) => ({ body: { contains: t, mode: "insensitive" as const } })),
          ...terms.map((t) => ({ heading: { contains: t, mode: "insensitive" as const } })),
        ],
      },
      include: { document: { include: { product: true } } },
      take: (input.limit ?? 8) * 3,
      orderBy: [{ document: { publishedAt: "desc" } }, { ordinal: "asc" }],
    });

    // Rank by relevance rather than publication date: the data sheet for the
    // part actually being asked about outranks a term match in some other
    // product's boilerplate, and a curated guide outranks a generated sheet.
    const scoreSection = (section: (typeof sections)[number]): number => {
      let score = 0;
      if (input.sku && section.document.product?.sku === input.sku) score += 100;
      if (section.document.type !== "SPEC_SHEET") score += 25;
      if (input.families?.some((f) => section.document.families.includes(f))) score += 15;
      const haystack = `${section.heading} ${section.body}`.toLowerCase();
      for (const term of terms) if (haystack.includes(term.toLowerCase())) score += 4;
      // Scope-and-purpose boilerplate is rarely the evidence anyone wants.
      if (section.anchor === "1.1") score -= 12;
      return score;
    };

    sections.sort((a, b) => scoreSection(b) - scoreSection(a) || a.ordinal - b.ordinal);
    sections.splice(input.limit ?? 8);

    const hits: DocHit[] = sections.map((s) => ({
      documentId: s.documentId,
      docNumber: s.document.docNumber,
      title: s.document.title,
      type: s.document.type,
      revision: s.document.revision,
      sectionId: s.id,
      anchor: s.anchor,
      heading: s.heading,
      excerpt: s.body.slice(0, 420),
    }));

    return {
      output: hits,
      summary: `Technical library search for "${input.query}" returned ${hits.length} section(s)${
        hits.length > 0 ? ` — ${[...new Set(hits.map((h) => h.docNumber))].slice(0, 4).join(", ")}` : ""
      }.`,
      status: hits.length === 0 ? "EMPTY" : "OK",
      evidence: hits.slice(0, 4).map((h) => ({
        kind: "document" as const,
        label: `${h.docNumber} §${h.anchor} — ${h.heading}`,
        claim: h.excerpt.split("\n")[0].slice(0, 220),
        sectionId: h.sectionId,
      })),
    } satisfies ToolResult<DocHit[]>;
  });
}

/**
 * Resolve the data-sheet section that backs a given spec key for a product.
 * This is what turns a compatibility check into a citation.
 */
export async function evidenceForSpec(
  prisma: PrismaClient,
  sku: string,
  specKey: string,
  claim: string,
): Promise<EvidenceDraft | null> {
  const meta = SPEC_META[specKey];
  if (!meta) return null;
  const anchor = SPEC_GROUP_ANCHORS[meta.group];
  if (!anchor) return null;

  const section = await prisma.documentSection.findFirst({
    where: { anchor: anchor.anchor, document: { product: { sku }, type: "SPEC_SHEET" } },
    include: { document: true },
  });
  if (!section) return null;

  return {
    kind: "document",
    label: `${section.document.docNumber} §${section.anchor} — ${section.heading}`,
    claim,
    sectionId: section.id,
  };
}

// ────────────────────────── check_compatibility ────────────────────────────

export async function checkCompatibility(
  bus: ToolBus,
  input: { productId: string; requirements: RequirementView[] },
): Promise<CompatibilityVerdict> {
  return bus.run("check_compatibility", { productId: input.productId }, async (ctx) => {
    const row = await ctx.prisma.product.findUniqueOrThrow({
      where: { id: input.productId },
      include: PRODUCT_INCLUDE,
    });
    const product = toProductView(row);
    const rules = (await ctx.prisma.compatibilityRule.findMany({ orderBy: { code: "asc" } })).map(toRuleView);

    const verdict = evaluateCandidate(product, input.requirements, rules);

    const evidence: EvidenceDraft[] = [];
    for (const check of verdict.checks) {
      if (!check.specKey) continue;
      const item = await evidenceForSpec(
        ctx.prisma,
        product.sku,
        check.specKey,
        `${product.sku} ${check.label.toLowerCase()}: ${check.actual}.`,
      );
      if (item) evidence.push(item);
    }

    const pass = verdict.checks.filter((c) => c.result === "PASS").length;
    const summary =
      verdict.safety === "BLOCKED"
        ? `${product.sku} fails ${verdict.hardFailures.length} hard requirement(s): ${verdict.hardFailures
            .map((f) => `${f.label.toLowerCase()} (${f.actual} vs ${f.requirement})`)
            .join(", ")}.`
        : `${product.sku} passes ${pass} of ${verdict.checks.length} checks${
            verdict.warnings.length + verdict.unknowns.length > 0
              ? ` with ${verdict.warnings.length} warning(s) and ${verdict.unknowns.length} unverified dimension(s)`
              : ""
          }.`;

    return {
      output: verdict,
      summary,
      status: verdict.safety === "BLOCKED" ? "BLOCKED" : "OK",
      safety: verdict.safety,
      evidence: dedupeEvidence(evidence),
    } satisfies ToolResult<CompatibilityVerdict>;
  });
}

function dedupeEvidence(items: EvidenceDraft[]): EvidenceDraft[] {
  const seen = new Set<string>();
  const out: EvidenceDraft[] = [];
  for (const item of items) {
    const key = `${item.sectionId ?? item.recordRef ?? ""}|${item.claim}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// ──────────────────────────── apply_adapter ───────────────────────────────

/**
 * Record that an adapter kit resolved a connection mismatch.
 *
 * This is a separate recorded step rather than a silent patch inside the
 * compatibility check, because the trace would otherwise show "RG-120 fails on
 * pipe connection" immediately above a recommendation that quotes the RG-120.
 * An operator reading that would rightly not trust the system.
 */
export async function applyAdapter(
  bus: ToolBus,
  input: {
    productSku: string;
    adapterSku: string;
    requiredConnection: string;
    providedConnection: string;
    adapterPressureBar: number | null;
    adapterTempC: number | null;
  },
): Promise<{ applied: true }> {
  return bus.run("apply_adapter", input, async (ctx) => {
    const evidence: EvidenceDraft[] = [];
    const doc = await ctx.prisma.documentSection.findFirst({
      where: {
        document: { families: { has: "FA Series" } },
        body: { contains: input.adapterSku },
      },
      include: { document: true },
    });
    if (doc) {
      evidence.push({
        kind: "document",
        label: `${doc.document.docNumber} §${doc.anchor} — ${doc.heading}`,
        claim: doc.body.slice(0, 220),
        sectionId: doc.id,
      });
    }

    return {
      output: { applied: true as const },
      summary: `${input.productSku} presents ${input.providedConnection.includes(input.requiredConnection) ? "a different connection" : input.providedConnection} to a ${input.requiredConnection} line. The ${input.adapterSku} adapter kit${
        input.adapterPressureBar && input.adapterTempC
          ? ` (rated ${input.adapterPressureBar} bar, ${input.adapterTempC} °C)`
          : ""
      } resolves it, so the connection check is re-evaluated as a pass carrying an "adapter required" warning. Two kits are needed per pump, suction and discharge.`,
      safety: "NEEDS_REVIEW",
      evidence,
    } satisfies ToolResult<{ applied: true }>;
  });
}

// ─────────────────────────── find_substitutes ──────────────────────────────

export interface SubstituteCandidate {
  product: ProductView;
  linkKind: string | null;
  linkNote: string | null;
  requiresSku: string | null;
  /** Adapter product that resolves a connection mismatch, when one applies. */
  adapter: ProductView | null;
}

export async function findSubstitutes(
  bus: ToolBus,
  input: { productId: string | null; categoryCodes: string[]; limit?: number },
): Promise<SubstituteCandidate[]> {
  return bus.run("find_substitutes", input, async (ctx) => {
    const curated = input.productId
      ? await ctx.prisma.substitutionLink.findMany({
          where: { fromProductId: input.productId },
          include: { toProduct: { include: PRODUCT_INCLUDE } },
        })
      : [];

    const curatedIds = new Set(curated.map((c) => c.toProductId));

    const categoryMatches = input.categoryCodes.length === 0 ? [] : await ctx.prisma.product.findMany({
      where: {
        category: { code: { in: input.categoryCodes } },
        isAccessory: false,
        lifecycle: { not: "DISCONTINUED" },
        id: { notIn: [...curatedIds, ...(input.productId ? [input.productId] : [])] },
      },
      include: PRODUCT_INCLUDE,
      take: input.limit ?? 24,
      orderBy: { sku: "asc" },
    });

    const adapterSkus = curated.map((c) => c.requiresSku).filter((s): s is string => Boolean(s));
    const adapters = adapterSkus.length
      ? await ctx.prisma.product.findMany({
          where: { sku: { in: adapterSkus } },
          include: PRODUCT_INCLUDE,
        })
      : [];

    const candidates: SubstituteCandidate[] = [
      ...curated.map((link) => ({
        product: toProductView(link.toProduct),
        linkKind: link.kind,
        linkNote: link.note,
        requiresSku: link.requiresSku,
        adapter: link.requiresSku
          ? (adapters.filter((a) => a.sku === link.requiresSku).map(toProductView)[0] ?? null)
          : null,
      })),
      ...categoryMatches.map((p) => ({
        product: toProductView(p),
        linkKind: null,
        linkNote: null,
        requiresSku: null,
        adapter: null,
      })),
    ];

    return {
      output: candidates,
      summary:
        input.categoryCodes.length === 0
          ? `Found ${curated.length} engineering-maintained replacement link(s) from the requested part${
              curated.length > 0 ? `: ${curated.map((c) => c.toProduct.sku).join(", ")}` : ""
            }.`
          : `Assembled ${candidates.length} candidate(s): ${curated.length} from engineering-maintained replacement links, ${categoryMatches.length} from a catalog sweep of ${input.categoryCodes.join(", ")}.`,
      status: candidates.length === 0 ? "EMPTY" : "OK",
      evidence: curated.slice(0, 5).map((link) => ({
        kind: "spec" as const,
        label: `Replacement link ${link.kind.replace("_", " ").toLowerCase()} → ${link.toProduct.sku}`,
        claim: link.note,
        recordRef: `substitution_links/${link.id}`,
      })),
    } satisfies ToolResult<SubstituteCandidate[]>;
  });
}

// ────────────────────────── screen_candidates ─────────────────────────────

export interface ScreenedProduct {
  productId: string;
  sku: string;
  name: string;
  categoryCode: string;
  safety: string;
  hardFailureCount: number;
  passCount: number;
  topFailure: string | null;
}

/**
 * Broad first pass over the catalog.
 *
 * Runs the compatibility engine over every product in the relevant categories
 * and returns them ranked by how close they come. This exists because a naive
 * "take the first N by part number" sweep silently never reaches the part that
 * would actually have fitted — which is indistinguishable, from the outside,
 * from an agent that did not look.
 *
 * The full screened list is recorded as the tool's output, so "we evaluated
 * 31 products and these 10 were worth a detailed check" is auditable.
 */
export async function screenCandidates(
  bus: ToolBus,
  input: { categoryCodes: string[]; excludeProductIds: string[]; requirements: RequirementView[]; shortlistSize?: number },
): Promise<{ screened: ScreenedProduct[]; shortlist: string[] }> {
  return bus.run(
    "screen_candidates",
    { categoryCodes: input.categoryCodes, shortlistSize: input.shortlistSize ?? 10 },
    async (ctx) => {
      const rows = await ctx.prisma.product.findMany({
        where: {
          category: { code: { in: input.categoryCodes } },
          isAccessory: false,
          lifecycle: { not: "DISCONTINUED" },
          id: { notIn: input.excludeProductIds },
        },
        include: PRODUCT_INCLUDE,
        orderBy: { sku: "asc" },
      });
      const rules = (await ctx.prisma.compatibilityRule.findMany({ orderBy: { code: "asc" } })).map(toRuleView);

      const screened: ScreenedProduct[] = rows.map((row) => {
        const product = toProductView(row);
        const verdict = evaluateCandidate(product, input.requirements, rules);
        return {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          categoryCode: product.categoryCode,
          safety: verdict.safety,
          hardFailureCount: verdict.hardFailures.length,
          passCount: verdict.checks.filter((c) => c.result === "PASS").length,
          topFailure: verdict.hardFailures[0]
            ? `${verdict.hardFailures[0].label}: ${verdict.hardFailures[0].actual} against ${verdict.hardFailures[0].requirement}`
            : null,
        };
      });

      screened.sort((a, b) => {
        if (a.hardFailureCount !== b.hardFailureCount) return a.hardFailureCount - b.hardFailureCount;
        if (b.passCount !== a.passCount) return b.passCount - a.passCount;
        return a.sku.localeCompare(b.sku);
      });

      const shortlist = screened.slice(0, input.shortlistSize ?? 10).map((s) => s.productId);
      const clean = screened.filter((s) => s.hardFailureCount === 0).length;

      return {
        output: { screened, shortlist },
        summary: `Screened the ${screened.length} catalog item(s) in ${input.categoryCodes.join(", ")} not already covered by a replacement link: ${clean} clear every hard requirement, ${screened.length - clean} do not. Shortlisted the ${shortlist.length} closest for a detailed check.`,
        status: screened.length === 0 ? "EMPTY" : "OK",
        evidence: [
          {
            kind: "spec",
            label: "Catalog screen",
            claim: `${screened.length} products evaluated. Closest non-qualifying: ${screened
              .filter((s) => s.hardFailureCount > 0)
              .slice(0, 3)
              .map((s) => `${s.sku} (${s.topFailure})`)
              .join("; ") || "none"}.`,
            recordRef: `catalog/screen`,
          },
        ],
      } satisfies ToolResult<{ screened: ScreenedProduct[]; shortlist: string[] }>;
    },
  );
}

// ──────────────────────────── check_inventory ──────────────────────────────

export interface InventoryOutcome {
  plan: FulfillmentPlan;
  totalAvailable: number;
  byWarehouse: { code: string; name: string; onHand: number; reserved: number; atp: number; zone: string }[];
}

export async function checkInventory(
  bus: ToolBus,
  input: {
    productId: string;
    sku: string;
    quantity: number;
    requiredBy: Date | null;
    destinationZone: string | null;
    leadTimeDays: number;
  },
): Promise<InventoryOutcome> {
  return bus.run("check_inventory", { sku: input.sku, quantity: input.quantity }, async (ctx) => {
    const rows = await ctx.prisma.inventory.findMany({
      where: { productId: input.productId },
      include: { warehouse: true, incoming: { orderBy: { expectedAt: "asc" } } },
    });
    const records = rows.map(toInventoryRecord);

    const plan = planFulfillment(input.quantity, records, {
      asOf: ctx.asOf,
      requiredBy: input.requiredBy,
      destinationZone: input.destinationZone,
      factoryLeadTimeDays: input.leadTimeDays,
    });
    assertPlanIsPhysical(plan, records);

    const byWarehouse = records.map((r) => ({
      code: r.warehouseCode,
      name: r.warehouseName,
      onHand: r.onHand,
      reserved: r.reserved,
      atp: Math.max(0, r.onHand - r.reserved),
      zone: r.freightZone,
    }));

    const available = totalAtp(records);
    const stockAllocations = plan.allocations.filter((a) => a.source !== "FACTORY");
    const summary =
      available === 0
        ? `${input.sku} has no available-to-promise stock at any location; the plan falls back to a ${input.leadTimeDays}-day factory build.`
        : plan.isSplit
          ? `${input.sku}: ${available} units available to promise across ${byWarehouse.filter((w) => w.atp > 0).length} locations. No single site covers ${input.quantity}, so the plan draws ${stockAllocations.map((a) => `${a.quantity} from ${a.warehouseCode}`).join(" and ")}.`
          : `${input.sku}: ${available} units available to promise; ${input.quantity} allocated from ${plan.allocations[0]?.warehouseCode ?? "stock"}.`;

    return {
      output: { plan, totalAvailable: available, byWarehouse },
      summary,
      status: available === 0 ? "EMPTY" : "OK",
      safety: plan.canFulfill && plan.meetsDeadline !== false ? "AUTO_SAFE" : "NEEDS_REVIEW",
      evidence: [
        {
          kind: "inventory",
          label: `${input.sku} stock position`,
          claim: `${available} units available to promise across ${byWarehouse.filter((w) => w.atp > 0).length} location(s): ${byWarehouse
            .filter((w) => w.onHand > 0)
            .map((w) => `${w.code} ${w.onHand} on hand less ${w.reserved} reserved`)
            .join("; ") || "none in stock"}.`,
          recordRef: `inventory/${input.productId}`,
        },
      ],
    } satisfies ToolResult<InventoryOutcome>;
  });
}

// ──────────────────────────── calculate_price ──────────────────────────────

export async function calculatePrice(
  bus: ToolBus,
  input: {
    productId: string;
    sku: string;
    quantity: number;
    customerId: string | null;
    manualDiscountPct?: number | null;
  },
): Promise<PricedLine> {
  return bus.run("calculate_price", { sku: input.sku, quantity: input.quantity }, async (ctx) => {
    const product = await ctx.prisma.product.findUniqueOrThrow({
      where: { id: input.productId },
      include: { category: true },
    });

    const customer = input.customerId
      ? await ctx.prisma.customer.findUnique({
          where: { id: input.customerId },
          include: { priceBook: { include: { entries: { where: { productId: input.productId } } } } },
        })
      : null;

    const contract = input.customerId
      ? await ctx.prisma.customerPricing.findUnique({
          where: { customerId_productId: { customerId: input.customerId, productId: input.productId } },
        })
      : null;

    const contractActive =
      contract && isContractActive(contract.effectiveFrom, contract.effectiveTo, ctx.asOf);

    const breaks: VolumeBreak[] = (await ctx.prisma.discountRule.findMany()).map((r) => ({
      code: r.code,
      categoryCode: r.categoryCode,
      minQty: r.minQty,
      discountPct: dec(r.discountPct),
      description: r.description,
    }));
    const volumeBreak = selectVolumeBreak(input.quantity, product.category.code, breaks);

    // A per-SKU price book entry overrides the book's default discount.
    const entryDiscount = customer?.priceBook?.entries?.[0]
      ? dec(customer.priceBook.entries[0].discountPct)
      : null;
    const bookDiscount = entryDiscount ?? (customer?.priceBook ? dec(customer.priceBook.defaultDiscountPct) : null);

    const line = priceLine({
      listPriceCents: toCents(dec(product.listPrice)),
      standardCostCents: toCents(dec(product.standardCost)),
      quantity: input.quantity,
      priceBookDiscountPct: bookDiscount,
      contractPriceCents: contractActive ? toCents(dec(contract.contractPrice)) : null,
      contractRef: contractActive ? contract.contractRef : null,
      volumeDiscountPct: volumeBreak?.discountPct ?? null,
      volumeRuleCode: volumeBreak?.code ?? null,
      manualDiscountPct: input.manualDiscountPct ?? null,
    });

    const expiredNote =
      contract && !contractActive
        ? ` Contract ${contract.contractRef} was found but is not effective on ${ctx.asOf.toISOString().slice(0, 10)} and was not applied.`
        : "";

    return {
      output: line,
      summary: `${input.sku} priced at ${formatCurrency(line.unitPriceCents)}/unit (${formatPct(line.discountPct)} off ${formatCurrency(line.listPriceCents)} list) via ${line.priceSourceDetail}. Extended ${formatCurrency(line.extendedCents)} for ${input.quantity}.${expiredNote}`,
      evidence: [
        {
          kind: "pricing",
          label: `${input.sku} price derivation`,
          claim: `List ${formatCurrency(line.listPriceCents)}. Options considered: ${line.considered
            .map((c) => `${c.source.replace("_", " ").toLowerCase()} ${formatCurrency(c.unitPriceCents)}`)
            .join("; ")}. Applied: ${line.priceSourceDetail}.${expiredNote}`,
          recordRef: `products/${input.productId}`,
        },
      ],
    } satisfies ToolResult<PricedLine>;
  });
}

// ─────────────────────────── calculate_freight ─────────────────────────────

export interface FreightOutcome {
  quote: FreightQuote;
  estimatedDelivery: string | null;
}

export async function calculateFreight(
  bus: ToolBus,
  input: {
    /** One line per quote line: its unit weight and where its units come from. */
    lines: { sku: string; unitWeightKg: number; allocations: Allocation[] }[];
    destinationZone: string;
    hazmat: boolean;
    requiredBy: Date | null;
  },
): Promise<FreightOutcome> {
  const shipments = toShipments(input.lines);
  return bus.run(
    "calculate_freight",
    {
      destinationZone: input.destinationZone,
      shipments: shipments.map((s) => ({
        warehouse: s.warehouseCode,
        weightKg: Math.round(s.weightKg * 100) / 100,
      })),
    },
    async (ctx) => {
      const [warehouses, rules] = await Promise.all([
        ctx.prisma.warehouse.findMany(),
        ctx.prisma.freightRule.findMany(),
      ]);
      const zoneByWarehouse: Record<string, string> = Object.fromEntries(
        warehouses.map((w) => [w.code, w.freightZone]),
      );
      // The factory ships out of the Midwest plant.
      zoneByWarehouse.FACTORY = "MIDWEST";

      const quote = quoteFreight({
        shipments,
        zoneByWarehouse,
        destinationZone: input.destinationZone,
        hazmat: input.hazmat,
        rules: rules.map(toFreightRuleView),
        requiredBy: input.requiredBy,
        asOf: ctx.asOf,
      });

      const delivery = estimateDelivery(shipments, quote);

      return {
        output: { quote, estimatedDelivery: delivery ? delivery.toISOString() : null },
        summary: `Freight rated at ${formatCurrency(quote.totalCents)} over ${quote.legs.length} leg(s) on ${quote.service.toLowerCase()} service${
          quote.expedited ? " — upgraded from ground to meet the requested date" : ""
        }${delivery ? `; estimated arrival ${delivery.toISOString().slice(0, 10)}` : ""}.`,
        safety: quote.expedited ? "NEEDS_REVIEW" : "AUTO_SAFE",
        evidence: quote.legs.map((leg) => ({
          kind: "pricing" as const,
          label: `Freight rule ${leg.ruleCode}`,
          claim: `${leg.originWarehouse} → ${input.destinationZone}, ${leg.weightKg} kg on ${leg.service.toLowerCase()} service: ${formatCurrency(leg.costCents)}, ${leg.transitDays} day transit.`,
          recordRef: `freight_rules/${leg.ruleCode}`,
        })),
      } satisfies ToolResult<FreightOutcome>;
    },
  );
}

// ───────────────────────────── check_margin ────────────────────────────────

export async function checkMargin(
  bus: ToolBus,
  input: { revenueCents: number; productCostCents: number; freightCents: number },
): Promise<MarginResult> {
  return bus.run("check_margin", input, async (ctx) => {
    const thresholds = await loadThresholds(ctx.prisma);
    const margin = computeMargin(input.revenueCents, input.productCostCents, input.freightCents);
    const below = margin.marginPct < thresholds.minMarginPct;

    return {
      output: margin,
      summary: `Gross margin ${formatCurrency(margin.marginCents)} (${formatPct(margin.marginPct)}) after absorbing ${formatCurrency(margin.freightCostCents)} freight — ${
        below
          ? `below the ${formatPct(thresholds.minMarginPct, 0)} policy minimum`
          : `above the ${formatPct(thresholds.minMarginPct, 0)} policy minimum`
      }.`,
      safety: below ? "NEEDS_REVIEW" : "AUTO_SAFE",
      evidence: [
        {
          kind: "policy",
          label: "Margin policy",
          claim: `Policy minimum gross margin is ${formatPct(thresholds.minMarginPct, 0)}; hard floor is ${formatPct(thresholds.hardMarginFloorPct, 0)}. This deal computes to ${formatPct(margin.marginPct)}.`,
          recordRef: "policy_thresholds/MIN_MARGIN_PCT",
        },
      ],
    } satisfies ToolResult<MarginResult>;
  });
}

export async function loadThresholds(prisma: PrismaClient): Promise<PolicyThresholds> {
  const rows = await prisma.policyThreshold.findMany();
  const byCode = new Map(rows.map((r) => [r.code, dec(r.numericValue)]));
  return {
    maxDiscountPct: byCode.get("MAX_DISCOUNT_PCT") ?? DEFAULT_THRESHOLDS.maxDiscountPct,
    minMarginPct: byCode.get("MIN_MARGIN_PCT") ?? DEFAULT_THRESHOLDS.minMarginPct,
    hardMarginFloorPct: byCode.get("HARD_MARGIN_FLOOR_PCT") ?? DEFAULT_THRESHOLDS.hardMarginFloorPct,
    largeQuoteCents: toCents(byCode.get("LARGE_QUOTE_VALUE") ?? centsToNumber(DEFAULT_THRESHOLDS.largeQuoteCents)),
  };
}

// ──────────────────────── evaluate_approvals ───────────────────────────────

export async function evaluateApprovalPolicy(
  bus: ToolBus,
  input: Omit<ApprovalEvaluationInput, "thresholds">,
) {
  return bus.run(
    "evaluate_approvals",
    {
      effectiveDiscountPct: input.effectiveDiscountPct,
      marginPct: input.margin.marginPct,
      quoteTotalCents: input.quoteTotalCents,
      isSubstitution: input.isSubstitution,
    },
    async (ctx) => {
      const thresholds = await loadThresholds(ctx.prisma);
      const requirements = evaluateApprovals({ ...input, thresholds });

      return {
        output: requirements,
        summary:
          requirements.length === 0
            ? "Policy check clear — no approval required. Discount, margin, quote value, technical checks and fulfillment are all inside policy."
            : `${requirements.length} approval(s) required: ${requirements.map((r) => r.title).join("; ")}.`,
        safety: requirements.length === 0 ? "AUTO_SAFE" : "NEEDS_REVIEW",
        evidence: requirements.map((r) => ({
          kind: "policy" as const,
          label: r.kind.replace(/_/g, " ").toLowerCase(),
          claim: r.reason,
          recordRef: `policy_thresholds/${r.kind}`,
        })),
      } satisfies ToolResult<typeof requirements>;
    },
  );
}
