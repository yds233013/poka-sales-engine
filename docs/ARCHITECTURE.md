# Architecture

How Poka Sales Engine is put together, and — more usefully — why each boundary sits where it does.

---

## The central claim

**The language model reads and writes prose. It never decides an outcome.**

Everything else in this document follows from that. A system that lets a model pick a pump, a
price or an approval threshold is a system whose answers cannot be defended six months later when
a customer asks why they were quoted what they were quoted. So the architecture draws a hard line:

| The provider MAY | The provider MAY NOT |
| --- | --- |
| Read a messy email and propose structured requirements | Decide a price |
| Flag genuine ambiguity | Decide whether stock exists |
| Phrase a rationale from facts it was handed | Decide whether a substitution is safe |
| Draft a customer letter from figures it was handed | Decide whether an approval is needed |

The line is enforced by shape, not discipline: the engines never import the provider, and the
provider is only ever handed values the engines already computed.

---

## 1. Request ingestion

A `SalesRequest` arrives with a raw body, a channel, a received timestamp and an account. Nothing
is parsed at insert time — an unprocessed request is a legitimate state, visible in the inbox as
`NEW` with a "Run analysis" button.

Analysis begins with `AIProvider.analyzeRequest()`. In the default deterministic provider this is
`src/lib/ai/extract.ts`, a rule-based extractor that produces `RequirementView[]` with units
normalised and each value tagged with the verbatim sentence it came from.

Requirements carry a **kind**, and the kind is the important part:

| Kind | Meaning | How the compatibility engine treats it |
| --- | --- | --- |
| `EXPLICIT` | Stated in the message | Compared normally |
| `INFERRED` | Derived from the part the customer already runs | Compared normally, flagged in the UI as derived |
| `AMBIGUOUS` | Implied but not quantified ("rated for higher temperature") | `UNKNOWN` — never satisfied, never failed |
| `MISSING` | Not present at all | The rule does not fire |

**Inference from the incumbent** is the highest-value step in extraction. A customer who writes
"we currently use the AX-220" has implicitly told you the connection size, the wetted material,
the site voltage and the space available. Each is derived at 0.75 confidence, marked `INFERRED`,
and shown to the operator with its derivation so they can strike it if the site has changed.

The extractor never guesses a number. "Rated for higher temperature" with no figure becomes an
`AMBIGUOUS` requirement and an open question, not an assumed 200 °C.

---

## 2. Agent orchestration

`src/lib/agent/orchestrator.ts` runs a **fixed pipeline**, not a free-running loop.

That is a deliberate trade. A planner-driven agent handles novel request shapes better; a fixed
pipeline gives two things that matter more here:

1. **Comparability.** Every case's audit trail has the same shape, so an operator learns to read
   one and can read all of them.
2. **No skip path.** There is no sequence of model outputs that results in the compatibility check
   or the approval evaluation not running.

The pipeline:

```
analyze → resolve_customer → resolve_sku ×n → search_technical_docs
        → infer from incumbent → persist requirements
        → gap check ────────────────────────────► INFORMATION_REQUIRED (stop)
        → find_substitutes (curated links)
        → screen_candidates (whole category)
        → for each candidate:
              check_compatibility
              └─ if BLOCKED: stop here for this candidate (no stock or price lookup)
              check_inventory
              calculate_price
        → rank ──────────────────────────────────► NO_VIABLE_OPTION (stop)
        → calculate_freight → check_margin → evaluate_approvals
        → persist recommendation, quote, approvals, evidence, audit
        → if no approvals required: draft customer response
```

Not checking stock or price for a candidate that failed a hard requirement is both an efficiency
and a readability decision — it mirrors how a salesperson actually works, and it keeps the trace
free of noise about parts that were never options.

### The tool bus

`src/lib/agent/toolbus.ts` wraps every tool call and persists:

`tool name · inputs · output · timestamp · duration · status · safety class · operator summary · evidence · error`

The "What the engine did" panel reads this table back. It is the executed trace, not a narration
written afterwards, and it is the reason the UI can show an operator exactly what happened without
exposing model reasoning — the `summary` field is written by the tool, in operations language:

> *"PX-440: 15 units available to promise across 2 locations. No single site covers 12, so the
> plan draws 8 from Dallas distribution centre and 4 from Houston distribution centre."*

