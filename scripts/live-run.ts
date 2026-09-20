/**
 * Run one case through the adaptive agent against a real model, and print
 * everything the run actually produced.
 *
 * This exists for live validation, which has two properties ordinary tests do
 * not: it costs money, and it is not reproducible. So the script runs exactly
 * one case per invocation, always against a throwaway copy, and prints the
 * observability record rather than asserting against it — judgement about
 * whether a live run was correct belongs with the reader.
 *
 *   npx tsx scripts/live-run.ts --scenario adaptive-technical-question-only
 *   npx tsx scripts/live-run.ts --ref REQ-2041
 *   npx tsx scripts/live-run.ts --account ACC-10044 --subject "..." --body "..."
 *
 * Never prints credentials. The API key reaches the Anthropic client and
 * nothing else.
 */

import "dotenv/config";
import { PrismaClient } from "@/generated/prisma";
import { runAdaptiveRequest } from "@/lib/agent/adaptive";
import { adaptiveApiKey, adaptiveModel } from "@/lib/ai/capability";
import { scenarioById } from "@/lib/eval/scenario";
import { prepareScenarioCase } from "@/lib/eval/runner";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

async function makeCase(db: PrismaClient): Promise<{ id: string; label: string }> {
  const scenarioId = arg("scenario");
  if (scenarioId) {
    const scenario = scenarioById(scenarioId);
    if (!scenario) throw new Error(`Unknown scenario "${scenarioId}"`);
    const { requestId } = await prepareScenarioCase(db, scenario);
    return { id: requestId, label: scenario.title };
  }

  const ref = arg("ref");
  if (ref) {
    const src = await db.salesRequest.findFirstOrThrow({
      where: { reference: ref },
      include: { requirements: true, items: true },
    });
    const copy = await db.salesRequest.create({
      data: {
        reference: `LIVE-${ref}-${Date.now().toString(36)}`,
        subject: src.subject,
        rawBody: src.rawBody,
        receivedAt: src.receivedAt,
        channel: src.channel,
        customerId: src.customerId,
        siteId: src.siteId,
        contactId: src.contactId,
        ownerId: src.ownerId,
      },
    });
    return { id: copy.id, label: `${ref} (copy)` };
  }

  const body = arg("body");
  const subject = arg("subject") ?? "Live validation request";
  const account = arg("account") ?? "ACC-10044";
  if (!body) throw new Error("Pass --scenario, --ref, or --subject/--body/--account");

  const customer = await db.customer.findFirstOrThrow({
    where: { accountNumber: account },
    include: { sites: true, contacts: true },
  });
  const owner = await db.user.findFirstOrThrow({ where: { role: "SALES_REP" } });
  const created = await db.salesRequest.create({
    data: {
      reference: `LIVE-ADHOC-${Date.now().toString(36)}`,
      subject,
      rawBody: body,
      receivedAt: new Date(),
      customerId: customer.id,
      siteId: customer.sites[0]?.id ?? null,
      contactId: customer.contacts[0]?.id ?? null,
      ownerId: owner.id,
    },
  });
  return { id: created.id, label: subject };
}

