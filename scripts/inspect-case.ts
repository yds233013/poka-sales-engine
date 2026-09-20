/**
 * Inspect one case end to end from the command line.
 *
 * Useful when a scenario does not behave as expected: prints the extracted
 * requirements, every candidate with its failed checks, the quote arithmetic,
 * the approvals and the full tool trace.
 *
 *   npx tsx scripts/inspect-case.ts REQ-2041
 */
import { PrismaClient } from "../src/generated/prisma";

const p = new PrismaClient();
const ref = process.argv[2];

async function main() {
  if (!ref) {
    console.error("Usage: npx tsx scripts/inspect-case.ts <REQUEST-REFERENCE>");
    process.exit(1);
  }

const r = await p.salesRequest.findFirstOrThrow({
  where: { reference: ref },
  include: {
    customer: true, site: true,
    requirements: true,
    recommendations: { include: { candidates: { include: { checks: true }, orderBy: { rank: "asc" } } } },
    quotes: { include: { items: { include: { product: true } } } },
    approvals: true,
    runs: { include: { toolCalls: { orderBy: { sequence: "asc" } } } },
  },
});
console.log(`\n=== ${r.reference} ${r.subject} | ${r.status} risk=${r.risk}`);
console.log("REQUIREMENTS:");
for (const q of r.requirements) console.log(`  ${q.kind.padEnd(9)} ${q.key.padEnd(22)} ${String(q.numValue ?? q.textValue ?? "-").padEnd(28)} conf=${q.confidence}`);
const rec = r.recommendations[0];
if (rec) {
  console.log(`\nRECOMMENDATION [${rec.outcome}] ${rec.headline}`);
  console.log("  " + rec.rationale.slice(0, 600));
  console.log("\nCANDIDATES:");
  for (const c of rec.candidates.slice(0, 12)) {
    const prod = await p.product.findUnique({ where: { id: c.productId } });
    console.log(`  #${String(c.rank).padStart(2)} ${(prod?.sku ?? "").padEnd(11)} ${c.verdict.padEnd(16)} score=${String(c.score).padStart(6)} avail=${c.availableQty ?? "-"} | ${c.reason.slice(0,120)}`);
    for (const ch of c.checks.filter(x=>x.result!=="PASS")) console.log(`        ${ch.result.padEnd(8)} ${ch.label}: ${ch.actual} vs ${ch.requirement}`);
  }
}
for (const q of r.quotes) {
  console.log(`\nQUOTE ${q.quoteNumber} [${q.status}] sub=${q.subtotal} freight=${q.freightCost} total=${q.total} margin=${q.marginAmount} (${q.marginPct}%)`);
  for (const i of q.items) console.log(`  L${i.lineNumber} ${i.product.sku} x${i.quantity} @ ${i.unitPrice} (${i.discountPct}% off ${i.listPrice}) src=${i.priceSource} ext=${i.extended} alloc=${JSON.stringify((i.allocations as { quantity: number; warehouseCode: string; source: string }[]).map(a=>`${a.quantity}@${a.warehouseCode}/${a.source}`))}`);
}
console.log("\nAPPROVALS:");
for (const a of r.approvals) console.log(`  [${a.status}] ${a.kind} (${a.requiredRole}) — ${a.title}`);
console.log("\nTRACE:");
for (const t of r.runs[0]?.toolCalls ?? []) console.log(`  ${String(t.sequence).padStart(2)}. ${t.toolName.padEnd(22)} ${t.status.padEnd(7)} ${t.summary.slice(0,140)}`);

}

main().finally(() => p.$disconnect());