A thrown error is recorded as an `ERROR` call and re-thrown. The run fails loudly rather than
continuing with a hole in the evidence chain.

---

## 3. Database

PostgreSQL via Prisma. Roughly thirty models; the ones that carry the design:

**Catalog** — `Product` with typed `ProductSpec` rows rather than a JSON blob, so the compatibility
engine compares numbers with units instead of parsing free text at comparison time.
`SubstitutionLink` holds curated engineering relationships (kind, note, optionally a required
accessory SKU). `AccessoryLink` holds recommended and required accompaniments.

**Rules** — `CompatibilityRule` and `PolicyThreshold` live in the database, not in code. An
application engineer could add a dimension or move the discount ceiling without a deploy, and the
UI can show the operator the exact policy that fired.

**Documentation** — `TechnicalDocument` → `DocumentSection`. Sections are the citable unit;
`Evidence.sectionId` points at one. Data sheets are generated from the product's own spec values
at seed time, which guarantees that the sentence an operator reads as evidence and the number the
engine compared cannot drift apart.

**Inventory** — `Inventory` (on hand, reserved, safety stock) per product × warehouse, plus
`IncomingShipment` for confirmed receipts. Reserved is a first-class column, not a derived guess.
A plan is a "split" whenever it reaches the customer as more than one delivery — including part
from stock and the rest built to order, which is the commonest case and the one an earlier
definition missed.

**Pricing** — `PriceBook` → `PriceBookEntry` for per-SKU overrides, `CustomerPricing` for
negotiated contracts with effective dates, `DiscountRule` for volume breaks, `FreightRule` for the
origin × destination × service matrix.

**Case** — `SalesRequest` → `Requirement`, `RequestItem`, `AgentRun` → `ToolCall` → `Evidence`,
`Recommendation` → `RecommendationCandidate` → `CandidateCheck`, `Quote` → `QuoteItem`,
`Approval`, `CustomerResponse`, `AuditEvent`.

Money is `Decimal(14,2)` at rest and **integer cents** in every engine.

---

## 4. Compatibility engine

`src/lib/engines/compatibility.ts`. Takes a `ProductView`, the requirements and the rules; returns
a `CompatibilityVerdict` with every check it performed.

A rule binds one requirement key to one spec key with an operator (`GTE`, `LTE`, `EQ`, `NEQ`,
`INCLUDES`, `WITHIN_TOLERANCE`) and a severity (`HARD`, `SOFT`).

Two invariants this file exists to guarantee:

1. **A HARD failure classifies the candidate `BLOCKED`.** Nothing downstream may quote, price or
   recommend a blocked candidate. `assertNotBlocked()` throws rather than returning a flag,
   because a boolean can be ignored and an exception cannot.
2. **A missing spec is `UNKNOWN`, never `PASS`.** Silently treating absent data as satisfactory is
   exactly how an unsafe substitution reaches a customer.

The verdict reports **every** dimension tested, passes included. An operator who can only see
failures cannot distinguish "checked and fine" from "never checked", and that distinction is the
whole point of the panel.

Text comparison is token-based after normalisation (inch marks, `#`, punctuation, case), so
`DN50` matches `ANSI 150# flange DN50 2in` but not `DN500`.

### The adapter override

When a curated link says a substitute needs an adapter kit, the orchestrator merges the adapter's
`provides_connection` spec and flips the connection check to `PASS` — then adds an explicit
`WARNING` ("Adapter required") and recomputes the verdict. The substitution becomes possible but
never silent: an engineer sees that the fit was achieved by assumption, and the adapter appears as
a real line on the quote.

---

## 5. Substitution engine

`src/lib/engines/substitution.ts`. Candidate discovery is curated-first, then a screen of the
whole relevant category. **Category membership is never a reason to offer a part** — everything
goes through the compatibility rules.

The screen exists because of a real bug. An earlier version took the first N products by part
number, which meant a request needing Hastelloy C-276 never reached the one Hastelloy pump in the
catalog — the AX- parts consumed the whole shortlist alphabetically. From outside, that is
indistinguishable from an agent that did not look. `screen_candidates` evaluates every product in
the relevant categories, ranks them by how close they come, records the full list as the tool's
output, and shortlists the closest for a detailed recorded check.

**Ranking bands deliverability above technical score:**

