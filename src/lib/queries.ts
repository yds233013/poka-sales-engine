/**
 * Read models for the UI.
 *
 * Kept separate from the engines so page components never reach into Prisma
 * directly, and so the shapes the screens depend on are visible in one file.
 */

import { prisma } from "@/lib/db";
import { centsToNumber } from "@/lib/money";
import { cents, dec, type Decimalish } from "@/lib/decimal";

export { cents, dec };

const OPEN_STATUSES = ["NEW", "ANALYZING", "NEEDS_REVIEW", "READY_FOR_APPROVAL", "APPROVED", "RESPONSE_READY"] as const;

/**
 * Evaluation copies are throwaway clones of real cases. They are deleted when a
 * scenario finishes, but a product view should not depend on that having
 * happened — one that slipped through would sit in the inbox looking exactly
 * like the case it was cloned from.
 */
const NOT_EVAL = { NOT: { reference: { startsWith: "EVAL-" } } };

/** The two numbers the sidebar shows: open requests and undecided approvals. */
export async function getShellCounts(): Promise<{ open: number; approvals: number }> {
  const [open, approvals] = await Promise.all([
    prisma.salesRequest.count({ where: { ...NOT_EVAL, status: { in: [...OPEN_STATUSES] } } }),
    prisma.approval.count({ where: { status: { in: ["PENDING", "CHANGES_REQUESTED"] }, request: NOT_EVAL } }),
  ]);
  return { open, approvals };
}

export async function getDashboard() {
  const [requests, approvals, quotes, runs] = await Promise.all([
    prisma.salesRequest.findMany({
      where: NOT_EVAL,
      include: {
        customer: true,
        owner: true,
        quotes: { orderBy: { createdAt: "desc" }, take: 1 },
        approvals: true,
        recommendations: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.approval.findMany({
      where: { status: { in: ["PENDING", "CHANGES_REQUESTED"] }, request: NOT_EVAL },
      include: { request: { include: { customer: true } }, quote: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.quote.findMany({ where: { request: NOT_EVAL }, include: { request: true } }),
    prisma.agentRun.findMany({
      where: { durationMs: { not: null }, request: NOT_EVAL },
      select: { durationMs: true },
    }),
  ]);

  // What the engine has done most recently, in either mode — the dashboard's
  // answer to "what has the agent been handling?". Real runs only.
  const recentRuns = await prisma.agentRun.findMany({
    where: { request: NOT_EVAL },
    orderBy: { startedAt: "desc" },
    take: 6,
    include: {
      request: {
        select: {
          id: true,
          reference: true,
          subject: true,
          status: true,
          customer: { select: { name: true } },
          recommendations: { orderBy: { createdAt: "desc" }, take: 1, select: { outcome: true } },
        },
      },
      _count: { select: { toolCalls: true } },
    },
  });

  const open = requests.filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.status));
  const needsReview = requests.filter((r) => r.status === "NEEDS_REVIEW" || r.status === "BLOCKED");
  const pipelineCents = quotes
    .filter((q) => q.status !== "REJECTED" && q.status !== "EXPIRED")
    .reduce((sum, q) => sum + cents(q.total), 0);

  const atRisk = requests.filter(
    (r) =>
      r.risk === "HIGH" ||
      r.risk === "BLOCKED" ||
      (ageHours(r.receivedAt) > 48 && (OPEN_STATUSES as readonly string[]).includes(r.status)),
  );

  const durations = runs.map((r) => r.durationMs ?? 0).filter((d) => d > 0).sort((a, b) => a - b);
  const medianRunMs = durations.length > 0 ? durations[Math.floor(durations.length / 2)] : 0;

  const marginQuotes = quotes.filter((q) => q.status !== "REJECTED");
  const blendedMargin =
    marginQuotes.length > 0
      ? (marginQuotes.reduce((s, q) => s + cents(q.marginAmount), 0) /
          Math.max(1, marginQuotes.reduce((s, q) => s + cents(q.total), 0))) *
        100
      : 0;

  return {
    requests,
    approvals,
    recentRuns,
    metrics: {
      openCount: open.length,
      needsReviewCount: needsReview.length,
      pendingApprovalCount: approvals.length,
      pipelineCents,
      atRiskCount: atRisk.length,
      medianRunMs,
      blendedMarginPct: Math.round(blendedMargin * 10) / 10,
      quoteCount: quotes.length,
    },
  };
}

export function ageHours(from: Date): number {
  return (Date.now() - from.getTime()) / 3_600_000;
}

export async function getInbox() {
  return prisma.salesRequest.findMany({
    where: NOT_EVAL,
    include: {
      customer: true,
      site: true,
      owner: true,
      approvals: true,
      quotes: { orderBy: { createdAt: "desc" }, take: 1 },
      recommendations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ receivedAt: "desc" }],
  });
}

export type InboxRow = Awaited<ReturnType<typeof getInbox>>[number];

export async function getCase(id: string) {
  return prisma.salesRequest.findUnique({
    where: { id },
    include: {
      customer: { include: { priceBook: true } },
      site: true,
      contact: true,
      owner: true,
      items: { include: { product: true }, orderBy: { lineNumber: "asc" } },
      requirements: { orderBy: { key: "asc" } },
      approvals: { include: { decidedBy: true }, orderBy: { createdAt: "asc" } },
      responses: { orderBy: { version: "desc" } },
      auditEvents: { include: { user: true }, orderBy: { createdAt: "asc" } },
      quotes: {
        orderBy: { createdAt: "desc" },
        include: { items: { include: { product: true }, orderBy: { lineNumber: "asc" } }, site: true },
      },
      recommendations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          candidates: {
            orderBy: { rank: "asc" },
            include: { product: { include: { category: true } }, checks: true },
          },
          evidence: { include: { section: { include: { document: true } } } },
        },
      },
      runs: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          toolCalls: {
            orderBy: { sequence: "asc" },
            include: { evidence: { include: { section: { include: { document: true } } } } },
          },
        },
      },
    },
  });
}

