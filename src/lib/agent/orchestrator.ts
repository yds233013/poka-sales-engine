/**
 * Agent orchestration.
 *
 * Runs one sales request end to end. The shape is a fixed investigation
 * pipeline rather than a free-running loop, which is a deliberate choice: a
 * deterministic tool order means two cases are comparable in the audit trail,
 * and it removes any path by which the agent could skip the compatibility or
 * approval step.
 *
 * The model contributes exactly three things — reading the inbound message,
 * phrasing the rationale, and drafting the customer letter. Everything that
 * decides an outcome is computed here from the engines.
 *
 * Safety invariants enforced in this file:
 *   - a candidate whose verdict is BLOCKED can never be selected or priced;
 *   - a quote is created PENDING_APPROVAL whenever the approval engine returns
 *     any requirement, and the release path re-checks that independently;
 *   - a customer-facing draft is only generated once nothing is outstanding.
 */

import type { PrismaClient } from "@/generated/prisma";
import type {
  Allocation,
  CompatibilityVerdict,
  FulfillmentPlan,
  PricedLine,
  ProductView,
  RequirementView,
} from "@/lib/domain/types";
import { assertNotBlocked, containsTokens, recomputeVerdict } from "@/lib/engines/compatibility";
import { rankCandidates, selectedCandidate, type RankableCandidate, type RankedCandidate } from "@/lib/engines/substitution";
import { computeQuoteTotals, assertTotalsConsistent } from "@/lib/engines/pricing";
import { canAutoRelease, deriveRisk } from "@/lib/engines/approval";
import { getAIProvider } from "@/lib/ai";
import { inferFromIncumbent } from "@/lib/ai/extract";
import { formatCurrency, centsToNumber } from "@/lib/money";
import { ToolBus } from "./toolbus";
import {
  calculateFreight,
  calculatePrice,
  checkCompatibility,
  checkInventory,
  checkMargin,
  evaluateApprovalPolicy,
  applyAdapter,
  findSubstitutes,
  resolveCustomer,
  resolveSku,
  screenCandidates,
  searchTechnicalDocs,
  type SubstituteCandidate,
  type ResolvedCustomer,
} from "./tools";
import { toProductView } from "./mappers";
import { recordAudit } from "@/lib/audit";

const PRODUCT_INCLUDE = { category: true, specs: true } as const;
const QUOTE_VALID_DAYS = 30;

export interface RunOptions {
  /** Injected clock — the seed uses it so scenario dates are stable. */
  asOf?: Date;
  /** Rep-entered discount override, when re-running after a manual edit. */
  manualDiscountPct?: number | null;
}

export interface RunOutcome {
  runId: string;
  status: string;
  recommendationId: string | null;
  quoteId: string | null;
  approvalCount: number;
  /**
   * True when every policy check was inside limits, so the quote may be
   * released without a human decision. Set whether or not the release actually
   * happened — see `deferAutoRelease`.
   */
  autoReleaseEligible?: boolean;
}

export async function runSalesRequest(
  prisma: PrismaClient,
  requestId: string,
  options: RunOptions = {},
): Promise<RunOutcome> {
  const asOf = options.asOf ?? new Date();
  const provider = getAIProvider();

  const request = await prisma.salesRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { customer: { include: { sites: true } } },
  });

  // Re-running a case replaces its prior analysis rather than layering on it.
  await prisma.$transaction([
    prisma.recommendation.deleteMany({ where: { requestId } }),
    prisma.quote.deleteMany({ where: { requestId } }),
    prisma.approval.deleteMany({ where: { requestId } }),
    prisma.requirement.deleteMany({ where: { requestId } }),
    prisma.requestItem.deleteMany({ where: { requestId } }),
    prisma.customerResponse.deleteMany({ where: { requestId } }),
    prisma.agentRun.deleteMany({ where: { requestId } }),
  ]);

  const run = await prisma.agentRun.create({
    data: { requestId, provider: provider.id, status: "RUNNING", startedAt: asOf },
  });
  const bus = new ToolBus({ prisma, runId: run.id, requestId, asOf });
  const startedAt = Date.now();

  await prisma.salesRequest.update({ where: { id: requestId }, data: { status: "ANALYZING" } });
  await recordAudit(prisma, requestId, {
    type: "RUN_STARTED",
    actor: "Sales Engine",
    summary: `Analysis started using the ${provider.label.toLowerCase()}.`,
  });

  try {
    // ── 1. Read the request ────────────────────────────────────────────────
    const [knownSkus, sites] = await Promise.all([
      prisma.product.findMany({ select: { sku: true } }),
      prisma.customerSite.findMany({ select: { id: true, name: true, aliases: true, city: true } }),
    ]);

    const analysis = await provider.analyzeRequest({
      subject: request.subject,
      body: request.rawBody,
      context: {
        knownSkus: knownSkus.map((p) => p.sku),
        siteAliases: sites.map((s) => ({
          siteId: s.id,
          label: s.name,
          tokens: [...s.aliases, s.city, s.name],
        })),
        now: asOf,
      },
    });

    // ── 2. Resolve the account ─────────────────────────────────────────────
    const account = await resolveCustomer(bus, {
      customerId: request.customerId,
      siteHint: analysis.siteId,
      bodyText: `${request.subject}\n${request.rawBody}`,
    });

    // ── 3. Resolve part numbers ────────────────────────────────────────────
    let incumbent: ProductView | null = null;
    const unresolvedSkus: string[] = [];
    const resolvedSkus: string[] = [];

    for (const item of analysis.items) {
      if (!item.sku) continue;
      const resolved = await resolveSku(bus, { rawSku: item.sku });
      if (resolved.found && resolved.productId) {
        resolvedSkus.push(resolved.sku!);
        if (!incumbent) {
          const row = await prisma.product.findUniqueOrThrow({
            where: { id: resolved.productId },
            include: PRODUCT_INCLUDE,
          });
          incumbent = toProductView(row);
        }
      } else {
        unresolvedSkus.push(item.sku);
      }
    }

    // ── 4. Requirements, including what the incumbent implies ──────────────
    let requirements = analysis.requirements;
    if (incumbent) {
      await searchTechnicalDocs(bus, {
        query: `${incumbent.sku} published limits temperature connection material`,
        sku: incumbent.sku,
        families: [incumbent.family],
      });
      requirements = [
        ...requirements,
        ...inferFromIncumbent(incumbent.sku, incumbent.specs, requirements),
      ];
    }

    await persistRequirements(prisma, requestId, requirements);
    await persistItems(prisma, requestId, analysis.items, prisma);

    const quantityReq = requirements.find((r) => r.key === "quantity");
    const quantity = quantityReq?.kind === "EXPLICIT" ? Number(quantityReq.numValue) : null;
    const requiredBy = analysis.requiredBy;
    const destinationZone = account.siteZone ?? "MIDWEST";

    await prisma.salesRequest.update({
      where: { id: requestId },
      data: {
        summary: analysis.summary,
        requiredBy,
        siteId: account.siteId,
        contactId: account.contactId,
      },
    });

    // ── 5. Can this be worked at all? ──────────────────────────────────────
    const blockingGaps = gapsThatBlock(
      requirements,
      incumbent,
      quantity,
      unresolvedSkus,
      resolvedSkus.length,
    );
    if (blockingGaps.length > 0) {
      return await finishAsInformationRequired(
        prisma, bus, run.id, requestId, provider, account, analysis.openQuestions, blockingGaps,
        request.subject, startedAt,
      );
    }

    // ── 6. Build the candidate set ─────────────────────────────────────────
    const candidateSources = await buildCandidates(bus, prisma, incumbent, requirements);

    // ── 7+. Hand over to the shared deterministic finalizer ────────────────
    return await finalizeCase(prisma, bus, provider, {
      runId: run.id,
      requestId,
      subject: request.subject,
      ownerId: request.ownerId,
      account,
      incumbent,
      requirements,
      quantity: quantity!,
      requiredBy,
      destinationZone,
      candidateSources,
      openQuestions: analysis.openQuestions,
      manualDiscountPct: options.manualDiscountPct ?? null,
      asOf,
    }, startedAt);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: message,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        trace: bus.calls as object[],
      },
    });
    // NEEDS_REVIEW, not BLOCKED. BLOCKED means "the engine refused to
    // recommend anything because nothing is safe"; a crash is a different
    // thing and must not masquerade as a safety verdict.
    await prisma.salesRequest.update({
      where: { id: requestId },
      data: {
        status: "NEEDS_REVIEW",
        risk: "HIGH",
        blockedReason: `Analysis did not complete: ${message.split("\n")[0]}. Re-run it, or work the case by hand.`,
      },
    });
    await recordAudit(prisma, requestId, {
      type: "RUN_FAILED",
      actor: "Sales Engine",
      summary: `Analysis stopped: ${message.split("\n")[0]}`,
    });
    throw error;
  }
}


