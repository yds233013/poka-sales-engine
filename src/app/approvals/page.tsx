import Link from "next/link";
import { getApprovalQueue, getUsers } from "@/lib/queries";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader, EmptyState, Pill, statusLabel, Mono } from "@/components/ui/primitives";
import { ActingUserProvider, ActingUserPicker } from "@/components/acting-user";
import { ApprovalListClient } from "@/components/case/approval-list";
import { money, dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const [approvals, users] = await Promise.all([getApprovalQueue(), getUsers()]);

  const open = approvals.filter((a) => a.status === "PENDING" || a.status === "CHANGES_REQUESTED");
  const decided = approvals.filter((a) => a.status === "APPROVED" || a.status === "REJECTED");

  const byRequest = new Map<string, typeof open>();
  for (const approval of open) {
    const list = byRequest.get(approval.requestId) ?? [];
    list.push(approval);
    byRequest.set(approval.requestId, list);
  }

  const actingUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    title: u.title,
    initials: u.initials,
  }));

  return (
    <ActingUserProvider users={actingUsers}>
      <PageBody>
        <PageHeader
          eyebrow="Approvals"
          title="Approval queue"
          description="Nothing here can be released to a customer until it is decided. Each request carries the numbers, the technical position and the risk the approver is being asked to accept."
          actions={
            <div className="flex flex-col items-end gap-1">
              <ActingUserPicker />
              <span className="text-[11px] text-ink-400">
                No authentication in this build — the role gate is still enforced server-side.
              </span>
            </div>
          }
        />

        <div className="mt-5 flex flex-col gap-5">
          {byRequest.size === 0 ? (
            <Panel>
              <EmptyState
                title="Nothing waiting on a decision"
                description="Every open case is inside policy or already signed off."
              />
            </Panel>
          ) : (
            [...byRequest.entries()].map(([requestId, group]) => {
              const request = group[0].request;
              const quote = group[0].quote;
              return (
                <Panel key={requestId}>
                  <PanelHeader
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        <Mono>{request.reference}</Mono>
                        <span>{request.customer?.name}</span>
                      </span>
                    }
                    subtitle={`${request.subject} · owner ${request.owner?.name ?? "unassigned"}${
                      quote ? ` · quote ${quote.quoteNumber} at ${money(quote.total)}` : ""
                    }`}
                    actions={
                      <Link
                        href={`/cases/${requestId}`}
                        className="text-[12px] font-medium text-accent-600 hover:underline"
                      >
                        Open case →
                      </Link>
                    }
                  />
                  <ApprovalListClient
                    approvals={group.map((a) => ({
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
                </Panel>
              );
            })
          )}

          {decided.length > 0 ? (
            <Panel>
              <PanelHeader title="Recently decided" subtitle="Kept on the record — an approval cannot be re-decided." />
              <ul className="divide-y divide-[var(--hairline)]">
                {decided.map((approval) => (
                  <li key={approval.id} className="flex items-start gap-3 px-4 py-2.5">
                    <Pill tone={approval.status === "APPROVED" ? "pass" : "fail"} dot>
                      {statusLabel(approval.status)}
                    </Pill>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/cases/${approval.requestId}#approvals`}
                        className="block truncate text-[12.5px] font-medium text-ink-900 hover:text-accent-600"
                      >
                        {approval.title}
                      </Link>
                      <p className="truncate text-[11.5px] text-ink-500">
                        {approval.request.customer?.name} · {approval.decidedBy?.name ?? "—"} ·{" "}
                        {dateTime(approval.decidedAt)}
                        {approval.decisionNote ? ` · “${approval.decisionNote}”` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </PageBody>
    </ActingUserProvider>
  );
}
