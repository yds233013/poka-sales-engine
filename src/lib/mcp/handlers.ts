/**
 * MCP tool handlers.
 *
 * Each handler is the bridge between a typed tool contract and the existing
 * deterministic application. It loads data through Prisma, runs the same
 * engines the fixed pipeline runs, and returns a sanitised structured result.
 *
 * What a handler never does:
 *   - accept a technical fact from the caller (requirements are loaded from
 *     the case, not supplied);
 *   - build SQL from caller input (everything goes through the ORM);
 *   - surface an environment variable, connection string or internal id that
 *     is not needed to continue the conversation.
 *
 * Every handler runs through the ToolBus, so an MCP call is persisted exactly
 * like a pipeline call: same table, same evidence, same trace the operator
 * reads back.
 */

import type { PrismaClient } from "@/generated/prisma";
import type { RequirementView, ProductView } from "@/lib/domain/types";
import { toProductView, toRequirementView, toInventoryRecord, dec } from "@/lib/agent/mappers";
import { availableToPromise } from "@/lib/engines/inventory";
import { formatCurrency } from "@/lib/money";
import type { ToolBus } from "@/lib/agent/toolbus";
import {
  calculatePrice,
  checkCompatibility,
  checkInventory,
  findSubstitutes,
  resolveCustomer,
  resolveSku,
  screenCandidates,
  searchTechnicalDocs,
} from "@/lib/agent/tools";
import { contractFor, type ToolName } from "./contracts";

const PRODUCT_INCLUDE = { category: true, specs: true } as const;

/**
 * Everything a handler is allowed to touch.
 *
 * Note what is absent: no environment, no connection string, no credentials.
 * The handler is handed a live Prisma client that the server constructed; the
 * model never sees how it was built.
 */
export interface HandlerContext {
  prisma: PrismaClient;
  bus: ToolBus;
  requestId: string;
  asOf: Date;
  /** Set by a terminal tool to end the run. */
  terminal: { called: ToolName | null; payload: unknown };
}

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

// ───────────────────────────── shared loaders ──────────────────────────────

/**
 * The case's requirements, as extracted deterministically.
 *
 * This is the reason `check_compatibility` takes only a SKU. If the caller
 * could pass requirements, it could pass ones any product satisfies.
 */
async function loadRequirements(ctx: HandlerContext): Promise<RequirementView[]> {
  const rows = await ctx.prisma.requirement.findMany({ where: { requestId: ctx.requestId } });
  return rows.map(toRequirementView);
}

async function loadProduct(ctx: HandlerContext, sku: string): Promise<ProductView | null> {
  const row = await ctx.prisma.product.findUnique({
    where: { sku: sku.trim().toUpperCase() },
    include: PRODUCT_INCLUDE,
  });
  return row ? toProductView(row) : null;
}

async function requireProduct(ctx: HandlerContext, sku: string): Promise<ProductView> {
  const product = await loadProduct(ctx, sku);
  if (!product) {
    throw new ToolInputError(
      `No catalog product with part number "${sku}". Use search_catalog or resolve_sku to find the right one rather than guessing.`,
    );
  }
  return product;
}

/**
 * Resolve the quantity for a tool that needs one.
 *
 * The extracted quantity wins. A caller-supplied figure that disagrees is
 * refused with the real number rather than silently accepted, because an
 * inflated quantity would flow into stock allocation and pricing.
 */
async function resolveQuantity(ctx: HandlerContext, supplied?: number): Promise<number> {
  const req = await ctx.prisma.requirement.findFirst({
    where: { requestId: ctx.requestId, key: "quantity" },
  });
  const extracted = req && req.kind === "EXPLICIT" ? Number(req.numValue) : null;

  if (supplied === undefined) {
    if (extracted === null) {
      throw new ToolInputError(
        "No quantity was stated in the customer's request, so this cannot be computed. Use request_clarification to ask for it.",
      );
    }
    return extracted;
  }
  if (extracted !== null && supplied !== extracted) {
    throw new ToolInputError(
      `Quantity ${supplied} does not match the ${extracted} extracted from the customer's message. Either omit the quantity or use ${extracted}.`,
    );
  }
  return supplied;
}