// ─────────────────────── shared deterministic finalization ─────────────────

export interface FinalizeInput {
  runId: string;
  requestId: string;
  subject: string;
  ownerId: string | null;
  account: ResolvedCustomer;
  incumbent: ProductView | null;
  requirements: RequirementView[];
  quantity: number;
  requiredBy: Date | null;
  destinationZone: string;
  /** The products to evaluate. Every one is re-validated from scratch. */
  candidateSources: SubstituteCandidate[];
  openQuestions: string[];
  manualDiscountPct?: number | null;
  /**
   * Hold the automatic release back and hand the decision to the caller.
   *
   * The adaptive path sets this because auto-release would otherwise happen
   * *before* the agent's summary has been grounding-checked, releasing a quote
   * on the strength of a narrative that is about to be rejected. The quote and
   * its approvals are still the finalizer's; only the release timing moves.
   */
  deferAutoRelease?: boolean;
  asOf: Date;
}

/**
 * Turn a set of candidate products into a recommendation, a quote and the
 * approvals policy requires.
 *
 * This is the single path to business truth, and both execution modes run it.
 * The deterministic pipeline supplies candidates from curated links plus a
 * catalog screen; the adaptive agent supplies whatever it decided to
 * investigate. Either way every candidate is re-evaluated here against the
 * compatibility rules, re-priced by the pricing engine, and re-tested against
 * approval policy.
 *
 * That is the whole reason the extraction exists: an agent can influence which
 * products get looked at, and nothing else. It cannot reach the numbers.
 */
