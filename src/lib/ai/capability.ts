/**
 * Which execution modes this deployment can actually offer.
 *
 * The application must never present the deterministic pipeline as though it
 * were a model-driven agent. When credentials are absent, adaptive mode is
 * reported unavailable, with the reason, and the UI says so plainly.
 */

export type ExecutionMode = "DETERMINISTIC" | "ADAPTIVE_AGENT";

export interface ModeAvailability {
  mode: ExecutionMode;
  available: boolean;
  label: string;
  description: string;
  /** Why it is unavailable. Null when it is available. */
  unavailableReason: string | null;
  model: string | null;
}

export const DEFAULT_ADAPTIVE_MODEL = "claude-sonnet-5";

export function adaptiveModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ADAPTIVE_MODEL;
}

export function adaptiveApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

/**
 * Whether this deployment may spend model credit on a live adaptive run.
 *
 * A key being present is not sufficient on a public deployment: anyone with
 * the link could run the suite in a loop. Setting PUBLIC_DEMO=true turns live
 * execution off regardless of the key, and the product falls back to the
 * captured live runs, which are labelled as such. ALLOW_LIVE_ADAPTIVE=true
 * re-enables it deliberately — for an authenticated or rate-limited demo.
 *
 * This is checked in the UI and, independently, inside runAdaptiveRequest, so
 * calling a server action directly cannot get around it.
 */
export function liveAdaptivePolicy(): { allowed: boolean; reason: string | null } {
  // The public-demo reason comes first: it is the one a visitor needs, whether
  // or not a key happens to be configured.
  if (process.env.PUBLIC_DEMO?.trim() === "true" && process.env.ALLOW_LIVE_ADAPTIVE?.trim() !== "true") {
    return {
      allowed: false,
      reason:
        "Live model runs are switched off on this public demo so visitors cannot spend API credit. The captured live runs are shown instead.",
    };
  }
  if (!adaptiveApiKey()) {
    return { allowed: false, reason: "No ANTHROPIC_API_KEY is configured, so no model is available to direct an investigation." };
  }
  return { allowed: true, reason: null };
}

export function executionModes(): ModeAvailability[] {
  const policy = liveAdaptivePolicy();
  const key = policy.allowed ? adaptiveApiKey() : null;
  return [
    {
      mode: "DETERMINISTIC",
      available: true,
      label: "Deterministic workflow",
      description:
        "Fixed tool pipeline. Runs offline, produces the same result every time, and is always available.",
      unavailableReason: null,
      model: null,
    },
    {
      mode: "ADAPTIVE_AGENT",
      available: Boolean(key),
      label: "Adaptive agent",
      description:
        "The model chooses which MCP tools to call and in what order. The same deterministic engines still decide compatibility, stock, price and approvals.",
      unavailableReason: key ? null : policy.reason,
      model: key ? adaptiveModel() : null,
    },
  ];
}

export function isAdaptiveAvailable(): boolean {
  return liveAdaptivePolicy().allowed;
}
