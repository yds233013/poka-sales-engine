"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Panel, PanelHeader, Button, Pill, SectionLabel } from "@/components/ui/primitives";
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
      <PanelHeader
        title="Run an investigation"
        subtitle="Pick a seeded scenario or paste a request, choose how it should be orchestrated, and inspect what actually executed."
      />

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
                      <span className={cn("text-[10.5px]", active ? "text-ink-300" : "text-ink-400")}>
                        {option.model}
                      </span>
                    ) : null
                  ) : (
                    <Pill tone="neutral" className="!px-1 !py-0 !text-[10px]">
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
    </Panel>
  );
}
