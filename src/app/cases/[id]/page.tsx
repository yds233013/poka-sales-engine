import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  Building2,
  CalendarClock,
  Clock,
  FileText,
  History,
  Mail,
  MapPin,
  ScanSearch,
  ShieldCheck,
  Truck,
  UserRound,
  Wallet,
  BookOpenCheck,
  ChevronRight,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getCase, getPolicyThresholds, getUsers } from "@/lib/queries";
import { executionModes } from "@/lib/ai/capability";
import { leaksInternalLanguage } from "@/lib/agent/adaptive/outcome";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader, Pill, EmptyState, StatusBadge, RISK_TONE, statusLabel } from "@/components/ui/primitives";
import { AuditPanel } from "@/components/case/panels";
import { RequestSection } from "@/components/workspace/request-section";
import type { ApprovalView } from "@/components/case/approval-card";
import { ApprovalListClient } from "@/components/case/approval-list";
import { ResponseEditor } from "@/components/case/response-editor";
import { ActingUserProvider, ActingUserPicker } from "@/components/acting-user";
import { CaseChrome } from "@/components/case/case-chrome";
import { RunModeBadge } from "@/components/run-mode";
import { DecisionSummary, type DecisionSummaryData } from "@/components/workspace/decision-summary";
import { ValidationMatrix, type MatrixCandidate, type Citation } from "@/components/workspace/validation-matrix";
import { EvidenceList, type EvidenceGroup } from "@/components/workspace/evidence-list";
import { FulfillmentPlan, FulfillmentFooter, type FulfillmentLine } from "@/components/workspace/fulfillment-plan";
import { Commercials } from "@/components/workspace/commercials";
import { ActivityTimeline } from "@/components/workspace/activity-timeline";
import { SectionNav } from "@/components/workspace/section-nav";
import { age, dayMonth, duration, money, shortDate, titleCase } from "@/lib/format";
import { APPROVAL_KIND_LABEL, TERMINATION_LABEL } from "@/lib/status";

export const dynamic = "force-dynamic";

/** How many candidates the comparison matrix shows side by side. */
const MATRIX_COLUMNS = 5;

