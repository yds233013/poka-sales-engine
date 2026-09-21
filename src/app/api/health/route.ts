import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { liveAdaptivePolicy } from "@/lib/ai/capability";

/**
 * Liveness and readiness in one response, for a platform health check.
 *
 * Reports whether the database answers and whether live model runs are
 * allowed on this deployment — never why in terms of configuration values,
 * and never a secret. A failing database returns 503 so the platform can
 * hold traffic back from an instance that cannot serve pages.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let database: "ok" | "unavailable" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unavailable";
  }
  const body = {
    status: database === "ok" ? "ok" : "degraded",
    database,
    deterministicEngines: "ok",
    liveAdaptive: liveAdaptivePolicy().allowed ? "enabled" : "disabled",
    checkedInMs: Date.now() - started,
  };
  return NextResponse.json(body, { status: database === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
}
