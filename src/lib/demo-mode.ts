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
 * One thing stays runnable: a seeded Agent Lab scenario in deterministic mode.
 * It runs against a throwaway copy of the case, never the canonical one, costs
 * nothing, and old copies are swept before each run.
 */

export function isPublicDemo(): boolean {
  return process.env.PUBLIC_DEMO?.trim() === "true";
}

export const READ_ONLY_REASON =
  "This public demo is read-only, so every visitor sees the same data. Clone the repository to use this — it works locally.";

/** The refusal a mutating server action returns on a public demo, or null. */
export function publicDemoRefusal(): { ok: false; message: string } | null {
  return isPublicDemo() ? { ok: false, message: READ_ONLY_REASON } : null;
}
