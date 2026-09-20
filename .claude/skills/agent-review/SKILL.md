---
name: agent-review
description: Review agent, MCP, grounding and safety changes in Poka Sales Engine. Use when changing src/lib/mcp/, src/lib/agent/adaptive/, src/lib/engines/, or anything that touches what the model is allowed to decide.
---

# Reviewing agent and tool changes

Work through these in order. Stop at the first one that fails and fix it before
continuing — they are ordered by how much damage a miss does.

## 1. Business truth

- Does the change let the model decide something an engine should decide?
  Check for arithmetic, thresholds or comparisons appearing in a prompt, a
  handler or a component.
- Does every path to a recommendation, quote or approval still go through
  `finalizeCase`?
- If a number is now produced somewhere new, is it re-derived and asserted?

## 2. Tool contracts

- Does any new tool input accept a *fact* rather than a *selector*? Run the
  contract test — it greps input keys for spec-like names.
- Is the effect classification right, and does it match what the handler
  actually does?
- Does the description tell the model when **not** to call it? Unnecessary
  calls are a measured failure.
- Could the output leak a credential, connection string or internal id?

## 3. Grounding

- Can the model now assert something no tool produced? Add a case to
  `checkGrounding` if so.
- Does the change grade the *model's* claims rather than the finalizer's
  authoritative output?

## 4. Safety boundary

Confirm these still hold, by test rather than by reading:

- the agent cannot approve an approval or release a quote;
- a hard compatibility failure cannot be quoted;
- a fabricated quantity or stock figure cannot enter a plan;
- an injected instruction in an RFQ or a document changes nothing.

## 5. Trace integrity

- Does every new step an operator can see correspond to a persisted tool call?
- Are sequence numbers still a single ordered series?
- Is `modelInitiated` set correctly — agent choices distinguished from
  pipeline steps?

## 6. Evidence

Run `npm run eval`. A failed critical check means unsafe, not imperfect. Then
`npm test` and confirm no existing test was weakened to accommodate the change.
