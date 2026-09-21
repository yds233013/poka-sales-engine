# Demo script

Two versions. The 60-second one proves the product works. The 3-minute one proves the
engineering behind it is real.

Reset first so the state is predictable:

```bash
npm run db:seed && npm run dev
```

Adaptive mode needs `ANTHROPIC_API_KEY` in `.env`. Without it — or on a public deployment with
`PUBLIC_DEMO=true` — everything below still works: live runs are reported as switched off, and
the captured live results are on screen, labelled with model and date.

---

# 60 seconds

One case, top to bottom. Do not open anything else.

### 0:00 — Overview

**Say:** "A technical sales desk. What needs a person, what's blocked, what's ready."

**Point at:** the four lanes — awaiting approval, needs review, ready to send, not analysed.

**Click:** the **Suggested walkthrough — REQ-2041** banner.

### 0:06 — The decision

**Point at:** the decision band at the top of the case.

**Say:** "Customer wants twelve of the pump they already run. They've moved the loop to
180 °C. The engine says: not that pump — PX-440 instead."

**Point at:** the red line under it — *Fluid temperature 120 °C — needs at least 180 °C*.

**Then:** "Eight from Dallas, four from Houston. A hundred and two thousand dollars.
And release is blocked."

That band is the whole answer. Everything below it is the reasoning.

### 0:20 — Technical validation

**Click:** the **Technical validation** tab.

**Point at:** the red cells — AX-220 at *120 °C*, PX-400 at *35 m³/h*.

**Say:** "Every requirement against every serious candidate. Red is a hard failure — the rule
engine's verdict, and no model can argue with it. And every value carries the data-sheet
section it came from."

**Click:** any `DS-1020 §2.1` under a PX-440 value.

**Say:** "That's the actual text the engine read." Then press back.

This is the most important beat. Let it land.

### 0:38 — Fulfillment and commercials

**Click:** the **Fulfillment** tab. **Point at:** the split bar — Dallas and Houston.

**Say:** "No single warehouse holds twelve. That split is why one of the approvals exists."

**Scroll** to Commercials. **Point at:** the hatched **Internal only** side.

**Say:** "Cost and margin sit behind that line. They never reach the customer."

### 0:50 — Approvals

**Click:** the **Approvals** tab (it shows a **3**).

**Say:** "Substitution, quote value, split shipment — each owned by a named role. The agent has
no tool that can approve or release anything."

### 0:56 — Close

**Click:** the **Agent activity** tab.

**Say:** "And that's the investigation as it actually ran — recorded tool calls, not a summary
written afterwards." Stop.

---

# 3 minutes

Everything above, then the engineering case.

### 1:00 — Who decides what

**Click:** **Agent lab** in the sidebar.

**Point at:** the diagram, top to bottom.

**Say:** "The model decides how to investigate. The engines decide what's true. People decide
what's allowed. Both execution modes cross the same MCP boundary and end at the same function."

### 1:15 — A real run

**Point at:** *Agent execution* — the captured live run badge and the seven figures.

**Say:** "REQ-2041 against claude-sonnet-5. Thirteen tools chosen, five turns, twenty seconds,
nine cents — and it landed on exactly the same quote as the deterministic pipeline, by its own
route."

**Point at:** the three **blocked** steps — AX-220, PX-420, PX-400.

### 1:35 — Adaptivity

**Point at:** *Investigation depth responds to the request*, then the grid underneath.

**Say:** "Same agent, same tools. A technical question takes five calls and never touches
pricing — look at the empty commercial column. An availability question checks stock and
stops. The substitution runs thirteen and produces a quote."

### 1:55 — The boundary

**Point at:** *MCP toolbox* — the three statements across the top.

**Say:** "No database handle, no credentials. Tools take selectors, not facts." **Expand**
`check_compatibility`. "It takes a part number. Not a temperature. It can say which part to
check; it cannot supply the requirement it's checked against."

### 2:15 — Evaluations

**Click:** **Evaluations** in the sidebar.

**Point at:** *14 / 14* and *13 / 14*.

**Say:** "Every run got the business answer right. Thirteen of fourteen passed the full eval."

**Then immediately, pointing at the red row:** "Those are different numbers on purpose. This
one was right, but didn't record why it ruled a part out — and two identical runs evaluated
nineteen candidates and twelve. It's left failing."

Do not skip this. A reviewer who sees only green assumes you tuned it.

### 2:40 — Adversarial

**Scroll** to *Adversarial runs*.

**Point at:** the dark panel, then *3 of 4*.

**Say:** "In three of four attacks the model partially complied — it repeated an invented
stock figure or price in its summary. Grounding rejected every one. The model can fail; the
system is built so that failure doesn't become business truth."

Do not soften this into "it resisted the attacks." It didn't, and that's the point.

### 2:55 — Close

**Say:** "Both modes end at the same function. The difference is orchestration, not authority."

---

## If you have a spare minute

**Run it live** (local only — a public demo has live runs switched off). In the Agent Lab
console, pick `C. Technical question` and run the adaptive agent. About twenty seconds and a
few cents. It answers without producing a quote, and the run renders from the database — the
execution panel switches from the captured run to yours.

**Prove the approval gate.** On REQ-2041 the acting user is a sales rep, and each approval says
it is reserved for a sales manager. Switch *Acting as* to a sales manager to decide one. The
role check is on the server, not in the UI.

---

## What not to show

- The catalog and technical library pages. They are real and slow to watch. Say that 77
  products and 85 documents exist; the citation click in the matrix proves the library is real.
- Raw tool JSON. Expand one step if asked; the sentences say the same thing.
- REQ-2041's customer response — there isn't one yet, by design, because the approvals are
  open. If someone asks what the customer gets, open the **Ready to send** lane on the
  overview and pick REQ-2028.
- Running the evaluation suite. It takes a minute, and the measured results are on screen.