export async function finalizeCase(
  prisma: PrismaClient,
  bus: ToolBus,
  provider: ReturnType<typeof getAIProvider>,
  input: FinalizeInput,
  startedAt: number,
): Promise<RunOutcome> {
  const { runId, requestId, account, incumbent, requirements, requiredBy, destinationZone, asOf } = input;
  const quantity = input.quantity;
  const candidateSources = input.candidateSources;
    // ── 7. Evaluate every candidate ────────────────────────────────────────
    const evaluated: {
      source: SubstituteCandidate;
      verdict: CompatibilityVerdict;
      plan: FulfillmentPlan | null;
      price: PricedLine | null;
    }[] = [];

    for (const source of candidateSources) {
      const verdict = await evaluateWithAdapter(bus, prisma, source, requirements);

      // Stock and price are not checked for a part that cannot be used. This
      // mirrors how a salesperson works and keeps the trace readable.
      if (verdict.safety === "BLOCKED") {
        evaluated.push({ source, verdict, plan: null, price: null });
        continue;
      }

      const inventory = await checkInventory(bus, {
        productId: source.product.id,
        sku: source.product.sku,
        quantity: quantity!,
        requiredBy,
        destinationZone,
        leadTimeDays: source.product.leadTimeDays,
      });
      const price = await calculatePrice(bus, {
        productId: source.product.id,
        sku: source.product.sku,
        quantity: quantity!,
        customerId: account.customerId,
        manualDiscountPct: input.manualDiscountPct ?? null,
      });
      evaluated.push({ source, verdict, plan: inventory.plan, price });
    }

    // ── 8. Rank ────────────────────────────────────────────────────────────
    const referencePrice = incumbent ? incumbent.listPriceCents : null;
    const rankable: RankableCandidate[] = evaluated.map((e) => ({
      productId: e.source.product.id,
      sku: e.source.product.sku,
      name: e.source.product.name,
      verdict: e.verdict,
      linkKind: e.source.linkKind as RankableCandidate["linkKind"],
      linkNote: e.source.linkNote,
      requiresAccessorySku: e.source.requiresSku,
      unitPriceCents: e.price?.unitPriceCents ?? e.source.product.listPriceCents,
      referencePriceCents: referencePrice,
      plan: e.plan ?? emptyPlan(quantity!),
      leadTimeDays: e.source.product.leadTimeDays,
      isExactMatch: incumbent?.id === e.source.product.id,
    }));

    const ranked = rankCandidates(rankable);
    const winner = selectedCandidate(ranked);

    if (!winner) {
      return await finishAsNoViableOption(
        prisma, bus, runId, requestId, provider, incumbent, ranked, input.subject, account, startedAt,
      );
    }

    const winningEval = evaluated.find((e) => e.source.product.id === winner.productId)!;

    // Last gate before anything commercial happens. The ranking engine already
    // refuses to promote a blocked candidate; this is the independent check on
    // the path to a quote, and it throws rather than returning a flag so it
    // cannot be read and ignored.
    assertNotBlocked(winner.verdict);

    const isSubstitution = Boolean(incumbent && incumbent.id !== winner.productId);

    // ── 9. Commercials ─────────────────────────────────────────────────────
    const lines: { product: ProductView; price: PricedLine; allocations: Allocation[] }[] = [
      { product: winningEval.source.product, price: winningEval.price!, allocations: winner.plan.allocations },
    ];

    // An adapter that makes the substitution work is a real line on the quote.
    if (winningEval.source.adapter) {
      const adapter = winningEval.source.adapter;
      const adapterQty = quantity! * 2; // suction and discharge
      const adapterInventory = await checkInventory(bus, {
        productId: adapter.id,
        sku: adapter.sku,
        quantity: adapterQty,
        requiredBy,
        destinationZone,
        leadTimeDays: adapter.leadTimeDays,
      });
      const adapterPrice = await calculatePrice(bus, {
        productId: adapter.id,
        sku: adapter.sku,
        quantity: adapterQty,
        customerId: account.customerId,
      });
      lines.push({ product: adapter, price: adapterPrice, allocations: adapterInventory.plan.allocations });
    }

    // Every line ships, including an adapter kit that may come from a
    // different warehouse than the pump. Rating only the pump's allocations
    // would quietly give the accessory free freight.
    const freight = await calculateFreight(bus, {
      lines: lines.map((l) => ({
        sku: l.product.sku,
        unitWeightKg: Math.max(0.1, l.product.weightKg),
        allocations: l.allocations,
      })),
      destinationZone,
      hazmat: lines.some((l) => l.product.hazmat),
      requiredBy,
    });

    const totals = computeQuoteTotals(lines.map((l) => l.price), freight.quote.totalCents);
    assertTotalsConsistent(lines.map((l) => l.price), totals);

    const margin = await checkMargin(bus, {
      revenueCents: totals.subtotalCents,
      productCostCents: totals.costTotalCents,
      freightCents: totals.freightCents,
    });

    // ── 10. Policy ─────────────────────────────────────────────────────────
    const unresolved = requirements
      .filter((r) => r.kind === "AMBIGUOUS")
      .map((r) => r.label.toLowerCase());

    const approvals = await evaluateApprovalPolicy(bus, {
      effectiveDiscountPct: totals.effectiveDiscountPct,
      margin,
      quoteTotalCents: totals.totalCents,
      verdict: winner.verdict,
      isSubstitution,
      substitutedFromSku: incumbent?.sku ?? null,
      substitutedToSku: winner.sku,
      plan: winner.plan,
      freightExpedited: freight.quote.expedited,
      freightMissesDeadline: freight.quote.missesDeadline,
      estimatedArrival: freight.estimatedDelivery ? new Date(freight.estimatedDelivery) : null,
      requiredBy,
      freightCents: freight.quote.totalCents,
      unresolvedRequirements: unresolved,
      inferredRequirements: requirements
        .filter((r) => r.kind === "INFERRED")
        .map((r) => r.label.toLowerCase()),
    });

    // ── 11. Persist ────────────────────────────────────────────────────────
    const outcome = isSubstitution
      ? "SUBSTITUTE"
      : winner.plan.isSplit
        ? "SPLIT_FULFILLMENT"
        : "EXACT_MATCH";

    const facts = buildFacts(winner, winningEval, freight.quote.totalCents, totals, requiredBy);
    const summary = await provider.summarizeRecommendation({
      outcome,
      requestedSku: incumbent?.sku ?? null,
      selectedSku: winner.sku,
      selectedName: winner.name,
      quantity: quantity!,
      facts,
      rejected: ranked
        .filter((r) => r.verdictLabel === "REJECTED")
        .map((r) => ({ sku: r.sku, reason: r.reason })),
      warnings: [...winner.verdict.warnings, ...winner.verdict.unknowns].map((c) => c.detail),
      openQuestions: input.openQuestions,
    });

    const risk = deriveRisk(approvals, winner.verdict);

    const recommendation = await prisma.recommendation.create({
      data: {
        requestId,
        outcome,
        headline: summary.headline,
        rationale: summary.rationale,
        risk,
        productId: winner.productId,
        quantity: quantity!,
        candidates: {
          create: ranked.map((candidate) => ({
            productId: candidate.productId,
            verdict: candidate.verdictLabel,
            rank: candidate.rank,
            reason: candidate.reason,
            score: candidate.score,
            unitPrice: candidate.verdict.safety === "BLOCKED" ? null : centsToNumber(candidate.unitPriceCents),
            availableQty: candidate.plan.allocatedQty,
            earliestShipDate: candidate.plan.readyDate,
            checks: {
              create: candidate.verdict.checks.map((check) => ({
                dimension: check.dimension,
                label: check.label,
                result: check.result,
                severity: check.severity,
                requirement: check.requirement,
                actual: check.actual,
                detail: check.detail,
                ruleCode: check.ruleCode,
              })),
            },
          })),
        },
      },
    });

    await linkEvidenceToRecommendation(prisma, runId, recommendation.id);

    const quote = await createQuote(prisma, {
      requestId,
      customerId: account.customerId!,
      siteId: account.siteId!,
      lines,
      totals,
      freightService: freight.quote.service,
      margin,
      estimatedDelivery: freight.estimatedDelivery ? new Date(freight.estimatedDelivery) : null,
      paymentTerms: account.paymentTerms ?? 30,
      pendingApproval: approvals.length > 0,
      asOf,
    });

    for (const requirement of approvals) {
      await prisma.approval.create({
        data: {
          requestId,
          quoteId: quote.id,
          kind: requirement.kind,
          requiredRole: requirement.requiredRole,
          title: requirement.title,
          reason: requirement.reason,
          proposedAction: requirement.proposedAction,
          commercialImpact: requirement.commercialImpact,
          technicalImpact: requirement.technicalImpact,
          riskNote: requirement.riskNote,
          context: requirement.context as object,
          requestedById: input.ownerId,
        },
      });
      await recordAudit(prisma, requestId, {
        type: "APPROVAL_REQUESTED",
        actor: "Sales Engine",
        summary: requirement.title,
        detail: { kind: requirement.kind, requiredRole: requirement.requiredRole },
      });
    }

    await recordAudit(prisma, requestId, {
      type: "RECOMMENDATION_GENERATED",
      actor: "Sales Engine",
      summary: summary.headline,
      detail: { outcome, quoteNumber: quote.quoteNumber, approvals: approvals.length },
    });

    await prisma.salesRequest.update({
      where: { id: requestId },
      data: { status: "READY_FOR_APPROVAL", risk, blockedReason: null },
    });

    // A deal that cleared every policy check still goes out through the one
    // release function, rather than a shortcut beside it. That function owns
    // the gate, the quote status and the audit entry, and having a second path
    // that sets those by hand is how the two drift apart.
    const autoRelease = canAutoRelease(approvals);
    if (autoRelease && !input.deferAutoRelease) {
      const { releaseQuote } = await import("@/lib/workflow");
      await releaseQuote(prisma, requestId, {
        actor: "Sales Engine",
        asOf,
        note: "Released without approval — every policy check was inside limits.",
      });
    }

    const released = autoRelease && !input.deferAutoRelease;
    if (!input.deferAutoRelease) await finishRun(prisma, runId, bus, startedAt, "COMPLETED");
    const status = released ? "RESPONSE_READY" : "READY_FOR_APPROVAL";

    return {
      runId,
      status,
      recommendationId: recommendation.id,
      quoteId: quote.id,
      approvalCount: approvals.length,
      autoReleaseEligible: autoRelease,
    };
}

