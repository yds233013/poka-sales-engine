/**
 * What the evaluation dashboard should show for a suite response.
 *
 * The rule lives here rather than inside the component so it can be tested
 * without a browser, and so there is one place that decides what counts as a
 * deliberate refusal. A refusal is shown as a plain explanation; a genuine
 * fault is never dressed up as one — those throw and reach the error boundary.
 */

import { isPublicDemoRefusal } from "@/lib/demo-mode";

/** Anything the action may return: the suite, or a refusal. */
type SuiteLike = { ok: true } | { ok: false; message?: string };

/** The sentence to show, or null when the suite ran and should be rendered. */
export function suiteNotice(result: SuiteLike): string | null {
  if (result.ok) return null;
  if (isPublicDemoRefusal(result)) return result.message;
  // Not a refusal this deployment issued: say so plainly rather than claiming
  // the demo is read-only, which would hide a real failure.
  return "The evaluation suite could not be run.";
}
