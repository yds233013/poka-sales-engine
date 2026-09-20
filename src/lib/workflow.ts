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

  await prisma.approval.update({
    where: { id: approval.id },
    data: {
      status: input.decision,
      decidedById: user.id,
      decidedAt: new Date(),
      decisionNote: input.note?.trim() || null,
    },
  });

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
    summary: `Quote ${quote.quoteNumber} released for ${formatMoney(quote.total)}.`,
    detail: { quoteNumber: quote.quoteNumber, total: quote.total.toString() },
  });

  await generateCustomerResponse(prisma, requestId, options.asOf ?? new Date());

  await prisma.salesRequest.update({
    where: { id: requestId },
    data: { status: "RESPONSE_READY" },
  });
  return quote.id;
}

export async function saveCustomerResponse(
  prisma: PrismaClient,
  requestId: string,
  input: { subject: string; body: string; actor: string },
) {
  const latest = await prisma.customerResponse.findFirst({
    where: { requestId },
    orderBy: { version: "desc" },
  });
  if (!latest) throw new WorkflowError("There is no draft to edit on this case.");

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
    actor: input.actor,
    summary: `Customer response edited (version ${latest.version + 1}).`,
  });
}

export async function completeCase(prisma: PrismaClient, requestId: string, actor: string) {
  const request = await prisma.salesRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.status !== "RESPONSE_READY") {
    throw new WorkflowError(
      "A case can only be completed once the customer response is ready to send.",
    );
  }
  await prisma.salesRequest.update({ where: { id: requestId }, data: { status: "COMPLETED" } });
  await recordAudit(prisma, requestId, {
    type: "CASE_COMPLETED",
    actor,
    summary: "Case closed.",
  });
}

function formatMoney(value: { toString(): string }): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value.toString()),
  );
}