// ───────────────────────────── helpers ─────────────────────────────────────

function emptyPlan(requestedQty: number): FulfillmentPlan {
  return {
    requestedQty,
    allocatedQty: 0,
    shortfall: requestedQty,
    canFulfill: false,
    isSplit: false,
    allocations: [],
    readyDate: null,
    meetsDeadline: null,
    notes: ["Not evaluated — the candidate failed a hard compatibility requirement."],
  };
}

export function gapsThatBlock(
  requirements: RequirementView[],
  incumbent: ProductView | null,
  quantity: number | null,
  unresolvedSkus: string[],
  resolvedSkuCount = 1,
): string[] {
  const gaps: string[] = [];
  // This build quotes one line per case. Collapsing "2 × PX-440 and 3 × AX-220"
  // into five of the first part is a silent mis-quote, so it stops instead.
  if (resolvedSkuCount > 1) {
    gaps.push("multiple line items");
  }
  if (!quantity || quantity <= 0) gaps.push("quantity");
  if (!incumbent) {
    // Without a named part, there must be enough technical detail to select on.
    const technical = requirements.filter(
      (r) =>
        r.kind === "EXPLICIT" &&
        ["max_fluid_temp_c", "min_flow_m3h", "min_head_m", "max_pressure_bar", "max_viscosity_cp"].includes(r.key),
    );
    if (technical.length < 2) gaps.push("duty conditions (no part number and too little technical detail to select on)");
  }
  if (unresolvedSkus.length > 0 && !incumbent) {
    gaps.push(`part number${unresolvedSkus.length > 1 ? "s" : ""} ${unresolvedSkus.join(", ")} (not in the catalog)`);
  }
  return gaps;
}

/**
 * Assemble the set of products that will get a full, recorded compatibility
 * check.
 *
 * Order of precedence: the part the customer named, then every curated
 * engineering replacement link, then the closest items from a screen of the
 * whole relevant catalog. The screen is what stops the candidate set being
 * an accident of alphabetical order.
 */
export async function buildCandidates(
  bus: ToolBus,
  prisma: PrismaClient,
  incumbent: ProductView | null,
  requirements: RequirementView[],
): Promise<SubstituteCandidate[]> {
  const categories = incumbent
    ? [incumbent.categoryCode, ...relatedCategories(incumbent.categoryCode)]
    : inferCategories(requirements);

  const curated = incumbent
    ? await findSubstitutes(bus, { productId: incumbent.id, categoryCodes: [], limit: 0 })
    : [];

  const chosen: SubstituteCandidate[] = [];
  if (incumbent) {
    chosen.push({ product: incumbent, linkKind: null, linkNote: null, requiresSku: null, adapter: null });
  }
  chosen.push(...curated);

  const excluded = chosen.map((c) => c.product.id);
  const { shortlist } = await screenCandidates(bus, {
    categoryCodes: categories,
    excludeProductIds: excluded,
    requirements,
    shortlistSize: incumbent ? 8 : 10,
  });

  if (shortlist.length > 0) {
    const rows = await prisma.product.findMany({
      where: { id: { in: shortlist } },
      include: PRODUCT_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, toProductView(r)]));
    for (const id of shortlist) {
      const product = byId.get(id);
      if (!product) continue;
      chosen.push({ product, linkKind: null, linkNote: null, requiresSku: null, adapter: null });
    }
  }

  return chosen;
}

