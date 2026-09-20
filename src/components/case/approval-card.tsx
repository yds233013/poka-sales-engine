"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Pill, statusLabel } from "@/components/ui/primitives";
import { decideApprovalAction } from "@/app/actions";
import { dateTime } from "@/lib/format";

export interface ApprovalView {
  id: string;
  kind: string;
  status: string;
  requiredRole: string;
  title: string;
  reason: string;
  proposedAction: string;
  commercialImpact: string;
  technicalImpact: string;
  riskNote: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

const STATUS_TONE: Record<string, "warn" | "pass" | "fail" | "neutral"> = {
  PENDING: "warn",
  APPROVED: "pass",
  REJECTED: "fail",
  CHANGES_REQUESTED: "warn",
};

export function ApprovalCard({
  approval,
  actingUserId,
  actingUserRole,
}: {
  approval: ApprovalView;
  actingUserId: string;
  actingUserRole: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const open = approval.status === "PENDING" || approval.status === "CHANGES_REQUESTED";
  const canDecide = actingUserRole === "ADMIN" || actingUserRole === approval.requiredRole;

  const decide = (decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED") =>
    start(async () => {
      setError(null);
      const result = await decideApprovalAction({
        approvalId: approval.id,
        userId: actingUserId,
        decision,
        note: note.trim() || undefined,
      });
      if (!result.ok) setError(result.message);
      else setNote("");
      router.refresh();
    });

  return (
    <div className="border-b border-[var(--hairline)] px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={STATUS_TONE[approval.status] ?? "neutral"} dot>
          {statusLabel(approval.status)}
        </Pill>
        <Pill tone="neutral">{statusLabel(approval.requiredRole)}</Pill>
        <span className="label-xs">{approval.kind.replace(/_/g, " ").toLowerCase()}</span>
      </div>

      <h4 className="mt-1.5 text-[13px] font-semibold leading-snug text-ink-900">{approval.title}</h4>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-600">{approval.reason}</p>

      <dl className="mt-2.5 space-y-1.5 rounded border border-[var(--hairline)] bg-ink-50/60 px-2.5 py-2">
        <Row label="Proposed">{approval.proposedAction}</Row>
        <Row label="Commercial">{approval.commercialImpact}</Row>
        {approval.technicalImpact && approval.technicalImpact !== "None." && approval.technicalImpact !== "None — this is a commercial threshold only." ? (
          <Row label="Technical">{approval.technicalImpact}</Row>
        ) : null}
        <Row label="Risk">{approval.riskNote}</Row>
      </dl>

      {approval.decidedByName ? (
        <div className="mt-2.5 rounded border-l-2 border-ink-300 bg-ink-50 py-1.5 pl-2.5 pr-2">
          <p className="text-[11.5px] text-ink-500">
            {statusLabel(approval.status)} by {approval.decidedByName} · {dateTime(approval.decidedAt)}
          </p>
          {approval.decisionNote ? (
            <p className="mt-1 text-[12px] leading-relaxed text-ink-700">“{approval.decisionNote}”</p>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="mt-3">
          {canDecide ? (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Decision note (optional but recommended — it goes on the audit trail)"
                className="w-full resize-y rounded border border-[var(--hairline-strong)] bg-white px-2 py-1.5 text-[12px] text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="approve" size="sm" disabled={pending} onClick={() => decide("APPROVED")}>
                  Approve
                </Button>
                <Button variant="secondary" size="sm" disabled={pending} onClick={() => decide("CHANGES_REQUESTED")}>
                  Request changes
                </Button>
                <Button variant="danger" size="sm" disabled={pending} onClick={() => decide("REJECTED")}>
                  Reject
                </Button>
              </div>
            </>
          ) : (
            <p className="rounded border border-[var(--hairline)] bg-ink-50 px-2.5 py-2 text-[11.5px] text-ink-500">
              This decision is reserved for {statusLabel(approval.requiredRole).toLowerCase()}. Switch the acting
              user above to decide it.
            </p>
          )}
          {error ? <p className="mt-2 text-[11.5px] text-fail-700">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[86px_1fr] gap-2">
      <dt className="label-xs pt-px !text-[9.5px] leading-[1.45]">{label}</dt>
      <dd className="text-[11.5px] leading-relaxed text-ink-700">{children}</dd>
    </div>
  );
}
