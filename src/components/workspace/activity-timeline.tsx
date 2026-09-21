"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PHASE, phaseOf } from "@/components/tool-phase";
import { Mono } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

/**
 * What the engine did, in the order it did it.
 *
 * Every row is a persisted ToolCall. The sentence is the summary the tool
 * wrote when it ran, not a narration composed afterwards, and expanding a row
 * shows the exact input and output that were recorded. Chain-of-thought is
 * never captured, so it cannot be shown.
 */

export interface ActivityStep {
  id: string;
  sequence: number;
  toolName: string;
  summary: string;
  status: string;
  safety: string;
  effect: string;
  modelInitiated: boolean;
  durationMs: number;
  input: unknown;
  output: unknown;
  evidence: { id: string; claim: string; docNumber: string | null; anchor: string | null }[];
}

const EFFECT_LABEL: Record<string, string> = {
  READ_ONLY: "read",
  DETERMINISTIC_COMPUTATION: "compute",
  MUTATION: "mutation",
  HUMAN_GATED_MUTATION: "human-gated",
};

const STATUS_DOT: Record<string, string> = {
  OK: "bg-pass-500",
  EMPTY: "bg-ink-300",
  BLOCKED: "bg-fail-500",
  ERROR: "bg-fail-500",
};

export function ActivityTimeline({ steps, adaptive }: { steps: ActivityStep[]; adaptive: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [agentOnly, setAgentOnly] = useState(false);
  const shown = agentOnly ? steps.filter((s) => s.modelInitiated) : steps;
  const agentCount = steps.filter((s) => s.modelInitiated).length;

  return (
    <div>
      {adaptive ? (
        <div className="flex items-center gap-1 border-b border-[var(--hairline)] px-4 py-2">
          {[
            { key: false, label: `All ${steps.length} steps` },
            { key: true, label: `${agentCount} the agent chose` },
          ].map((f) => (
            <button
              key={String(f.key)}
              type="button"
              onClick={() => setAgentOnly(f.key)}
              className={cn(
                "h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors",
                agentOnly === f.key ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      <ol className="relative px-4 py-3">
        {/* The spine. */}
        <span className="absolute bottom-6 left-[31px] top-6 w-px bg-[var(--hairline)]" aria-hidden />
        {shown.map((step) => {
          const phase = PHASE[phaseOf(step.toolName)];
          const Icon = phase.icon;
          const isOpen = open === step.id;
          return (
            <li key={step.id} className="relative">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : step.id)}
                aria-expanded={isOpen}
                className="group grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 rounded-md py-1.5 pr-2 text-left transition-colors hover:bg-ink-50"
              >
                <span className={cn("relative z-10 mt-0.5 flex size-[26px] items-center justify-center rounded-full ring-4 ring-white", phase.tone)}>
                  <Icon className="size-3.5" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="t-body block text-ink-800">{step.summary}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Mono className="!text-[11px] text-ink-500">{step.toolName}</Mono>
                    <span className="t-micro text-ink-400">{EFFECT_LABEL[step.effect] ?? step.effect}</span>
                    {step.modelInitiated ? (
                      <span className="t-micro rounded bg-accent-50 px-1 font-medium text-accent-700">agent chose</span>
                    ) : null}
                    {step.evidence.length ? (
                      <span className="t-micro text-ink-400">
                        {step.evidence.length} citation{step.evidence.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="flex items-center gap-2 pt-1">
                  <span className={cn("size-1.5 rounded-full", STATUS_DOT[step.status] ?? "bg-ink-300")} title={step.status} />
                  <span className="tnum t-micro w-12 text-right text-ink-400">{step.durationMs} ms</span>
                  <ChevronRight className={cn("size-3.5 text-ink-300 transition-transform", isOpen && "rotate-90")} aria-hidden />
                </span>
              </button>

              {isOpen ? (
                <div className="animate-in mb-2 ml-[44px] mt-1 space-y-2.5 rounded-md border border-[var(--hairline)] bg-ink-50/50 p-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <Meta label="Step" value={`#${step.sequence}`} />
                    <Meta label="Effect" value={EFFECT_LABEL[step.effect] ?? step.effect} />
                    <Meta label="Safety" value={step.safety.replace(/_/g, " ").toLowerCase()} />
                    <Meta label="Status" value={step.status.toLowerCase()} />
                    <Meta label="Duration" value={`${step.durationMs} ms`} />
                  </div>
                  <Payload label="Input" value={step.input} />
                  <Payload label="Structured output" value={step.output} />
                  {step.evidence.length ? (
                    <div>
                      <div className="t-micro font-medium text-ink-500">Evidence produced</div>
                      <ul className="mt-1 space-y-0.5">
                        {step.evidence.slice(0, 8).map((e) => (
                          <li key={e.id} className="t-small flex items-baseline gap-2 text-ink-700">
                            {e.docNumber ? (
                              <Link href={`/library/${e.docNumber}#${e.anchor}`} className="font-mono text-[11px] text-accent-700 hover:underline">
                                {e.docNumber} §{e.anchor}
                              </Link>
                            ) : null}
                            <span className="min-w-0 truncate">{e.claim}</span>
                          </li>
                        ))}
                        {step.evidence.length > 8 ? (
                          <li className="t-micro text-ink-400">and {step.evidence.length - 8} more</li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="t-micro text-ink-500">
      {label} <span className="font-medium text-ink-800">{value}</span>
    </span>
  );
}

function Payload({ label, value }: { label: string; value: unknown }) {
  const text = JSON.stringify(value ?? {}, null, 2);
  return (
    <div>
      <div className="t-micro font-medium text-ink-500">{label}</div>
      <pre className="mt-1 max-h-56 overflow-auto rounded border border-[var(--hairline)] bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-700">
        {text.length > 6000 ? `${text.slice(0, 6000)}\n…` : text}
      </pre>
    </div>
  );
}

