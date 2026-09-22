/**
 * Seed a brand-new database, and do nothing to one that already has data.
 *
 * Runs as part of the production pre-deploy step, after the migrations, so a
 * fresh deployment opens onto the canonical demo without anyone connecting to
 * the database by hand. It is deliberately not a reset: if a single product or
 * case exists it exits without touching anything. Resetting a populated demo
 * is a separate, explicit act: set DEMO_RESEED=true on the service (which only
 * the project owner can do) and it reseeds on that deploy. See docs/DEPLOYMENT.md.
 */
import { execFileSync } from "node:child_process";
import { PrismaClient } from "../src/generated/prisma";

async function main() {
  if (process.env.DEMO_RESEED?.trim() === "true") {
    process.stdout.write("DEMO_RESEED=true — resetting the demo to its seeded state.\n");
    execFileSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit" });
    return;
  }
  const prisma = new PrismaClient();
  try {
    const [products, requests] = await Promise.all([prisma.product.count(), prisma.salesRequest.count()]);
    if (products > 0 || requests > 0) {
      process.stdout.write(`Database already populated (${products} products, ${requests} cases) — not seeding.\n`);
      return;
    }
  } finally {
    await prisma.$disconnect();
  }
  process.stdout.write("Empty database — seeding the synthetic demo.\n");
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit" });
}

main().catch((error) => {
  console.error("seed-if-empty failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