async function caseContext(ctx: HandlerContext) {
  const request = await ctx.prisma.salesRequest.findUniqueOrThrow({
    where: { id: ctx.requestId },
    include: { customer: true, site: true },
  });
  return {
    request,
    destinationZone: request.site?.freightZone ?? "MIDWEST",
    requiredBy: request.requiredBy,
    customerId: request.customerId,
  };
}

function specValue(product: ProductView, key: string): string | null {
  const spec = product.specs[key];
  if (!spec) return null;
  if (spec.numValue != null) return `${spec.numValue}${spec.unit ? ` ${spec.unit}` : ""}`;
  return spec.textValue ?? null;
}

function specNumber(product: ProductView, key: string): number | null {
  return product.specs[key]?.numValue ?? null;
}

// ────────────────────────────── the handlers ───────────────────────────────

export type HandlerMap = {
  [K in ToolName]: (ctx: HandlerContext, input: Record<string, unknown>) => Promise<unknown>;
};

export const HANDLERS: HandlerMap = {
  async resolve_customer(ctx) {
    const { request } = await caseContext(ctx);
    const account = await resolveCustomer(ctx.bus, {
      customerId: request.customerId,
      siteHint: request.siteId,
      bodyText: `${request.subject}\n${request.rawBody}`,
    });
    const site = request.siteId
      ? await ctx.prisma.customerSite.findUnique({ where: { id: request.siteId } })
      : null;

    return {
      found: Boolean(account.customerId),
      customerName: account.customerName,
      accountNumber: account.accountNumber,
      tier: account.tier,
      siteName: account.siteName,
      siteCity: site ? `${site.city}, ${site.state}` : null,
      freightZone: account.siteZone,
      contactName: account.contactName,
      priceBook: account.priceBookCode,
      paymentTermsDays: account.paymentTerms,
      note: account.customerId
        ? "Commercial terms come from this account's price book and any active contract."
        : "No account matched — pricing and freight cannot be computed.",
    };
  },

  async get_request_state(ctx) {
    return ctx.bus.run("get_request_state", {}, async () => {
    const { request } = await caseContext(ctx);
    const [requirements, items] = await Promise.all([
      loadRequirements(ctx),
      ctx.prisma.requestItem.findMany({
        where: { requestId: ctx.requestId },
        include: { product: true },
        orderBy: { lineNumber: "asc" },
      }),
    ]);

    const quantityReq = requirements.find((r) => r.key === "quantity");
    const render = (r: RequirementView) => {
      if (r.kind === "MISSING") return "not stated";
      const op = r.operator === "GTE" ? "≥ " : r.operator === "LTE" ? "≤ " : "";
      if (r.numValue != null) return `${op}${r.numValue}${r.unit ? ` ${r.unit}` : ""}`;
      return r.textValue ?? "—";
    };

    const technical = requirements.filter(
      (r) => !["quantity", "required_by", "ship_to", "incumbent_sku"].includes(r.key),
    );
    const output = {
      summary: request.summary ?? "Not yet summarised.",
      quantity: quantityReq?.kind === "EXPLICIT" ? Number(quantityReq.numValue) : null,
      requiredBy: request.requiredBy?.toISOString().slice(0, 10) ?? null,
      items: items.map((i) => ({
        rawText: i.rawText,
        sku: i.product?.sku ?? null,
        quantity: i.quantity || null,
      })),
      requirements: technical.map((r) => ({
        key: r.key,
        label: r.label,
        kind: r.kind,
        value: render(r),
        sourceQuote: r.sourceQuote,
        note: r.note,
      })),
      openQuestions: requirements
        .filter((r) => r.kind === "AMBIGUOUS" || r.kind === "MISSING")
        .map((r) => r.note ?? `Confirm ${r.label.toLowerCase()}.`),
    };

    return {
      output,
      summary: `Read the extracted request state: ${technical.length} technical requirement(s)${
        output.quantity ? `, ${output.quantity} units` : ", quantity not stated"
      }${output.requiredBy ? `, required by ${output.requiredBy}` : ""}.`,
    };
    });
  },

  async resolve_sku(ctx, input) {
    const resolved = await resolveSku(ctx.bus, { rawSku: String(input.sku) });
    return {
      found: resolved.found,
      sku: resolved.sku,
      name: resolved.name,
      lifecycle: resolved.lifecycle,
      category: resolved.categoryCode,
      suggestions: resolved.suggestions,
    };
  },

  async search_catalog(ctx, input) {
    const query = String(input.query).trim();
    const limit = Number(input.limit ?? 12);
    const categoryCode = input.categoryCode ? String(input.categoryCode) : undefined;

    return ctx.bus.run("search_catalog", { query, categoryCode, limit }, async () => {
      const rows = await ctx.prisma.product.findMany({
        where: {
          ...(categoryCode ? { category: { code: categoryCode } } : {}),
          lifecycle: { not: "DISCONTINUED" },
          OR: [
            { sku: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { specs: { some: { textValue: { contains: query, mode: "insensitive" } } } },
          ],
        },
        include: PRODUCT_INCLUDE,
        orderBy: [{ isAccessory: "asc" }, { sku: "asc" }],
        take: limit + 1,
      });

      const truncated = rows.length > limit;
      const products = rows.slice(0, limit).map(toProductView);
      const matches = products.map((p) => ({
        sku: p.sku,
        name: p.name,
        family: p.family,
        categoryCode: p.categoryCode,
        lifecycle: p.lifecycle,
        maxFluidTempC: specNumber(p, "max_fluid_temp_c"),
        maxFlowM3h: specNumber(p, "max_flow_m3h"),
        connection: specValue(p, "inlet_connection"),
        wettedMaterial: specValue(p, "wetted_material"),
      }));

      return {
        output: { matches, truncated },
        summary: `Catalog search for "${query}"${categoryCode ? ` in ${categoryCode}` : ""} returned ${matches.length} product(s)${truncated ? " (more available)" : ""}.`,
        status: matches.length === 0 ? ("EMPTY" as const) : ("OK" as const),
      };
    });
  },

  async get_product(ctx, input) {
    const sku = String(input.sku);
    type ProductPayload = {
      found: boolean;
      sku: string | null;
      name: string | null;
      family: string | null;
      lifecycle: string | null;
      leadTimeDays: number | null;
      specs: { key: string; label: string; value: string }[];
    };
    return ctx.bus.run<{ sku: string }, ProductPayload>("get_product", { sku }, async () => {
      const product = await loadProduct(ctx, sku);
      if (!product) {
        return {
          output: { found: false, sku: null, name: null, family: null, lifecycle: null, leadTimeDays: null, specs: [] },
          summary: `No catalog product with part number "${sku}".`,
          status: "EMPTY" as const,
          safety: "NEEDS_REVIEW" as const,
        };
      }
      const specs = Object.values(product.specs).map((s) => ({
        key: s.key,
        label: s.label,
        value:
          s.numValue != null
            ? `${s.numValue}${s.unit ? ` ${s.unit}` : ""}`
            : (s.textValue ?? (s.boolValue ? "yes" : "no")),
      }));
      return {
        output: {
          found: true,
          sku: product.sku,
          name: product.name,
          family: product.family,
          lifecycle: product.lifecycle,
          leadTimeDays: product.leadTimeDays,
          specs,
        },
        summary: `Read the full specification for ${product.sku} — ${specs.length} published values.`,
        evidence: [
          {
            kind: "spec" as const,
            label: `${product.sku} catalog record`,
            claim: `${product.sku} publishes ${specs.length} specification values.`,
            recordRef: `products/${product.id}`,
          },
        ],
      };
    });
  },

  async search_technical_docs(ctx, input) {
    const hits = await searchTechnicalDocs(ctx.bus, {
      query: String(input.query),
      sku: input.sku ? String(input.sku).toUpperCase() : null,
      limit: Number(input.limit ?? 6),
    });
    return {
      sections: hits.map((h) => ({
        documentNumber: h.docNumber,
        title: h.title,
        type: h.type,
        anchor: h.anchor,
        heading: h.heading,
        excerpt: h.excerpt,
      })),
    };
  },

  async check_compatibility(ctx, input) {
    const product = await requireProduct(ctx, String(input.sku));
    const requirements = await loadRequirements(ctx);
    if (requirements.length === 0) {
      throw new ToolInputError(
        "This case has no extracted requirements yet, so there is nothing to check against. Call get_request_state first.",
      );
    }

    const verdict = await checkCompatibility(ctx.bus, {
      productId: product.id,
      requirements,
    });

    const calls = await ctx.prisma.toolCall.findMany({
      where: { runId: ctx.bus.context.runId, toolName: "check_compatibility" },
      orderBy: { sequence: "desc" },
      take: 1,
      include: { evidence: { include: { section: { include: { document: true } } } } },
    });

    return {
      sku: verdict.sku,
      safety: verdict.safety,
      passCount: verdict.checks.filter((c) => c.result === "PASS").length,
      checks: verdict.checks.map((c) => ({
        dimension: c.dimension,
        label: c.label,
        result: c.result,
        severity: c.severity,
        required: c.requirement,
        actual: c.actual,
        detail: c.detail,
      })),
      evidence: (calls[0]?.evidence ?? []).map((e) => ({
        kind: e.kind as "document" | "spec" | "inventory" | "pricing" | "policy" | "account",
        label: e.label,
        claim: e.claim,
        documentNumber: e.section?.document.docNumber ?? null,
        anchor: e.section?.anchor ?? null,
        recordRef: e.recordRef,
      })),
    };
  },

  async find_substitutes(ctx, input) {
    const product = await requireProduct(ctx, String(input.sku));
    const requirements = await loadRequirements(ctx);
    const limit = Number(input.limit ?? 8);

    const curated = await findSubstitutes(ctx.bus, {
      productId: product.id,
      categoryCodes: [],
      limit: 0,
    });

    const { screened } = await screenCandidates(ctx.bus, {
      categoryCodes: [product.categoryCode, ...relatedCategoriesFor(product.categoryCode)],
      excludeProductIds: [product.id, ...curated.map((c) => c.product.id)],
      requirements,
      shortlistSize: limit,
    });

    return {
      curated: curated.map((c) => ({
        sku: c.product.sku,
        relationship: String(c.linkKind ?? "ALTERNATE"),
        note: c.linkNote ?? "",
        requiresAccessory: c.requiresSku,
      })),
      screened: screened.slice(0, limit).map((s) => ({
        sku: s.sku,
        name: s.name,
        hardFailures: s.hardFailureCount,
        closestGap: s.topFailure,
      })),
    };
  },

  async get_inventory(ctx, input) {
    const product = await requireProduct(ctx, String(input.sku));
    return ctx.bus.run("get_inventory", { sku: product.sku }, async () => {
      const rows = await ctx.prisma.inventory.findMany({
        where: { productId: product.id },
        include: { warehouse: true, incoming: { orderBy: { expectedAt: "asc" } } },
      });
      const records = rows.map(toInventoryRecord);
      const totalAvailable = records.reduce((s, r) => s + availableToPromise(r), 0);

      return {
        output: {
          sku: product.sku,
          totalAvailable,
          locations: records.map((r) => ({
            warehouse: r.warehouseCode,
            city: `${r.city}, ${r.state}`,
            onHand: r.onHand,
            reserved: r.reserved,
            availableToPromise: availableToPromise(r),
          })),
          inbound: records.flatMap((r) =>
            r.incoming
              .filter((i) => i.confirmed && i.expectedAt.getTime() >= ctx.asOf.getTime())
              .map((i) => ({
                warehouse: r.warehouseCode,
                quantity: i.quantity,
                expectedAt: i.expectedAt.toISOString().slice(0, 10),
              })),
          ),
          factoryLeadTimeDays: product.leadTimeDays,
        },
        summary: `${product.sku}: ${totalAvailable} units available to promise across ${records.filter((r) => availableToPromise(r) > 0).length} location(s).`,
        status: totalAvailable === 0 ? ("EMPTY" as const) : ("OK" as const),
        evidence: [
          {
            kind: "inventory" as const,
            label: `${product.sku} stock position`,
            claim: `${totalAvailable} units available to promise (on hand less reserved) across ${records.length} locations.`,
            recordRef: `inventory/${product.id}`,
          },
        ],
      };
    });
  },

  async build_fulfillment_plan(ctx, input) {
    const product = await requireProduct(ctx, String(input.sku));
    const quantity = await resolveQuantity(ctx, input.quantity as number | undefined);
    const { destinationZone, requiredBy } = await caseContext(ctx);

    const outcome = await checkInventory(ctx.bus, {
      productId: product.id,
      sku: product.sku,
      quantity,
      requiredBy,
      destinationZone,
      leadTimeDays: product.leadTimeDays,
    });

    return {
      sku: product.sku,
      requestedQty: outcome.plan.requestedQty,
      canFulfill: outcome.plan.canFulfill,
      shortfall: outcome.plan.shortfall,
      isSplit: outcome.plan.isSplit,
      meetsDeadline: outcome.plan.meetsDeadline,
      readyDate: outcome.plan.readyDate?.toISOString().slice(0, 10) ?? null,
      allocations: outcome.plan.allocations.map((a) => ({
        warehouse: a.warehouseCode,
        quantity: a.quantity,
        source: a.source,
        readyDate: a.readyDate.toISOString().slice(0, 10),
      })),
      notes: outcome.plan.notes,
    };
  },

  async calculate_price(ctx, input) {
    const product = await requireProduct(ctx, String(input.sku));
    const quantity = await resolveQuantity(ctx, input.quantity as number | undefined);
    const { customerId } = await caseContext(ctx);

    const line = await calculatePrice(ctx.bus, {
      productId: product.id,
      sku: product.sku,
      quantity,
      customerId,
    });

    return {
      sku: product.sku,
      quantity: line.quantity,
      listPrice: formatCurrency(line.listPriceCents),
      unitPrice: formatCurrency(line.unitPriceCents),
      discountPct: line.discountPct,
      priceSource: line.priceSource,
      priceSourceDetail: line.priceSourceDetail,
      extended: formatCurrency(line.extendedCents),
      considered: line.considered.map((c) => ({
        source: c.source,
        unitPrice: formatCurrency(c.unitPriceCents),
        detail: c.detail,
      })),
    };
  },

  async get_customer_history(ctx, input) {
    const { request } = await caseContext(ctx);
    const limit = Number(input.limit ?? 5);
    if (!request.customerId) return { customerName: null, cases: [] };

    return ctx.bus.run("get_customer_history", { limit }, async () => {
      const cases = await ctx.prisma.salesRequest.findMany({
        where: { customerId: request.customerId!, id: { not: ctx.requestId } },
        include: {
          quotes: { orderBy: { createdAt: "desc" }, take: 1 },
          recommendations: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { receivedAt: "desc" },
        take: limit,
      });

      return {
        output: {
          customerName: request.customer?.name ?? null,
          cases: cases.map((c) => ({
            reference: c.reference,
            subject: c.subject,
            status: c.status,
            outcome: c.recommendations[0]?.outcome ?? null,
            quotedTotal: c.quotes[0] ? formatCurrency(Math.round(dec(c.quotes[0].total) * 100)) : null,
            receivedAt: c.receivedAt.toISOString().slice(0, 10),
          })),
        },
        summary: `Read ${cases.length} previous case(s) for ${request.customer?.name ?? "this account"}.`,
        status: cases.length === 0 ? ("EMPTY" as const) : ("OK" as const),
      };
    });
  },

  // ── Terminal tools ──────────────────────────────────────────────────────
  //
  // These record the agent's intent and stop the loop. The runtime then runs
  // the deterministic finalizer. Deliberately, none of them can approve,
  // release or price anything: they hand over a selection and a reason.

  async create_quote_draft(ctx, input) {
    const skus = (input.candidateSkus as string[]).map((s) => s.trim().toUpperCase());
    const found = await ctx.prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { sku: true },
    });
    const missing = skus.filter((s) => !found.some((f) => f.sku === s));
    if (missing.length > 0) {
      throw new ToolInputError(
        `These part numbers are not in the catalog: ${missing.join(", ")}. Resolve them before concluding.`,
      );
    }
    ctx.terminal.called = "create_quote_draft";
    ctx.terminal.payload = { candidateSkus: skus, rationale: String(input.rationale) };
    return ctx.bus.run("create_quote_draft", { candidateSkus: skus }, async () => ({
      output: {
        status: "PENDING_FINALIZATION",
        outcome: null as string | null,
        selectedSku: null as string | null,
        quoteNumber: null as string | null,
        approvalsRaised: 0,
        note: "Candidates accepted. The deterministic finalizer will now re-validate, price and apply approval policy.",
      },
      summary: `Concluded the investigation with ${skus.length} candidate(s) (${skus.join(", ")}) for deterministic finalization.`,
      safety: "NEEDS_REVIEW" as const,
    }));
  },

  async request_clarification(ctx, input) {
    ctx.terminal.called = "request_clarification";
    const questions = input.questions as string[];
    ctx.terminal.payload = { questions, reason: String(input.reason) };
    return ctx.bus.run("request_clarification", { questionCount: questions.length }, async () => ({
      output: {
        status: "NEEDS_CUSTOMER_CLARIFICATION",
        questionCount: questions.length,
        note: "Investigation stopped. A clarification letter will be drafted.",
      },
      summary: `Stopped to ask the customer ${questions.length} question(s) rather than assume: ${questions[0]}`,
      safety: "NEEDS_REVIEW" as const,
    }));
  },

  async escalate_for_review(ctx, input) {
    ctx.terminal.called = "escalate_for_review";
    const blockingDimensions = (input.blockingDimensions as string[]) ?? [];
    ctx.terminal.payload = { reason: String(input.reason), blockingDimensions };
    return ctx.bus.run("escalate_for_review", { blockingDimensions }, async () => ({
      output: {
        status: "NEEDS_INTERNAL_REVIEW",
        note: "Investigation stopped and routed to a human specialist.",
      },
      summary: `Escalated to a human specialist${blockingDimensions.length ? ` — unmet: ${blockingDimensions.join(", ")}` : ""}.`,
      safety: "BLOCKED" as const,
    }));
  },
};

