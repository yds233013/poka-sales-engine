import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EVAL_SUITE_DISABLED_REASON,
  isPublicDemoRefusal,
  publicDemoRefusal,
  READ_ONLY_REASON,
  READ_ONLY_REFUSAL,
} from "@/lib/demo-mode";
import { suiteNotice } from "@/lib/eval/suite-response";

/**
 * A refusal the public demo issues on purpose is an answer, not a fault.
 *
 * Thrown from a server action it reached the browser as an opaque server
 * error, and the visitor saw a generic 500 for a rule the deployment is
 * deliberately enforcing. These tests pin the two halves of the fix: the
 * refusal is a value with a marker of its own, and anything without that
 * marker is never described as a read-only refusal.
 */

let previous: string | undefined;
beforeEach(() => {
  previous = process.env.PUBLIC_DEMO;
});
afterEach(() => {
  if (previous === undefined) delete process.env.PUBLIC_DEMO;
  else process.env.PUBLIC_DEMO = previous;
});

describe("publicDemoRefusal", () => {
  it("is nothing at all when this is not a public demo", () => {
    delete process.env.PUBLIC_DEMO;
    expect(publicDemoRefusal()).toBeNull();
    expect(publicDemoRefusal(EVAL_SUITE_DISABLED_REASON)).toBeNull();
  });

  it("carries a marker and a sentence a visitor can read", () => {
    process.env.PUBLIC_DEMO = "true";
    const refusal = publicDemoRefusal();
    expect(refusal).toEqual({ ok: false, refusal: READ_ONLY_REFUSAL, message: READ_ONLY_REASON });
    expect(isPublicDemoRefusal(refusal)).toBe(true);
  });

  it("can explain a particular action rather than the deployment in general", () => {
    process.env.PUBLIC_DEMO = "true";
    const refusal = publicDemoRefusal(EVAL_SUITE_DISABLED_REASON)!;
    expect(refusal.message).toBe(EVAL_SUITE_DISABLED_REASON);
    expect(refusal.message).toMatch(/disabled in the public demo/i);
    expect(refusal.message).toMatch(/local/i);
  });
});

describe("isPublicDemoRefusal", () => {
  it("recognises only a refusal this module produced", () => {
    process.env.PUBLIC_DEMO = "true";
    expect(isPublicDemoRefusal(publicDemoRefusal())).toBe(true);
  });

  it("does not mistake a failure, an error or a look-alike for one", () => {
    // A genuine fault must never be presented as "this is switched off here".
    expect(isPublicDemoRefusal(new Error(READ_ONLY_REASON))).toBe(false);
    expect(isPublicDemoRefusal({ ok: false, message: READ_ONLY_REASON })).toBe(false);
    expect(isPublicDemoRefusal({ ok: false, refusal: "SOMETHING_ELSE", message: "x" })).toBe(false);
    expect(isPublicDemoRefusal(null)).toBe(false);
    expect(isPublicDemoRefusal(undefined)).toBe(false);
    expect(isPublicDemoRefusal("PUBLIC_DEMO_READ_ONLY")).toBe(false);
  });
});

describe("what the evaluation dashboard shows", () => {
  it("shows nothing when the suite ran: the results are the answer", () => {
    expect(suiteNotice({ ok: true })).toBeNull();
  });

  it("shows the deployment's own sentence when it refused", () => {
    process.env.PUBLIC_DEMO = "true";
    expect(suiteNotice(publicDemoRefusal(EVAL_SUITE_DISABLED_REASON)!)).toBe(EVAL_SUITE_DISABLED_REASON);
  });

  it("does not claim a read-only demo for a failure that was not one", () => {
    const notice = suiteNotice({ ok: false, message: "Database connection lost" });
    expect(notice).toBe("The evaluation suite could not be run.");
    expect(notice).not.toMatch(/public demo|read-only/i);
  });
});