function relatedCategories(code: string): string[] {
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

export function inferCategories(requirements: RequirementView[]): string[] {
  const temp = requirements.find((r) => r.key === "max_fluid_temp_c")?.numValue ?? 0;
  const viscosity = requirements.find((r) => r.key === "max_viscosity_cp")?.numValue ?? 0;
  const sealless = /sealless/i.test(
    requirements.find((r) => r.key === "seal_type")?.textValue ?? "",
  );
  if (viscosity >= 1000) return ["PD-GEAR", "PD-DIA"];
  if (sealless) return ["MD-SEAL"];
  if (temp > 120) return ["CP-HT", "MD-SEAL"];
  return ["CP-STD", "VI-PUMP", "CP-HT"];
}

/**
 * Evaluate a candidate, applying an adapter kit's connection override where
 * a curated link says one is required.
 *
 * Only the connection dimension is overridden, and the override is recorded
 * as a warning rather than a silent pass — fitting an adapter changes the
 * installation and an engineer should see that it was assumed.
 */
export async function evaluateWithAdapter(
  bus: ToolBus,
  prisma: PrismaClient,
  source: SubstituteCandidate,
  requirements: RequirementView[],
): Promise<CompatibilityVerdict> {
  const verdict = await checkCompatibility(bus, {
    productId: source.product.id,
    requirements,
  });

  const adapter = source.adapter;
  if (!adapter) return verdict;

  const provides = adapter.specs.provides_connection?.textValue;
  if (!provides) return verdict;

  const connectionCheck = verdict.checks.find((c) => c.dimension === "connection");
  if (!connectionCheck || connectionCheck.result !== "FAIL") return verdict;

  const required = requirements.find((r) => r.key === "inlet_connection")?.textValue ?? "";
  if (!required) return verdict;

  // An adapter may only rescue a connection failure if the whole assembly
  // stands up. Three things have to hold, and an earlier version checked only
  // the first — and checked it with a raw substring match, so "DN50" matched
  // "DN500".
  //
  //   1. it presents the size the site actually has;
  //   2. it mates with this pump's connection;
  //   3. its own pressure and temperature ratings clear the duty — the
  //      assembly is only as strong as its weakest part, and the HARD rules
  //      were evaluated against the pump, not the adapter.
  const pumpConnection = source.product.specs.inlet_connection?.textValue ?? "";
  const presentsRequired = containsTokens(provides, required);
  const matesWithPump = pumpConnection
    ? provides
        .split(/\s+/)
        .some((token: string) => token.length > 2 && containsTokens(pumpConnection, token))
    : false;

  const dutyTemp = requirements.find((r) => r.key === "max_fluid_temp_c");
  const dutyPressure = requirements.find((r) => r.key === "max_pressure_bar");
  const adapterTemp = adapter.specs.max_fluid_temp_c?.numValue ?? null;
  const adapterPressure = adapter.specs.max_pressure_bar?.numValue ?? null;

  const ratingShortfalls: string[] = [];
  if (dutyTemp?.kind === "EXPLICIT" && dutyTemp.numValue != null) {
    if (adapterTemp == null) {
      ratingShortfalls.push(`${adapter.sku} does not publish a temperature rating`);
    } else if (adapterTemp < dutyTemp.numValue) {
      ratingShortfalls.push(
        `${adapter.sku} is rated to ${adapterTemp} °C against a ${dutyTemp.numValue} °C duty`,
      );
    }
  }
  if (dutyPressure?.kind === "EXPLICIT" && dutyPressure.numValue != null) {
    if (adapterPressure == null) {
      ratingShortfalls.push(`${adapter.sku} does not publish a pressure rating`);
    } else if (adapterPressure < dutyPressure.numValue) {
      ratingShortfalls.push(
        `${adapter.sku} is rated to ${adapterPressure} bar against a ${dutyPressure.numValue} bar duty`,
      );
    }
  }

  if (!presentsRequired || !matesWithPump || ratingShortfalls.length > 0) {
    // The adapter does not rescue this one. Leave the hard failure standing
    // and say why the accessory was not enough.
    connectionCheck.detail = `${connectionCheck.detail} The ${adapter.sku} adapter kit was considered and does not resolve it: ${
      ratingShortfalls.length > 0
        ? ratingShortfalls.join("; ")
        : !presentsRequired
          ? `it presents ${provides}, not ${required}`
          : `it does not mate with the ${source.product.sku}'s ${pumpConnection}`
    }.`;
    return verdict;
  }

  await applyAdapter(bus, {
    productSku: source.product.sku,
    adapterSku: adapter.sku,
    requiredConnection: required,
    providedConnection: connectionCheck.actual,
    adapterPressureBar: adapterPressure,
    adapterTempC: adapterTemp,
    dutyPressureBar: dutyPressure?.numValue ?? null,
    dutyTempC: dutyTemp?.numValue ?? null,
  });

  connectionCheck.result = "PASS";
  connectionCheck.detail = `${source.product.sku} presents ${connectionCheck.actual}, which does not match ${connectionCheck.requirement} directly. The ${adapter.sku} adapter kit adapts it to ${provides}, and the kit's own ratings (${adapterPressure ?? "—"} bar, ${adapterTemp ?? "—"} °C) clear this duty.`;

  const warning = {
    dimension: "accessory",
    label: "Adapter required",
    result: "WARNING" as const,
    severity: "SOFT" as const,
    requirement: `direct fit to ${required}`,
    actual: `fits via ${adapter.sku}`,
    detail: `This selection only lands on the existing pipework with ${adapter.sku} adapter kits fitted at suction and discharge. That adds installed length and raises suction velocity — confirm against the site before committing.`,
    ruleCode: "ADAPTER",
  };
  verdict.checks.push(warning);
  // Recompute from the patched check set — the original score was zero because
  // the connection had failed hard before the adapter was considered.
  recomputeVerdict(verdict, 10);

  void prisma;
  return verdict;
}

export async function persistRequirements(
  prisma: PrismaClient,
  requestId: string,
  requirements: RequirementView[],
) {
  const seen = new Set<string>();
  for (const requirement of requirements) {
    if (seen.has(requirement.key)) continue;
    seen.add(requirement.key);
    await prisma.requirement.create({
      data: {
        requestId,
        key: requirement.key,
        label: requirement.label,
        kind: requirement.kind,
        operator: requirement.operator,
        numValue: requirement.numValue,
        textValue: requirement.textValue,
        unit: requirement.unit,
        sourceQuote: requirement.sourceQuote,
        confidence: requirement.confidence,
        note: requirement.note,
      },
    });
  }
}

export async function persistItems(
  prisma: PrismaClient,
  requestId: string,
  items: { rawText: string; sku: string | null; quantity: number | null; lineNumber: number }[],
  db: PrismaClient,
) {
  for (const item of items) {
    const product = item.sku ? await db.product.findUnique({ where: { sku: item.sku } }) : null;
    await prisma.requestItem.create({
      data: {
        requestId,
        rawText: item.rawText,
        productId: product?.id ?? null,
        quantity: item.quantity ?? 0,
        lineNumber: item.lineNumber,
      },
    });
  }
}

/** Attach the run's evidence to the recommendation so the UI can read it back. */
export async function linkEvidenceToRecommendation(
  prisma: PrismaClient,
  runId: string,
  recommendationId: string,
) {
  await prisma.evidence.updateMany({
    where: { toolCall: { runId } },
    data: { recommendationId },
  });
}

function buildFacts(
  winner: RankedCandidate,
  evaluation: { verdict: CompatibilityVerdict; price: PricedLine | null },
  freightCents: number,
  totals: { subtotalCents: number; totalCents: number; effectiveDiscountPct: number },
  requiredBy: Date | null,
): string[] {
  const facts: string[] = [];
  const passed = evaluation.verdict.checks.filter((c) => c.result === "PASS");

  facts.push(
    `${winner.sku} was checked against ${evaluation.verdict.checks.length} requirement dimensions and passes ${passed.length} of them${
      passed.length > 0 ? `, including ${passed.slice(0, 3).map((c) => c.label.toLowerCase()).join(", ")}` : ""
    }.`,
  );

  if (winner.plan.isSplit) {
    facts.push(
      `No single location holds ${winner.plan.requestedQty} units, so the order draws ${winner.plan.allocations
        .map((a) => `${a.quantity} from ${a.warehouseName}`)
        .join(" and ")}.`,
    );
  } else if (winner.plan.allocations[0]) {
    facts.push(
      `All ${winner.plan.requestedQty} units are available from ${winner.plan.allocations[0].warehouseName}.`,
    );
  }

  if (winner.plan.readyDate) {
    facts.push(
      `Ship-ready ${winner.plan.readyDate.toISOString().slice(0, 10)}${
        requiredBy
          ? winner.plan.meetsDeadline
            ? `, inside the requested date of ${requiredBy.toISOString().slice(0, 10)}`
            : `, which is after the requested date of ${requiredBy.toISOString().slice(0, 10)}`
          : ""
      }.`,
    );
  }

  if (evaluation.price) {
    facts.push(
      `Priced at ${formatCurrency(evaluation.price.unitPriceCents)} per unit — ${evaluation.price.priceSourceDetail.toLowerCase()}.`,
    );
  }
  facts.push(
    `Quote total ${formatCurrency(totals.totalCents)} including ${formatCurrency(freightCents)} freight.`,
  );

  if (winner.linkNote) facts.push(winner.linkNote);
  return facts;
}

interface CreateQuoteArgs {
  requestId: string;
  customerId: string;
  siteId: string;
  lines: { product: ProductView; price: PricedLine; allocations: Allocation[] }[];
  totals: ReturnType<typeof computeQuoteTotals>;
  freightService: "GROUND" | "EXPEDITED" | "AIR";
  margin: { marginCents: number; marginPct: number };
  estimatedDelivery: Date | null;
  paymentTerms: number;
  pendingApproval: boolean;
  asOf: Date;
}

const QUOTE_NUMBER_SEED = 1040;

/**
 * Next quote number.
 *
 * Derived from the highest number already issued, never from a row count. A
 * count breaks the moment anything is deleted — and re-running a case deletes
 * its own quote first, which made "Re-run analysis" mint a number that already
 * belonged to another case and hard-fail on the unique constraint.
 */
async function nextQuoteNumber(prisma: PrismaClient, year: number): Promise<string> {
  const latest = await prisma.quote.findFirst({
    where: { quoteNumber: { startsWith: `QT-${year}-` } },
    orderBy: { quoteNumber: "desc" },
    select: { quoteNumber: true },
  });
  const highest = latest ? Number(latest.quoteNumber.split("-")[2]) : QUOTE_NUMBER_SEED - 1;
  const next = Number.isFinite(highest) ? highest + 1 : QUOTE_NUMBER_SEED;
  return `QT-${year}-${String(Math.max(next, QUOTE_NUMBER_SEED)).padStart(4, "0")}`;
}

async function createQuote(prisma: PrismaClient, args: CreateQuoteArgs) {
  const year = args.asOf.getUTCFullYear();
  const quoteNumber = await nextQuoteNumber(prisma, year);
  const validUntil = new Date(args.asOf.getTime() + QUOTE_VALID_DAYS * 86400000);

  return prisma.quote.create({
    data: {
      quoteNumber,
      requestId: args.requestId,
      customerId: args.customerId,
      siteId: args.siteId,
      status: args.pendingApproval ? "PENDING_APPROVAL" : "DRAFT",
      subtotal: centsToNumber(args.totals.subtotalCents),
      discountTotal: centsToNumber(args.totals.discountTotalCents),
      freightCost: centsToNumber(args.totals.freightCents),
      freightService: args.freightService,
      total: centsToNumber(args.totals.totalCents),
      costTotal: centsToNumber(args.totals.costTotalCents),
      marginAmount: centsToNumber(args.margin.marginCents),
      marginPct: args.margin.marginPct,
      validUntil,
      estimatedDelivery: args.estimatedDelivery,
      terms: `Net ${args.paymentTerms} days. Prices in USD, ex-works our distribution centre with freight as quoted. Delivery estimate assumes order release within the validity period.`,
      items: {
        create: args.lines.map((line, index) => ({
          productId: line.product.id,
          lineNumber: index + 1,
          description: line.product.name,
          quantity: line.price.quantity,
          listPrice: centsToNumber(line.price.listPriceCents),
          unitPrice: centsToNumber(line.price.unitPriceCents),
          discountPct: line.price.discountPct,
          priceSource: line.price.priceSource,
          extended: centsToNumber(line.price.extendedCents),
          unitCost: centsToNumber(line.price.unitCostCents),
          leadTimeDays: line.product.leadTimeDays,
          allocations: line.allocations.map((a) => ({
            warehouseCode: a.warehouseCode,
            warehouseName: a.warehouseName,
            quantity: a.quantity,
            source: a.source,
            readyDate: a.readyDate.toISOString(),
            note: a.note ?? null,
          })) as object[],
        })),
      },
    },
  });
}

export async function finishRun(
  prisma: PrismaClient,
  runId: string,
  bus: ToolBus,
  startedAt: number,
  status: "COMPLETED" | "HALTED_FOR_APPROVAL",
) {
  await prisma.agentRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
      trace: bus.calls as object[],
    },
  });
}

