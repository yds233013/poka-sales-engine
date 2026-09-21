import { ArrowRight, CircleAlert, CircleCheck, MessageSquareText, ShieldAlert, ShieldCheck, Truck } from "lucide-react";
import { Mono } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

/**
 * The first thing on an analysed case: the answer, in one band.
 *
 * Built so a reader gets the decision in five seconds and can then go down
 * the page for the reasons. Every value is passed in from the case's own
 * records — this component formats a decision, it never makes one.
 */

export type DecisionSummaryData =
  | {
      kind: "product";
      recommendedSku: string;
      recommendedName: string;
      /** Set when the customer asked for a different part. */
      replacingSku: string | null;
      /** Why the requested part could not be used, in engine terms. */
      replacingReason: string | null;
      quantity: number;
      fulfillment: { label: string; detail: string; onTime: boolean | null };
      total: string;
      totalNote: string;
      gate: { state: "blocked" | "approved" | "released" | "clear"; label: string; detail: string };
    }
  | { kind: "none"; headline: string; reason: string; closest: string | null }
  | { kind: "questions"; headline: string; questions: string[] }
  | { kind: "answered"; headline: string; answer: string; citations: string[] };

export function DecisionSummary({ data }: { data: DecisionSummaryData }) {
  if (data.kind === "product") return <ProductDecision data={data} />;
  if (data.kind === "none") {
    return (
      <Band tone="fail" icon={ShieldAlert} eyebrow="No viable option" title={data.headline}>
        <p className="t-body text-ink-700">{data.reason}</p>
        {data.closest ? <p className="t-small mt-1.5 text-ink-500">Closest candidate: {data.closest}</p> : null}
      </Band>
    );
  }
  if (data.kind === "questions") {
    return (
      <Band tone="warn" icon={MessageSquareText} eyebrow="Waiting on the customer" title={data.headline}>
        <ul className="space-y-1">
          {data.questions.map((q) => (
            <li key={q} className="t-body flex gap-2 text-ink-700">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-warn-500" aria-hidden />
              {q}
            </li>
          ))}
        </ul>
      </Band>
    );
  }
  return (
    <Band tone="pass" icon={CircleCheck} eyebrow="Question answered from evidence" title={data.headline}>
      <p className="t-body text-ink-700">{data.answer}</p>
      {data.citations.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {data.citations.map((c) => (
            <Mono key={c} className="rounded bg-white px-1.5 py-0.5 !text-[11.5px] ring-1 ring-inset ring-[var(--hairline)]">
              {c}
            </Mono>
          ))}
        </div>
      ) : null}
    </Band>
  );
}

function ProductDecision({ data }: { data: Extract<DecisionSummaryData, { kind: "product" }> }) {
  const gateTone = {
    blocked: "border-warn-200 bg-warn-50 text-warn-700",
    approved: "border-accent-200 bg-accent-50 text-accent-700",
    released: "border-pass-200 bg-pass-50 text-pass-700",
    clear: "border-pass-200 bg-pass-50 text-pass-700",
  }[data.gate.state];
  const GateIcon = data.gate.state === "blocked" ? ShieldAlert : ShieldCheck;

  return (
    <section
      id="decision"
      aria-label="Decision summary"
      className="scroll-mt-28 overflow-hidden rounded-lg border border-[var(--hairline)] bg-white shadow-[var(--shadow-sm)]"
    >
      <div className="grid grid-cols-1 gap-px bg-[var(--hairline)] md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* The part, and what it replaces. */}
        <div className="bg-white px-5 py-4">
          <div className="t-small font-medium text-ink-500">Recommended</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink-900">
              {data.recommendedSku}
            </span>
            <span className="tnum text-[15px] font-medium text-ink-600">× {data.quantity}</span>
          </div>
          <div className="t-small mt-1 text-ink-500">{data.recommendedName}</div>

          {data.replacingSku ? (
            <div className="mt-3.5 flex items-start gap-2.5 rounded-md border border-fail-200 bg-fail-50/60 px-3 py-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-fail-600" aria-hidden />
              <div className="min-w-0">
                <div className="t-small flex flex-wrap items-center gap-1.5 text-ink-700">
                  Replacing the requested
                  <Mono className="!text-[12px] font-medium text-ink-900">{data.replacingSku}</Mono>
                  <ArrowRight className="size-3 text-ink-400" aria-hidden />
                  <Mono className="!text-[12px] font-medium text-ink-900">{data.recommendedSku}</Mono>
                </div>
                {data.replacingReason ? (
                  <div className="t-small mt-0.5 font-medium text-fail-700">{data.replacingReason}</div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="t-small mt-3.5 flex items-center gap-2 text-pass-700">
              <CircleCheck className="size-4" aria-hidden /> The part the customer asked for, as requested.
            </div>
          )}
        </div>

        {/* What it takes to deliver, what it costs, and what stands in the way. */}
        <div className="flex flex-col divide-y divide-[var(--hairline)] bg-white">
          <Cell label="Fulfillment" icon={Truck}>
            <div className="t-heading text-ink-900">{data.fulfillment.label}</div>
            <div
              className={cn(
                "t-small",
                data.fulfillment.onTime === false ? "text-fail-700" : data.fulfillment.onTime ? "text-pass-700" : "text-ink-500",
              )}
            >
              {data.fulfillment.detail}
            </div>
          </Cell>
          <Cell label="Quote total">
            <div className="tnum text-[17px] font-semibold leading-tight tracking-[-0.015em] text-ink-900">{data.total}</div>
            <div className="t-small text-ink-500">{data.totalNote}</div>
          </Cell>
          <div className="px-4 py-3">
            <a
              href="#approvals"
              className={cn("flex items-center gap-2.5 rounded-md border px-3 py-2 transition-colors hover:brightness-[0.98]", gateTone)}
            >
              <GateIcon className="size-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <div className="t-heading leading-tight">{data.gate.label}</div>
                <div className="t-small opacity-90">{data.gate.detail}</div>
              </div>
              <ArrowRight className="ml-auto size-3.5 shrink-0 opacity-70" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Cell({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: typeof Truck;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5">
      <div className="t-small flex shrink-0 items-center gap-1.5 pt-0.5 font-medium text-ink-500">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        {label}
      </div>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

function Band({
  tone,
  icon: Icon,
  eyebrow,
  title,
  children,
}: {
  tone: "fail" | "warn" | "pass";
  icon: typeof Truck;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  const ring = { fail: "border-fail-200", warn: "border-warn-200", pass: "border-pass-200" }[tone];
  const chip = {
    fail: "bg-fail-50 text-fail-700 ring-fail-200",
    warn: "bg-warn-50 text-warn-700 ring-warn-200",
    pass: "bg-pass-50 text-pass-700 ring-pass-200",
  }[tone];
  return (
    <section id="decision" className={cn("scroll-mt-28 rounded-lg border bg-white px-5 py-4 shadow-[var(--shadow-sm)]", ring)}>
      <div className={cn("inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium ring-1 ring-inset", chip)}>
        <Icon className="size-3.5" aria-hidden />
        {eyebrow}
      </div>
      <h2 className="t-title mt-2 text-ink-900">{title}</h2>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}