| Band | Meaning |
| --- | --- |
| 0 | Usable and lands inside the customer's date (or no date was given) |
| 1 | Usable but late |
| 2 | Technically usable but cannot cover the quantity — never promoted |
| 3 | Rejected outright |

A part that arrives after the date the customer gave is not the recommendation, even if it is the
better engineering fit. That trade is stated to the operator rather than buried in a score. Within
a band, a score orders on check results, curated-link strength, stock depth, price delta against
the incumbent and whether an adapter is needed.

`selectedCandidate()` throws if a blocked candidate somehow carries the `RECOMMENDED` label — a
last structural guard on the path to a quote.

---

## 6. Inventory engine

`src/lib/engines/inventory.ts`.

**Available to promise is `on hand − reserved`**, computed in exactly one function that everything
else calls. Quoting stock already allocated to another order is the easiest way for a system like
this to lie to a customer.

Allocation is deterministic and, in order of preference:

1. **A single location that can cover the whole order** and still meet the date. A split means two
   receipts, two freight legs and two chances to go wrong; saving one day is not worth it.
2. **A split**, sources ordered by ready date, then stock before inbound, then same-freight-zone
   first, then deepest position (so small pockets of stock stay intact), then warehouse code.
3. **Confirmed inbound receipts** — unconfirmed and already-past receipts are ignored.
4. **A factory build** at the published lead time.

Ready dates are business-day arithmetic from the warehouse's handling days.

`assertPlanIsPhysical()` throws if any allocation exceeds available-to-promise plus confirmed
inbound at that warehouse, or if allocated + shortfall ≠ requested.

---

## 7. Pricing, freight and margin

**Pricing** (`engines/pricing.ts`) — integer cents throughout. Floating-point dollars drift once
you multiply by a quantity and then apply a percentage, and a quote whose lines do not add up to
its own total is worse than no quote. Every arithmetic path operates on integers and rounds at
exactly one place: where a percentage is applied.

Precedence:

1. An **active contract** price — a commitment, honoured even when a volume break would be cheaper.
2. **Price book vs volume break** — whichever gives the lower unit price. They **never stack**.
3. **List**.
4. A **manual override** is applied on top and labelled `MANUAL` so the approval engine sees it.

Every price considered is recorded on the line for audit.

**Freight** (`engines/freight.ts`) — rated per consignment: lines picked from the same dock merge
into one leg, lines from different warehouses do not. If ground misses the customer's date, the
engine looks for a faster service and **only commits to one that actually makes the date** — buying
air freight for a shipment that is still late costs money, achieves nothing, and would hand the
approval engine a justification ("expedited freight required to hit the date") that is untrue.
When nothing reaches in time the quote stays on ground and sets `missesDeadline`, which raises a
`DELIVERY_DATE_MISS` approval: a late commitment is a decision a person makes, not a calculation.

**Margin** (`engines/margin.ts`) — freight is a **pass-through**: billed at exactly what the
carrier charges, so it contributes revenue and cost in equal measure and nets to zero.

```
gross margin    = goods revenue − goods cost
gross margin %  = gross margin ÷ (goods revenue + freight billed)
```

An earlier version subtracted the freight cost while ignoring the freight revenue. On a long-haul
split that understated the deal by several points — enough to manufacture a `MARGIN_FLOOR` breach
that did not exist and escalate a commercial director over an arithmetic artefact. Two percentages
are reported because they answer different questions: `productMarginPct` is how well the goods
were sold, `marginPct` is what the deal is worth against everything invoiced.

`assertTotalsConsistent()` re-derives subtotal, total and every line extension before persistence.

---

## 8. Approval engine

`src/lib/engines/approval.ts`. Pure: it looks at numbers and verdicts, never at model output.
Returns an ordered list of `ApprovalRequirement`, technical before commercial, each carrying
reason, proposed action, commercial impact, technical impact, risk note, required role and a
snapshot of the numbers at the moment it was raised.

`canAutoRelease()` is the single source of truth for "can this go out without a human?". Callers
use it rather than re-deriving the condition, so there is no second, weaker copy of the rule.

### Where the gate actually lives

```
UI                 disables the button              ← a courtesy
workflow.ts        assertReleaseAllowed() throws    ← the control
engines/approval   the policy itself                ← the rule
```