export async function finishAsInformationRequired(
  prisma: PrismaClient,
  bus: ToolBus,
  runId: string,
  requestId: string,
  provider: ReturnType<typeof getAIProvider>,
  account: { customerName: string | null; contactName: string | null },
  openQuestions: string[],
  gaps: string[],
  subject: string,
  startedAt: number,
): Promise<RunOutcome> {
  const questions = [...new Set([...openQuestions, ...gaps.map(gapToQuestion)])];

  const summary = await provider.summarizeRecommendation({
    outcome: "INFORMATION_REQUIRED",
    requestedSku: null,
    selectedSku: null,
    selectedName: null,
    quantity: null,
    facts: [],
    rejected: [],
    warnings: [],
    openQuestions: questions,
  });

  const recommendation = await prisma.recommendation.create({
    data: {
      requestId,
      outcome: "INFORMATION_REQUIRED",
      headline: summary.headline,
      rationale: summary.rationale,
      risk: "MEDIUM",
    },
  });

  const draft = await provider.draftCustomerResponse({
    customerName: account.customerName ?? "there",
    contactName: account.contactName,
    outcome: "INFORMATION_REQUIRED",
    requestedSku: null,
    selectedSku: null,
    selectedName: null,
    quantity: null,
    commercial: null,
    availability: [],
    technicalNotes: [],
    openQuestions: questions,
    quoteNumber: null,
    senderName: await prisma.salesRequest
      .findUnique({ where: { id: requestId }, include: { owner: true } })
      .then((r) => r?.owner?.name ?? "Technical Sales"),
  });

  await prisma.customerResponse.create({
    data: { requestId, subject: draft.subject || `Re: ${subject}`, body: draft.body },
  });

  await prisma.salesRequest.update({
    where: { id: requestId },
    data: { status: "NEEDS_REVIEW", risk: "MEDIUM", blockedReason: null },
  });
  await finishRun(prisma, runId, bus, startedAt, "COMPLETED");
  await recordAudit(prisma, requestId, {
    type: "INFORMATION_REQUESTED",
    actor: "Sales Engine",
    summary: `Stopped before recommending: ${gaps.join(", ")} not determinable from the request.`,
    detail: { questions },
  });

  return { runId, status: "NEEDS_REVIEW", recommendationId: recommendation.id, quoteId: null, approvalCount: 0 };
}