/** Approvals that are about the money rather than the part. */
const COMMERCIAL_APPROVALS = new Set(["DISCOUNT_THRESHOLD", "MARGIN_FLOOR", "LARGE_QUOTE_VALUE", "EXPEDITED_FREIGHT"]);

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [request, users, thresholds, warehouses] = await Promise.all([
    getCase(id),
    getUsers(),
    getPolicyThresholds(),
    prisma.warehouse.findMany({ select: { code: true, name: true, city: true } }),
  ]);
  if (!request) notFound();

  const adaptiveMode = executionModes().find((m) => m.mode === "ADAPTIVE_AGENT")!;
  const recommendation = request.recommendations[0] ?? null;
  const quote = request.quotes[0] ?? null;
  const run = request.runs[0] ?? null;
  const response = request.responses[0] ?? null;
  const candidates = recommendation?.candidates ?? [];
  const winner = candidates.find((c) => c.verdict === "RECOMMENDED") ?? null;
  const requestedSku = request.items.find((i) => i.product)?.product?.sku ?? null;
  const requested = requestedSku ? candidates.find((c) => c.product.sku === requestedSku) ?? null : null;
  const blockingApprovals = request.approvals.filter((a) => a.status === "PENDING" || a.status === "CHANGES_REQUESTED");
  const city = new Map(warehouses.map((w) => [w.code, w.city]));

  // ── Citations: every figure the compatibility engine compared resolves to
  //    the data-sheet section it was read from. Claims are keyed by part and
  //    dimension ("PX-440 fluid temperature: 205 °C.").
  const evidence = recommendation?.evidence ?? [];
  const citationFor = (sku: string, label: string): Citation | undefined => {
    const prefix = `${sku} ${label.toLowerCase()}`;
    const hit = evidence.find((e) => e.claim.toLowerCase().startsWith(prefix.toLowerCase()) && e.section);
    return hit?.section
      ? { docNumber: hit.section.document.docNumber, anchor: hit.section.anchor, claim: hit.claim }
      : undefined;
  };

  const firstFailure = (checks: { result: string; severity: string; label: string; actual: string; requirement: string }[]) => {
    const fail = checks.find((c) => c.result === "FAIL" && c.severity === "HARD") ?? checks.find((c) => c.result === "FAIL");
    return fail ? `${fail.label} ${fail.actual} — needs ${fail.requirement}` : null;
  };

  // ── Comparison matrix: the winner, the part the customer asked for, then
  //    the nearest alternatives in rank order.
  const ordered = [
    ...(winner ? [winner] : []),
    ...(requested && requested.id !== winner?.id ? [requested] : []),
    ...candidates.filter((c) => c.id !== winner?.id && c.id !== requested?.id),
  ];
  const matrixColumns: MatrixCandidate[] = ordered.slice(0, MATRIX_COLUMNS).map((c) => ({
    sku: c.product.sku,
    name: c.product.name,
    verdict: c.verdict,
    role: c.id === winner?.id ? "recommended" : c.id === requested?.id ? "requested" : "alternative",
    checks: c.checks.map((k) => ({
      dimension: k.dimension,
      label: k.label,
      result: k.result,
      severity: k.severity,
      requirement: k.requirement,
      actual: k.actual,
      detail: k.detail,
    })),
    citations: Object.fromEntries(c.checks.map((k) => [k.dimension, citationFor(c.product.sku, k.label)])),
  }));
  const furtherRejected = ordered.slice(MATRIX_COLUMNS).map((c) => ({
    sku: c.product.sku,
    name: c.product.name,
    reason: firstFailure(c.checks) ?? c.reason.replace(/^Rejected: /, ""),
  }));

  // ── Evidence, grouped by the parts that matter to the decision.
  const evidenceGroups: EvidenceGroup[] = [winner, requested && requested.id !== winner?.id ? requested : null]
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => {
      const seen = new Set<string>();
      const items = evidence
        .filter((e) => e.claim.startsWith(`${c.product.sku} `) && e.section)
        .filter((e) => (seen.has(e.claim) ? false : (seen.add(e.claim), true)))
        .map((e) => ({
          id: e.id,
          claim: e.claim,
          docNumber: e.section!.document.docNumber,
          docTitle: e.section!.document.title,
          anchor: e.section!.anchor,
          heading: e.section!.heading,
          excerpt: e.section!.body.length > 700 ? `${e.section!.body.slice(0, 700)}…` : e.section!.body,
        }));
      return {
        sku: c.product.sku,
        role: c.id === winner?.id ? "Recommended — the values it was accepted on" : "Requested — the values it was ruled out on",
        items,
      };
    });
  const citedCount = evidenceGroups.reduce((n, g) => n + g.items.length, 0);

  // ── Fulfillment
  const fulfillmentLines: FulfillmentLine[] =
    quote?.items.map((item) => ({
      sku: item.product.sku,
      quantity: item.quantity,
      sources: (item.allocations as unknown as { warehouseCode: string; warehouseName: string; quantity: number; source: string; readyDate: string }[]).map((a) => ({
        warehouseCode: a.warehouseCode,
        location: city.get(a.warehouseCode) ?? a.warehouseName,
        quantity: a.quantity,
        source: a.source,
        readyDate: dayMonth(a.readyDate),
      })),
    })) ?? [];
  const onTime =
    quote?.estimatedDelivery && request.requiredBy ? quote.estimatedDelivery.getTime() <= request.requiredBy.getTime() : null;

  // ── Decision summary, in whichever shape this case's outcome takes.
  let decision: DecisionSummaryData | null = null;
  if (recommendation && winner && quote) {
    const sources = fulfillmentLines[0]?.sources ?? [];
    const released = quote.status === "APPROVED" || quote.status === "SENT";
    decision = {
      kind: "product",
      recommendedSku: winner.product.sku,
      recommendedName: winner.product.name,
      replacingSku: requested && requested.id !== winner.id ? requested.product.sku : null,
      replacingReason: requested && requested.id !== winner.id ? firstFailure(requested.checks) : null,
      quantity: fulfillmentLines[0]?.quantity ?? recommendation.quantity ?? 0,
      fulfillment: {
        label: sources.length > 1 ? sources.map((s) => `${s.quantity} ${s.location}`).join(" + ") : sources[0] ? `${sources[0].quantity} from ${sources[0].location}` : "—",
        detail: [
          quote.estimatedDelivery ? `Delivers ${shortDate(quote.estimatedDelivery)}` : null,
          onTime === null ? null : onTime ? "on time" : "late",
        ]
          .filter(Boolean)
          .join(" · "),
        onTime,
      },
      total: money(quote.total),
      totalNote: `${quote.quoteNumber} · incl. ${money(quote.freightCost)} freight`,
      gate:
        blockingApprovals.length > 0
          ? {
              state: "blocked",
              label: "Release blocked",
              detail: `${blockingApprovals.length} of ${request.approvals.length} approval${request.approvals.length === 1 ? "" : "s"} to decide before this can go out`,
            }
          : released
            ? { state: "released", label: "Released", detail: "Approved and released to the customer response" }
            : request.approvals.length > 0
              ? { state: "approved", label: "Approved — ready to release", detail: `All ${request.approvals.length} approvals decided` }
              : { state: "clear", label: "Inside policy", detail: "No approval needed on this deal" },
    };
  } else if (recommendation?.outcome === "NO_VIABLE_OPTION") {
    const closest = candidates[0];
    decision = {
      kind: "none",
      headline: recommendation.headline,
      reason: request.blockedReason ?? recommendation.rationale,
      closest: closest ? `${closest.product.sku} — ${firstFailure(closest.checks) ?? closest.reason}` : null,
    };
  } else if (recommendation?.outcome === "INFORMATION_REQUIRED") {
    const questions = request.requirements
      .filter((r) => r.kind === "MISSING" || r.kind === "AMBIGUOUS")
      .map((r) => r.note ?? `Confirm ${r.label.toLowerCase()}.`);
    decision = { kind: "questions", headline: recommendation.headline, questions: questions.length ? questions : [recommendation.rationale] };
  } else if (recommendation?.outcome === "INFORMATION_PROVIDED") {
    const cited = run?.toolCalls.find((t) => t.toolName === "respond_with_information")?.input as { evidenceRefs?: string[] } | undefined;
    decision = { kind: "answered", headline: recommendation.headline, answer: recommendation.rationale, citations: cited?.evidenceRefs ?? [] };
  }

  // ── Customer-safety of the drafted response, checked against this case's
  //    own figures rather than asserted.
  const responseChecks = response
    ? (() => {
        const figures = quote ? [money(quote.costTotal), money(quote.marginAmount)] : [];
        const leakedFigure = figures.find((f) => response.body.includes(f));
        const leakedWords = leaksInternalLanguage(response.body) || leaksInternalLanguage(response.subject);
        const checks = [
          {
            label: leakedWords || leakedFigure ? "Internal language found" : "Customer-safe",
            ok: !leakedWords && !leakedFigure,
            detail: leakedFigure
              ? `The draft contains an internal figure (${leakedFigure}).`
              : leakedWords
                ? "The draft uses internal commercial language."
                : "Checked for margin and cost language and for this quote's cost and margin figures. None present.",
          },
        ];
        if (run?.mode === "ADAPTIVE_AGENT") {
          checks.push({
            label: run.groundingIssues.length ? `${run.groundingIssues.length} unsupported claim(s)` : "Every claim grounded",
            ok: run.groundingIssues.length === 0,
            detail: run.groundingIssues.length ? run.groundingIssues.join(" · ") : "Every figure in the agent's text matched a tool result.",
          });
        } else {
          checks.push({ label: "Drafted from computed facts", ok: true, detail: "Assembled from engine output; the model did not author the figures." });
        }
        if (quote) {
          const released = quote.status === "APPROVED" || quote.status === "SENT";
          checks.push({
            label: released ? "Quote released" : "Quote not yet released",
            ok: released,
            detail: released ? "Every approval was decided and the quote was released." : "The quote is still held.",
          });
        }
        return checks;
      })()
    : undefined;

  const actingUsers = users.map((u) => ({ id: u.id, name: u.name, role: u.role, title: u.title, initials: u.initials }));
  const activitySteps =
    run?.toolCalls.map((call) => ({
      id: call.id,
      sequence: call.sequence,
      toolName: call.toolName,
      summary: call.summary,
      status: call.status,
      safety: call.safety,
      effect: call.effect,
      modelInitiated: call.modelInitiated,
      durationMs: call.durationMs,
      input: call.input,
      output: call.output,
      evidence: call.evidence.map((e) => ({
        id: e.id,
        claim: e.claim,
        docNumber: e.section?.document.docNumber ?? null,
        anchor: e.section?.anchor ?? null,
      })),
    })) ?? [];

  const sections = [
    decision ? { id: "decision", label: "Decision" } : null,
    { id: "request", label: "Request" },
    matrixColumns.length ? { id: "validation", label: "Technical validation" } : null,
    citedCount ? { id: "evidence", label: "Evidence", badge: null } : null,
    quote ? { id: "fulfillment", label: "Fulfillment" } : null,
    quote ? { id: "commercials", label: "Commercials" } : null,
    { id: "approvals", label: "Approvals", badge: blockingApprovals.length || null },
    recommendation ? { id: "response", label: "Response" } : null,
    activitySteps.length ? { id: "activity", label: "Agent activity" } : null,
    { id: "audit", label: "Audit trail" },
  ].filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <ActingUserProvider users={actingUsers}>
      <PageBody>
        <PageHeader
          crumbs={[{ label: "Requests", href: "/inbox" }, { label: request.reference }]}
          title={request.subject}
          meta={
            <div className="t-small flex flex-wrap items-center gap-x-4 gap-y-1.5 text-ink-500">
              <StatusBadge status={request.status} />
              <Pill tone={RISK_TONE[request.risk]} dot>
                {statusLabel(request.risk)} risk
              </Pill>
              <Link href="/customers" className="flex items-center gap-1.5 font-medium text-ink-800 hover:text-accent-700">
                <Building2 className="size-3.5 text-ink-400" aria-hidden />
                {request.customer?.name ?? "Unidentified account"}
                {request.customer ? <span className="font-mono text-[11px] font-normal text-ink-400">{request.customer.accountNumber}</span> : null}
              </Link>
              {request.site ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-ink-400" aria-hidden />
                  {request.site.name}, {request.site.city} {request.site.state}
                </span>
              ) : null}
              <span className="flex items-center gap-1.5">
                <UserRound className="size-3.5 text-ink-400" aria-hidden />
                {request.owner?.name ?? "Unassigned"}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5 text-ink-400" aria-hidden />
                Received {age(request.receivedAt)} ago
              </span>
              {request.requiredBy ? (
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="size-3.5 text-ink-400" aria-hidden />
                  Needed by {shortDate(request.requiredBy)}
                </span>
              ) : null}
            </div>
          }
          actions={
            <CaseChrome
              requestId={request.id}
              status={request.status}
              hasQuote={Boolean(quote)}
              blockingApprovals={blockingApprovals.length}
              adaptiveAvailable={adaptiveMode.available}
              adaptiveUnavailableReason={adaptiveMode.unavailableReason}
            />
          }
          className="!mb-0 !border-b-0"
        />

        <SectionNav
          sections={sections}
          aside={run ? <RunModeBadge mode={run.mode} modelSource={run.modelSource} model={run.model} /> : null}
        />

        {/* Row A — the answer and the gate, side by side. */}
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-5">
            {decision ? <DecisionSummary data={decision} /> : null}
            {!recommendation ? (
              <Panel>
                <EmptyState
                  icon={ScanSearch}
                  title="Not analysed yet"
                  description="This request is in the inbox untouched. Run the analysis to see what the engine makes of it."
                />
              </Panel>
            ) : null}

            <section id="request" className="scroll-mt-16">
              <RequestSection
                subject={request.subject}
                body={request.rawBody}
                channel={request.channel}
                receivedAt={request.receivedAt}
                contactName={request.contact?.name ?? null}
                contactEmail={request.contact?.email ?? null}
                requirements={request.requirements.map((r) => ({
                  id: r.id,
                  label: r.label,
                  kind: r.kind,
                  operator: r.operator,
                  numValue: r.numValue === null ? null : Number(r.numValue),
                  textValue: r.textValue,
                  unit: r.unit,
                  sourceQuote: r.sourceQuote,
                  confidence: Number(r.confidence),
                  note: r.note,
                }))}
              />
            </section>
          </div>

          {/* ── The gate ──────────────────────────────────────────────── */}
          <aside className="flex min-w-0 flex-col gap-5 ">
            <section id="approvals" className="scroll-mt-16">
              <Panel>
                <PanelHeader
                  icon={ShieldCheck}
                  title="Approvals"
                  subtitle={
                    request.approvals.length > 0
                      ? blockingApprovals.length > 0
                        ? `${blockingApprovals.length} of ${request.approvals.length} to decide — nothing is released until all are`
                        : `All ${request.approvals.length} decided`
                      : quote
                        ? "Inside policy — nothing on this deal needs a signature."
                        : "No quote was produced, so there is nothing to approve."
                  }
                />
                {request.approvals.length > 0 ? (
                  <div className="border-b border-[var(--hairline)] bg-ink-50/60 px-4 py-2.5">
                    <ActingUserPicker />
                    <p className="t-micro mt-1 text-ink-400">
                      No authentication in this demo. The role gate is still enforced on the server — a sales rep cannot record an
                      engineer&apos;s sign-off.
                    </p>
                  </div>
                ) : null}
                {request.approvals.length === 0 ? (
                  <EmptyState
                    title={quote ? "No approval required" : "Nothing to approve"}
                    description={
                      quote
                        ? "Discount, margin, quote value, technical checks and fulfillment are all inside policy."
                        : request.status === "BLOCKED"
                          ? "The engine refused to produce a recommendation, so no quote exists. This enquiry belongs with application engineering."
                          : !recommendation
                            ? "Nothing has been analysed on this case yet, so there is nothing to decide."
                            : recommendation.outcome === "INFORMATION_PROVIDED"
                              ? "The customer asked a question and it was answered from evidence. No quotation was produced, so no approval is needed."
                              : "The engine stopped before producing a quote and is waiting on information from the customer."
                    }
                  />
                ) : (
                  <ApprovalListClient
                    approvals={request.approvals.map(
                      (a): ApprovalView => ({
                        id: a.id,
                        kind: a.kind,
                        status: a.status,
                        requiredRole: a.requiredRole,
                        title: a.title,
                        reason: a.reason,
                        proposedAction: a.proposedAction,
                        commercialImpact: a.commercialImpact,
                        technicalImpact: a.technicalImpact,
                        riskNote: a.riskNote,
                        decidedByName: a.decidedBy?.name ?? null,
                        decidedAt: a.decidedAt?.toISOString() ?? null,
                        decisionNote: a.decisionNote,
                      }),
                    )}
                  />
                )}
              </Panel>
            </section>


          </aside>
        </div>

        {/* Everything that explains the answer, at full width. */}
        <div className="mt-5 flex min-w-0 flex-col gap-6">

            {matrixColumns.length ? (
              <section id="validation" className="scroll-mt-16">
                <SectionTitle
                  icon={ScanSearch}
                  title="Technical validation"
                  note="Every value compared by the rule engine, with the data-sheet section it came from. A hard failure rules a part out; no model can override it."
                />
                <Panel>
                  <ValidationMatrix columns={matrixColumns} furtherRejected={furtherRejected} />
                </Panel>
              </section>
            ) : null}

            {citedCount ? (
              <section id="evidence" className="scroll-mt-16">
                <SectionTitle
                  icon={BookOpenCheck}
                  title="Evidence"
                  note={`${citedCount} claims behind the decision, each tied to a section of a document in the technical library. Open one to read the source.`}
                />
                <Panel>
                  <EvidenceList groups={evidenceGroups} />
                </Panel>
              </section>
            ) : null}

            {quote ? (
              <section id="fulfillment" className="scroll-mt-16">
                <SectionTitle icon={Truck} title="Fulfillment" note="Available-to-promise is on-hand stock less what is already reserved for other orders." />
                <Panel>
                  <FulfillmentPlan lines={fulfillmentLines} />
                  <FulfillmentFooter
                    freightService={titleCase(quote.freightService)}
                    freightCost={money(quote.freightCost)}
                    estimatedDelivery={quote.estimatedDelivery ? shortDate(quote.estimatedDelivery) : null}
                    requiredBy={request.requiredBy ? shortDate(request.requiredBy) : null}
                    onTime={onTime}
                  />
                </Panel>
              </section>
            ) : null}

            {quote ? (
              <section id="commercials" className="scroll-mt-16">
                <SectionTitle icon={Wallet} title="Commercials" note={`Quote ${quote.quoteNumber} · valid until ${shortDate(quote.validUntil)}`} />
                <Panel>
                  <Commercials
                    requestId={request.id}
                    quoteNumber={quote.quoteNumber}
                    lines={quote.items.map((item) => ({
                      id: item.id,
                      sku: item.product.sku,
                      description: item.description,
                      quantity: item.quantity,
                      listPrice: Number(item.listPrice),
                      unitPrice: Number(item.unitPrice),
                      discountPct: Number(item.discountPct),
                      priceSource: item.priceSource,
                      extended: Number(item.extended),
                    }))}
                    subtotal={Number(quote.subtotal)}
                    discountTotal={Number(quote.discountTotal)}
                    freightCost={Number(quote.freightCost)}
                    freightService={titleCase(quote.freightService)}
                    total={Number(quote.total)}
                    costTotal={Number(quote.costTotal)}
                    marginAmount={Number(quote.marginAmount)}
                    marginPct={Number(quote.marginPct)}
                    marginFloorPct={thresholds.minMarginPct}
                    triggeredApprovals={request.approvals
                      .filter((a) => COMMERCIAL_APPROVALS.has(a.kind))
                      .map((a) => APPROVAL_KIND_LABEL[a.kind] ?? a.kind)}
                    repriceDisabledReason={request.status === "COMPLETED" ? "This case is closed. Reopen it to change the pricing." : undefined}
                    account={{
                      tier: request.customer ? titleCase(request.customer.tier) : "—",
                      priceBook: request.customer?.priceBook?.name ?? "Published list",
                      paymentTerms: `Net ${request.customer?.paymentTerms ?? 30} days`,
                      creditLimit: request.customer ? money(request.customer.creditLimit) : "—",
                    }}
                  />
                </Panel>
              </section>
            ) : null}

            {recommendation ? (
              <section id="response" className="scroll-mt-16">
                <SectionTitle icon={FileText} title="Customer response" />
                {response ? (
                  <ResponseEditor
                    requestId={request.id}
                    subject={response.subject}
                    body={response.body}
                    version={response.version}
                    edited={response.edited}
                    locked={blockingApprovals.length > 0}
                    lockReason={
                      blockingApprovals.length > 0
                        ? "The customer response is held until every approval on this case has been decided. Nothing customer-facing is generated from an unapproved quote."
                        : undefined
                    }
                    checks={responseChecks}
                  />
                ) : (
                  <Panel>
                    <EmptyState
                      icon={FileText}
                      title="No draft yet"
                      description={
                        blockingApprovals.length > 0
                          ? `The response is drafted when the quote is released. ${blockingApprovals.length} approval${blockingApprovals.length === 1 ? "" : "s"} must be decided first.`
                          : quote
                            ? "Release the quote to draft the customer response."
                            : "No customer response has been drafted for this case."
                      }
                    />
                  </Panel>
                )}
              </section>
            ) : null}

            {activitySteps.length && run ? (
              <section id="activity" className="scroll-mt-16">
                <SectionTitle
                  icon={Activity}
                  title="Agent activity"
                  note="Each step is a recorded tool call, in the order it ran. The sentence is what the tool reported at the time — not a summary written afterwards."
                />
                <Panel>
                  <RunHeader run={run} steps={activitySteps.length} />
                  <ActivityTimeline steps={activitySteps} adaptive={run.mode === "ADAPTIVE_AGENT"} />
                </Panel>
              </section>
            ) : null}

            <section id="audit" className="scroll-mt-16">
              <details className="group">
                <summary className="mb-2.5 flex cursor-pointer list-none items-center gap-2">
                  <History className="size-4 text-ink-400" aria-hidden />
                  <span className="t-title text-ink-900">Audit trail</span>
                  <span className="t-small text-ink-500">{request.auditEvents.length} events · append-only</span>
                  <ChevronRight className="size-4 text-ink-400 transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <AuditPanel events={request.auditEvents} />
              </details>
            </section>
        </div>
      </PageBody>
    </ActingUserProvider>
  );
}

