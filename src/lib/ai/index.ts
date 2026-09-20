import type { AIProvider } from "./provider";
import { MockProvider } from "./mock-provider";
import { AnthropicProvider } from "./anthropic-provider";

let cached: AIProvider | null = null;

/**
 * Resolve the configured provider.
 *
 * Falls back to the deterministic provider whenever a remote provider is
 * requested without a usable key, and says so rather than failing — a missing
 * key is a configuration state, not an error.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const configured = (process.env.AI_PROVIDER ?? "mock").toLowerCase();
  const key = process.env.ANTHROPIC_API_KEY?.trim();

  if (configured === "anthropic" && key) {
    cached = new AnthropicProvider(key, process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5");
  } else {
    cached = new MockProvider();
  }
  return cached;
}

export function providerStatus(): { id: string; label: string; remote: boolean; note: string } {
  const provider = getAIProvider();
  const configured = (process.env.AI_PROVIDER ?? "mock").toLowerCase();
  const note =
    configured === "anthropic" && provider.remote
      ? "Language steps use the Claude API. Pricing, inventory, compatibility and approvals remain deterministic."
      : configured === "anthropic"
        ? "AI_PROVIDER is set to anthropic but no API key is present — running deterministically."
        : "Running fully offline. No request leaves this machine.";
  return { id: provider.id, label: provider.label, remote: provider.remote, note };
}

export type { AIProvider };
