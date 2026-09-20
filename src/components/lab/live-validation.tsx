import { Panel, PanelHeader, Pill, Mono } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import {
  CAPTURED_SUITE,
  CAPTURED_FAILURE,
  CAPTURED_PATHS,
  CAPTURED_ATTACKS,
  CAPTURED_ATTACK_SUMMARY,
} from "@/lib/eval/captured";

/**
 * What happened when this was run against a real model.
 *
 * Everything on this surface is historical and labelled as such. A run started
 * from the console above renders from the database instead; the two are never
 * mixed, because a captured number presented as a live one is the same lie as
 * a fabricated one.
 */
export function LiveValidation() {
  const s = CAPTURED_SUITE;
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Live validation"
          subtitle={`Measured against ${s.model} over the Anthropic Messages API. ${s.method}`}
          actions={<Pill tone="neutral">Captured {s.capturedOn}</Pill>}
        />

        <div className="grid grid-cols-2 gap-px border-b border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-4">
          {[
            {
              label: "Business outcomes correct",
              value: `${s.businessOutcomesCorrect}/${s.scenariosExecuted}`,
              tone: "text-pass-700",
              note: "Recommendation matched domain truth",
            },
            {
              label: "Scenarios passed",
              value: `${s.scenariosPassed}/${s.scenariosExecuted}`,
              tone: "text-warn-700",
              note: "One failed on audit completeness",
            },
            {
              label: "Safety violations",
              value: String(s.safetyViolations),
              tone: "text-pass-700",
              note: "Across every run",
            },
            {
              label: "Grounding rejections",
              value: String(s.groundingRejections),
              tone: "text-pass-700",
              note: "In this suite",
            },
          ].map((cell) => (
            <div key={cell.label} className="bg-white px-4 py-3">
              <div className="label-xs">{cell.label}</div>
              <div className={cn("tnum mt-0.5 text-[17px] font-semibold", cell.tone)}>{cell.value}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-ink-500">{cell.note}</div>
            </div>
          ))}
        </div>

        {/* The distinction matters enough to state rather than imply: a correct
            answer and a complete audit record are two different measurements. */}
        <div className="border-b border-[var(--hairline)] px-4 py-2.5">
          <p className="text-[11.5px] leading-relaxed text-ink-600">
            Those first two numbers differ on purpose. Every run reached the right commercial answer; one
            of them did not record the full reasoning behind a rejection. Outcome correctness and audit
            completeness are scored separately, and only the first is about whether a customer would have
            been given the right thing.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px bg-[var(--hairline)] sm:grid-cols-5">
          {[
            ["Mean turns", s.meanTurns.toFixed(1)],
            ["Mean tool calls", s.meanToolCalls.toFixed(1)],
            ["Mean latency", `${(s.meanLatencyMs / 1000).toFixed(1)} s`],
            ["Suite cost", `$${s.totalCostUsd.toFixed(4)}`],
            ["Cost per run", `$${s.meanCostUsd.toFixed(4)}`],
          ].map(([label, value]) => (
            <div key={label} className="bg-white px-4 py-2.5">
              <div className="label-xs">{label}</div>
              <div className="tnum mt-0.5 text-[13px] font-medium text-ink-900">{value}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="The scenario that failed"
          subtitle="Kept visible. A results panel that only showed successes would not tell you which kind you were looking at."
          actions={<Pill tone="fail">Fail</Pill>}
        />
        <div className="space-y-2.5 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-medium text-ink-900">{CAPTURED_FAILURE.scenario}</span>
            <Mono>{CAPTURED_FAILURE.check}</Mono>
          </div>
          {[
            ["What was right", CAPTURED_FAILURE.whatWasRight, "text-pass-700"],
            ["What was wrong", CAPTURED_FAILURE.whatWasWrong, "text-fail-700"],
            ["Why it is still failing", CAPTURED_FAILURE.whyItStands, "text-ink-600"],
          ].map(([label, text, tone]) => (
            <div key={label} className="grid gap-1 sm:grid-cols-[150px_1fr] sm:gap-3">
              <div className="label-xs pt-0.5">{label}</div>
              <p className={cn("text-[11.5px] leading-relaxed", tone)}>{text}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Investigation depth responds to the request"
          subtitle="Tool sequences from three real runs, exactly as each one persisted them. Nothing here is a template — a different request produces a different path."
          actions={<Pill tone="neutral">Captured runs</Pill>}
        />
        <div className="divide-y divide-[var(--hairline)]">
          {CAPTURED_PATHS.map((path) => (
            <div key={path.label} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] font-medium text-ink-900">{path.label}</span>
                <Pill tone={path.producedQuote ? "accent" : "pass"}>{path.termination.replace(/_/g, " ")}</Pill>
                <Pill tone="neutral">{path.tools.length} tools</Pill>
                {!path.producedQuote ? <Pill tone="neutral">no quote</Pill> : null}
              </div>
              <p className="mt-1 text-[11.5px] italic leading-snug text-ink-500">&ldquo;{path.request}&rdquo;</p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {path.tools.map((tool, index) => (
                  <span key={`${tool}-${index}`} className="flex items-center gap-1">
                    <Mono>{tool}</Mono>
                    {index < path.tools.length - 1 ? <span className="text-ink-300">→</span> : null}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[11.5px] leading-snug text-ink-600">{path.note}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="What happened when the request attacked the agent"
          subtitle="Four adversarial runs. The finding is not that the model resisted them."
          actions={<Pill tone="neutral">{CAPTURED_ATTACK_SUMMARY.runs} runs</Pill>}
        />

        <div className="border-b border-[var(--hairline)] bg-ink-50/60 px-4 py-3">
          <p className="text-[12px] leading-relaxed text-ink-800">
            In {CAPTURED_ATTACK_SUMMARY.partiallyCompliedInProse} of {CAPTURED_ATTACK_SUMMARY.runs} runs the
            model <span className="font-medium">partially complied</span> — it did the tool work correctly,
            then repeated an invented stock figure or price in its written summary. Grounding rejected every
            one of those claims before it could reach a customer or a quotation.
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-600">
            That is the design principle, stated plainly: the model can fail, and the system is built so that
            a model failure does not silently become business truth. {CAPTURED_ATTACK_SUMMARY.safetyViolations}{" "}
            safety violations and {CAPTURED_ATTACK_SUMMARY.claimsReachingCustomerFacingOutput} unsupported
            claims reached customer-facing output.
          </p>
        </div>

        <div className="divide-y divide-[var(--hairline)]">
          {CAPTURED_ATTACKS.map((attack, index) => (
            <div key={index} className="px-4 py-3">
              <p className="text-[11.5px] italic leading-snug text-ink-700">{attack.attack}</p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2 sm:gap-4">
                <div>
                  <div className="label-xs">What the model did</div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-warn-700">{attack.modelBehaviour}</p>
                </div>
                <div>
                  <div className="label-xs">What the system did</div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-pass-700">{attack.systemOutcome}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
