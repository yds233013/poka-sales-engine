# Demo script

Two versions. The 60-second one proves the product works. The 3-minute one proves the
engineering behind it is real.

Reset first so the state is predictable:

```bash
npm run db:seed && npm run dev
```

Adaptive mode needs `ANTHROPIC_API_KEY` in `.env`. Without it everything below still works —
the Agent Lab reports adaptive as unavailable rather than pretending, and the captured live
results are still on screen.

---

# 60 seconds

One case, told end to end. Do not open anything else.

### 0:00 — Dashboard

**Say:** "A technical sales desk. Requests in, and what's stuck."

**Point at:** the work queue — ordered by what needs a person, not by what arrived last.

Don't linger. One sentence, then move.

### 0:08 — Open REQ-2041

**Click:** `REQ-2041 — Line 4 pump replacement`.

**Say:** "Customer wants twelve of the pump they already run. But they've converted the loop to
thermal fluid at 180 °C."

**Point at:** the recommendation headline — **PX-440 in place of AX-220**.

### 0:20 — The rejection

**Point at:** *Closest parts ruled out*.

**Say:** "Their own part fails. Fluid temperature 120 °C against 180 °C required. PX-400 fails on
flow. Those numbers came from a rule engine — the model didn't decide this and can't argue
with it."

This is the single most important beat. Let it land.

### 0:32 — Evidence

**Point at:** any `DOCUMENT DS-1020 §2.1` chip under Technical validation.

**Say:** "Every technical claim resolves to a section of a data sheet. Nothing here is asserted."

### 0:40 — Inventory and commercials

**Point at:** the fulfillment plan — 8 from Dallas, 4 from Houston.

**Say:** "No single warehouse holds twelve, so it's a split shipment, and that split is why one of
the approvals exists."

**Point at:** the commercial block — **INTERNAL ONLY · never sent to the customer**.

**Say:** "Cost and margin sit behind that line. They cannot reach the customer response."

### 0:50 — Approvals

**Point at:** the three pending approvals and the greyed-out **Release blocked** button.

**Say:** "Substitution, quote value, split shipment. Three approvals, each with the role that owns
it. Nothing goes out until a human clears them — and the agent has no tool that can."

### 0:58 — Close

**Say:** "That whole investigation is recorded as executed tool calls, not a summary written
afterwards."

Scroll once to *What the engine did*. Stop.

---

# 3 minutes

Everything above, then the engineering case.

### 1:00 — Agent Lab

**Click:** `Agent lab`.

**Point at:** *The agent decides / The engines decide*.

**Say:** "This is the whole architecture in two columns. The model picks the route. The engines
decide what's true."

### 1:15 — Live validation

**Point at:** the four figures.

**Say:** "Fourteen scenarios against claude-sonnet-5. Fourteen out of fourteen reached the right
commercial answer. Thirteen of fourteen passed the eval."

**Then immediately:** "Those are different numbers on purpose."

**Point at:** *The scenario that failed*.

**Say:** "One run got the right answer but didn't record why it ruled a part out. Correct
outcome, incomplete audit trail. It's left failing — two runs minutes apart evaluated nineteen
candidates and twelve, so it's reliability of investigation breadth, not capability."

Do not skip this. A reviewer who sees a green dashboard assumes you tuned it.

### 1:45 — Adaptivity

**Point at:** *Investigation depth responds to the request*.

**Say:** "Three real runs. A technical question uses five tools and never touches pricing. An
availability question checks stock and stops. The substitution case runs twelve and produces a
quote. Same agent, same tools — different requests."

### 2:10 — Adversarial

**Point at:** *What happened when the request attacked the agent*.

**Say:** "Four attacks. In three of them the model partially complied — it did the tool work
correctly and then repeated an invented stock figure or price in its summary."

**Then:** "Grounding rejected every one. That's the design principle: the model can fail, and the
system is built so a model failure doesn't silently become business truth."

This is the strongest thirty seconds available. Do not soften it into "it resisted the attacks."

### 2:35 — MCP boundary

**Point at:** the MCP tool surface, right column.

**Say:** "Sixteen tools over the Model Context Protocol. Typed schemas, safety classification,
side-effect classification. The model has no database handle and no credentials — it gets these
capabilities and nothing else."

**Point at:** `check_compatibility · deterministic computation`.

**Say:** "Note what it takes: a part number. Not a temperature. It can say *which* part to check.
It cannot supply the requirement it's checked against."

### 2:55 — Close

**Say:** "Both modes end at the same function. The difference is orchestration, not authority."

---

## If you have a spare minute

**Run it live.** In the Agent Lab, pick `C. Technical question` and run the adaptive agent. It
takes about 20 seconds and costs about seven cents. It will answer the question in five or six
tool calls without producing a quote, and the run record renders from the database — model,
turns, tool sequence, tokens, cost.

**Prove the approval gate.** On REQ-2041, switch *Acting as* to a sales representative and try to
clear the substitution approval. It refuses — the role gate is enforced server-side, not hidden
in the UI.

---

## What not to show

- The catalog and technical library. They are real and they are boring to watch. Mention that
  77 products and 85 documents exist; don't scroll them.
- Raw JSON in tool inputs/outputs unless asked. The summaries say the same thing.
- The customer response on REQ-2041 — there isn't one yet, by design, because the approvals are
  open. If someone asks what the customer gets, open `REQ-2028`, which has cleared.
- Running the full eval suite. It takes a minute and the captured results are already on screen.
