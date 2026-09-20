import Link from "next/link";
import { getDashboard, getPolicyThresholds, ageHours } from "@/lib/queries";
import { PageBody, PageHeader } from "@/components/ui/page";
import {
  Panel,
  PanelHeader,
  Metric,
  Pill,
  EmptyState,
  REQUEST_STATUS_TONE,
  RISK_TONE,
  statusLabel,
  Mono,
} from "@/components/ui/primitives";
import { compactMoney, money, age, duration, pct } from "@/lib/format";
import { formatCurrency } from "@/lib/money";

export const dynamic = "force-dynamic";

const ACTIONABLE = new Set(["NEW", "NEEDS_REVIEW", "READY_FOR_APPROVAL", "BLOCKED"]);

export default async function DashboardPage() {
  const [{ requests, approvals, metrics }, thresholds] = await Promise.all([
    getDashboard(),
    getPolicyThresholds(),
  ]);

  const queue = requests
    .filter((r) => ACTIONABLE.has(r.status))
    .sort((a, b) => {
      const rank = (s: string) => (s === "BLOCKED" ? 0 : s === "READY_FOR_APPROVAL" ? 1 : s === "NEEDS_REVIEW" ? 2 : 3);
      const d = rank(a.status) - rank(b.status);
      return d !== 0 ? d : a.receivedAt.getTime() - b.receivedAt.getTime();
    });

  const readyToSend = requests.filter((r) => r.status === "RESPONSE_READY");

  return (
    <PageBody>
      <PageHeader
        eyebrow="Operations"
        title="Today"
        description="Inbound technical sales requests, what the engine has done with them, and what is waiting on a person."
      />

      <div className="mt-5 grid grid-cols-2 divide-x divide-y divide-[var(--hairline)] overflow-hidden rounded-md border border-[var(--hairline)] bg-white md:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
        <Metric label="Open requests" value={metrics.openCount} hint={`${metrics.quoteCount} quotes raised`} />
        <Metric
          label="Needs review"
          value={metrics.needsReviewCount}
          hint="Blocked or waiting on information"
          tone={metrics.needsReviewCount > 0 ? "warn" : "neutral"}
        />
        <Metric
          label="Pending approvals"
          value={metrics.pendingApprovalCount}
          hint="Cannot be released until decided"
          tone={metrics.pendingApprovalCount > 0 ? "warn" : "neutral"}
        />
        <Metric label="Quote value in pipeline" value={compactMoney(metrics.pipelineCents / 100)} hint="Excludes rejected quotes" />
        <Metric
          label="Blended margin"
          value={pct(metrics.blendedMarginPct)}
          hint={`Policy minimum ${thresholds.minMarginPct}%`}
          tone={metrics.blendedMarginPct < thresholds.minMarginPct ? "warn" : "pass"}
        />
        <Metric
          label="Median analysis time"
          value={duration(metrics.medianRunMs)}
          hint="Request received to recommendation"
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Panel>
          <PanelHeader
            title="Work queue"
            subtitle="Cases where the engine has stopped and needs a person"
            actions={
              <Link href="/inbox" className="text-[12px] font-medium text-accent-600 hover:underline">
                Full inbox →
              </Link>
            }
          />
          {queue.length === 0 ? (
            <EmptyState title="Nothing waiting" description="Every open case has been worked through." />
          ) : (
            <ul className="divide-y divide-[var(--hairline)]">
              {queue.map((request) => {
                const quote = request.quotes[0];
                const pending = request.approvals.filter((a) => a.status === "PENDING").length;
                const hours = ageHours(request.receivedAt);
                return (
                  <li key={request.id}>
                    <Link
                      href={`/cases/${request.id}`}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-ink-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Mono>{request.reference}</Mono>
                          <Pill tone={REQUEST_STATUS_TONE[request.status]}>{statusLabel(request.status)}</Pill>
                          {request.risk !== "LOW" ? (
                            <Pill tone={RISK_TONE[request.risk]} dot>
                              {statusLabel(request.risk)} risk
                            </Pill>
                          ) : null}
                          {pending > 0 ? (
                            <span className="text-[11.5px] text-ink-500">
                              {pending} approval{pending === 1 ? "" : "s"} open
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-[13px] font-medium text-ink-900">{request.subject}</p>
                        <p className="mt-0.5 truncate text-[12px] text-ink-500">
                          {request.customer?.name ?? "Unidentified account"}
                          {request.summary ? ` · ${request.summary}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tnum text-[12.5px] font-medium text-ink-900">
                          {quote ? money(quote.total) : "—"}
                        </div>
                        <div className={`tnum mt-0.5 text-[11.5px] ${hours > 48 ? "text-warn-700" : "text-ink-400"}`}>
                          {age(request.receivedAt)} old
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel>
            <PanelHeader
              title="Approvals waiting on a decision"
              subtitle="No quote below can be sent until these are cleared"
              actions={
                <Link href="/approvals" className="text-[12px] font-medium text-accent-600 hover:underline">
                  Queue →
                </Link>
              }
            />
            {approvals.length === 0 ? (
              <EmptyState title="No approvals outstanding" />
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {approvals.slice(0, 6).map((approval) => (
                  <li key={approval.id}>
                    <Link
                      href={`/cases/${approval.requestId}#approvals`}
                      className="block px-4 py-2.5 transition-colors hover:bg-ink-50"
                    >
                      <div className="flex items-center gap-2">
                        <Pill tone={approval.status === "CHANGES_REQUESTED" ? "warn" : "neutral"}>
                          {statusLabel(approval.requiredRole)}
                        </Pill>
                        <span className="truncate text-[11.5px] text-ink-500">
                          {approval.request.customer?.name}
                        </span>
                      </div>
                      <p className="mt-1 text-[12.5px] font-medium leading-snug text-ink-900">{approval.title}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Ready to send" subtitle="Approved, drafted and waiting on the salesperson" />
            {readyToSend.length === 0 ? (
              <EmptyState title="Nothing ready to send" />
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {readyToSend.map((request) => (
                  <li key={request.id}>
                    <Link
                      href={`/cases/${request.id}#response`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-ink-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-ink-900">
                          {request.customer?.name}
                        </p>
                        <p className="truncate text-[11.5px] text-ink-500">{request.recommendations[0]?.headline}</p>
                      </div>
                      <span className="tnum shrink-0 text-[12px] text-ink-600">
                        {request.quotes[0] ? formatCurrency(Number(request.quotes[0].total) * 100) : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </PageBody>
  );
}