/**
 * Condense "every candidate failed" into one customer-readable line per
 * dimension, naming the closest the catalog can actually get to.
 */
function summariseBlockingGaps(ranked: RankedCandidate[]): string[] {
  const byDimension = new Map<string, { label: string; requirement: string; actuals: Set<string> }>();

  for (const candidate of ranked) {
    for (const failure of candidate.verdict.hardFailures) {
      const entry = byDimension.get(failure.dimension) ?? {
        label: failure.label,
        requirement: failure.requirement,
        actuals: new Set<string>(),
      };
      entry.actuals.add(failure.actual);
      byDimension.set(failure.dimension, entry);
    }
  }

  // Only report a dimension every evaluated candidate failed — anything less
  // is not what blocked the enquiry.
  const total = ranked.length;
  const lines: string[] = [];
  for (const [dimension, entry] of byDimension) {
    const failingCount = ranked.filter((c) =>
      c.verdict.hardFailures.some((f) => f.dimension === dimension),
    ).length;
    if (failingCount < total) continue;
    lines.push(
      `${entry.label}: the duty needs ${entry.requirement}, and nothing in the range we can offer for this service goes beyond ${[...entry.actuals].slice(0, 3).join(" / ")}.`,
    );
  }

  if (lines.length === 0) {
    // No single dimension blocked everything — report the most common ones.
    const counts = [...byDimension.entries()].sort(
      (a, b) => b[1].actuals.size - a[1].actuals.size,
    );
    for (const [, entry] of counts.slice(0, 3)) {
      lines.push(`${entry.label}: the duty needs ${entry.requirement}, which no available selection meets alongside the other requirements.`);
    }
  }
  return lines;
}

export function gapToQuestion(gap: string): string {
  if (gap === "quantity") return "How many units are required?";
  if (gap === "multiple line items")
    return "This enquiry covers more than one part number. Could you send each line as a separate request? This system quotes one line at a time, and I would rather ask than quote the wrong quantity against the wrong part.";
  if (gap.startsWith("duty conditions"))
    return "What are the duty conditions — flow, head, fluid and operating temperature? Without a part number we cannot select on the description alone.";
  if (gap.startsWith("part number"))
    return `Could you confirm the part number? ${gap.replace("part number", "The reference").replace("part numbers", "The references")} did not match anything in our catalogue.`;
  return `Could you confirm ${gap}?`;
}

export async function finishAsNoViableOption(
  prisma: PrismaClient,
  bus: ToolBus,
  runId: string,
  requestId: string,
  provider: ReturnType<typeof getAIProvider>,
  incumbent: ProductView | null,
  ranked: RankedCandidate[],
  subject: string,
  account: { customerName: string | null; contactName: string | null },
  startedAt: number,
): Promise<RunOutcome> {
  const rejected = ranked.map((r) => ({ sku: r.sku, reason: r.reason }));
  const owner = await prisma.salesRequest
    .findUnique({ where: { id: requestId }, include: { owner: true } })
    .then((r) => r?.owner?.name ?? "Technical Sales");

  // The customer gets one line per blocking dimension, not one per candidate
  // per rule. Internal rule explanations stay internal.
  const hardReasons = summariseBlockingGaps(ranked);

  const summary = await provider.summarizeRecommendation({
    outcome: "NO_VIABLE_OPTION",
    requestedSku: incumbent?.sku ?? null,
    selectedSku: null,
    selectedName: null,
    quantity: null,
    facts: incumbent
      ? [`The requested ${incumbent.sku} does not meet the stated duty, and no catalog alternative does either.`]
      : ["No catalog product meets the stated duty."],
    rejected,
    warnings: [],
    openQuestions: [],
  });

  const recommendation = await prisma.recommendation.create({
    data: {
      requestId,
      outcome: "NO_VIABLE_OPTION",
      headline: summary.headline,
      rationale: summary.rationale,
      risk: "BLOCKED",
      candidates: {
        create: ranked.map((candidate) => ({
          productId: candidate.productId,
          verdict: "REJECTED",
          rank: candidate.rank,
          reason: candidate.reason,
          score: 0,
          checks: {
            create: candidate.verdict.checks.map((check) => ({
              dimension: check.dimension,
              label: check.label,
              result: check.result,
              severity: check.severity,
              requirement: check.requirement,
              actual: check.actual,
              detail: check.detail,
              ruleCode: check.ruleCode,
            })),
          },
        })),
      },
    },
  });

  await linkEvidenceToRecommendation(prisma, runId, recommendation.id);

  const draft = await provider.draftCustomerResponse({
    customerName: account.customerName ?? "there",
    contactName: account.contactName,
    outcome: "NO_VIABLE_OPTION",
    requestedSku: incumbent?.sku ?? null,
    selectedSku: null,
    selectedName: null,
    quantity: null,
    commercial: null,
    availability: [],
    technicalNotes: hardReasons,
    openQuestions: [],
    quoteNumber: null,
    senderName: owner,
  });

  await prisma.customerResponse.create({
    data: { requestId, subject: draft.subject || `Re: ${subject}`, body: draft.body },
  });

  await prisma.salesRequest.update({
    where: { id: requestId },
    data: {
      status: "BLOCKED",
      risk: "BLOCKED",
      blockedReason:
        "No catalog product satisfies every hard requirement. The engine will not propose a near-miss on a safety-relevant dimension.",
    },
  });
  await finishRun(prisma, runId, bus, startedAt, "COMPLETED");
  await recordAudit(prisma, requestId, {
    type: "RECOMMENDATION_BLOCKED",
    actor: "Sales Engine",
    summary: summary.headline,
    detail: { rejected: rejected.slice(0, 8) },
  });

  return { runId, status: "BLOCKED", recommendationId: recommendation.id, quoteId: null, approvalCount: 0 };
}

