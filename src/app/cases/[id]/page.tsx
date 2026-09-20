import Link from "next/link";
import { notFound } from "next/navigation";
import { getCase, getPolicyThresholds, getUsers } from "@/lib/queries";
import { PageBody } from "@/components/ui/page";
import {
  Panel,
  PanelHeader,
  Pill,
  EmptyState,
  REQUEST_STATUS_TONE,
  RISK_TONE,
  statusLabel,
  Mono,
  SectionLabel,
} from "@/components/ui/primitives";
import {
  AlternativesPanel,
  AuditPanel,
  CommercialsPanel,
  FulfillmentPanel,
  RecommendationPanel,
  RequestPanel,
  RequirementsPanel,
  TracePanel,
  type AllocationView,
} from "@/components/case/panels";
import type { ApprovalView } from "@/components/case/approval-card";
import { ApprovalListClient } from "@/components/case/approval-list";
import { ResponseEditor } from "@/components/case/response-editor";
import { ActingUserProvider, ActingUserPicker } from "@/components/acting-user";
import { CaseChrome } from "@/components/case/case-chrome";
import type { EvidenceView } from "@/components/evidence";
import { age, money, shortDate, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [request, users, thresholds] = await Promise.all([
    getCase(id),
    getUsers(),
    getPolicyThresholds(),
  ]);
  if (!request) notFound();

  const recommendation = request.recommendations[0] ?? null;
  const quote = request.quotes[0] ?? null;
  const run = request.runs[0] ?? null;
  const response = request.responses[0] ?? null;
  const winner = recommendation?.candidates.find((c) => c.verdict === "RECOMMENDED") ?? null;

  const blockingApprovals = request.approvals.filter(
    (a) => a.status === "PENDING" || a.status === "CHANGES_REQUESTED",
  );

  // Map each compatibility dimension to the data-sheet section that backs it,
  // so a check in the matrix links to the text it was read from.
  const evidenceByDimension: Record<string, EvidenceView | undefined> = {};
  if (winner && run) {
    const compatibilityEvidence = run.toolCalls
      .filter((tc) => tc.toolName === "check_compatibility")
      .flatMap((tc) => tc.evidence)
      .filter((e) => e.claim.startsWith(`${winner.product.sku} `));
    for (const check of winner.checks) {
      const match = compatibilityEvidence.find((e) =>
        e.claim.toLowerCase().includes(check.label.toLowerCase()),
      );
      if (match) {
        evidenceByDimension[check.dimension] = {
          id: match.id,
          kind: match.kind,
          label: match.label,
          claim: match.claim,
          docNumber: match.section?.document.docNumber ?? null,
          anchor: match.section?.anchor ?? null,
          heading: match.section?.heading ?? null,
          recordRef: match.recordRef,
        };
      }
    }
  }

  const traceSteps =
    run?.toolCalls.map((call) => ({
      id: call.id,
      sequence: call.sequence,
      toolName: call.toolName,
      summary: call.summary,
      status: call.status,
      safety: call.safety,
      durationMs: call.durationMs,
      input: call.input,
      output: call.output,
      evidence: call.evidence.map((e) => ({
        id: e.id,
        kind: e.kind,
        label: e.label,
        claim: e.claim,
        docNumber: e.section?.document.docNumber ?? null,
        anchor: e.section?.anchor ?? null,
        heading: e.section?.heading ?? null,
        recordRef: e.recordRef,
      })),
    })) ?? [];

  const fulfillmentLines =
    quote?.items.map((item) => ({
      sku: item.product.sku,
      quantity: item.quantity,
      allocations: item.allocations as unknown as AllocationView[],
    })) ?? [];

  const actingUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    title: u.title,
    initials: u.initials,
  }));

  return (
    <ActingUserProvider users={actingUsers}>
      <div className="border-b border-[var(--hairline)] bg-white">
        <div className="mx-auto w-full max-w-[1440px] px-5 py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/inbox" className="text-[12px] text-ink-400 hover:text-ink-700">
                  Inbox
                </Link>
                <span className="text-ink-300">/</span>
                <Mono>{request.reference}</Mono>
                <Pill tone={REQUEST_STATUS_TONE[request.status]}>{statusLabel(request.status)}</Pill>
                <Pill tone={RISK_TONE[request.risk]} dot>
                  {statusLabel(request.risk)} risk
                </Pill>
              </div>
              <h1 className="mt-1.5 text-[17px] font-semibold tracking-[-0.02em] text-ink-900">
                {request.subject}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-500">
                <Link href="/customers" className="font-medium text-ink-700 hover:text-accent-600">
                  {request.customer?.name ?? "Unidentified account"}
                </Link>
                {request.customer ? <span>{request.customer.accountNumber}</span> : null}
                {request.site ? (
                  <span>
                    Ship to {request.site.name}, {request.site.city} {request.site.state}
                  </span>
                ) : null}
                <span>Owner {request.owner?.name ?? "unassigned"}</span>
                <span>{age(request.receivedAt)} old</span>
                {request.requiredBy ? <span>Needed by {shortDate(request.requiredBy)}</span> : null}
              </div>
            </div>
            <CaseChrome
              requestId={request.id}
              status={request.status}
              hasQuote={Boolean(quote)}
              blockingApprovals={blockingApprovals.length}
            />
          </div>
        </div>
      </div>

      <PageBody>
        {blockingApprovals.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-warn-200 bg-warn-50 px-4 py-2.5">
            <Pill tone="warn" dot>
              Action required
            </Pill>
            <p className="text-[12.5px] text-warn-700">
              {blockingApprovals.length} approval{blockingApprovals.length === 1 ? "" : "s"} must be decided
              before this quote can be released to the customer.
            </p>
            <a href="#approvals" className="text-[12px] font-medium text-warn-700 underline">
              Go to approvals
            </a>
          </div>
        ) : null}

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-w-0 flex-col gap-5">
            {recommendation ? (
              <RecommendationPanel
                outcome={recommendation.outcome}
                headline={recommendation.headline}
                rationale={recommendation.rationale}
                risk={recommendation.risk}
                blockedReason={request.blockedReason}
                selected={
                  winner
                    ? {
                        sku: winner.product.sku,
                        name: winner.product.name,
                        family: winner.product.category.family,
                        quantity: recommendation.quantity ?? 0,
                        unitPrice: winner.unitPrice ? money(winner.unitPrice) : null,
                        lifecycle: winner.product.lifecycle,
                      }
                    : null
                }
                checks={winner?.checks ?? []}
                evidenceByDimension={evidenceByDimension}
              />
            ) : (
              <Panel>
                <PanelHeader title="Recommendation" />
                <EmptyState
                  title="Not analysed yet"
                  description="This request is sitting in the inbox untouched. Run the analysis to see what the engine makes of it."
                />
              </Panel>
            )}

            {recommendation ? <AlternativesPanel candidates={
              recommendation.candidates.map((candidate) => ({
                id: candidate.id,
                sku: candidate.product.sku,
                name: candidate.product.name,
                family: candidate.product.category.family,
                verdict: candidate.verdict,
                rank: candidate.rank,
                reason: candidate.reason,
                score: Number(candidate.score),
                unitPrice: candidate.unitPrice ? Number(candidate.unitPrice) : null,
                availableQty: candidate.availableQty,
                earliestShipDate: candidate.earliestShipDate,
                checks: candidate.checks,
              }))
            } /> : null}

            {quote ? (
              <FulfillmentPanel
                lines={fulfillmentLines}
                estimatedDelivery={quote.estimatedDelivery}
                requiredBy={request.requiredBy}
                freightService={quote.freightService}
                freightCost={money(quote.freightCost)}
              />
            ) : null}

            {quote ? (
              <CommercialsPanel
                marginFloorPct={thresholds.minMarginPct}
                quote={{
                  quoteNumber: quote.quoteNumber,
                  status: quote.status,
                  subtotal: Number(quote.subtotal),
                  discountTotal: Number(quote.discountTotal),
                  freightCost: Number(quote.freightCost),
                  total: Number(quote.total),
                  costTotal: Number(quote.costTotal),
                  marginAmount: Number(quote.marginAmount),
                  marginPct: Number(quote.marginPct),
                  validUntil: quote.validUntil,
                  items: quote.items.map((item) => ({
                    id: item.id,
                    sku: item.product.sku,
                    description: item.description,
                    quantity: item.quantity,
                    listPrice: Number(item.listPrice),
                    unitPrice: Number(item.unitPrice),
                    discountPct: Number(item.discountPct),
                    priceSource: item.priceSource,
                    extended: Number(item.extended),
                  })),
                }}
              />
            ) : null}

            <div id="response" className="scroll-mt-16">
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
                />
              ) : recommendation ? (
                <Panel>
                  <PanelHeader title="Customer response" />
                  <EmptyState
                    title="No draft yet"
                    description="The response is drafted once the quote is released. Clear the open approvals first."
                  />
                </Panel>
              ) : null}
            </div>

            {traceSteps.length > 0 ? (
              <div id="trace" className="scroll-mt-16">
                <TracePanel steps={traceSteps} provider={run?.provider ?? "mock"} durationMs={run?.durationMs ?? null} />
              </div>
            ) : null}

            <div id="audit" className="scroll-mt-16">
              <AuditPanel events={request.auditEvents} />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-[68px]">
            <div id="approvals" className="scroll-mt-16">
              <Panel>
                <PanelHeader
                  title="Approvals"
                  subtitle={
                    request.approvals.length > 0
                      ? `${blockingApprovals.length} of ${request.approvals.length} still open`
                      : quote
                        ? "Policy check was clear — nothing on this deal requires a signature."
                        : "No quote was produced, so there is nothing to approve."
                  }
                />
                {request.approvals.length > 0 ? (
                  <div className="border-b border-[var(--hairline)] bg-ink-50/60 px-4 py-2">
                    <ActingUserPicker />
                    <p className="mt-1 text-[11px] leading-snug text-ink-400">
                      This build has no authentication. The role gate is still enforced server-side — a
                      representative cannot record an engineer&apos;s sign-off.
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
                          : "The engine stopped before producing a quote and is waiting on information from the customer."
                    }
                  />
                ) : (
                  <ApprovalList
                    approvals={request.approvals.map((a) => ({
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
                    }))}
                  />
                )}
              </Panel>
            </div>

            <RequestPanel
              subject={request.subject}
              body={request.rawBody}
              channel={request.channel}
              receivedAt={request.receivedAt}
              contactName={request.contact?.name ?? null}
              contactEmail={request.contact?.email ?? null}
            />

            {request.requirements.length > 0 ? (
              <RequirementsPanel
                requirements={request.requirements.map((r) => ({
                  id: r.id,
                  key: r.key,
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
            ) : null}

            <Panel>
              <PanelHeader title="Account" />
              <div className="px-4 py-3">
                <SectionLabel>Commercial terms</SectionLabel>
                <dl className="mt-1 space-y-1">
                  <Row label="Tier">{request.customer ? titleCase(request.customer.tier) : "—"}</Row>
                  <Row label="Price book">{request.customer?.priceBook?.name ?? "Published list"}</Row>
                  <Row label="Payment terms">Net {request.customer?.paymentTerms ?? 30} days</Row>
                  <Row label="Credit limit">{request.customer ? money(request.customer.creditLimit) : "—"}</Row>
                </dl>
                {request.customer?.notes ? (
                  <p className="mt-2.5 border-t border-[var(--hairline)] pt-2.5 text-[11.5px] leading-relaxed text-ink-500">
                    {request.customer.notes}
                  </p>
                ) : null}
              </div>
            </Panel>
          </div>
        </div>
      </PageBody>
    </ActingUserProvider>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[12px] text-ink-500">{label}</dt>
      <dd className="text-[12px] font-medium text-ink-900">{children}</dd>
    </div>
  );
}

function ApprovalList({ approvals }: { approvals: ApprovalView[] }) {
  return <ApprovalListClient approvals={approvals} />;
}
