/**
 * Audit trail.
 *
 * One append-only stream per case. Every consequential act writes here — the
 * agent's own steps, approval decisions, manual edits, quote release,
 * response generation — so the trail answers "what happened, when, and why"
 * without cross-referencing three tables.
 */

import type { PrismaClient } from "@/generated/prisma";

export interface AuditInput {
  type: string;
  actor: string;
  actorId?: string | null;
  summary: string;
  detail?: unknown;
}

export async function recordAudit(
  prisma: PrismaClient,
  requestId: string,
  input: AuditInput,
): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      requestId,
      type: input.type,
      actor: input.actor,
      actorId: input.actorId ?? null,
      summary: input.summary,
      detail: input.detail === undefined ? undefined : (JSON.parse(JSON.stringify(input.detail)) as object),
    },
  });
}

/** Human-readable label for an audit event type. */
export const AUDIT_LABELS: Record<string, string> = {
  REQUEST_RECEIVED: "Request received",
  RUN_STARTED: "Analysis started",
  RUN_FAILED: "Analysis failed",
  RECOMMENDATION_GENERATED: "Recommendation generated",
  RECOMMENDATION_BLOCKED: "Recommendation blocked",
  INFORMATION_REQUESTED: "Information requested",
  APPROVAL_REQUESTED: "Approval requested",
  APPROVAL_GRANTED: "Approval granted",
  APPROVAL_REJECTED: "Approval rejected",
  APPROVAL_CHANGES_REQUESTED: "Changes requested",
  RESPONSE_GENERATED: "Response drafted",
  RESPONSE_EDITED: "Response edited",
  QUOTE_RELEASED: "Quote released",
  QUOTE_REPRICED: "Quote repriced",
  CASE_COMPLETED: "Case completed",
  OWNER_ASSIGNED: "Owner assigned",
};
