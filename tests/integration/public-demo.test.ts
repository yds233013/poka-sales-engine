import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The actions call revalidatePath, which needs a Next request scope.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { db, requestByRef } from "../support/db";
import {
  completeCaseAction,
  decideApprovalAction,
  releaseQuoteAction,
  repriceQuoteAction,
  runAnalysisAction,
  saveResponseAction,
} from "@/app/actions";
import { runEvalSuite, runInLab } from "@/app/agent-lab/actions";
import { EVAL_SUITE_DISABLED_REASON, isPublicDemoRefusal, READ_ONLY_REFUSAL } from "@/lib/demo-mode";

/**
 * PUBLIC_DEMO=true must protect the shared dataset on the server, not only in
 * the UI. Each action is called directly — as a visitor posting to the action
 * endpoint would — and REQ-2041 is checked afterwards to be exactly as seeded.
 */

async function snapshot() {
  const request = await requestByRef("REQ-2041");
  const approvals = await db.approval.findMany({
    where: { requestId: request.id },
    select: { id: true, status: true },
    orderBy: { id: "asc" },
  });
  const quotes = await db.quote.findMany({
    where: { requestId: request.id },
    select: { id: true, status: true, total: true },
    orderBy: { id: "asc" },
  });
  const runs = await db.agentRun.count({ where: { requestId: request.id } });
  const responses = await db.customerResponse.count({ where: { requestId: request.id } });
  return {
    request: { id: request.id, status: request.status },
    approvals,
    quotes: quotes.map((q) => ({ ...q, total: q.total.toString() })),
    runs,
    responses,
  };
}

let previous: string | undefined;
beforeEach(() => {
  previous = process.env.PUBLIC_DEMO;
  process.env.PUBLIC_DEMO = "true";
});
afterEach(() => {
  if (previous === undefined) delete process.env.PUBLIC_DEMO;
  else process.env.PUBLIC_DEMO = previous;
});
afterAll(async () => {
  await db.$disconnect();
});

describe("public demo write protection", () => {
  it("refuses every case mutation and leaves REQ-2041 untouched", async () => {
    const before = await snapshot();
    const requestId = before.request.id;
    const approval = before.approvals[0];
    const manager = await db.user.findFirstOrThrow({ where: { role: "SALES_MANAGER" } });

    const results = [
      await runAnalysisAction(requestId, "DETERMINISTIC"),
      await runAnalysisAction(requestId, "ADAPTIVE_AGENT"),
      await decideApprovalAction({ approvalId: approval.id, userId: manager.id, decision: "APPROVED" }),
      await releaseQuoteAction({ requestId, userId: manager.id }),
      await repriceQuoteAction({ requestId, discountPct: 40, userId: manager.id }),
      await saveResponseAction({ requestId, subject: "x", body: "y", actor: manager.name }),
      await completeCaseAction({ requestId, actor: manager.name }),
    ];
    for (const result of results) {
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/public demo is read-only/i);
      // Each one is a marked refusal, so the UI can tell it from a failure.
      expect(isPublicDemoRefusal(result)).toBe(true);
    }

    expect(await snapshot()).toEqual(before);
  });

  it("refuses custom requests, seeded-case re-runs and adaptive runs in the lab", async () => {
    const before = await db.salesRequest.count();
    const refused = [
      await runInLab({
        mode: "DETERMINISTIC",
        customRfq: { accountNumber: "ACC-10044", subject: "Visitor request", body: "Please quote 4 x PX-440 for the Dallas plant." },
      }),
      await runInLab({ mode: "DETERMINISTIC", reference: "REQ-2041" }),
      await runInLab({ mode: "ADAPTIVE_AGENT", scenarioId: "hero-substitution" }),
    ];
    for (const result of refused) {
      expect(result.ok).toBe(false);
      expect(result.runId).toBeNull();
    }
    expect(await db.salesRequest.count()).toBe(before);
  });

  it("still runs a seeded scenario deterministically, on a throwaway copy", async () => {
    const before = await snapshot();
    const result = await runInLab({ mode: "DETERMINISTIC", scenarioId: "hero-substitution" });
    expect(result.ok).toBe(true);
    const copy = await db.salesRequest.findUniqueOrThrow({ where: { id: result.requestId! } });
    expect(copy.reference).toMatch(/^EVAL-/);
    expect(copy.id).not.toBe(before.request.id);
    expect(await snapshot()).toEqual(before);
    await db.salesRequest.delete({ where: { id: copy.id } });
  }, 60_000);

  it("refuses the evaluation suite as an answer, not as a server error", async () => {
    // Thrown, this reached the browser as an opaque digest and the visitor saw
    // a generic 500 for a rule this deployment enforces on purpose.
    const before = await snapshot();
    const runsBefore = await db.agentRun.count();
    const evalCasesBefore = await db.salesRequest.count({ where: { reference: { startsWith: "EVAL-" } } });

    const result = await runEvalSuite();

    expect(result.ok).toBe(false);
    expect(isPublicDemoRefusal(result)).toBe(true);
    expect(result).toMatchObject({ refusal: READ_ONLY_REFUSAL, message: EVAL_SUITE_DISABLED_REASON });
    // Nothing ran: no scenario executed, no throwaway case created.
    expect(await db.agentRun.count()).toBe(runsBefore);
    expect(await db.salesRequest.count({ where: { reference: { startsWith: "EVAL-" } } })).toBe(evalCasesBefore);
    expect(await snapshot()).toEqual(before);
  });
});
