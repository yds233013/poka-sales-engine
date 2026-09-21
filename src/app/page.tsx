import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Inbox as InboxIcon,
  ShieldCheck,
  Send,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { getDashboard, getPolicyThresholds, ageHours } from "@/lib/queries";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader, EmptyState, StatusBadge, Mono } from "@/components/ui/primitives";
import { RunModeBadge } from "@/components/run-mode";
import { compactMoney, money, age, duration } from "@/lib/format";
import { OUTCOME_LABEL, TERMINATION_LABEL, APPROVAL_KIND_LABEL, ROLE_LABEL } from "@/lib/status";
import { SPOTLIGHT } from "@/lib/demo";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/**
 * The desk, as a technical-sales lead would read it first thing.
 *
 * Organised by what a person has to do, not by what arrived last: decide an
 * approval, review a case the engine could not finish, send what is ready.
 * Every number is read from the database; there is no chart here because
 * nothing on this screen is a trend worth drawing.
 */
export default async function OverviewPage() {
  const [{ requests, approvals, recentRuns, metrics }, thresholds] = await Promise.all([
    getDashboard(),
    getPolicyThresholds(),
  ]);

  const awaitingApproval = requests.filter((r) => r.status === "READY_FOR_APPROVAL");
  const needsReview = requests.filter((r) => r.status === "NEEDS_REVIEW" || r.status === "BLOCKED");
  const notAnalysed = requests.filter((r) => r.status === "NEW");
  const readyToSend = requests.filter((r) => r.status === "RESPONSE_READY" || r.status === "APPROVED");

  const heldValue = awaitingApproval.reduce((sum, r) => sum + Number(r.quotes[0]?.total ?? 0), 0);
  const spotlight = requests.find((r) => r.reference === SPOTLIGHT.reference) ?? null;

  // One queue, ordered by what blocks revenue soonest.
  const RANK: Record<string, number> = { BLOCKED: 0, READY_FOR_APPROVAL: 1, NEEDS_REVIEW: 2, NEW: 3 };
  const attention = [...needsReview, ...awaitingApproval, ...notAnalysed].sort((a, b) => {
    const d = (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9);
    return d !== 0 ? d : a.receivedAt.getTime() - b.receivedAt.getTime();
  });

  const approvalsByCase = new Map<string, typeof approvals>();
  for (const approval of approvals) {
    const list = approvalsByCase.get(approval.requestId) ?? [];
    list.push(approval);
    approvalsByCase.set(approval.requestId, list);
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="Technical sales desk"
        title="Overview"
        description="What needs a person today, what the engine has handled, and what is ready to go out."
      />

      {spotlight ? (
        <Link
          href={`/cases/${spotlight.id}`}
          className="group mb-5 flex items-center gap-4 rounded-lg border border-accent-200 bg-accent-50/60 px-4 py-3 shadow-[var(--shadow-xs)] transition-colors hover:border-accent-300"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-600 text-white">
            <ArrowUpRight className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-accent-700">Suggested walkthrough</span>
              <Mono className="!text-[12px] text-accent-900">{spotlight.reference}</Mono>
              <span className="t-heading truncate text-ink-900">{spotlight.subject}</span>
            </div>
            <p className="t-small mt-0.5 line-clamp-1 text-ink-600">{SPOTLIGHT.pitch}</p>
          </div>
          <span className="hidden shrink-0 items-center gap-1 text-[12.5px] font-medium text-accent-700 group-hover:text-accent-900 md:flex">
            Open case <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      ) : null}

      {/* Four lanes of work. Each is a count of cases waiting on a kind of
          person, and each links to exactly those cases. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Lane
          icon={ShieldCheck}
          tone="warn"
          label="Awaiting approval"
          value={awaitingApproval.length}
          detail={`${approvals.length} decisions · ${compactMoney(heldValue)} held`}
          href="/approvals"
        />
        <Lane
          icon={CircleAlert}
          tone="fail"
          label="Needs review"
          value={needsReview.length}
          detail="Blocked, or waiting on the customer"
          href="/inbox?filter=review"
        />
        <Lane
          icon={Send}
          tone="pass"
          label="Ready to send"
          value={readyToSend.length}
          detail="Approved and drafted"
          href="/inbox?filter=ready"
        />
        <Lane
          icon={InboxIcon}
          tone="neutral"
          label="Not yet analysed"
          value={notAnalysed.length}
          detail="In the inbox, untouched"
          href="/inbox?filter=open"
        />
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-[var(--hairline)] rounded-lg border border-[var(--hairline)] bg-white shadow-[var(--shadow-xs)]">
        <Figure label="Quote value in pipeline" value={compactMoney(metrics.pipelineCents / 100)} note={`${metrics.quoteCount} quotes raised`} />
        <Figure
          label="Blended margin"
          value={`${metrics.blendedMarginPct}%`}
          note={`Policy floor ${thresholds.minMarginPct}%`}
          tone={metrics.blendedMarginPct < thresholds.minMarginPct ? "warn" : "pass"}
        />
        <Figure label="Median analysis time" value={duration(metrics.medianRunMs)} note="Request received to recommendation" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel>
          <PanelHeader
            icon={CircleAlert}
            title="Needs attention"
            subtitle="Ordered by what blocks a quote soonest: blocked, then awaiting approval, then review, then untouched."
            actions={
              <Link href="/inbox" className="flex items-center gap-1 text-[12.5px] font-medium text-accent-700 hover:text-accent-900">
                All requests <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {attention.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Nothing is waiting on a person" description="Every open case is either moving or done." />
          ) : (
            <ul className="divide-y divide-[var(--hairline)]">
              {attention.map((request) => {
                const quote = request.quotes[0];
                const open = request.approvals.filter((a) => a.status === "PENDING" || a.status === "CHANGES_REQUESTED").length;
                const outcome = request.recommendations[0]?.outcome;
                const reason =
                  request.status === "READY_FOR_APPROVAL"
                    ? `${open} approval${open === 1 ? "" : "s"} to decide`
                    : request.status === "NEW"
                      ? "Not analysed yet"
                      : request.blockedReason ?? (outcome ? OUTCOME_LABEL[outcome] : "Needs a person");
                const hours = ageHours(request.receivedAt);
                return (
                  <li key={request.id}>
                    <Link
                      href={`/cases/${request.id}`}
                      className="group grid grid-cols-[140px_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 transition-colors hover:bg-ink-50/70"
                    >
                      <div className="space-y-1">
                        <Mono className="block !text-[12px] text-ink-500">{request.reference}</Mono>
                        <StatusBadge status={request.status} />
                      </div>
                      <div className="min-w-0">
                        <div className="t-heading truncate text-ink-900 group-hover:text-accent-700">{request.subject}</div>
                        <div className="t-small mt-0.5 truncate text-ink-500">
                          {request.customer?.name ?? "Unknown account"}
                          <span className="mx-1.5 text-ink-300">·</span>
                          <span className={cn(request.status === "BLOCKED" ? "text-fail-700" : request.status === "READY_FOR_APPROVAL" ? "text-warn-700" : "")}>
                            {reason}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="tnum t-body font-medium text-ink-900">{quote ? money(quote.total) : "—"}</div>
                        <div className={cn("t-micro mt-0.5 flex items-center justify-end gap-1", hours > 48 ? "text-warn-700" : "text-ink-400")}>
                          <Clock className="size-3" aria-hidden />
                          {age(request.receivedAt)}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHeader
              icon={ShieldCheck}
              title="Decisions waiting"
              subtitle="Nothing below reaches a customer until these are decided."
              actions={
                <Link href="/approvals" className="flex items-center gap-1 text-[12.5px] font-medium text-accent-700 hover:text-accent-900">
                  Queue <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {approvalsByCase.size === 0 ? (
              <EmptyState title="No decisions waiting" />
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {[...approvalsByCase.entries()].map(([requestId, list]) => (
                  <li key={requestId}>
                    <Link href={`/cases/${requestId}#approvals`} className="block px-4 py-2.5 transition-colors hover:bg-ink-50/70">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <Mono className="!text-[12px] text-ink-500">{list[0].request.reference}</Mono>
                          <span className="t-small truncate font-medium text-ink-800">{list[0].request.customer?.name}</span>
                        </span>
                        <span className="tnum t-small shrink-0 text-ink-700">{list[0].quote ? money(list[0].quote.total) : ""}</span>
                      </div>
                      <ul className="mt-1.5 space-y-1">
                        {list.map((approval) => (
                          <li key={approval.id} className="flex items-center gap-2">
                            <span className="size-1.5 shrink-0 rounded-full bg-warn-500" aria-hidden />
                            <span className="t-small truncate text-ink-700">{APPROVAL_KIND_LABEL[approval.kind] ?? approval.kind}</span>
                            <span className="t-micro ml-auto shrink-0 text-ink-500">{ROLE_LABEL[approval.requiredRole] ?? approval.requiredRole}</span>
                          </li>
                        ))}
                      </ul>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader icon={Send} title="Ready to send" subtitle="Cleared, drafted, waiting on the salesperson." />
            {readyToSend.length === 0 ? (
              <EmptyState title="Nothing ready yet" />
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {readyToSend.map((request) => (
                  <li key={request.id}>
                    <Link href={`/cases/${request.id}#response`} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-ink-50/70">
                      <span className="min-w-0">
                        <span className="t-small block truncate font-medium text-ink-800">{request.customer?.name}</span>
                        <span className="t-micro block truncate text-ink-500">{request.subject}</span>
                      </span>
                      <span className="tnum t-small shrink-0 text-ink-700">{request.quotes[0] ? money(request.quotes[0].total) : "—"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel className="mt-5">
        <PanelHeader
          icon={Activity}
          title="Recent engine activity"
          subtitle="The latest investigations, in either execution mode, as they were actually run."
          actions={
            <Link href="/agent-lab" className="flex items-center gap-1 text-[12.5px] font-medium text-accent-700 hover:text-accent-900">
              Agent lab <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
        {recentRuns.length === 0 ? (
          <EmptyState title="No runs yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-[var(--hairline)] bg-ink-50/50">
                  {["Case", "Mode", "Concluded", "Tool calls", "Duration", "When"].map((h) => (
                    <th key={h} className="label-xs px-4 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hairline)]">
                {recentRuns.map((run) => {
                  const outcome = run.request.recommendations[0]?.outcome;
                  const concluded = run.termination
                    ? TERMINATION_LABEL[run.termination] ?? run.termination
                    : outcome
                      ? OUTCOME_LABEL[outcome] ?? outcome
                      : run.status;
                  return (
                    <tr key={run.id} className="transition-colors hover:bg-ink-50/70">
                      <td className="px-4 py-2.5">
                        <Link href={`/cases/${run.request.id}#activity`} className="group block min-w-0">
                          <Mono className="!text-[12px] text-ink-500">{run.request.reference}</Mono>
                          <span className="t-small ml-2 text-ink-800 group-hover:text-accent-700">{run.request.customer?.name}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <RunModeBadge mode={run.mode} modelSource={run.modelSource} />
                      </td>
                      <td className="t-small px-4 py-2.5 text-ink-700">{concluded}</td>
                      <td className="tnum t-small px-4 py-2.5 text-ink-700">{run._count.toolCalls}</td>
                      <td className="tnum t-small px-4 py-2.5 text-ink-700">{duration(run.durationMs)}</td>
                      <td className="t-small px-4 py-2.5 text-ink-500">{age(run.startedAt)} ago</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </PageBody>
  );
}

function Lane({
  icon: Icon,
  tone,
  label,
  value,
  detail,
  href,
}: {
  icon: LucideIcon;
  tone: "warn" | "fail" | "pass" | "neutral";
  label: string;
  value: number;
  detail: string;
  href: string;
}) {
  const accent = {
    warn: "text-warn-600 bg-warn-50 ring-warn-200",
    fail: "text-fail-600 bg-fail-50 ring-fail-200",
    pass: "text-pass-600 bg-pass-50 ring-pass-200",
    neutral: "text-ink-500 bg-ink-50 ring-ink-200",
  }[tone];
  return (
    <Link
      href={href}
      className="group rounded-lg border border-[var(--hairline)] bg-white px-4 py-3.5 shadow-[var(--shadow-xs)] transition-[border-color,box-shadow] hover:border-[var(--hairline-strong)] hover:shadow-[var(--shadow-sm)]"
    >
      <div className="flex items-center justify-between">
        <span className={cn("flex size-7 items-center justify-center rounded-md ring-1 ring-inset", accent)}>
          <Icon className="size-3.5" strokeWidth={2} aria-hidden />
        </span>
        <ArrowRight className="size-3.5 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-500" aria-hidden />
      </div>
      <div className="t-figure mt-3 text-ink-900">{value}</div>
      <div className="t-heading mt-0.5 text-ink-800">{label}</div>
      <div className="t-small mt-0.5 text-ink-500">{detail}</div>
    </Link>
  );
}

function Figure({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "pass" | "warn" }) {
  return (
    <div className="px-4 py-3">
      <div className="t-small text-ink-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className={cn("tnum text-[17px] font-semibold tracking-[-0.015em]", tone === "warn" ? "text-warn-700" : tone === "pass" ? "text-pass-700" : "text-ink-900")}>
          {value}
        </span>
        <span className="t-micro text-ink-500">{note}</span>
      </div>
    </div>
  );
}