/**
 * Generate the customer-facing draft.
 *
 * Reads only from the persisted quote and recommendation, and passes the
 * provider pre-formatted, customer-safe figures. Cost and margin are never in
 * scope here — there is no code path by which they could reach the draft.
 */
export async function generateCustomerResponse(
  prisma: PrismaClient,
  requestId: string,
  asOf: Date = new Date(),
): Promise<{ subject: string; body: string } | null> {
  const provider = getAIProvider();
  const request = await prisma.salesRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      customer: true,
      contact: true,
      owner: true,
      items: { include: { product: true }, orderBy: { lineNumber: "asc" } },
      recommendations: { orderBy: { createdAt: "desc" }, take: 1, include: { candidates: { include: { checks: true }, orderBy: { rank: "asc" } } } },
      quotes: { orderBy: { createdAt: "desc" }, take: 1, include: { items: { include: { product: true } } } },
    },
  });

  const recommendation = request.recommendations[0];
  const quote = request.quotes[0];
  if (!recommendation) return null;

  const winner = recommendation.candidates.find((c) => c.verdict === "RECOMMENDED");
  const line = quote?.items.find((i) => i.productId === recommendation.productId) ?? quote?.items[0];

  const availability: string[] = [];
  if (line) {
    const allocations = line.allocations as {
      warehouseName: string;
      quantity: number;
      readyDate: string;
      source: string;
    }[];
    for (const allocation of allocations) {
      const units = `${allocation.quantity} unit${allocation.quantity === 1 ? "" : "s"}`;
      const date = allocation.readyDate.slice(0, 10);
      // Say what each source actually is. Describing an unreceived purchase
      // order, or a part that has not been built, as stock in our warehouse is
      // the sort of thing a customer discovers on the delivery date.
      if (allocation.source === "STOCK") {
        availability.push(`${units} in stock at our ${allocation.warehouseName}, ready to ship ${date}`);
      } else if (allocation.source === "INCOMING") {
        availability.push(
          `${units} against a confirmed inbound delivery into our ${allocation.warehouseName}, ready to ship ${date} once received`,
        );
      } else {
        availability.push(`${units} built to order, ready to ship ${date}`);
      }
    }
    if (allocations.length > 1) {
      availability.push(
        "These arrive as separate deliveries — the later date above is the one to plan around.",
      );
    }
  }

  // Customer-safe phrasing only. `check.detail` carries the internal rule
  // explanation ("beyond the limit the pump stalls or the motor overloads"),
  // which is written for an application engineer, not for the buyer.
  const technicalNotes = (winner?.checks ?? [])
    .filter((c) => c.result === "WARNING" || c.result === "UNKNOWN")
    .map((c) =>
      c.result === "UNKNOWN"
        ? `${c.label}: we have assumed ${c.requirement}. Please confirm this against the installation.`
        : `${c.label}: the proposed part offers ${c.actual} against ${c.requirement} on the existing installation. Worth confirming before the order is placed.`,
    );

  const requirements = await prisma.requirement.findMany({ where: { requestId } });
  const openQuestions = requirements
    .filter((r) => r.kind === "AMBIGUOUS")
    .map((r) => r.note ?? `Please confirm ${r.label.toLowerCase()}.`);

  const draft = await provider.draftCustomerResponse({
    customerName: request.customer?.name ?? "there",
    contactName: request.contact?.name ?? null,
    outcome: recommendation.outcome,
    requestedSku: request.items[0]?.product?.sku ?? null,
    selectedSku: line?.product.sku ?? null,
    selectedName: line?.product.name ?? null,
    quantity: line?.quantity ?? recommendation.quantity,
    commercial: quote
      ? {
          unitPrice: formatCurrency(Math.round(Number(line?.unitPrice ?? 0) * 100)),
          extended: formatCurrency(Math.round(Number(line?.extended ?? 0) * 100)),
          freight: formatCurrency(Math.round(Number(quote.freightCost) * 100)),
          total: formatCurrency(Math.round(Number(quote.total) * 100)),
          validUntil: quote.validUntil.toISOString().slice(0, 10),
          estimatedDelivery: quote.estimatedDelivery?.toISOString().slice(0, 10) ?? null,
        }
      : null,
    availability,
    technicalNotes,
    openQuestions,
    quoteNumber: quote?.quoteNumber ?? null,
    senderName: request.owner?.name ?? "Technical Sales",
  });

  const existing = await prisma.customerResponse.findFirst({
    where: { requestId },
    orderBy: { version: "desc" },
  });

  await prisma.customerResponse.create({
    data: {
      requestId,
      subject: draft.subject,
      body: draft.body,
      version: (existing?.version ?? 0) + 1,
    },
  });

  await recordAudit(prisma, requestId, {
    type: "RESPONSE_GENERATED",
    actor: "Sales Engine",
    summary: "Customer-facing response drafted from the approved quote.",
  });

  void asOf;
  return draft;
}
