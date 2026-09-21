"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Panel, Button, Pill, SectionLabel, Mono, statusLabel } from "@/components/ui/primitives";
import { duration } from "@/lib/format";
import { cn } from "@/lib/cn";
import { runInLab, type LabRunResult } from "@/app/agent-lab/actions";

export interface ModeOption {
  mode: "DETERMINISTIC" | "ADAPTIVE_AGENT";
  available: boolean;
  label: string;
  description: string;
  unavailableReason: string | null;
  model: string | null;
}

export interface ScenarioOption {
  id: string;
  title: string;
  demonstrates: string;
  seeded: boolean;
}

export function RunConsole({
  modes,
  scenarios,
  accounts,
}: {
  modes: ModeOption[];
  scenarios: ScenarioOption[];
  accounts: { accountNumber: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<ModeOption["mode"]>("DETERMINISTIC");
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? "");
  const [tab, setTab] = useState<"scenario" | "custom">("scenario");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [account, setAccount] = useState(accounts[0]?.accountNumber ?? "");
  const [result, setResult] = useState<LabRunResult | null>(null);

  const selectedMode = modes.find((m) => m.mode === mode)!;
  const scenario = scenarios.find((s) => s.id === scenarioId);

  const execute = () =>
    start(async () => {
      setResult(null);
      const outcome = await runInLab({
        mode,
        ...(tab === "scenario"
          ? { scenarioId }
          : { customRfq: { subject, body, accountNumber: account } }),
      });
      setResult(outcome);
      router.refresh();
    });

  const canRun =
    selectedMode.available &&
    (tab === "scenario" ? Boolean(scenarioId) : subject.trim().length > 2 && body.trim().length > 20);

  return (
    <Panel>
      {/* Execution mode */}
      <div className="border-b border-[var(--hairline)] px-4 py-3">
        <SectionLabel>Execution mode</SectionLabel>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {modes.map((option) => {
            const active = mode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                disabled={!option.available}
                onClick={() => setMode(option.mode)}
                className={cn(
                  "rounded border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-ink-900 bg-ink-900 text-white"
                    : option.available
                      ? "border-[var(--hairline-strong)] bg-white hover:bg-ink-50"
                      : "cursor-not-allowed border-[var(--hairline)] bg-ink-50/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("text-[12.5px] font-medium", !option.available && "text-ink-400")}>
                    {option.label}
                  </span>
                  {option.available ? (
                    option.model ? (
                      <span className={cn("text-[11px]", active ? "text-ink-300" : "text-ink-400")}>
                        {option.model}
                      </span>
                    ) : null
                  ) : (
                    <Pill tone="neutral" className="!px-1 !py-0 !text-[11px]">
                      unavailable
                    </Pill>
                  )}
                </div>
                <p
                  className={cn(
                    "mt-1 text-[11.5px] leading-relaxed",
                    active ? "text-ink-300" : option.available ? "text-ink-500" : "text-ink-400",
                  )}
                >
                  {option.available ? option.description : option.unavailableReason}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Input */}
      <div className="border-b border-[var(--hairline)] px-4 py-3">
        <div className="flex items-center gap-0.5">
          {(["scenario", "custom"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "rounded px-2.5 py-1 text-[12px] font-medium transition-colors",
                tab === key ? "bg-ink-100 text-ink-900" : "text-ink-500 hover:bg-ink-50",
              )}
            >
              {key === "scenario" ? "Seeded scenario" : "Custom request"}
            </button>
          ))}
        </div>

        {tab === "scenario" ? (
          <div className="mt-2.5">
            <select
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
              className="h-8 w-full rounded border border-[var(--hairline-strong)] bg-white px-2 text-[12.5px] text-ink-900 focus:border-accent-500 focus:outline-none"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.seeded ? "" : "New · "}
                  {s.title}
                </option>
              ))}
            </select>
            {scenario ? (
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-500">{scenario.demonstrates}</p>
            ) : null}
          </div>
        ) : (
          <div className="mt-2.5 space-y-2">
            <div className="flex gap-2">
              <select
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="h-8 w-56 rounded border border-[var(--hairline-strong)] bg-white px-2 text-[12px] text-ink-800 focus:border-accent-500 focus:outline-none"
              >
                {accounts.map((a) => (
                  <option key={a.accountNumber} value={a.accountNumber}>
                    {a.name}
                  </option>
                ))}
              </select>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="h-8 flex-1 rounded border border-[var(--hairline-strong)] bg-white px-2.5 text-[12.5px] text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
              />
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              placeholder="Paste the customer's message exactly as it arrived — including anything odd in it."
              className="w-full resize-y rounded border border-[var(--hairline-strong)] bg-white px-2.5 py-2 text-[12.5px] leading-relaxed text-ink-800 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Button variant="primary" onClick={execute} disabled={!canRun || pending}>
          {pending ? "Running…" : mode === "DETERMINISTIC" ? "Run deterministic workflow" : "Run adaptive agent"}
        </Button>
        {!selectedMode.available ? (
          <span className="text-[11.5px] text-ink-500">{selectedMode.unavailableReason}</span>
        ) : null}
        {result ? (
          <span className={cn("text-[11.5px]", result.ok ? "text-pass-700" : "text-fail-700")}>
            {result.message}
            {result.ok && result.requestId ? (
              <>
                {" "}
                <Link href={`/cases/${result.requestId}`} className="font-medium text-accent-600 underline">
                  Open the case
                </Link>
              </>
            ) : null}
          </span>
        ) : null}
      </div>

      {result?.ok && result.run ? <RunRecord run={result.run} /> : null}
    </Panel>
  );
}

/**
 * What the run actually recorded.
 *
 * The provenance label is the point of this block. A scripted test run and a
 * live one both record ADAPTIVE_AGENT with a model name, so without saying
 * which is which the console would present a fixture as a live agent result.
 * Token and cost figures are shown only for runs that were really billed.
 */
function RunRecord({ run }: { run: NonNullable<LabRunResult["run"]> }) {
  const live = run.modelSource === "LIVE";
  const scripted = run.modelSource === "SCRIPTED";
  const label = scripted ? "Scripted adaptive test" : live ? "Live adaptive" : "Deterministic";

  const answered = run.termination === "INFORMATION_PROVIDED";
  const cells: { label: string; value: string }[] = [
    { label: "Termination", value: run.termination ? statusLabel(run.termination) : "—" },
    { label: "Turns", value: run.turnCount != null ? String(run.turnCount) : "—" },
    { label: "Agent tool calls", value: String(run.toolSequence.length) },
    { label: "Duration", value: run.durationMs != null ? duration(run.durationMs) : "—" },
  ];
  if (live) {
    cells.push({
      label: "Tokens in / out",
      value:
        run.inputTokens != null
          ? `${run.inputTokens.toLocaleString()} / ${(run.outputTokens ?? 0).toLocaleString()}${
              run.cacheReadTokens ? ` · ${run.cacheReadTokens.toLocaleString()} cached` : ""
            }`
          : "—",
    });
    cells.push({
      label: "Estimated cost",
      value: run.estimatedCostUsd != null ? `$${run.estimatedCostUsd.toFixed(4)}` : "—",
    });
  }

  return (
    <div className="border-t border-[var(--hairline)]">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Pill tone={scripted ? "warn" : live ? "accent" : "neutral"}>{label}</Pill>
        {run.model ? <Mono>{run.model}</Mono> : null}
        {scripted ? (
          <span className="text-[11px] text-ink-500">
            Directed by a scripted stand-in — no provider call was made and nothing was billed.
          </span>
        ) : null}
        {answered ? (
          <Pill tone="pass">Question answered — nothing quoted</Pill>
        ) : null}
      </div>

      {answered ? (
        <div className="border-t border-[var(--hairline)] bg-pass-50 px-4 py-2.5">
          <p className="text-[11.5px] leading-snug text-pass-700">
            The customer asked a question and it was answered from cited evidence. No quotation, price,
            freight, margin or approval was produced, because none was requested. The answer is a draft for
            a person to send.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-px border-y border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="bg-white px-3 py-2">
            <div className="label-xs">{cell.label}</div>
            <div className="tnum mt-0.5 text-[12.5px] font-medium text-ink-900">{cell.value}</div>
          </div>
        ))}
      </div>

      {run.toolSequence.length > 0 ? (
        <div className="px-4 py-2.5">
          <div className="label-xs mb-1">Tools the model chose, in order</div>
          <div className="flex flex-wrap items-center gap-1">
            {run.toolSequence.map((tool, index) => (
              <span key={`${tool}-${index}`} className="flex items-center gap-1">
                <Mono>{tool}</Mono>
                {index < run.toolSequence.length - 1 ? <span className="text-ink-300">→</span> : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {run.groundingIssues.length > 0 ? (
        <div className="border-t border-[var(--hairline)] bg-warn-50 px-4 py-2.5">
          <div className="label-xs mb-1 text-warn-700">
            {run.groundingIssues.length} claim(s) rejected as unsupported — the case was routed for review
          </div>
          <ul className="space-y-0.5">
            {run.groundingIssues.map((issue, index) => (
              <li key={index} className="text-[11.5px] leading-snug text-warn-700">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