function SectionTitle({ icon: Icon, title, note }: { icon: typeof Mail; title: string; note?: string }) {
  return (
    <div className="mb-2.5">
      <h2 className="t-title flex items-center gap-2 text-ink-900">
        <Icon className="size-4 text-ink-400" strokeWidth={1.75} aria-hidden />
        {title}
      </h2>
      {note ? <p className="t-small mt-0.5 max-w-3xl pl-6 text-ink-500">{note}</p> : null}
    </div>
  );
}

function RunHeader({
  run,
  steps,
}: {
  run: {
    mode: string;
    modelSource: string;
    model: string | null;
    provider: string;
    durationMs: number | null;
    termination: string | null;
    turnCount: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    estimatedCostUsd: unknown;
    groundingIssues: string[];
    guardrailEvents: unknown;
  };
  steps: number;
}) {
  const adaptive = run.mode === "ADAPTIVE_AGENT";
  const guardrails = ((run.guardrailEvents as { kind: string; detail: string }[] | null) ?? []);
  const facts: [string, string][] = [
    ["Mode", adaptive ? (run.modelSource === "LIVE" ? "Live adaptive" : "Scripted adaptive") : "Deterministic pipeline"],
    ["Tool calls", String(steps)],
    ["Duration", duration(run.durationMs)],
  ];
  if (adaptive) {
    facts.push(["Turns", run.turnCount === null ? "—" : String(run.turnCount)]);
    facts.push(["Concluded", run.termination ? TERMINATION_LABEL[run.termination] ?? run.termination : "—"]);
    if (run.modelSource === "LIVE") {
      const cached = (run.cacheReadTokens ?? 0) + (run.cacheWriteTokens ?? 0);
      facts.push(["Tokens", `${((run.inputTokens ?? 0) + cached).toLocaleString("en-US")} in · ${(run.outputTokens ?? 0).toLocaleString("en-US")} out`]);
      facts.push(["Cost", run.estimatedCostUsd ? `$${Number(run.estimatedCostUsd).toFixed(4)}` : "—"]);
    }
    facts.push(["Grounding", run.groundingIssues.length ? `${run.groundingIssues.length} rejected` : "Clean"]);
  }
  return (
    <div className="border-b border-[var(--hairline)]">
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <div className="t-micro text-ink-500">{label}</div>
            <div className="t-small mt-0.5 font-medium text-ink-900">{value}</div>
          </div>
        ))}
      </div>
      {run.groundingIssues.length ? (
        <div className="border-t border-fail-200 bg-fail-50 px-4 py-2">
          <div className="t-micro font-medium text-fail-700">Unsupported claims rejected by grounding</div>
          <ul className="mt-1 space-y-0.5">
            {run.groundingIssues.map((issue) => (
              <li key={issue} className="t-small text-fail-700">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {guardrails.length ? (
        <div className="border-t border-warn-200 bg-warn-50 px-4 py-2">
          <div className="t-micro font-medium text-warn-700">Guardrails triggered</div>
          <ul className="mt-1 space-y-0.5">
            {guardrails.map((g, i) => (
              <li key={i} className="t-small text-warn-700">
                <span className="font-medium">{g.kind.replace(/_/g, " ").toLowerCase()}</span> — {g.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
