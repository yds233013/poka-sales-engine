"use client";

import { useState, useTransition } from "react";
import { Panel, PanelHeader, Button, Pill, EmptyState, Mono, type Tone } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { runEvalSuite, type EvalSuiteResult } from "@/app/agent-lab/actions";
import { suiteNotice } from "@/lib/eval/suite-response";
import { duration } from "@/lib/format";
import { useDemoMode } from "@/components/demo-mode";

const STATUS_TONE: Record<string, Tone> = {
  PASS: "pass",
  FAIL: "fail",
  ERROR: "fail",
  // A documented limit of the fixed pipeline, not a defect. Shown in warning
  // tone rather than red, because a red row reads as "something broke" and
  // this is the measurement the adaptive column exists to be compared against.
  EXPECTED_GAP: "warn",
  NOT_RUN: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  EXPECTED_GAP: "BASELINE GAP",
  NOT_RUN: "NOT RUN",
};

/**
 * Baseline vs adaptive, scored against the same domain truth.
 *
 * When adaptive has not run, the column says NOT RUN and stays empty. It never
 * borrows the deterministic numbers, and it never shows a score for work that
 * did not happen.
 */
export function EvalDashboard({ adaptiveAvailable }: { adaptiveAvailable: boolean }) {
  const { readOnly, reason } = useDemoMode();
  const [pending, start] = useTransition();
  const [suite, setSuite] = useState<EvalSuiteResult | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // A deployment that refuses this says so in its answer. Showing that
  // sentence is the whole handling: it is an expected reply, not an error.
  const run = () =>
    start(async () => {
      const result = await runEvalSuite();
      const notice = suiteNotice(result);
      if (notice !== null) {
        setRefusal(notice);
        return;
      }
      setRefusal(null);
      setSuite(result as EvalSuiteResult);
    });

  const summary = suite
    ? {
        deterministicPass: suite.rows.filter((r) => r.deterministic.status === "PASS").length,
        deterministicGap: suite.rows.filter((r) => r.deterministic.status === "EXPECTED_GAP").length,
        adaptivePass: suite.rows.filter((r) => r.adaptive.status === "PASS").length,
        adaptiveNotRun: suite.rows.filter((r) => r.adaptive.status === "NOT_RUN").length,
        total: suite.rows.length,
      }
    : null;

  return (
    <Panel>
      <PanelHeader
        title="Evaluation"
        subtitle="Every scenario run in both modes and scored against the same domain truth — outcome, SKU resolution, safety, grounding and tool selection."
        actions={
          <Button variant="secondary" size="sm" onClick={run} disabled={pending} title={readOnly ? reason : undefined}>
            {pending ? "Running suite…" : suite ? "Re-run suite" : "Run evaluation suite"}
          </Button>
        }
      />

      {refusal ? (
        <div role="status" className="border-b border-[var(--hairline)] bg-ink-50 px-4 py-2.5">
          <p className="text-[12px] text-ink-600">{refusal}</p>
        </div>
      ) : readOnly ? (
        <div className="border-b border-[var(--hairline)] bg-ink-50 px-4 py-2.5">
          <p className="text-[12px] text-ink-600">
            Running the suite is switched off on this public demo — it runs for over a minute and, with a model
            configured, spends API credit. The measured results are shown above; <code>npm run eval</code> reproduces
            them locally.
          </p>
        </div>
      ) : !adaptiveAvailable ? (
        <div className="border-b border-[var(--hairline)] bg-warn-50 px-4 py-2.5">
          <p className="text-[12px] text-warn-700">
            No model provider is configured, so adaptive scenarios will report{" "}
            <span className="font-medium">NOT RUN</span> rather than a score. Deterministic results are unaffected.
          </p>
        </div>
      ) : null}

      {!suite ? (
        <EmptyState
          title="No evaluation has been run in this session"
          description={
            readOnly
              ? "Not run on this deployment."
              : "Running the suite executes every scenario end to end against the real engines. It takes a minute or so."
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px border-b border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-5">
            {[
              { label: "Scenarios", value: String(summary!.total), tone: "" },
              { label: "Deterministic passed", value: `${summary!.deterministicPass}/${summary!.total}`, tone: "text-pass-700" },
              {
                label: "Beyond the baseline",
                value: String(summary!.deterministicGap),
                tone: summary!.deterministicGap > 0 ? "text-warn-700" : "text-ink-400",
              },
              {
                label: "Adaptive passed",
                value: summary!.adaptiveNotRun === summary!.total ? "NOT RUN" : `${summary!.adaptivePass}/${summary!.total - summary!.adaptiveNotRun}`,
                tone: summary!.adaptiveNotRun === summary!.total ? "text-ink-400" : "text-pass-700",
              },
              { label: "Run at", value: new Date(suite.ranAt).toLocaleTimeString("en-US"), tone: "" },
            ].map((cell) => (
              <div key={cell.label} className="bg-white px-4 py-2.5">
                <div className="label-xs">{cell.label}</div>
                <div className={cn("tnum mt-0.5 text-[15px] font-semibold", cell.tone || "text-ink-900")}>
                  {cell.value}
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--hairline)] bg-ink-50/60">
                  {["Scenario", "Mode", "Status", "Outcome", "Selected", "Tools", "Unneeded", "Grounded", "Safety", "Duration"].map(
                    (h) => (
                      <th key={h} className="label-xs px-3 py-2 text-left whitespace-nowrap">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {suite.rows.flatMap((row) =>
                  (["deterministic", "adaptive"] as const).map((key) => {
                    const r = row[key];
                    const isAdaptive = key === "adaptive";
                    const notRun = r.status === "NOT_RUN";
                    return (
                      <tr
                        key={`${row.scenarioId}-${key}`}
                        className={cn(
                          "border-b border-[var(--hairline)] last:border-0",
                          isAdaptive && "bg-ink-50/40",
                        )}
                      >
                        <td className="px-3 py-2 align-top">
                          {!isAdaptive ? (
                            <button
                              type="button"
                              onClick={() => setExpanded(expanded === row.scenarioId ? null : row.scenarioId)}
                              className="text-left text-[12px] font-medium text-ink-900 hover:text-accent-600"
                            >
                              {row.title}
                            </button>
                          ) : (
                            <span className="text-[11px] text-ink-300">↳</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top text-[11.5px] whitespace-nowrap text-ink-500">
                          {isAdaptive ? "Adaptive" : "Deterministic"}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</Pill>
                          {r.expectedGapReason ? (
                            <p className="mt-1 max-w-[16rem] text-[11px] leading-snug text-ink-500">
                              {r.expectedGapReason}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 align-top text-[11.5px] whitespace-nowrap text-ink-600">
                          {notRun ? <span className="text-ink-300">—</span> : (r.outcome ?? "—")}
                        </td>
                        <td className="px-3 py-2 align-top whitespace-nowrap">
                          {notRun ? <span className="text-ink-300">—</span> : r.selectedSku ? <Mono>{r.selectedSku}</Mono> : "—"}
                        </td>
                        <td className="tnum px-3 py-2 align-top text-[12px]">
                          {notRun ? (
                            <span className="text-ink-300">—</span>
                          ) : isAdaptive ? (
                            `${r.metrics.modelInitiatedCalls} / ${r.metrics.toolCalls}`
                          ) : (
                            r.metrics.toolCalls
                          )}
                        </td>
                        <td className="tnum px-3 py-2 align-top text-[12px]">
                          {notRun ? (
                            <span className="text-ink-300">—</span>
                          ) : r.metrics.unnecessaryCalls > 0 ? (
                            <span className="font-medium text-warn-700">{r.metrics.unnecessaryCalls}</span>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className="px-3 py-2 align-top text-[12px]">
                          {notRun || !isAdaptive ? (
                            <span className="text-ink-300">—</span>
                          ) : r.metrics.groundingIssues === 0 ? (
                            <span className="text-pass-700">yes</span>
                          ) : (
                            <span className="text-fail-700">{r.metrics.groundingIssues} issue(s)</span>
                          )}
                        </td>
                        <td className="tnum px-3 py-2 align-top text-[12px]">
                          {notRun ? (
                            <span className="text-ink-300">—</span>
                          ) : r.metrics.safetyViolations > 0 ? (
                            <span className="font-medium text-fail-700">{r.metrics.safetyViolations}</span>
                          ) : (
                            <span className="text-pass-700">0</span>
                          )}
                        </td>
                        <td className="tnum px-3 py-2 align-top text-[11.5px] text-ink-500">
                          {notRun ? <span className="text-ink-300">—</span> : duration(r.metrics.durationMs)}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>

          {expanded ? (
            <div className="border-t border-[var(--hairline)] bg-ink-50/50 px-4 py-3">
              {(() => {
                const row = suite.rows.find((r) => r.scenarioId === expanded)!;
                return (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {(["deterministic", "adaptive"] as const).map((key) => {
                      const r = row[key];
                      return (
                        <div key={key}>
                          <div className="label-xs">{key === "adaptive" ? "Adaptive agent" : "Deterministic"}</div>
                          {r.status === "NOT_RUN" ? (
                            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">{r.notRunReason}</p>
                          ) : (
                            <>
                              <ul className="mt-1.5 space-y-1">
                                {r.checks.map((check) => (
                                  <li key={check.name} className="flex items-start gap-2">
                                    <Pill
                                      tone={check.passed ? "pass" : check.critical ? "fail" : "warn"}
                                      className="!px-1 !py-0 !text-[11px]"
                                    >
                                      {check.passed ? "pass" : "fail"}
                                    </Pill>
                                    <span className="text-[11.5px] leading-relaxed text-ink-600">
                                      <span className="font-medium text-ink-800">{check.name}</span> — {check.detail}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              {r.toolSequence.length > 0 ? (
                                <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-500">
                                  {r.toolSequence.join(" → ")}
                                </p>
                              ) : null}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
