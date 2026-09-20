/**
 * Workflow transitions.
 *
 * Every state change a human can cause passes through this module, and every
 * one re-derives its own preconditions rather than trusting the caller. The
 * UI disables the release button when approvals are open; `releaseQuote` also
 * refuses, because a disabled button is a courtesy and a server-side check is
 * the actual control.
 */

import type { PrismaClient } from "@/generated/prisma";
import { assertReleaseAllowed } from "@/lib/engines/approval";
import { recordAudit } from "@/lib/audit";
import { generateCustomerResponse } from "@/lib/agent/orchestrator";

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export interface ApprovalDecisionInput {
  approvalId: string;
  decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
  note?: string;
  /** The user acting. In a real deployment this comes from the session. */
  userId: string;
}

/**
 * Record an approval decision.
 *
 * Refuses to re-decide an approval that already carries a decision — an
 * approval is a point-in-time act, and letting it be overwritten would make
 * the audit trail meaningless.
 */
export async function decideApproval(prisma: PrismaClient, input: ApprovalDecisionInput) {
  const approval = await prisma.approval.findUnique({
    where: { id: input.approvalId },
    include: { request: true },
  });
  if (!approval) throw new WorkflowError("Approval not found.");
  if (approval.status !== "PENDING" && approval.status !== "CHANGES_REQUESTED") {
    throw new WorkflowError(
      `This approval was already ${approval.status.toLowerCase().replace("_", " ")} and cannot be decided again.`,
    );
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new WorkflowError("Unknown approver.");

  // Role gate. The commercial director may act on anything; otherwise the
  // deciding user must hold the role the policy engine asked for.
  if (user.role !== "ADMIN" && user.role !== approval.requiredRole) {
    throw new WorkflowError(
      `This approval requires ${approval.requiredRole.replace("_", " ").toLowerCase()}. ${user.name} is ${user.role.replace("_", " ").toLowerCase()}.`,
    );
  }

  // Conditional write: two people deciding at once must not both succeed and
  // have the later one silently win. The status guard is part of the WHERE.
  const written = await prisma.approval.updateMany({
    where: { id: approval.id, status: { in: ["PENDING", "CHANGES_REQUESTED"] } },
    data: {
      status: input.decision,
      decidedById: user.id,
      decidedAt: new Date(),
      decisionNote: input.note?.trim() || null,
    },
  });
  if (written.count === 0) {
    throw new WorkflowError("This approval was decided by someone else a moment ago.");
  }

  await recordAudit(prisma, approval.requestId, {
    type:
      input.decision === "APPROVED"
        ? "APPROVAL_GRANTED"
        : input.decision === "REJECTED"
          ? "APPROVAL_REJECTED"
          : "APPROVAL_CHANGES_REQUESTED",
    actor: user.name,
    actorId: user.id,
    summary: `${approval.title} — ${input.decision.replace("_", " ").toLowerCase()} by ${user.name}.`,
    detail: input.note ? { note: input.note } : undefined,
  });

  await refreshRequestStatus(prisma, approval.requestId);
  return approval.requestId;
}

/**
 * Recompute a case's status from the state of its approvals.
 * Called after every decision so the inbox never drifts from reality.
 */
export async function refreshRequestStatus(prisma: PrismaClient, requestId: string) {
  const request = await prisma.salesRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { approvals: true, quotes: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (request.status === "COMPLETED" || request.status === "BLOCKED") return;

  const approvals = request.approvals;
  if (approvals.some((a) => a.status === "REJECTED")) {
    await prisma.salesRequest.update({
      where: { id: requestId },
      data: { status: "NEEDS_REVIEW", risk: "HIGH" },
    });
    if (request.quotes[0]) {
      await prisma.quote.update({ where: { id: request.quotes[0].id }, data: { status: "REJECTED" } });
    }
    return;
  }
  if (approvals.some((a) => a.status === "CHANGES_REQUESTED")) {
    await prisma.salesRequest.update({ where: { id: requestId }, data: { status: "NEEDS_REVIEW" } });
    return;
  }
  if (approvals.some((a) => a.status === "PENDING")) {
    await prisma.salesRequest.update({ where: { id: requestId }, data: { status: "READY_FOR_APPROVAL" } });
    return;
  }
  if (approvals.length > 0) {
    await prisma.salesRequest.update({ where: { id: requestId }, data: { status: "APPROVED" } });
  }
}

export interface ReleaseOptions {
  actor: string;
  actorId?: string | null;
  asOf?: Date;
  /** Appended to the audit entry — e.g. why no approval was needed. */
  note?: string;
}

/**
 * Release a quote and draft the customer response.
 *
 * This is the only path from an approved case to customer-facing output, and
 * it re-checks the approval state itself before doing anything.
 */
export async function releaseQuote(
  prisma: PrismaClient,
  requestId: string,
  options: ReleaseOptions,
) {
  const request = await prisma.salesRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { approvals: true, quotes: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const quote = request.quotes[0];
  if (!quote) throw new WorkflowError("There is no quote on this case to release.");
  if (request.status === "BLOCKED") {
    throw new WorkflowError("This case is blocked — no quote can be released from it.");
  }

  // Releasing an already-released quote is a no-op, not a re-draft.
  // Regenerating here would silently discard an edit a salesperson had made
  // to the letter, which is the sort of data loss nobody reports and everybody
  // stops trusting the tool over.
  if (quote.status === "APPROVED" || quote.status === "SENT") {
    const existing = await prisma.customerResponse.count({ where: { requestId } });
    if (existing > 0) return quote.id;
  }

  // The structural gate. Throws if anything is still open or was rejected.
  // The engine is deliberately dependency-free and raises a plain Error; this
  // layer translates it so every caller sees one failure type.
  try {
    assertReleaseAllowed(
      request.approvals.map((a) => ({ id: a.id, status: a.status, title: a.title })),
    );
  } catch (error) {
    throw new WorkflowError(error instanceof Error ? error.message : String(error));
  }

  await prisma.quote.update({ where: { id: quote.id }, data: { status: "APPROVED" } });
  await recordAudit(prisma, requestId, {
    type: "QUOTE_RELEASED",
    actor: options.actor,
    actorId: options.actorId ?? null,
    summary: `Quote ${quote.quoteNumber} released for ${formatMoney(quote.total)}.${
      options.note ? ` ${options.note}` : ""
    }`,
    detail: { quoteNumber: quote.quoteNumber, total: quote.total.toString() },
  });

  await generateCustomerResponse(prisma, requestId, options.asOf ?? new Date());

  await prisma.salesRequest.update({
    where: { id: requestId },
    data: { status: "RESPONSE_READY" },
  });
  return quote.id;
}

/**
 * Save an edited customer response.
 *
 * The editor is disabled in the UI while approvals are open; this re-checks it
 * server-side, because the UI lock is a courtesy and this is the control. The
 * acting user is resolved against the user table rather than trusted as a
 * free-text name, so the audit entry names a real person.
 */
/**
 * Re-run the case with a rep-entered discount off list.
 *
 * The pricing engine has always supported a manual override; there was no way
 * to reach it, which made an entire documented branch untestable in the
 * product. Repricing re-runs the whole investigation, so the approval engine
 * sees the new number and raises whatever the discount now requires — which is
 * the point: a rep cannot discount their way past a threshold, only into one.
 */
export async function repriceQuote(
  prisma: PrismaClient,
  requestId: string,
  input: { discountPct: number; actor: string; actorId?: string | null },
) {
  if (!Number.isFinite(input.discountPct) || input.discountPct < 0 || input.discountPct > 95) {
    throw new WorkflowError("A manual discount must be between 0% and 95%.");
  }

  const request = await prisma.salesRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { quotes: { take: 1 } },
  });
  if (request.status === "COMPLETED") {
    throw new WorkflowError("This case is closed and cannot be repriced.");
  }
  if (request.quotes.length === 0) {
    throw new WorkflowError("There is no quote on this case to reprice.");
  }

  const { runSalesRequest } = await import("@/lib/agent/orchestrator");
  await runSalesRequest(prisma, requestId, { manualDiscountPct: input.discountPct });

  await recordAudit(prisma, requestId, {
    type: "QUOTE_REPRICED",
    actor: input.actor,
    actorId: input.actorId ?? null,
    summary: `Repriced at a manual ${input.discountPct}% off list. Approvals re-evaluated against the new figures.`,
    detail: { discountPct: input.discountPct },
  });
}

export async function saveCustomerResponse(
  prisma: PrismaClient,
  requestId: string,
  input: { subject: string; body: string; actor: string; userId?: string | null },
) {
  const request = await prisma.salesRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { approvals: true, quotes: { take: 1 } },
  });

  // A clarification letter on a case with no quote is always editable — there
  // is no offer in it. An offer is only editable once nothing is outstanding.
  if (request.quotes.length > 0) {
    const open = request.approvals.filter(
      (a) => a.status === "PENDING" || a.status === "CHANGES_REQUESTED",
    );
    if (open.length > 0) {
      throw new WorkflowError(
        `Cannot edit the customer response while ${open.length} approval(s) are open — ${open
          .map((a) => a.title)
          .join("; ")}`,
      );
    }
    if (request.approvals.some((a) => a.status === "REJECTED")) {
      throw new WorkflowError(
        "An approval on this case was refused. The customer response cannot be edited or sent.",
      );
    }
  }

  const latest = await prisma.customerResponse.findFirst({
    where: { requestId },
    orderBy: { version: "desc" },
  });
  if (!latest) throw new WorkflowError("There is no draft to edit on this case.");

  const user = input.userId ? await prisma.user.findUnique({ where: { id: input.userId } }) : null;
  const actor = user?.name ?? input.actor;

  await prisma.customerResponse.create({
    data: {
      requestId,
      subject: input.subject,
      body: input.body,
      edited: true,
      version: latest.version + 1,
    },
  });
  await recordAudit(prisma, requestId, {
    type: "RESPONSE_EDITED",
    actor,
    actorId: user?.id ?? null,
    summary: `Customer response edited (version ${latest.version + 1}).`,
  });
}

export async function completeCase(prisma: PrismaClient, requestId: string, actor: string) {
  const request = await prisma.salesRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { quotes: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (request.status !== "RESPONSE_READY") {
    throw new WorkflowError(
      "A case can only be completed once the customer response is ready to send.",
    );
  }

  await prisma.salesRequest.update({ where: { id: requestId }, data: { status: "COMPLETED" } });
  // Closing the case means the quotation went out. Leaving it APPROVED would
  // make "released but never sent" and "sent to the customer" indistinguishable.
  if (request.quotes[0]) {
    await prisma.quote.update({ where: { id: request.quotes[0].id }, data: { status: "SENT" } });
  }
  await recordAudit(prisma, requestId, {
    type: "CASE_COMPLETED",
    actor,
    summary: request.quotes[0]
      ? `Quotation ${request.quotes[0].quoteNumber} sent to the customer. Case closed.`
      : "Case closed.",
  });
}

function formatMoney(value: { toString(): string }): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value.toString()),
  );
}
