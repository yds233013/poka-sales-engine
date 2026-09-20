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

export function executionModes(): ModeAvailability[] {
  const key = adaptiveApiKey();
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
      unavailableReason: key
        ? null
        : "No ANTHROPIC_API_KEY is configured, so no model is available to direct an investigation.",
      model: key ? adaptiveModel() : null,
    },
  ];
}

export function isAdaptiveAvailable(): boolean {
  return adaptiveApiKey() !== null;
}
