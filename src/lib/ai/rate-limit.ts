/**
 * A per-process cap on live adaptive runs.
 *
 * Defence in depth for a deployment that has deliberately re-enabled live
 * runs (ALLOW_LIVE_ADAPTIVE=true). It is in-memory, so each server instance
 * counts separately — adequate for a single long-running container, and
 * documented as insufficient on its own for autoscaled or serverless hosting,
 * where a shared store or authentication belongs in front of it.
 */

const WINDOW_MS = 60 * 60_000;
const started: number[] = [];

export function liveRunLimit(): number | null {
  const raw = process.env.ADAPTIVE_MAX_RUNS_PER_HOUR?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** Record a run if the budget allows it. Returns false when the hour is spent. */
export function takeLiveRunSlot(now = Date.now()): boolean {
  const limit = liveRunLimit();
  if (limit === null) return true;
  while (started.length && now - started[0] > WINDOW_MS) started.shift();
  if (started.length >= limit) return false;
  started.push(now);
  return true;
}

/** Test hook: forget every recorded run. */
export function resetLiveRunSlots(): void {
  started.length = 0;
}