`releaseQuote()` re-reads the approvals and calls the gate itself. It does not trust the caller,
and it is the only path from an approved case to customer-facing output.

Three further structural properties:

- **A decided approval cannot be re-decided.** An approval is a point-in-time act.
- **The role gate is server-side.** `decideApproval()` checks the acting user's role against the
  requirement. A sales representative cannot record an engineer's sign-off.
- **The customer response is generated *by* the release action.** An unapproved quote has no
  customer-facing artefact to leak.

---

## 9. Audit trail

One append-only `AuditEvent` stream per case: request received, owner assigned, run started,
requirements extracted, recommendation generated or blocked, information requested, approval
requested, approval decided (with the decider and their note), quote released, response generated,
response edited, case completed.

Together with `AgentRun` → `ToolCall` → `Evidence`, the trail answers *what happened, when, and
why* without cross-referencing three tables by hand.

---

## 10. AI provider abstraction

```ts
interface AIProvider {
  analyzeRequest(input): Promise<ExtractionResult>
  planInvestigation(input): Promise<InvestigationStep[]>
  summarizeRecommendation(input): Promise<RecommendationSummary>
  draftCustomerResponse(input): Promise<DraftedResponse>
}
```

**`MockProvider` is the default and does real work.** It runs the rule-based extractor and
composes rationales and customer letters from the facts the engines computed. What it does not do
is invent anything: every sentence it emits is assembled from a value that came out of the
database or an engine. That is why the demo stays honest with no API key present, and why the
deterministic mode does not feel like a degraded fallback.

**`AnthropicProvider` is a strict superset, not a replacement:**

- Extraction runs deterministically **first**. The model is asked only to propose what the rules
  missed; `mergeRequirements()` lets deterministic values win every conflict.
- Proposed requirements are schema-validated with Zod, and any whose `sourceQuote` is not actually
  a substring of the message is **dropped** — a fabricated citation is the one failure mode that
  would poison the evidence trail.
- Rationale and letter drafting are handed the computed facts and told to rephrase, not add. A
  rationale containing internal commercial language is discarded in favour of the deterministic one.
- Every call falls back to the deterministic provider on any error, timeout or schema violation.
  Enabling a key can cost latency; it cannot break the workflow.
- `planInvestigation()` does not consult the model at all — the pipeline is fixed by design.

---

## 11. Safety boundaries

| Boundary | Where | How it is enforced |
| --- | --- | --- |
| Hard compatibility failure blocks a candidate | `compatibility.ts` | `assertNotBlocked()` throws |
| Blocked candidate cannot be selected | `substitution.ts` | `selectedCandidate()` throws on violation |
| Allocation cannot exceed real stock | `inventory.ts` | `assertPlanIsPhysical()` throws |
| Quote arithmetic must balance | `pricing.ts` | `assertTotalsConsistent()` throws before persistence |
| Approvals block release | `workflow.ts` | `assertReleaseAllowed()` throws; UI state is advisory |
| Role gate on approvals | `workflow.ts` | Acting user's role checked against the requirement |
| An approval is decided once | `workflow.ts` | Re-decision refused |
| No customer output before approval | `orchestrator.ts` / `workflow.ts` | The response is generated by the release action |
| No internal figures in customer text | provider + tests | Cost and margin are never in scope for the draft; both providers guard, and a test checks every response by keyword and by literal value |
| Unverifiable claims are surfaced, not smoothed | `compatibility.ts` | Missing spec → `UNKNOWN` → human review |
| An adapter cannot silently rescue a hard failure | `orchestrator.ts` | The kit must present the required size, mate with the pump, and clear the duty on its own pressure and temperature ratings — otherwise the failure stands |
| A printed quotation shows its approval state | `quotes/[quoteNumber]` | The draft mark and watermark are deliberately not `no-print`, so a PDF cannot be saved clean while approvals are open |
| A factory build is bounded | `inventory.ts` | Capped per order by policy, so `canFulfill` can genuinely be false instead of absorbing any quantity |
| Model cannot fabricate a citation | `anthropic-provider.ts` | Quotes checked against the message; unmatched ones dropped |
| Text in a request is data, not instruction | by construction | Request bodies are only ever extracted from; policy runs on the computed numbers |

Each of these has a test that tries to break it. See `tests/integration/adversarial.test.ts`.