/** Mirrors the deterministic pipeline's notion of adjacent families. */
function relatedCategoriesFor(code: string): string[] {
  const map: Record<string, string[]> = {
    "CP-STD": ["CP-HT", "MD-SEAL", "VI-PUMP"],
    "CP-HT": ["CP-STD", "MD-SEAL"],
    "MD-SEAL": ["CP-HT", "CP-STD"],
    "PD-GEAR": ["PD-DIA"],
    "PD-DIA": ["PD-GEAR"],
    "VI-PUMP": ["CP-STD"],
  };
  return map[code] ?? [];
}

/** Validate input against the contract, then dispatch. */
export async function invokeHandler(
  ctx: HandlerContext,
  name: string,
  rawInput: unknown,
): Promise<unknown> {
  const contract = contractFor(name);
  if (!contract) {
    throw new ToolInputError(
      `Unknown tool "${name}". Call one of the tools you were given; do not invent names.`,
    );
  }
  const parsed = contract.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new ToolInputError(`Invalid arguments for ${name} — ${detail}`);
  }
  const handler = HANDLERS[name as ToolName];
  const output = await handler(ctx, parsed.data as Record<string, unknown>);

  // Validate on the way out too. A handler that drifts from its declared
  // contract is a bug the model should never have to discover.
  const checked = contract.output.safeParse(output);
  if (!checked.success) {
    throw new Error(
      `Tool ${name} returned output that does not match its contract: ${checked.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return checked.data;
}