export type CaseDetail = NonNullable<Awaited<ReturnType<typeof getCase>>>;

export async function getApprovalQueue() {
  return prisma.approval.findMany({
    where: { request: NOT_EVAL },
    include: {
      request: { include: { customer: true, owner: true } },
      quote: true,
      decidedBy: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
}

/** Commercial guardrails, read from the database so the UI shows live policy. */
export async function getPolicyThresholds() {
  const rows = await prisma.policyThreshold.findMany();
  const byCode = new Map(rows.map((r) => [r.code, dec(r.numericValue)]));
  return {
    maxDiscountPct: byCode.get("MAX_DISCOUNT_PCT") ?? 18,
    minMarginPct: byCode.get("MIN_MARGIN_PCT") ?? 22,
    hardMarginFloorPct: byCode.get("HARD_MARGIN_FLOOR_PCT") ?? 8,
    largeQuoteValue: byCode.get("LARGE_QUOTE_VALUE") ?? 50000,
    maxFactoryUnits: byCode.get("MAX_FACTORY_UNITS") ?? 250,
  };
}

export async function getUsers() {
  return prisma.user.findMany({ orderBy: { name: "asc" } });
}

export async function getCatalog(params: { q?: string; category?: string }) {
  const products = await prisma.product.findMany({
    where: {
      ...(params.category ? { category: { code: params.category } } : {}),
      ...(params.q
        ? {
            OR: [
              { sku: { contains: params.q, mode: "insensitive" } },
              { name: { contains: params.q, mode: "insensitive" } },
              { description: { contains: params.q, mode: "insensitive" } },
              { specs: { some: { textValue: { contains: params.q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    include: {
      category: true,
      specs: true,
      inventory: { include: { warehouse: true } },
    },
    orderBy: [{ isAccessory: "asc" }, { sku: "asc" }],
    take: 200,
  });

  const categories = await prisma.productCategory.findMany({ orderBy: { code: "asc" } });
  return { products, categories };
}

export async function getProduct(sku: string) {
  return prisma.product.findUnique({
    where: { sku },
    include: {
      category: true,
      specs: true,
      inventory: { include: { warehouse: true, incoming: { orderBy: { expectedAt: "asc" } } } },
      documents: { include: { sections: { orderBy: { ordinal: "asc" } } } },
      substitutesFrom: { include: { toProduct: { include: { category: true } } } },
      substitutesTo: { include: { fromProduct: { include: { category: true } } } },
      requiresAcc: { include: { accessory: true } },
      priceBookEntries: { include: { priceBook: true } },
    },
  });
}

/** Curated guidance first — the generated data sheets are reference, not reading. */
const DOC_TYPE_ORDER = [
  "REPLACEMENT_GUIDE",
  "COMPATIBILITY_NOTE",
  "TECHNICAL_BULLETIN",
  "SAFETY_NOTICE",
  "INSTALLATION_GUIDE",
  "SPEC_SHEET",
];

export async function getLibrary(params: { q?: string; type?: string }) {
  const docs = await prisma.technicalDocument.findMany({
    where: {
      ...(params.type ? { type: params.type as never } : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: "insensitive" } },
              { docNumber: { contains: params.q, mode: "insensitive" } },
              { summary: { contains: params.q, mode: "insensitive" } },
              { sections: { some: { body: { contains: params.q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    include: { product: true, sections: { orderBy: { ordinal: "asc" } } },
    take: 160,
  });

  return docs.sort(
    (a, b) =>
      DOC_TYPE_ORDER.indexOf(a.type) - DOC_TYPE_ORDER.indexOf(b.type) ||
      a.docNumber.localeCompare(b.docNumber),
  );
}

export async function getDocument(docNumber: string) {
  return prisma.technicalDocument.findUnique({
    where: { docNumber },
    include: { product: true, sections: { orderBy: { ordinal: "asc" } } },
  });
}

export async function getCustomers() {
  return prisma.customer.findMany({
    include: {
      priceBook: true,
      sites: true,
      contacts: true,
      requests: {
        where: NOT_EVAL,
        include: { quotes: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { receivedAt: "desc" },
      },
      customerPricing: { include: { product: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getQuoteByNumber(quoteNumber: string) {
  return prisma.quote.findUnique({
    where: { quoteNumber },
    include: {
      customer: true,
      site: true,
      request: { include: { contact: true, owner: true } },
      items: { include: { product: true }, orderBy: { lineNumber: "asc" } },
      approvals: { include: { decidedBy: true } },
    },
  });
}

export function toMoney(v: Decimalish): number {
  return centsToNumber(cents(v));
}
