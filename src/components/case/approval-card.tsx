"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, CircleCheck, CircleX, Clock, RotateCcw } from "lucide-react";
import { Button, statusLabel } from "@/components/ui/primitives";
import { decideApprovalAction } from "@/app/actions";
import { dateTime } from "@/lib/format";
import { APPROVAL_KIND_LABEL, ROLE_LABEL } from "@/lib/status";
import { cn } from "@/lib/cn";

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

const STATE = {
  PENDING: { icon: Clock, label: "Pending", cls: "text-warn-700 bg-warn-50 ring-warn-200" },
  CHANGES_REQUESTED: { icon: RotateCcw, label: "Changes requested", cls: "text-warn-700 bg-warn-50 ring-warn-200" },
  APPROVED: { icon: CircleCheck, label: "Approved", cls: "text-pass-700 bg-pass-50 ring-pass-200" },
  REJECTED: { icon: CircleX, label: "Rejected", cls: "text-fail-700 bg-fail-50 ring-fail-200" },
} as const;

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

  const state = STATE[approval.status as keyof typeof STATE] ?? STATE.PENDING;
  const StateIcon = state.icon;
  const hasTechnical =
    approval.technicalImpact &&
    approval.technicalImpact !== "None." &&
    approval.technicalImpact !== "None — this is a commercial threshold only.";

  return (
    <div className={cn("border-b border-[var(--hairline)] px-4 py-3.5 last:border-0", !open && "bg-ink-50/40")}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset", state.cls)}>
          <StateIcon className="size-3.5" strokeWidth={2} aria-label={state.label} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="t-small font-medium text-ink-500">{APPROVAL_KIND_LABEL[approval.kind] ?? approval.kind}</span>
            <span className="t-micro rounded bg-ink-100 px-1.5 py-px font-medium text-ink-700">
              {ROLE_LABEL[approval.requiredRole] ?? approval.requiredRole}
            </span>
            <span className={cn("t-micro ml-auto font-medium", state.cls.split(" ")[0])}>{state.label}</span>
          </div>
          <h4 className="t-heading mt-0.5 text-ink-900">{approval.title}</h4>
          <p className="t-small mt-0.5 text-ink-600">{approval.reason}</p>

          <details className="group mt-2">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-ink-500 hover:text-ink-800">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
              Business impact
            </summary>
            <dl className="animate-in mt-1.5 space-y-1.5 rounded-md border border-[var(--hairline)] bg-white px-2.5 py-2">
              <Row label="Proposed">{approval.proposedAction}</Row>
              <Row label="Commercial">{approval.commercialImpact}</Row>
              {hasTechnical ? <Row label="Technical">{approval.technicalImpact}</Row> : null}
              <Row label="Risk">{approval.riskNote}</Row>
            </dl>
          </details>

          {approval.decidedByName ? (
            <div className="mt-2 rounded-md border-l-2 border-ink-300 bg-white py-1.5 pl-2.5 pr-2">
              <p className="t-micro text-ink-500">
                {statusLabel(approval.status)} by <span className="font-medium text-ink-700">{approval.decidedByName}</span> ·{" "}
                {dateTime(approval.decidedAt)}
              </p>
              {approval.decisionNote ? <p className="t-small mt-0.5 text-ink-700">“{approval.decisionNote}”</p> : null}
            </div>
          ) : null}

          {open ? (
            <div className="mt-2.5">
              {canDecide ? (
                <>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Decision note — it goes on the audit trail"
                    className="t-small w-full resize-y rounded-md border border-[var(--hairline-strong)] bg-white px-2.5 py-1.5 text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
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
                <p className="t-small rounded-md border border-dashed border-[var(--hairline-strong)] bg-white px-2.5 py-2 text-ink-500">
                  Reserved for a <span className="font-medium text-ink-700">{(ROLE_LABEL[approval.requiredRole] ?? approval.requiredRole).toLowerCase()}</span>.
                  Switch the acting user above to decide it.
                </p>
              )}
              {error ? <p className="t-small mt-2 text-fail-700">{error}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[78px_1fr] gap-2">
      <dt className="t-micro pt-px font-medium text-ink-500">{label}</dt>
      <dd className="t-small text-ink-700">{children}</dd>
    </div>
  );
}
