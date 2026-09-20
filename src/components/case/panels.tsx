import Link from "next/link";
import {
  Panel,
  PanelHeader,
  Pill,
  DataRow,
  SectionLabel,
  statusLabel,
  Mono,
  CHECK_TONE,
  type Tone,
} from "@/components/ui/primitives";
import { EvidenceList, type EvidenceView } from "@/components/evidence";
import { CheckMatrix, type CheckView } from "./check-matrix";
import { RepriceControl } from "./reprice-control";
import { dateTime, money, pct, shortDate, titleCase, duration, dayMonth } from "@/lib/format";
import { cn } from "@/lib/cn";

// ─────────────────────────── Customer request ──────────────────────────────

export function RequestPanel({
  subject,
  body,
  channel,
  receivedAt,
  contactName,
  contactEmail,
}: {
  subject: string;
  body: string;
  channel: string;
  receivedAt: Date;
  contactName: string | null;
  contactEmail: string | null;
}) {
  return (
    <Panel>
      <PanelHeader
        title="Customer request"
        subtitle={`${titleCase(channel)} · ${dateTime(receivedAt)}`}
      />
      <div className="px-4 py-3">
        <div className="text-[12px] text-ink-500">
          <span className="text-ink-700">{contactName ?? "Unknown sender"}</span>
          {contactEmail ? ` · ${contactEmail}` : ""}
        </div>
        <p className="mt-1 text-[13px] font-medium text-ink-900">{subject}</p>
        <pre className="mt-2.5 max-h-72 overflow-y-auto whitespace-pre-wrap rounded border border-[var(--hairline)] bg-ink-50/70 px-3 py-2.5 font-sans text-[12px] leading-relaxed text-ink-700">
          {body}
        </pre>
      </div>
    </Panel>
  );
}

// ───────────────────────────── Requirements ────────────────────────────────

export interface RequirementRow {
  id: string;
  key: string;
  label: string;
  kind: string;
  operator: string | null;
  numValue: number | null;
  textValue: string | null;
  unit: string | null;
  sourceQuote: string | null;
  confidence: number;
  note: string | null;
}

const KIND_TONE: Record<string, "pass" | "accent" | "warn" | "fail" | "neutral"> = {
  EXPLICIT: "pass",
  INFERRED: "accent",
  AMBIGUOUS: "warn",
  MISSING: "fail",
};

const KIND_HINT: Record<string, string> = {
  EXPLICIT: "Stated in the message",
  INFERRED: "Derived from the part the customer already runs",
  AMBIGUOUS: "Implied but not quantified — treated as unverified, never guessed",
  MISSING: "Not present in the request",
};

