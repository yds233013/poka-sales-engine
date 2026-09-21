import { getInbox } from "@/lib/queries";
import { PageBody, PageHeader } from "@/components/ui/page";
import { InboxTable } from "@/components/inbox-table";
import { INBOX_FILTERS, type FilterKey } from "@/lib/inbox-filters";
import { age, isPast } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const [{ filter }, requests] = await Promise.all([searchParams, getInbox()]);
  const initialFilter: FilterKey = INBOX_FILTERS.some((f) => f.key === filter) ? (filter as FilterKey) : "all";

  const rows = requests.map((request) => ({
    id: request.id,
    reference: request.reference,
    subject: request.subject,
    summary: request.summary,
    customer: request.customer?.name ?? "Unidentified account",
    site: request.site ? `${request.site.city}, ${request.site.state}` : "Site not identified",
    owner: request.owner?.name ?? "Unassigned",
    ownerInitials: request.owner?.initials ?? "—",
    status: request.status,
    risk: request.risk,
    channel: request.channel,
    receivedAt: request.receivedAt.toISOString(),
    requiredBy: request.requiredBy?.toISOString() ?? null,
    value: request.quotes[0] ? Number(request.quotes[0].total) : null,
    outcome: request.recommendations[0]?.outcome ?? null,
    pendingApprovals: request.approvals.filter((a) => a.status === "PENDING" || a.status === "CHANGES_REQUESTED").length,
    totalApprovals: request.approvals.length,
    run: request.runs[0] ? { mode: request.runs[0].mode, modelSource: request.runs[0].modelSource } : null,
    lastActivity: request.auditEvents[0]
      ? { at: request.auditEvents[0].createdAt.toISOString(), summary: request.auditEvents[0].summary }
      : null,
    overdue: Boolean(request.requiredBy && isPast(request.requiredBy) && request.status !== "COMPLETED"),
    lastActivityAgo: request.auditEvents[0]
      ? `Active ${age(request.auditEvents[0].createdAt)} ago`
      : `Received ${age(request.receivedAt)} ago`,
  }));

  return (
    <PageBody>
      <PageHeader
        eyebrow="Operations"
        title="Requests"
        description="Every inbound request, what the engine made of it, and where it is waiting."
      />
      <InboxTable rows={rows} initialFilter={initialFilter} />
    </PageBody>
  );
}
