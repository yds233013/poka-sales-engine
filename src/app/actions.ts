"use server";

/**
 * Server actions.
 *
 * Thin: each one validates its input, delegates to the workflow module (which
 * owns the rules) and revalidates. No business logic lives here, so there is
 * no second, weaker copy of the approval gate behind the UI.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runSalesRequest } from "@/lib/agent/orchestrator";
import {
  completeCase,
  decideApproval,
  releaseQuote,
  repriceQuote,
  saveCustomerResponse,
  WorkflowError,
} from "@/lib/workflow";

export interface ActionResult {
  ok: boolean;
  message: string;
}

function fail(error: unknown): ActionResult {
  if (error instanceof WorkflowError) return { ok: false, message: error.message };
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return { ok: false, message };
}

function revalidateCase(requestId: string) {
  revalidatePath(`/cases/${requestId}`);
  revalidatePath("/inbox");
  revalidatePath("/approvals");
  revalidatePath("/");
}

const idSchema = z.string().min(1);

export async function runAnalysisAction(requestId: string): Promise<ActionResult> {
  try {
    idSchema.parse(requestId);
    const outcome = await runSalesRequest(prisma, requestId);
    revalidateCase(requestId);
    return {
      ok: true,
      message:
        outcome.approvalCount > 0
          ? `Analysis complete — ${outcome.approvalCount} approval(s) required before this can be sent.`
          : "Analysis complete.",
    };
  } catch (error) {
    revalidateCase(requestId);
    return fail(error);
  }
}

const decisionSchema = z.object({
  approvalId: z.string().min(1),
  userId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
  note: z.string().max(2000).optional(),
});

export async function decideApprovalAction(input: {
  approvalId: string;
  userId: string;
  decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
  note?: string;
}): Promise<ActionResult> {
  try {
    const parsed = decisionSchema.parse(input);
    const requestId = await decideApproval(prisma, parsed);
    revalidateCase(requestId);
    return { ok: true, message: `Decision recorded: ${parsed.decision.replace("_", " ").toLowerCase()}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function releaseQuoteAction(input: {
  requestId: string;
  userId: string;
}): Promise<ActionResult> {
  try {
    idSchema.parse(input.requestId);
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) return { ok: false, message: "Unknown user." };
    await releaseQuote(prisma, input.requestId, { actor: user.name, actorId: user.id });
    revalidateCase(input.requestId);
    return { ok: true, message: "Quote released and the customer response drafted." };
  } catch (error) {
    return fail(error);
  }
}

const responseSchema = z.object({
  requestId: z.string().min(1),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
  actor: z.string().min(1),
  userId: z.string().min(1).optional(),
});

export async function saveResponseAction(input: {
  requestId: string;
  subject: string;
  body: string;
  actor: string;
  userId?: string;
}): Promise<ActionResult> {
  try {
    const parsed = responseSchema.parse(input);
    await saveCustomerResponse(prisma, parsed.requestId, parsed);
    revalidateCase(parsed.requestId);
    return { ok: true, message: "Response saved." };
  } catch (error) {
    return fail(error);
  }
}

const repriceSchema = z.object({
  requestId: z.string().min(1),
  discountPct: z.number().min(0).max(95),
  userId: z.string().min(1),
});

export async function repriceQuoteAction(input: {
  requestId: string;
  discountPct: number;
  userId: string;
}): Promise<ActionResult> {
  try {
    const parsed = repriceSchema.parse(input);
    const user = await prisma.user.findUnique({ where: { id: parsed.userId } });
    if (!user) return { ok: false, message: "Unknown user." };
    await repriceQuote(prisma, parsed.requestId, {
      discountPct: parsed.discountPct,
      actor: user.name,
      actorId: user.id,
    });
    revalidateCase(parsed.requestId);
    return {
      ok: true,
      message: `Repriced at ${parsed.discountPct}% off list. Approvals re-evaluated.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function completeCaseAction(input: {
  requestId: string;
  actor: string;
}): Promise<ActionResult> {
  try {
    idSchema.parse(input.requestId);
    await completeCase(prisma, input.requestId, input.actor);
    revalidateCase(input.requestId);
    return { ok: true, message: "Case closed." };
  } catch (error) {
    return fail(error);
  }
}
