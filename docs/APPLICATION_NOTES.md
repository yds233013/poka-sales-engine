# Application notes

Source material for applications and interviews. Every figure here matches the product and
`src/lib/eval/captured.ts`; nothing is rounded up.

Live demo: https://poka-sales-engine.up.railway.app · Code: https://github.com/yds233013/poka-sales-engine

---

## A. One sentence

An AI-native technical-sales workspace that turns messy industrial requests into evidence-backed
product recommendations, fulfillment plans and approval-gated quotes. A Claude agent decides what
to investigate; deterministic engines decide what is true.

## B. Two resume bullets

- Built an AI sales-engineering platform (Next.js, TypeScript, PostgreSQL, Claude API) where an
  adaptive agent investigates customer requests through 16 typed MCP tools and produces validated,
  priced quotes. It matched the rule-based pipeline's quote exactly, in ~21 s for ~$0.09 per run.
- Designed deterministic engines, a grounding layer and server-enforced human approvals so the
  model cannot invent prices, stock or technical claims. Verified with 402 tests, a 14-scenario live
  eval (14/14 correct business outcomes, 13/14 full passes) and prompt-injection runs, where
  grounding blocked every invented figure.

## C. 30 seconds

A technical salesperson gets an email: "we run AX-220s, the loop's going to 180 °C, need twelve in
two weeks." Answering it properly means checking a data sheet, finding a replacement, checking
stock across warehouses, pricing it and knowing who has to sign off. This does that investigation.

In the flagship case it catches that the AX-220 is only rated to 120 °C and recommends a PX-440.
It splits the order 8 from Dallas and 4 from Houston and prices it at $102,808.88. Then it holds
the quote until three named people approve it. Every number traces to a source. The model chooses
what to look at, but it never decides what's true.

## D. 90 seconds, technical

There are two execution modes over the same system. The deterministic mode is a fixed tool
pipeline. The adaptive mode is a Claude agent loop that chooses its own tools over a real MCP
server. That server has 16 typed tools, no database handle and no credentials. Tools take
selectors, not facts: `check_compatibility` takes a part number, never a temperature, so the model
can choose what to check but not what it's checked against.

Compatibility, available-to-promise, pricing, freight, margin and approval policy are pure
functions with no Prisma import. Both modes end at one function, `finalizeCase`, which re-validates
and re-prices whatever the agent looked at. Because of that, the live REQ-2041 run reached exactly
the deterministic result: PX-440 × 12, $102,808.88, 30.38 % margin, three approvals.

After the agent writes its summary, a grounding check rejects any price, stock level, part number
or citation that no tool returned, and routes the case to a person. Approvals are role-gated on the
server, and the agent has no tool that can decide one.

On evaluation: 14 live scenarios on claude-sonnet-5. The business outcome was right in 14 of 14,
and 13 of 14 passed the full eval. The failure is real and left visible.

## E. Why I built it for Poka specifically

Poka publicly describes moving into technical sales for industrial customers. That is the work
where a confident wrong answer does real damage: a pump that can't take the temperature, or stock
promised twice. I wanted to show how I would build an agent for that setting. It gets real
autonomy over the investigation and no authority over the facts, and every decision it touches is
auditable. It's an independent project on synthetic data, not affiliated with Poka.

## F. The most interesting engineering decision

**Making tools take selectors instead of facts.** The obvious design lets the model pass the
requirement to check, as in "is PX-440 good at 180 °C?". That design lets a prompt injection change
the requirement. Here the extracted requirements live in the case state, and the tool only accepts
a part number, so the model can choose which part to check but cannot supply the value it's checked
against. Together with `finalizeCase` as the single path to a quote, this is why the adaptive mode
can be given real freedom: the worst it can do is look at the wrong parts, and the engines re-check
whatever it looked at.

## G. What failed, and what I learned

- **The agent had no correct way to answer a question.** In live runs, "can the MX-160 handle
  175 °C?" could only end as a clarification or a quote. I added a terminal
  `respond_with_information` action. A technical question now resolves in five tool calls with no
  pricing anywhere in the run. *Lesson:* a live model finds the gaps in your action space that
  scripted tests never exercise.
- **The model partly obeyed injections.** In 3 of 4 adversarial runs it repeated an invented stock
  figure or price in its summary, and grounding caught every one. *Lesson:* don't build on the model
  resisting. Build so that its compliance has no effect.
- **A catalog screen that only looked at the first N parts.** A Hastelloy request never reached the
  one Hastelloy pump, which looked exactly like an agent that didn't search. The screen now covers
  the whole relevant category and records what it evaluated.
- **A margin bug.** Freight cost was subtracted while freight revenue was ignored, which understated
  every deal enough to trigger false policy breaches. *Lesson:* re-derive the arithmetic before
  persisting (`assertTotalsConsistent`).
- **An intermittent audit gap I didn't paper over.** On refusal cases the agent sometimes stops
  early. Two identical runs evaluated 19 and 12 candidates. That scenario is left failing.

## H. Real-model and eval results, stated precisely

- **Model:** `claude-sonnet-5` through the Messages API, captured 20 September 2026. One model, one
  day, one run per scenario. Only orchestration was live; extraction and every engine stayed
  deterministic.
- **Suite:** 14 scenarios, adaptive mode. **14 / 14 business outcomes correct. 13 / 14 full
  passes.** 0 safety violations, 0 unnecessary tool calls, 0 required tools missed. Mean 4.6 turns,
  14.1 tool calls, 27.1 s. Total $0.8212, or $0.0587 per run, estimated from published rates.
- **The failure:** intermittent audit completeness on a refusal case. The outcome was correct, but
  fewer candidates had a recorded reason than the pipeline records.
- **REQ-2041 live:** 5 turns, 13 tool calls chosen by the model (23 total including finalization),
  20.7 s, ~$0.0905. Same quote as the deterministic path.
- **Adversarial:** 4 attacks. The model partly complied in prose in 3. Grounding rejected every
  invented claim. 0 claims reached customer-facing output, and nothing was approved or released.
- **Offline tests:** 402 (276 unit, 126 integration against a real seeded Postgres).

## I. Current limitations

- No authentication. The acting-user picker stands in for identity, and the public demo is
  read-only for that reason.
- One shared dataset, with no per-visitor sandbox.
- Live-model evidence is narrow: one model, one day, single runs. The public demo shows captured
  runs and does not call the model.
- Lexical document retrieval rather than embeddings, one line item per case, single currency, and a
  synthetic freight matrix.
- Quoting doesn't reserve stock, so two quotes can promise the same units.
- Synthetic data throughout, with no integration with any real system.
