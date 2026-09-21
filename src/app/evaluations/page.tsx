import { CircleCheck, CircleX, FlaskConical, ShieldAlert, Swords, TableProperties } from "lucide-react";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel, Pill } from "@/components/ui/primitives";
import { EvalDashboard } from "@/components/lab/eval-dashboard";
import { isAdaptiveAvailable } from "@/lib/ai/capability";
import {
  CAPTURED_SUITE,
  CAPTURED_SCENARIOS,
  CAPTURED_FAILURE,
  CAPTURED_ATTACKS,
  CAPTURED_ATTACK_SUMMARY,
} from "@/lib/eval/captured";
import { OUTCOME_LABEL } from "@/lib/status";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/**
 * How the agent was measured, and what it got wrong.
 *
 * Everything above the console is a captured live suite, labelled with its
 * model and date and never mixed with a run started here. The failing
 * scenario stays on the page: a results screen that only showed passes would
 * give a reader no way to tell which kind of result they were looking at.
 */
export default function EvaluationsPage() {
  const s = CAPTURED_SUITE;
  const failed = CAPTURED_SCENARIOS.filter((x) => x.status === "FAIL").length;

  return (
    <PageBody>
      <PageHeader
        eyebrow="Agent"
        title="Evaluations"
        description="Fourteen scenarios scored against the same domain truth in both execution modes, a live run against a real model, and the attacks it was put through."
        actions={
          <Pill tone="neutral" dot>
            Captured {s.capturedOn} · {s.model}
          </Pill>
        }
      />

      <div className="flex flex-col gap-6">
        {/* ── Headline ───────────────────────────────────────────────── */}
        <section>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Headline label="Business outcomes correct" value={`${s.businessOutcomesCorrect} / ${s.scenariosExecuted}`} tone="pass" note="The right recommendation for the duty" />
            <Headline label="Full eval passes" value={`${s.scenariosPassed} / ${s.scenariosExecuted}`} tone="warn" note={`${failed} failed on audit completeness`} />
            <Headline label="Safety violations" value={String(s.safetyViolations)} tone="pass" note="Across every scenario" />
            <Headline label="Grounding failures" value={String(s.groundingRejections)} tone="pass" note="Unsupported claims in this suite" />
            <Headline label="Suite cost" value={`$${s.totalCostUsd.toFixed(4)}`} note={`$${s.meanCostUsd.toFixed(4)} per run`} />
          </div>
          <div className="mt-3 grid grid-cols-2 divide-x divide-[var(--hairline)] rounded-lg border border-[var(--hairline)] bg-white shadow-[var(--shadow-xs)] sm:grid-cols-5">
            {[
              ["Mean turns", s.meanTurns.toFixed(1)],
              ["Mean tool calls", s.meanToolCalls.toFixed(1)],
              ["Mean latency", `${(s.meanLatencyMs / 1000).toFixed(1)} s`],
              ["Unnecessary calls", String(s.unnecessaryToolCalls)],
              ["Required tools missed", String(s.requiredToolsMissed)],
            ].map(([label, value]) => (
              <div key={label} className="px-4 py-2.5">
                <div className="t-micro text-ink-500">{label}</div>
                <div className="tnum t-heading mt-0.5 text-ink-900">{value}</div>
              </div>
            ))}
          </div>
          <p className="t-small mt-3 max-w-4xl text-ink-600">
            The first two figures differ on purpose. Outcome correctness asks whether a customer would have been given the right
            thing; the full eval also demands a complete audit record. Every run got the answer right. One did not write down why it
            ruled out a part, and that counts as a failure here.
          </p>
        </section>

        {/* ── Scenario table ─────────────────────────────────────────── */}
        <section>
          <SectionTitle icon={TableProperties} title="Scenario results" note={s.method} />
          <Panel>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead>
                  <tr className="border-b border-[var(--hairline)] bg-ink-50/50">
                    {["Scenario", "Result", "Outcome", "Part", "Tool calls", "Unneeded", "Grounding", "Safety"].map((h, i) => (
                      <th key={h} className={cn("t-small px-4 py-2 font-medium text-ink-500", i >= 4 && "text-right")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--hairline)]">
                  {CAPTURED_SCENARIOS.map((row) => {
                    const fail = row.status === "FAIL";
                    return (
                      <tr key={row.title} className={cn(fail ? "bg-fail-50/50" : "transition-colors hover:bg-ink-50/60")}>
                        <td className="t-small px-4 py-2.5 font-medium text-ink-900">{row.title}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={cn(
                              "inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-semibold",
                              fail ? "bg-fail-100 text-fail-700" : "bg-pass-50 text-pass-700",
                            )}
                          >
                            {fail ? <CircleX className="size-3" aria-hidden /> : <CircleCheck className="size-3" aria-hidden />}
                            {fail ? "Fail" : "Pass"}
                          </span>
                        </td>
                        <td className="t-small px-4 py-2.5 text-ink-700">{OUTCOME_LABEL[row.outcome] ?? row.outcome}</td>
                        <td className="px-4 py-2.5 font-mono text-[12px] text-ink-800">{row.sku ?? "—"}</td>
                        <td className="tnum t-small px-4 py-2.5 text-right text-ink-700">
                          {row.agentToolCalls} <span className="text-ink-400">/ {row.totalToolCalls}</span>
                        </td>
                        <td className="tnum t-small px-4 py-2.5 text-right text-ink-700">{row.unnecessaryCalls}</td>
                        <td className="t-small px-4 py-2.5 text-right text-pass-700">{row.groundingRejections === 0 ? "Clean" : row.groundingRejections}</td>
                        <td className="t-small px-4 py-2.5 text-right text-pass-700">{row.safetyViolations === 0 ? "0" : row.safetyViolations}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="t-small border-t border-[var(--hairline)] bg-ink-50/50 px-4 py-2 text-ink-500">
              Tool calls shown as <span className="font-medium text-ink-700">chosen by the model</span> / total including deterministic
              finalization. This suite ran before the informational terminal action existed; scenarios C and D have since been re-run
              live and now conclude by answering the question — see the adaptive paths in the Agent lab.
            </div>
          </Panel>
        </section>

        {/* ── The failure ────────────────────────────────────────────── */}
        <section>
          <SectionTitle icon={ShieldAlert} title="The scenario that failed" note="Kept visible, and explained rather than relaxed." />
          <Panel className="border-fail-200">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--hairline)] px-4 py-3">
              <span className="inline-flex h-5 items-center gap-1 rounded bg-fail-100 px-1.5 text-[11px] font-semibold text-fail-700">
                <CircleX className="size-3" aria-hidden /> Fail
              </span>
              <span className="t-heading text-ink-900">{CAPTURED_FAILURE.scenario}</span>
              <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-700">{CAPTURED_FAILURE.check}</span>
            </div>
            <div className="grid gap-px bg-[var(--hairline)] md:grid-cols-3">
              <Finding label="Business result" tone="pass" title="Correct">
                {CAPTURED_FAILURE.whatWasRight}
              </Finding>
              <Finding label="Audit completeness" tone="fail" title="Failed">
                {CAPTURED_FAILURE.whatWasWrong}
              </Finding>
              <Finding label="Why it is still failing" tone="warn" title="Intermittent">
                {CAPTURED_FAILURE.whyItStands}
              </Finding>
            </div>
          </Panel>
        </section>

        {/* ── Adversarial ────────────────────────────────────────────── */}
        <section>
          <SectionTitle
            icon={Swords}
            title="Adversarial runs"
            note={`${CAPTURED_ATTACK_SUMMARY.runs} requests written to make the agent skip checks, invent stock, discount and approve itself — run live.`}
          />
          <Panel>
            <div className="grid gap-px border-b border-[var(--hairline)] bg-[var(--hairline)] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="bg-ink-950 px-5 py-4 text-white">
                <div className="text-[12px] font-medium text-white/60">The design principle</div>
                <p className="mt-1.5 text-[17px] font-semibold leading-snug tracking-[-0.015em]">
                  The model can fail. The system is designed so that a model failure does not become business truth.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-px bg-[var(--hairline)]">
                {[
                  ["Model partially complied", `${CAPTURED_ATTACK_SUMMARY.partiallyCompliedInProse} of ${CAPTURED_ATTACK_SUMMARY.runs}`, "warn"],
                  ["Safety violations", String(CAPTURED_ATTACK_SUMMARY.safetyViolations), "pass"],
                  ["Unsupported claims reaching a customer", String(CAPTURED_ATTACK_SUMMARY.claimsReachingCustomerFacingOutput), "pass"],
                  ["Approvals the agent decided", "0", "pass"],
                ].map(([label, value, tone]) => (
                  <div key={label} className="bg-white px-4 py-3">
                    <div className="t-micro text-ink-500">{label}</div>
                    <div className={cn("t-figure mt-0.5", tone === "warn" ? "text-warn-700" : "text-pass-700")}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <ul className="divide-y divide-[var(--hairline)]">
              {CAPTURED_ATTACKS.map((attack, i) => (
                <li key={i} className="grid gap-3 px-4 py-3.5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <div className="t-micro font-medium text-ink-500">Attack</div>
                    <p className="t-small mt-0.5 font-mono text-[12px] text-ink-800">{attack.attack}</p>
                  </div>
                  <div>
                    <div className="t-micro font-medium text-warn-700">What the model did</div>
                    <p className="t-small mt-0.5 text-ink-700">{attack.modelBehaviour}</p>
                  </div>
                  <div>
                    <div className="t-micro font-medium text-pass-700">What the system did</div>
                    <p className="t-small mt-0.5 text-ink-700">{attack.systemOutcome}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </section>

        {/* ── Run it ─────────────────────────────────────────────────── */}
        <section>
          <SectionTitle
            icon={FlaskConical}
            title="Run the suite"
            note="Executes every scenario end to end against the real engines. Deterministic mode is free and always available; adaptive rows run only where live model calls are allowed, and report Not run otherwise."
          />
          <EvalDashboard adaptiveAvailable={isAdaptiveAvailable()} />
        </section>
      </div>
    </PageBody>
  );
}

function Headline({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "pass" | "warn" }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white px-4 py-3.5 shadow-[var(--shadow-xs)]">
      <div className="t-small text-ink-500">{label}</div>
      <div className={cn("tnum mt-1 text-[26px] font-semibold leading-none tracking-[-0.025em]", tone === "pass" ? "text-pass-700" : tone === "warn" ? "text-warn-700" : "text-ink-900")}>
        {value}
      </div>
      <div className="t-small mt-1.5 text-ink-500">{note}</div>
    </div>
  );
}

function Finding({ label, title, tone, children }: { label: string; title: string; tone: "pass" | "fail" | "warn"; children: React.ReactNode }) {
  return (
    <div className="bg-white px-4 py-3.5">
      <div className="t-micro text-ink-500">{label}</div>
      <div className={cn("t-heading mt-0.5", tone === "pass" ? "text-pass-700" : tone === "fail" ? "text-fail-700" : "text-warn-700")}>{title}</div>
      <p className="t-small mt-1 text-ink-700">{children}</p>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, note }: { icon: typeof Swords; title: string; note?: string }) {
  return (
    <div className="mb-2.5">
      <h2 className="t-title flex items-center gap-2 text-ink-900">
        <Icon className="size-4 text-ink-400" strokeWidth={1.75} aria-hidden />
        {title}
      </h2>
      {note ? <p className="t-small mt-0.5 max-w-4xl pl-6 text-ink-500">{note}</p> : null}
    </div>
  );
}
