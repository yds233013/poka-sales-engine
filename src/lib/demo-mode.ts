/**
 * Public-demo write protection.
 *
 * A public deployment shares one synthetic dataset between every visitor. With
 * PUBLIC_DEMO=true the product stays fully browsable, but anything that would
 * change that shared state — deciding an approval, releasing or repricing a
 * quote, editing a response, re-running a seeded case, creating a request,
 * running the evaluation suite — is refused on the server, so REQ-2041 looks
 * the same for the next visitor as it did for the last.
 *
 * The check lives in the server actions, not only in the UI: a visitor who
 * calls an action directly gets the same refusal as one who clicks a disabled
 * button. Locally (PUBLIC_DEMO unset) every action works as before.
 *
 * A refusal is returned as data (see `publicDemoRefusal`), never thrown: the
 * visitor gets a plain explanation instead of a generic server error, while a
 * real fault still surfaces as a real fault.
 *
 * One thing stays runnable: a seeded Agent Lab scenario in deterministic mode.
 * It runs against a throwaway copy of the case, never the canonical one, costs
 * nothing, and old copies are swept before each run.
 */

export function isPublicDemo(): boolean {
  return process.env.PUBLIC_DEMO?.trim() === "true";
}

export const READ_ONLY_REASON =
  "This public demo is read-only, so every visitor sees the same data. Clone the repository to use this — it works locally.";

/**
 * Why the evaluation suite in particular is off here: it runs for over a
 * minute and, with a model configured, spends credit on every scenario.
 */
export const EVAL_SUITE_DISABLED_REASON =
  "This action is disabled in the public demo. The evaluation suite runs for over a minute and, with a model configured, spends API credit — it can be run in a local or authenticated environment (npm run eval). The measured results above are unaffected.";

/**
 * A refusal is an expected answer, not a failure.
 *
 * Server actions return this shape rather than throwing. A thrown error is how
 * Next.js reports something unexpected: the client receives an opaque digest
 * and the visitor sees a generic server error, which is the wrong thing to
 * show for a rule the deployment is deliberately enforcing. Throwing stays for
 * genuine faults, so those still look like faults.
 */
export const READ_ONLY_REFUSAL = "PUBLIC_DEMO_READ_ONLY" as const;

export interface PublicDemoRefusal {
  ok: false;
  /** Present only on a deliberate refusal; absent on every other failure. */
  refusal: typeof READ_ONLY_REFUSAL;
  message: string;
}

/** True for a refusal this module produced, and for nothing else. */
export function isPublicDemoRefusal(value: unknown): value is PublicDemoRefusal {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { refusal?: unknown }).refusal === READ_ONLY_REFUSAL
  );
}

/** The refusal a mutating server action returns on a public demo, or null. */
export function publicDemoRefusal(message: string = READ_ONLY_REASON): PublicDemoRefusal | null {
  return isPublicDemo() ? { ok: false, refusal: READ_ONLY_REFUSAL, message } : null;
}
