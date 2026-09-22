import { afterEach, describe, expect, it } from "vitest";
import { liveAdaptivePolicy, isAdaptiveAvailable, executionModes } from "@/lib/ai/capability";
import { takeLiveRunSlot, resetLiveRunSlots } from "@/lib/ai/rate-limit";

/**
 * A public demo must not let an anonymous visitor spend API credit. These
 * pin the rules the deployment guide relies on.
 */

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  resetLiveRunSlots();
});

describe("live adaptive policy", () => {
  it("is unavailable without a key", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(liveAdaptivePolicy().allowed).toBe(false);
    expect(isAdaptiveAvailable()).toBe(false);
  });

  it("is available with a key on a private deployment", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.PUBLIC_DEMO;
    expect(liveAdaptivePolicy().allowed).toBe(true);
  });

  it("is switched off on a public demo even when a key is present", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.PUBLIC_DEMO = "true";
    const policy = liveAdaptivePolicy();
    expect(policy.allowed).toBe(false);
    expect(policy.reason).toMatch(/public demo/i);
    // And the UI reports it the same way, with the reason.
    const adaptive = executionModes().find((m) => m.mode === "ADAPTIVE_AGENT")!;
    expect(adaptive.available).toBe(false);
    expect(adaptive.unavailableReason).toMatch(/public demo/i);
  });

  it("gives the public-demo reason on a public demo with no key", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.PUBLIC_DEMO = "true";
    const policy = liveAdaptivePolicy();
    expect(policy.allowed).toBe(false);
    expect(policy.reason).toMatch(/public demo/i);
  });

  it("can be re-enabled deliberately on a public demo", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.PUBLIC_DEMO = "true";
    process.env.ALLOW_LIVE_ADAPTIVE = "true";
    expect(liveAdaptivePolicy().allowed).toBe(true);
  });
});

describe("live run rate limit", () => {
  it("is unlimited when no limit is configured", () => {
    delete process.env.ADAPTIVE_MAX_RUNS_PER_HOUR;
    for (let i = 0; i < 50; i++) expect(takeLiveRunSlot()).toBe(true);
  });

  it("refuses runs past the hourly limit and recovers after the window", () => {
    process.env.ADAPTIVE_MAX_RUNS_PER_HOUR = "2";
    const t0 = 1_000_000;
    expect(takeLiveRunSlot(t0)).toBe(true);
    expect(takeLiveRunSlot(t0 + 1)).toBe(true);
    expect(takeLiveRunSlot(t0 + 2)).toBe(false);
    expect(takeLiveRunSlot(t0 + 61 * 60_000)).toBe(true);
  });
});
