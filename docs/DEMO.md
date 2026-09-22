# Demo script

Two paths. The 60-second one shows the product value; the 3-minute one adds the engineering
behind it.

**Where:** the live demo, https://poka-sales-engine.up.railway.app. It is read-only, so it looks
the same every time. Everything below works there. Buttons that would change data are disabled
and say why. Running locally (`npm run db:seed && npm run dev`) gives the same screens with every
action enabled.

Use a desktop-width window. Below 1280 px the sidebar collapses to icons.

---

# 60-second product demo

One case, top to bottom. Don't open anything else.

### 0:00 · Overview · `/`

**Say:** "This is a technical sales desk. It shows what needs a person, what's blocked and what's
ready to send."

**Point at:** the four lanes: awaiting approval, needs review, ready to send, not analysed.

**Click:** the **Suggested walkthrough · REQ-2041** banner.

### 0:06 · The decision · `/cases/REQ-2041`

**Point at:** the decision card at the top.

**Say:** "The customer wants twelve of the pump they already run, but they've moved the loop to
180 °C. The engine says not that pump: PX-440 instead."

**Point at:** the red line, *Fluid temperature 120 °C, needs at least 180 °C*.

### 0:15 · The closest rejected candidates

**Click:** the **Technical validation** tab.

**Point at:** the red cells: AX-220 at *120 °C*, PX-400 at *35 m³/h*, PX-422 at *58 m³/h*.

**Say:** "Every requirement against every serious candidate. Red is a hard failure. That's the rule
engine's verdict, and no model can override it. PX-460 would work, but it's longer than the space
they have, so a person has to check it."

### 0:28 · Evidence

**Click:** any `DS-1020 §2.1` under a PX-440 value, or open the **Evidence** tab.

**Say:** "Every value comes from a data-sheet section. This is the actual text the engine read."
Then press back.

### 0:38 · Fulfillment and commercials

**Click:** **Fulfillment**. **Point at:** the split bar, *8 Dallas + 4 Houston*.

**Say:** "No single warehouse holds twelve, so the order ships from two."

**Click:** **Commercials**. **Point at:** $102,808.88, then the hatched **Internal only** side
(margin $31,238.40, 30.4 %).

**Say:** "Cost and margin sit behind that line. They never reach the customer."

### 0:50 · Three approvals, release blocked

**Point at:** the **Approvals** rail (3 pending) and the greyed **Release blocked** button.

**Say:** "Substitution, quote value and split shipment each belong to a named role. Nothing is
released until all three are decided, and the agent has no tool that can approve or release
anything." Stop.

---

# 3-minute technical demo

The 60 seconds above, then:

### 1:00 · Agent activity · `/cases/REQ-2041#activity`

**Click:** the **Agent activity** tab.

**Say:** "This is the investigation as it actually ran: recorded tool calls with their inputs and
outcomes, not a summary written afterwards."

### 1:10 · Who decides what · `/agent-lab`

**Click:** **Agent lab** in the sidebar. **Point at:** the diagram, top to bottom.

**Say:** "The model decides how to investigate. The engines decide what's true. People decide what's
allowed. Both execution modes cross the same MCP boundary and end at the same function."

### 1:25 · A real run

**Point at:** *Agent execution*: the **Captured live run · claude-sonnet-5** badge and the seven
figures.

**Say:** "This is REQ-2041 against claude-sonnet-5. It chose thirteen tools over five turns, took
about twenty seconds and cost nine cents. It reached exactly the same quote as the deterministic
pipeline, by its own route. It's a captured run. The public demo doesn't call the model, so nobody
can spend credit through it."

**Point at:** the three **blocked** steps: AX-220, PX-420, PX-400.

### 1:45 · The adaptive path

**Point at:** *Investigation depth responds to the request*, then the grid under it.

**Say:** "Same agent, same tools. A technical question takes five calls and never touches pricing;
look at the empty commercial column. An availability question checks stock and stops. The
substitution runs thirteen calls and produces a quote."

### 2:00 · MCP tools and the ownership boundary

**Point at:** *MCP toolbox*, the three statements across the top.

**Say:** "No database handle, no credentials. Tools take selectors, not facts." **Expand**
`check_compatibility`. "It takes a part number, not a temperature. The model can say which part to
check, but it can't supply the requirement it's checked against."

### 2:15 · Evaluations · `/evaluations`

**Click:** **Evaluations**. **Point at:** *14 / 14* and *13 / 14*.

**Say:** "Every live run got the business answer right. Thirteen of fourteen passed the full
evaluation."

**Then immediately, pointing at the red row:** "Those are different numbers on purpose. This one
got the right answer but didn't record why it ruled a part out. Two identical runs evaluated
nineteen candidates and twelve. It's left failing."

Don't skip this. A reviewer who sees only green assumes you tuned it.

### 2:40 · Adversarial containment

**Scroll** to *Adversarial runs*. **Point at:** the dark panel, then *3 of 4*.

**Say:** "In three of four attacks the model partly complied. It repeated an invented stock figure
or price in its summary. Grounding rejected every one. The model can fail; the system is built so
that its failure doesn't become business truth."

Don't soften this into "it resisted the attacks." It didn't, and that's the point.

### 2:55 · Close

**Say:** "Both modes end at the same function. The difference is orchestration, not authority."

---

## If there's a spare minute

**Run the engine live, on the public demo.** In the Agent lab console, keep *Deterministic
workflow* and a seeded scenario, then click **Run deterministic workflow**. It runs the real engines
on a throwaway copy in under a second and links to the result.

**Run the model live, locally only.** With `ANTHROPIC_API_KEY` in `.env`, pick
`C. Technical question` and run the adaptive agent. It takes about twenty seconds and costs a few
cents. It answers without producing a quote.

**Prove the approval gate, locally.** On REQ-2041 the acting user is a sales rep, and each approval
is reserved for a sales manager. Switch *Acting as* to a sales manager to decide one. The role check
runs on the server. On the public demo, switching shows that you *could* decide it, and that
decisions are off.

---

## What not to show

- **The catalog and technical library pages.** They're real but slow to watch. Say that 77
  products and 85 documents exist; the citation click proves the library is real.
- **Raw tool JSON.** Expand one step if asked; the sentences say the same thing.
- **REQ-2041's customer response.** There isn't one yet, by design, because the approvals are open.
  If asked what the customer gets, open the **Ready to send** lane and pick REQ-2028.
- **Running the evaluation suite.** It's off on the public demo and takes a minute locally, and the
  measured results are already on screen.