async function main() {
  if (!adaptiveApiKey()) {
    console.error("No ANTHROPIC_API_KEY configured. Nothing was run and nothing was charged.");
    process.exit(1);
  }
  const db = new PrismaClient();
  const model = adaptiveModel();
  const { id, label } = await makeCase(db);
  const keep = process.argv.includes("--keep");

  console.log(`\n${"═".repeat(78)}`);
  console.log(`LIVE ADAPTIVE RUN — ${label}`);
  console.log(`model: ${model}   case: ${id}`);
  console.log("═".repeat(78));

  const started = Date.now();
  try {
    const result = await runAdaptiveRequest(db, id, { model });
    const wall = Date.now() - started;

    const run = await db.agentRun.findUniqueOrThrow({
      where: { id: result.runId },
      include: { toolCalls: { orderBy: { sequence: "asc" } } },
    });
    const request = await db.salesRequest.findUniqueOrThrow({
      where: { id },
      include: {
        approvals: true,
        responses: { orderBy: { version: "desc" }, take: 1 },
        quotes: { include: { items: { include: { product: true } } } },
        recommendations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { candidates: { include: { product: true }, orderBy: { rank: "asc" } } },
        },
      },
    });

    const agentCalls = run.toolCalls.filter((c) => c.modelInitiated);
    const systemCalls = run.toolCalls.filter((c) => !c.modelInitiated);
    const quote = request.quotes[0] ?? null;
    const rec = request.recommendations[0] ?? null;

    console.log(`\n  OUTCOME`);
    console.log(`    termination   : ${run.termination}`);
    console.log(`    case status   : ${request.status}`);
    console.log(`    recommendation: ${rec?.outcome ?? "—"}`);
    console.log(`    grounding     : ${result.groundingIssues.length === 0 ? "clean" : `${result.groundingIssues.length} issue(s)`}`);
    for (const issue of result.groundingIssues) console.log(`      ! ${issue}`);

    console.log(`\n  AGENT TOOL PATH (${agentCalls.length} calls the model chose)`);
    agentCalls.forEach((c, i) => {
      console.log(`    ${String(i + 1).padStart(2)}. ${c.toolName.padEnd(24)} ${c.status.padEnd(6)} ${String(c.durationMs).padStart(5)}ms  ${JSON.stringify(c.input).slice(0, 70)}`);
    });
    console.log(`\n  PIPELINE CALLS (${systemCalls.length}, not model-chosen)`);
    console.log(`    ${systemCalls.map((c) => c.toolName).join(" → ") || "—"}`);

    console.log(`\n  BUSINESS RESULT`);
    if (quote) {
      console.log(`    quote         : ${quote.quoteNumber}  status ${quote.status}`);
      for (const item of quote.items) {
        console.log(`    line          : ${item.product.sku} ×${item.quantity} @ ${item.unitPrice} (${item.priceSource}) = ${item.extended}`);
      }
      console.log(`    total         : $${quote.total}   margin ${quote.marginPct}%`);
    } else {
      console.log(`    quote         : none`);
    }
    console.log(`    approvals     : ${request.approvals.length}${request.approvals.length ? ` — ${request.approvals.map((a) => `${a.kind}/${a.status}`).join(", ")}` : ""}`);
    console.log(`    decided by    : ${request.approvals.filter((a) => a.decidedById).length} (must be 0 — the agent cannot decide)`);
    if (rec) console.log(`    candidates    : ${rec.candidates.map((c) => `${c.product.sku}:${c.verdict}`).join(", ")}`);
    if (request.responses[0]) {
      console.log(`    customer draft: v${request.responses[0].version}${request.responses[0].edited ? " (edited)" : ""} — "${request.responses[0].body.replace(/\s+/g, " ").slice(0, 110)}…"`);
    }

    console.log(`\n  COST AND TIMING`);
    console.log(`    turns         : ${run.turnCount}`);
    console.log(`    tool calls    : ${run.toolCallCount} model-issued`);
    console.log(`    agent duration: ${run.durationMs} ms   wall ${wall} ms`);
    console.log(`    tokens        : ${run.inputTokens} in / ${run.outputTokens} out`);
    console.log(`    cache         : ${run.cacheWriteTokens ?? 0} written / ${run.cacheReadTokens ?? 0} read`);
    console.log(`    cost          : $${run.estimatedCostUsd ?? "—"}`);
    const guardrails = (run.guardrailEvents ?? []) as { kind: string; detail: string }[];
    if (guardrails.length) {
      console.log(`\n  GUARDRAILS`);
      for (const g of guardrails) console.log(`    ${g.kind}: ${g.detail.slice(0, 400)}`);
    }
    console.log("");
  } finally {
    if (!keep) await db.salesRequest.delete({ where: { id } }).catch(() => undefined);
    else console.log(`  (case kept: ${id})\n`);
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nLIVE RUN FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
