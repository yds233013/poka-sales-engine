import { getInbox } from "@/lib/queries";
import { PageBody, PageHeader } from "@/components/ui/page";
import { InboxTable } from "@/components/inbox-table";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const requests = await getInbox();

  const rows = requests.map((request) => ({
    id: request.id,
    reference: request.reference,
    subject: request.subject,
    summary: request.summary,
    customer: request.customer?.name ?? "Unidentified",
    site: request.site ? `${request.site.city}, ${request.site.state}` : "—",
    owner: request.owner?.name ?? "Unassigned",
    ownerInitials: request.owner?.initials ?? "—",
    status: request.status,
    risk: request.risk,
    channel: request.channel,
    receivedAt: request.receivedAt.toISOString(),
    requiredBy: request.requiredBy?.toISOString() ?? null,
    value: request.quotes[0] ? Number(request.quotes[0].total) : null,
    outcome: request.recommendations[0]?.outcome ?? null,
    pendingApprovals: request.approvals.filter(
      (a) => a.status === "PENDING" || a.status === "CHANGES_REQUESTED",
    ).length,
    totalApprovals: request.approvals.length,
  }));

  return (
    <PageBody>
      <PageHeader
        eyebrow="Inbox"
        title="Inbound requests"
        description="Every request that has arrived, what the engine made of it, and where it is stuck."
      />
      <div className="mt-5">
        <InboxTable rows={rows} />
      </div>
    </PageBody>
  );
}
