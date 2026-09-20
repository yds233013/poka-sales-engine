# Poka Sales Engine — working notes

Invariants that hold across the whole codebase. If a change would break one of
these, that is the thing to discuss before writing it.

## Business truth

- **Deterministic engines own business truth.** Compatibility, inventory,
  available-to-promise, pricing, discounts, freight, margin and approval policy
  are computed in `src/lib/engines/`. Never reimplement any of it in a prompt,
  a tool handler or a UI component.
- **`finalizeCase` is the only path to a recommendation, a quote or an
  approval.** Both execution modes call it. A second path is how the two modes
  would drift apart.
- **Money is integer cents in the engines**, `Decimal(14,2)` at rest, with one
  rounding point where a percentage is applied. Quote totals are re-derived and
  asserted before persistence.

## The LLM boundary

- The model may read prose, choose which tools to call, decide when it has
  enough evidence, and phrase what the engines found. It may not decide a
  price, a stock level, a compatibility verdict or an approval.
- **The model cannot approve, release or send anything.** No tool does those
  things, and the workflow layer re-checks server-side regardless.
- **Answering is a terminal action, not a shortcut past grounding.**
  `respond_with_information` ends a run with an answer and never invokes the
  finalizer, so no price, quote, approval or release can result from it. Every
  claim and citation is checked twice: `canRespondWithInformation` before the
  action is spent, `checkGrounding` before anything is drafted.
- **Every technical claim requires evidence.** A price, a stock figure or a
  citation that no tool produced is rejected, and the case goes to a human
  rather than having its summary quietly rewritten.
- Tool inputs are **selectors, never facts**. Requirements are loaded from the
  case; a caller that could supply its own could make anything pass.

## Traces and audit

- **The trace must reflect actual tool execution.** Every step an operator sees
  comes from a persisted `ToolCall` row. Never synthesise a narrative after a
  run.
- Chain-of-thought is never persisted or displayed. Tool summaries are written
  in operations language for a salesperson.
- One `ToolBus` per run, so sequence numbers form a single ordered series.
- **`modelInitiated` means the agent named that tool.** Tools built on other
  tools record both, but only the outer call is the agent's. An "agent chose"
  mark that covers calls the agent never made is worse than no mark.

## Untrusted content

- Customer messages and retrieved document text are **data, not instructions**.
  They are wrapped and labelled as untrusted, and never spliced into the
  instruction channel.
- The defence is architectural, not textual: obeying an injection must change
  nothing, because no tool exists that could act on it.

## Before calling something done

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- `npm run eval` for anything touching the agent, the tools or the engines.
- Adaptive metrics are `NOT_RUN` without credentials — never zero, never a
  pass, never the deterministic numbers relabelled.
- Do not delete a test to make a change pass. Replace it with a stronger one or
  fix the code.
- **Never run a seeded case in a test or an eval.** Analysing a case rewrites
  its recommendation, quote and approvals, so REQ-2041 would carry whatever the
  last test left behind — and Vitest orders files by duration, not by name.
  Clone it (`CaseTracker.clone`, `prepareScenarioCase`) and delete the copy.
