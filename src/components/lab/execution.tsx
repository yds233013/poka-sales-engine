import Link from "next/link";
import { ArrowUpRight, History, Radio } from "lucide-react";
import { Mono } from "@/components/ui/primitives";
import { ActivityTimeline, type ActivityStep } from "@/components/workspace/activity-timeline";
import { PHASE, phaseOf } from "@/components/tool-phase";
import { contractFor } from "@/lib/mcp/contracts";
import { CAPTURED_FLAGSHIP_RUN } from "@/lib/eval/captured";
import { TERMINATION_LABEL } from "@/lib/status";
import { duration } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * One adaptive run, end to end: what it concluded, what it cost, and every
 * tool it chose in order.
 *
 * Two sources, never mixed. A live run persisted in this database renders from
 * its own records, outputs included. When none exists — a fresh deployment, or
 * a public demo with live execution disabled — the captured flagship run is
 * shown instead and labelled as captured.
 */

export interface LiveRunView {
  requestId: string;
  reference: string;
  model: string | null;
  termination: string | null;
  turnCount: number | null;
  durationMs: number | null;
  costUsd: number | null;
  groundingIssues: number;
  guardrails: number;
  agentSteps: number;
  totalSteps: number;
  startedAt: string;
  steps: ActivityStep[];
}

const EFFECT_LABEL: Record<string, string> = {
  READ_ONLY: "read",
  DETERMINISTIC_COMPUTATION: "compute",
  MUTATION: "mutation",
  HUMAN_GATED_MUTATION: "human-gated",
};

export function Execution({ live }: { live: LiveRunView | null }) {
  if (live) {
    return (
      <div>
        <Summary
          source={
            <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-accent-600 px-2 text-[12px] font-medium text-white">
              <Radio className="size-3.5" aria-hidden /> Live adaptive · {live.model}
            </span>
          }
          caption={
            <>
              Latest live run in this database —{" "}
              <Link href={`/cases/${live.requestId}#activity`} className="font-medium text-accent-700 hover:underline">
                {live.reference}
              </Link>
            </>
          }
          cells={[
            ["Outcome", live.termination ? TERMINATION_LABEL[live.termination] ?? live.termination : "—"],
            ["Grounding", live.groundingIssues ? `${live.groundingIssues} rejected` : "Clean"],
            ["Guardrails", live.guardrails ? `${live.guardrails} triggered` : "None"],
            ["Turns", live.turnCount === null ? "—" : String(live.turnCount)],
            ["Tool calls", `${live.agentSteps} chosen · ${live.totalSteps} total`],
            ["Latency", duration(live.durationMs)],
            ["Cost", live.costUsd === null ? "—" : `$${live.costUsd.toFixed(4)}`],
          ]}
        />
        <ActivityTimeline steps={live.steps} adaptive />
      </div>
    );
  }

  const run = CAPTURED_FLAGSHIP_RUN;
  return (
    <div>
      <Summary
        source={
          <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-ink-900 px-2 text-[12px] font-medium text-white">
            <History className="size-3.5" aria-hidden /> Captured live run · {run.model}
          </span>
        }
        caption={
          <>
            {run.reference} run against the real model on {run.capturedOn}. Reached {run.result.sku} × {run.result.quantity},{" "}
            {run.result.total}, {run.result.margin} margin, {run.result.approvals} approvals — identical to the deterministic result.
          </>
        }
        cells={[
          ["Outcome", TERMINATION_LABEL[run.termination] ?? run.termination],
          ["Grounding", "Clean"],
          ["Safety", "0 violations"],
          ["Turns", String(run.turns)],
          ["Tool calls", `${run.agentToolCalls} chosen · ${run.agentToolCalls + run.pipelineToolCalls} total`],
          ["Latency", `${(run.durationMs / 1000).toFixed(1)} s`],
          ["Cost", `$${run.costUsd.toFixed(4)}`],
        ]}
      />
      <ol className="relative px-4 py-3">
        <span className="absolute bottom-6 left-[31px] top-6 w-px bg-[var(--hairline)]" aria-hidden />
        {run.steps.map((step, i) => {
          const phase = PHASE[phaseOf(step.tool)];
          const Icon = phase.icon;
          const effect = contractFor(step.tool)?.effect;
          return (
            <li key={i} className="relative grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 py-1.5">
              <span className={cn("relative z-10 mt-0.5 flex size-[26px] items-center justify-center rounded-full ring-4 ring-white", phase.tone)}>
                <Icon className="size-3.5" strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <Mono className="!text-[12.5px] font-medium text-ink-900">{step.tool}</Mono>
                  <Mono className="truncate !text-[11px] text-ink-400">{step.input}</Mono>
                </span>
                <span className="t-small mt-0.5 flex flex-wrap items-center gap-x-2 text-ink-600">
                  {step.note}
                  {effect ? <span className="t-micro text-ink-400">{EFFECT_LABEL[effect]}</span> : null}
                </span>
              </span>
              <span className="flex items-center gap-2 pt-1">
                <span
                  className={cn(
                    "t-micro rounded px-1.5 py-px font-medium",
                    step.status === "OK" ? "bg-pass-50 text-pass-700" : "bg-fail-50 text-fail-700",
                  )}
                >
                  {step.status === "OK" ? "ok" : "blocked"}
                </span>
                <span className="tnum t-micro w-12 text-right text-ink-400">{step.durationMs} ms</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="t-small flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hairline)] bg-ink-50/50 px-4 py-2 text-ink-500">
        <span>
          Inputs, statuses and durations as recorded. Structured outputs are not retained for captured runs — run one live
          to inspect them.
        </span>
        <Link href="#console" className="flex items-center gap-1 font-medium text-accent-700 hover:text-accent-900">
          Run an investigation <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function Summary({
  source,
  caption,
  cells,
}: {
  source: React.ReactNode;
  caption: React.ReactNode;
  cells: [string, string][];
}) {
  return (
    <div className="border-b border-[var(--hairline)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 pt-3.5">
        {source}
        <span className="t-small text-ink-600">{caption}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-px border-t border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-4 xl:grid-cols-7">
        {cells.map(([label, value]) => (
          <div key={label} className="bg-white px-4 py-2.5">
            <div className="t-micro text-ink-500">{label}</div>
            <div className="t-heading mt-0.5 text-ink-900">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