export function RequirementsPanel({ requirements }: { requirements: RequirementRow[] }) {
  const order = ["EXPLICIT", "INFERRED", "AMBIGUOUS", "MISSING"];
  const sorted = [...requirements].sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.label.localeCompare(b.label),
  );
  const counts = order.map((kind) => ({ kind, n: requirements.filter((r) => r.kind === kind).length }));

  return (
    <Panel>
      <PanelHeader
        title="Extracted requirements"
        subtitle="What the request was understood to mean, and where each value came from"
      />
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--hairline)] px-4 py-2">
        {counts
          .filter((c) => c.n > 0)
          .map((c) => (
            <Pill key={c.kind} tone={KIND_TONE[c.kind]} dot>
              {c.n} {c.kind.toLowerCase()}
            </Pill>
          ))}
      </div>
      <ul className="divide-y divide-[var(--hairline)]">
        {sorted.map((requirement) => (
          <li key={requirement.id} className="px-4 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-medium text-ink-900">{requirement.label}</span>
                  <Pill tone={KIND_TONE[requirement.kind]} className="!px-1 !py-0 !text-[10px]">
                    {requirement.kind.toLowerCase()}
                  </Pill>
                </div>
                {requirement.sourceQuote ? (
                  <p className="mt-1 border-l-2 border-ink-200 pl-2 text-[11.5px] italic leading-relaxed text-ink-500">
                    “{requirement.sourceQuote}”
                  </p>
                ) : (
                  <p className="mt-1 text-[11.5px] text-ink-400">{KIND_HINT[requirement.kind]}</p>
                )}
                {requirement.note ? (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">{requirement.note}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <div className="tnum text-[12.5px] font-medium text-ink-900">
                  {formatRequirementValue(requirement)}
                </div>
                {requirement.confidence < 1 && requirement.kind !== "MISSING" ? (
                  <div className="tnum mt-0.5 text-[11px] text-ink-400">
                    {Math.round(requirement.confidence * 100)}% confidence
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function formatRequirementValue(r: RequirementRow): string {
  if (r.kind === "MISSING") return "not stated";
  const op = r.operator === "GTE" ? "≥ " : r.operator === "LTE" ? "≤ " : r.operator === "WITHIN_TOLERANCE" ? "≈ " : "";
  if (r.numValue !== null) return `${op}${r.numValue}${r.unit ? ` ${r.unit}` : ""}`;
  if (r.textValue) return r.textValue;
  return "—";
}

// ──────────────────────────── Recommendation ───────────────────────────────

const OUTCOME_TONE: Record<string, "pass" | "accent" | "warn" | "fail"> = {
  EXACT_MATCH: "pass",
  SUBSTITUTE: "accent",
  SPLIT_FULFILLMENT: "accent",
  NO_VIABLE_OPTION: "fail",
  INFORMATION_REQUIRED: "warn",
  INFORMATION_PROVIDED: "pass",
};

const OUTCOME_LABEL: Record<string, string> = {
  EXACT_MATCH: "Exact match",
  SUBSTITUTE: "Substitution",
  SPLIT_FULFILLMENT: "Split shipment",
  NO_VIABLE_OPTION: "No viable option",
  INFORMATION_REQUIRED: "Information required",
  INFORMATION_PROVIDED: "Question answered",
};

export function RecommendationPanel({
  outcome,
  headline,
  rationale,
  risk,
  selected,
  checks,
  evidenceByDimension,
  blockedReason,
}: {
  outcome: string;
  headline: string;
  rationale: string;
  risk: string;
  selected: {
    sku: string;
    name: string;
    family: string;
    quantity: number;
    unitPrice: string | null;
    lifecycle: string;
  } | null;
  checks: CheckView[];
  evidenceByDimension: Record<string, EvidenceView | undefined>;
  blockedReason: string | null;
}) {
  const failed = checks.filter((c) => c.result === "FAIL").length;
  const warned = checks.filter((c) => c.result === "WARNING" || c.result === "UNKNOWN").length;
  const passed = checks.filter((c) => c.result === "PASS").length;

  return (
    <Panel>
      <div className="border-b border-[var(--hairline)] px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={OUTCOME_TONE[outcome] ?? "neutral"}>{OUTCOME_LABEL[outcome] ?? outcome}</Pill>
          <Pill tone={risk === "LOW" ? "pass" : risk === "MEDIUM" ? "warn" : "fail"} dot>
            {statusLabel(risk)} risk
          </Pill>
        </div>
        <h2 className="mt-2 text-[16px] font-semibold leading-snug tracking-[-0.015em] text-ink-900">
          {headline}
        </h2>
        <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-ink-600">{rationale}</p>

        {blockedReason ? (
          <div className="mt-3 rounded border border-fail-200 bg-fail-50 px-3 py-2">
            <SectionLabel className="!text-fail-700">Blocked</SectionLabel>
            <p className="mt-1 text-[12px] leading-relaxed text-fail-700">{blockedReason}</p>
          </div>
        ) : null}

        {selected ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded border border-[var(--hairline)] bg-ink-50/60 px-3 py-2.5">
            <div>
              <SectionLabel>Quoted part</SectionLabel>
              <Link
                href={`/catalog/${selected.sku}`}
                className="mt-0.5 block font-mono text-[13px] font-medium text-ink-900 hover:text-accent-600"
              >
                {selected.sku}
              </Link>
              <div className="text-[11.5px] text-ink-500">{selected.family}</div>
            </div>
            <div>
              <SectionLabel>Quantity</SectionLabel>
              <div className="tnum mt-0.5 text-[13px] font-medium text-ink-900">{selected.quantity}</div>
            </div>
            {selected.unitPrice ? (
              <div>
                <SectionLabel>Unit price</SectionLabel>
                <div className="tnum mt-0.5 text-[13px] font-medium text-ink-900">{selected.unitPrice}</div>
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <SectionLabel>Description</SectionLabel>
              <div className="mt-0.5 truncate text-[12.5px] text-ink-700">{selected.name}</div>
            </div>
          </div>
        ) : null}
      </div>

      {checks.length > 0 ? (
        <>
          <div className="flex items-center gap-3 border-b border-[var(--hairline)] bg-white px-4 py-2">
            <SectionLabel>Technical validation</SectionLabel>
            <div className="flex items-center gap-1.5">
              {passed > 0 ? <Pill tone="pass">{passed} pass</Pill> : null}
              {warned > 0 ? <Pill tone="warn">{warned} to review</Pill> : null}
              {failed > 0 ? <Pill tone="fail">{failed} fail</Pill> : null}
            </div>
          </div>
          <CheckMatrix checks={checks} evidenceBySpec={evidenceByDimension} />
        </>
      ) : null}
    </Panel>
  );
}

// ───────────────────────────── Alternatives ────────────────────────────────

export interface CandidateRow {
  id: string;
  sku: string;
  name: string;
  family: string;
  verdict: string;
  rank: number;
  reason: string;
  score: number;
  unitPrice: number | null;
  availableQty: number | null;
  earliestShipDate: Date | null;
  checks: CheckView[];
}

const VERDICT_TONE: Record<string, "pass" | "accent" | "warn" | "fail" | "neutral"> = {
  RECOMMENDED: "pass",
  VIABLE: "accent",
  REQUIRES_REVIEW: "warn",
  REJECTED: "fail",
};

export function AlternativesPanel({ candidates }: { candidates: CandidateRow[] }) {
  const considered = candidates.filter((c) => c.verdict !== "RECOMMENDED");
  const viable = considered.filter((c) => c.verdict !== "REJECTED");
  const rejected = considered.filter((c) => c.verdict === "REJECTED");

  if (considered.length === 0) return null;

  return (
    <Panel>
      <PanelHeader
        title="Alternatives considered"
        subtitle={
          viable.length === 0
            ? `${rejected.length} other ${rejected.length === 1 ? "option was" : "options were"} evaluated and rejected. Every one is listed with the reason.`
            : `${viable.length} other ${viable.length === 1 ? "option was" : "options were"} viable; ${rejected.length} ${rejected.length === 1 ? "was" : "were"} rejected. Every one is listed with the reason.`
        }
      />

      {viable.length > 0 ? (
        <ul className="divide-y divide-[var(--hairline)]">
          {viable.map((candidate) => (
            <CandidateItem key={candidate.id} candidate={candidate} />
          ))}
        </ul>
      ) : null}

      {rejected.length > 0 ? (
        <details className="group border-t border-[var(--hairline)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[12.5px] font-medium text-ink-600 hover:bg-ink-50">
            <span className="text-ink-400 transition-transform group-open:rotate-90">›</span>
            {rejected.length} rejected — show why each was ruled out
          </summary>
          <ul className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
            {rejected.map((candidate) => (
              <CandidateItem key={candidate.id} candidate={candidate} />
            ))}
          </ul>
        </details>
      ) : null}
    </Panel>
  );
}

function CandidateItem({ candidate }: { candidate: CandidateRow }) {
  const problems = candidate.checks.filter((c) => c.result === "FAIL" || c.result === "WARNING" || c.result === "UNKNOWN");
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/catalog/${candidate.sku}`} className="font-mono text-[12.5px] font-medium text-ink-900 hover:text-accent-600">
              {candidate.sku}
            </Link>
            <Pill tone={VERDICT_TONE[candidate.verdict] ?? "neutral"}>{statusLabel(candidate.verdict)}</Pill>
            <span className="text-[11.5px] text-ink-400">{candidate.family}</span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-600">{candidate.reason}</p>
          {problems.length > 0 ? (
            <div className="mt-2 space-y-1">
              {problems.map((check) => (
                <div key={check.id} className="flex items-start gap-2">
                  <Pill tone={CHECK_TONE[check.result]} className="mt-px shrink-0 !px-1 !py-0 !text-[10px]">
                    {check.result === "NOT_APPLICABLE" ? "N/A" : check.result}
                  </Pill>
                  <span className="text-[11.5px] leading-relaxed text-ink-600">
                    <span className="font-medium text-ink-800">{check.label}:</span> {check.actual}
                    <span className="text-ink-400"> · needs {check.requirement}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {candidate.unitPrice !== null ? (
            <div className="tnum text-[12.5px] font-medium text-ink-900">{money(candidate.unitPrice)}</div>
          ) : (
            <div className="text-[12px] text-ink-400">not priced</div>
          )}
          {candidate.availableQty !== null && candidate.availableQty > 0 ? (
            <div className="tnum mt-0.5 text-[11.5px] text-ink-500">
              {candidate.availableQty} sourceable
              {candidate.earliestShipDate ? ` · ${dayMonth(candidate.earliestShipDate)}` : ""}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

// ───────────────────────────── Fulfillment ─────────────────────────────────

export interface AllocationView {
  warehouseCode: string;
  warehouseName: string;
  quantity: number;
  source: string;
  readyDate: string;
  note?: string | null;
}

export function FulfillmentPanel({
  lines,
  estimatedDelivery,
  requiredBy,
  freightService,
  freightCost,
}: {
  lines: { sku: string; quantity: number; allocations: AllocationView[] }[];
  estimatedDelivery: Date | null;
  requiredBy: Date | null;
  freightService: string;
  freightCost: string;
}) {
  const late = estimatedDelivery && requiredBy && estimatedDelivery.getTime() > requiredBy.getTime();

  return (
    <Panel>
      <PanelHeader
        title="Fulfillment plan"
        subtitle="Available-to-promise is on-hand less stock already reserved against other orders"
      />
      <div className="divide-y divide-[var(--hairline)]">
        {lines.map((line) => (
          <div key={line.sku} className="px-4 py-3">
            <div className="flex items-baseline gap-2">
              <Mono>{line.sku}</Mono>
              <span className="tnum text-[12px] text-ink-500">{line.quantity} units</span>
              {line.allocations.length > 1 ? <Pill tone="warn">Split shipment</Pill> : null}
            </div>
            <ul className="mt-2 space-y-1.5">
              {line.allocations.map((allocation, index) => (
                <li key={index} className="flex items-center justify-between gap-3 text-[12px]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="tnum w-8 shrink-0 text-right font-medium text-ink-900">
                      {allocation.quantity}
                    </span>
                    <span className="truncate text-ink-700">{allocation.warehouseName}</span>
                    <Pill
                      tone={allocation.source === "STOCK" ? "pass" : allocation.source === "INCOMING" ? "warn" : "neutral"}
                      className="!px-1 !py-0 !text-[10px]"
                    >
                      {allocation.source.toLowerCase()}
                    </Pill>
                  </div>
                  <span className="tnum shrink-0 text-ink-500">ready {dayMonth(allocation.readyDate)}</span>
                </li>
              ))}
            </ul>
            {line.allocations.some((a) => a.note) ? (
              <p className="mt-1.5 text-[11.5px] text-ink-500">
                {line.allocations.filter((a) => a.note).map((a) => a.note).join(" · ")}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <dl className="border-t border-[var(--hairline)] px-4 py-2.5">
        <DataRow label="Freight service" mono>
          {titleCase(freightService)} · {freightCost}
        </DataRow>
        <DataRow label="Estimated delivery" mono>
          <span className={cn(late && "text-fail-700")}>{shortDate(estimatedDelivery)}</span>
        </DataRow>
        <DataRow label="Customer needs by" mono>
          {requiredBy ? shortDate(requiredBy) : <span className="text-ink-400">not stated</span>}
        </DataRow>
      </dl>
    </Panel>
  );
}

// ───────────────────────────── Commercials ─────────────────────────────────

export function CommercialsPanel({
  quote,
  marginFloorPct,
  requestId,
  repriceDisabledReason,
}: {
  requestId: string;
  repriceDisabledReason?: string;
  quote: {
    quoteNumber: string;
    status: string;
    subtotal: number;
    discountTotal: number;
    freightCost: number;
    total: number;
    costTotal: number;
    marginAmount: number;
    marginPct: number;
    validUntil: Date;
    items: {
      id: string;
      sku: string;
      description: string;
      quantity: number;
      listPrice: number;
      unitPrice: number;
      discountPct: number;
      priceSource: string;
      extended: number;
    }[];
  };
  marginFloorPct: number;
}) {
  const belowPolicy = quote.marginPct < marginFloorPct;
  return (
    <Panel>
      <PanelHeader
        title="Commercials"
        subtitle={`Quote ${quote.quoteNumber} · ${statusLabel(quote.status)} · valid until ${shortDate(quote.validUntil)}`}
        actions={
          <Link
            href={`/quotes/${quote.quoteNumber}`}
            className="text-[12px] font-medium text-accent-600 hover:underline"
          >
            Open quote →
          </Link>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--hairline)] bg-ink-50/60">
              {["Line", "Description", "Qty", "List", "Unit", "Disc.", "Source", "Extended"].map((h) => (
                <th key={h} className="label-xs px-3 py-1.5 text-left whitespace-nowrap last:text-right">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr key={item.id} className="border-b border-[var(--hairline)] last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link href={`/catalog/${item.sku}`} className="font-mono text-[12px] text-ink-900 hover:text-accent-600">
                    {item.sku}
                  </Link>
                </td>
                <td className="max-w-[240px] truncate px-3 py-2 text-[12px] text-ink-600">{item.description}</td>
                <td className="tnum px-3 py-2 text-[12px]">{item.quantity}</td>
                <td className="tnum px-3 py-2 text-[12px] text-ink-500">{money(item.listPrice)}</td>
                <td className="tnum px-3 py-2 text-[12px] font-medium">{money(item.unitPrice)}</td>
                <td className="tnum px-3 py-2 text-[12px]">{pct(item.discountPct)}</td>
                <td className="px-3 py-2 text-[11.5px] whitespace-nowrap text-ink-500">
                  {titleCase(item.priceSource)}
                </td>
                <td className="tnum px-3 py-2 text-right text-[12px] font-medium">{money(item.extended)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-px bg-[var(--hairline)] sm:grid-cols-2">
        <dl className="bg-white px-4 py-3">
          <SectionLabel>Customer-facing</SectionLabel>
          <div className="mt-1">
            <DataRow label="Subtotal" mono>{money(quote.subtotal)}</DataRow>
            <DataRow label="Discount applied" mono>−{money(quote.discountTotal)}</DataRow>
            <DataRow label="Freight" mono>{money(quote.freightCost)}</DataRow>
            <div className="mt-1 border-t border-[var(--hairline)] pt-1">
              <DataRow label={<span className="font-medium text-ink-800">Total</span>} mono>
                <span className="text-[13.5px]">{money(quote.total)}</span>
              </DataRow>
            </div>
          </div>
        </dl>
        <dl className="bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <SectionLabel>Internal only</SectionLabel>
            <Pill tone="neutral" className="!px-1 !py-0 !text-[10px]">
              never sent to the customer
            </Pill>
          </div>
          <div className="mt-1">
            <DataRow label="Cost of goods" mono>{money(quote.costTotal)}</DataRow>
            <DataRow label="Freight (billed at cost)" mono>
              <span className="text-ink-500">{money(quote.freightCost)}</span>
            </DataRow>
            <DataRow label="Gross margin" mono>{money(quote.marginAmount)}</DataRow>
            <div className="mt-1 border-t border-[var(--hairline)] pt-1">
              <DataRow label={<span className="font-medium text-ink-800">Margin %</span>} mono>
                <span
                  className={cn("text-[13.5px]", belowPolicy ? "text-fail-700" : "text-pass-700")}
                  title={`Policy minimum is ${pct(marginFloorPct, 0)}`}
                >
                  {pct(quote.marginPct)}
                </span>
              </DataRow>
            </div>
          </div>
        </dl>
      </div>

      <RepriceControl
        requestId={requestId}
        currentDiscountPct={quote.items[0]?.discountPct ?? 0}
        disabled={Boolean(repriceDisabledReason)}
        disabledReason={repriceDisabledReason}
      />
    </Panel>
  );
}

// ─────────────────────────────── Activity ──────────────────────────────────

export interface TraceStep {
  id: string;
  sequence: number;
  toolName: string;
  summary: string;
  status: string;
  safety: string;
  effect: string;
  modelInitiated: boolean;
  durationMs: number;
  evidence: EvidenceView[];
  input: unknown;
  output: unknown;
}

export interface RunMeta {
  mode: "DETERMINISTIC" | "ADAPTIVE_AGENT";
  /**
   * Whether a real provider directed this run, or a scripted stand-in did.
   *
   * `mode` cannot answer that — a scripted test run records ADAPTIVE_AGENT
   * with a model name, exactly like a live one. Presenting the two the same
   * way would describe a fixture as a live agent result.
   */
  modelSource: "NONE" | "SCRIPTED" | "LIVE";
  model: string | null;
  termination: string | null;
  turnCount: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  toolCallCount: number | null;
  guardrailEvents: { kind: string; detail: string }[];
  groundingIssues: string[];
}

const EFFECT_TONE: Record<string, Tone> = {
  READ_ONLY: "neutral",
  DETERMINISTIC_COMPUTATION: "accent",
  MUTATION: "warn",
  HUMAN_GATED_MUTATION: "fail",
};

const SAFETY_TONE: Record<string, "pass" | "warn" | "fail"> = {
  AUTO_SAFE: "pass",
  NEEDS_REVIEW: "warn",
  BLOCKED: "fail",
};

export function TracePanel({
  steps,
  provider,
  durationMs,
  run,
}: {
  steps: TraceStep[];
  provider: string;
  durationMs: number | null;
  run?: RunMeta | null;
}) {
  const adaptive = run?.mode === "ADAPTIVE_AGENT";
  const scripted = adaptive && run?.modelSource === "SCRIPTED";
  const agentCalls = steps.filter((s) => s.modelInitiated).length;

  return (
    <Panel>
      <PanelHeader
        title="What the engine did"
        subtitle={
          adaptive
            ? `${agentCalls} of ${steps.length} tool calls were chosen by the model; the rest are deterministic finalization. ${duration(durationMs)}${run?.turnCount ? ` · ${run.turnCount} turns` : ""}. This is the executed trace, not a narration of it.`
            : `${steps.length} tool calls in ${duration(durationMs)} · ${provider === "mock" ? "deterministic provider" : provider}. This is the executed trace, not a narration of it.`
        }
        actions={
          run ? (
            <Pill tone={!adaptive ? "neutral" : scripted ? "warn" : "accent"}>
              {!adaptive
                ? "Deterministic"
                : scripted
                  ? `Scripted adaptive test · ${run.model ?? "model"}`
                  : `Live adaptive · ${run.model ?? "model"}`}
            </Pill>
          ) : null
        }
      />

      {run && adaptive ? (
        <div className="grid grid-cols-2 gap-px border-b border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-4">
          {[
            { label: "Termination", value: run.termination ? statusLabel(run.termination) : "—" },
            { label: "Agent tool calls", value: String(agentCalls) },
            {
              label: scripted ? "Tokens (simulated)" : "Tokens in / out",
              value:
                run.inputTokens != null
                  ? `${run.inputTokens.toLocaleString()} / ${(run.outputTokens ?? 0).toLocaleString()}${
                      !scripted && run.cacheReadTokens ? ` · ${run.cacheReadTokens.toLocaleString()} cached` : ""
                    }`
                  : "—",
            },
            {
              label: scripted ? "Cost (not billed)" : "Estimated cost",
              value: scripted
                ? "—"
                : run.estimatedCostUsd != null
                  ? `$${run.estimatedCostUsd.toFixed(4)}`
                  : "—",
            },
          ].map((cell) => (
            <div key={cell.label} className="bg-white px-3 py-2">
              <div className="label-xs">{cell.label}</div>
              <div className="tnum mt-0.5 text-[12.5px] font-medium text-ink-900">{cell.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {run && run.guardrailEvents.length > 0 ? (
        <div className="border-b border-[var(--hairline)] bg-warn-50 px-4 py-2.5">
          <SectionLabel className="!text-warn-700">Guardrails triggered</SectionLabel>
          <ul className="mt-1 space-y-0.5">
            {run.guardrailEvents.map((event, index) => (
              <li key={index} className="text-[11.5px] leading-relaxed text-warn-700">
                <span className="font-medium">{event.kind.replace(/_/g, " ").toLowerCase()}</span> — {event.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {run && run.groundingIssues.length > 0 ? (
        <div className="border-b border-[var(--hairline)] bg-fail-50 px-4 py-2.5">
          <SectionLabel className="!text-fail-700">Unsupported claims rejected</SectionLabel>
          <ul className="mt-1 space-y-0.5">
            {run.groundingIssues.map((issue, index) => (
              <li key={index} className="text-[11.5px] leading-relaxed text-fail-700">
                {issue}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-fail-700">
            The case was routed for human review rather than having the summary quietly rewritten.
          </p>
        </div>
      ) : null}
      <ol className="divide-y divide-[var(--hairline)]">
        {steps.map((step) => (
          <li key={step.id} className="px-4 py-2.5">
            <div className="flex items-start gap-3">
              <span className="tnum mt-0.5 w-5 shrink-0 text-right text-[11px] text-ink-400">{step.sequence}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Mono className="!text-[11.5px] text-accent-700">{step.toolName}</Mono>
                  {step.modelInitiated ? (
                    <Pill tone="accent" className="!px-1 !py-0 !text-[10px]">
                      agent chose
                    </Pill>
                  ) : null}
                  <Pill tone={EFFECT_TONE[step.effect] ?? "neutral"} className="!px-1 !py-0 !text-[10px]">
                    {step.effect.replace(/_/g, " ").toLowerCase()}
                  </Pill>
                  <Pill tone={SAFETY_TONE[step.safety] ?? "neutral"} className="!px-1 !py-0 !text-[10px]">
                    {step.safety.replace("_", " ").toLowerCase()}
                  </Pill>
                  {step.status !== "OK" ? (
                    <Pill tone={step.status === "ERROR" ? "fail" : "neutral"} className="!px-1 !py-0 !text-[10px]">
                      {step.status.toLowerCase()}
                    </Pill>
                  ) : null}
                  <span className="tnum text-[11px] text-ink-400">{step.durationMs} ms</span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-700">{step.summary}</p>
                {step.evidence.length > 0 ? (
                  <div className="mt-1.5">
                    <EvidenceList items={step.evidence.slice(0, 4)} />
                  </div>
                ) : null}
                <details className="group mt-1.5">
                  <summary className="cursor-pointer list-none text-[11px] text-ink-400 hover:text-ink-600">
                    inputs &amp; output
                  </summary>
                  <pre className="mt-1 max-h-56 overflow-auto rounded border border-[var(--hairline)] bg-ink-950 px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-ink-200">
{JSON.stringify({ input: step.input, output: step.output }, null, 2).slice(0, 4000)}
                  </pre>
                </details>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export interface AuditRow {
  id: string;
  type: string;
  actor: string;
  summary: string;
  createdAt: Date;
}

export function AuditPanel({ events }: { events: AuditRow[] }) {
  return (
    <Panel>
      <PanelHeader title="Audit trail" subtitle="Append-only. What happened, when, and who caused it." />
      <ol className="divide-y divide-[var(--hairline)]">
        {events.map((event) => (
          <li key={event.id} className="flex items-start gap-3 px-4 py-2">
            <span className="tnum mt-0.5 w-24 shrink-0 text-[11px] text-ink-400">{dateTime(event.createdAt)}</span>
            <div className="min-w-0">
              <p className="text-[12px] leading-relaxed text-ink-800">{event.summary}</p>
              <p className="text-[11px] text-ink-400">{event.actor}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
