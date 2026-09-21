"use client";

import { useState } from "react";
import { ChevronRight, Database, KeyRound, Lock } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The agent's complete capability surface, as the MCP server advertises it.
 *
 * Grouped by what the tools are for rather than alphabetically, because the
 * question a reviewer is asking is "what can this thing do to the world?" —
 * and the answer is visible in the effect column before anything is opened.
 */

export interface ToolView {
  name: string;
  title: string;
  description: string;
  effect: string;
  effectNote: string;
  idempotent: boolean;
  terminal: boolean;
  group: string;
  /** The JSON Schema the model is actually sent. */
  inputSchema: string;
  outputSchema: string;
}

const EFFECT = {
  READ_ONLY: { label: "Read", cls: "bg-ink-50 text-ink-700 ring-ink-200" },
  DETERMINISTIC_COMPUTATION: { label: "Compute", cls: "bg-accent-50 text-accent-700 ring-accent-200" },
  MUTATION: { label: "Mutation", cls: "bg-warn-50 text-warn-700 ring-warn-200" },
  HUMAN_GATED_MUTATION: { label: "Human-gated", cls: "bg-fail-50 text-fail-700 ring-fail-200" },
} as const;

const TOOL_GROUPS: { key: string; label: string; note: string }[] = [
  { key: "discovery", label: "Discovery", note: "Who is asking and what they asked for" },
  { key: "technical", label: "Technical", note: "Specifications, compatibility and evidence" },
  { key: "inventory", label: "Inventory", note: "Stock positions and fulfillment plans" },
  { key: "commercial", label: "Commercial", note: "Pricing — never a discount the model chose" },
  { key: "workflow", label: "Workflow", note: "Ways to end a run. None can approve, release or send" },
];

export function Toolbox({ tools, serverName, serverVersion }: { tools: ToolView[]; serverName: string; serverVersion: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const counts = Object.entries(EFFECT).map(([key, e]) => ({ ...e, key, n: tools.filter((t) => t.effect === key).length }));

  return (
    <div>
      <div className="grid gap-px border-b border-[var(--hairline)] bg-[var(--hairline)] md:grid-cols-3">
        {[
          { icon: Database, title: "No database handle", body: "The server owns data access. The model receives validated structures, never rows." },
          { icon: KeyRound, title: "No credentials", body: "No connection string, API key or environment variable appears in any schema." },
          { icon: Lock, title: "Selectors, not facts", body: "check_compatibility takes a part number and loads the requirements itself." },
        ].map((item) => (
          <div key={item.title} className="flex gap-2.5 bg-white px-4 py-3">
            <item.icon className="mt-0.5 size-4 shrink-0 text-ink-400" strokeWidth={1.75} aria-hidden />
            <div>
              <div className="t-heading text-ink-900">{item.title}</div>
              <div className="t-small text-ink-600">{item.body}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--hairline)] px-4 py-2.5">
        <span className="t-small text-ink-600">
          <span className="font-mono text-ink-800">{serverName}</span> v{serverVersion} · {tools.length} tools over JSON-RPC
        </span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {counts.map((c) => (
            <span key={c.key} className={cn("inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium ring-1 ring-inset", c.cls)}>
              {c.n} {c.label.toLowerCase()}
            </span>
          ))}
        </span>
      </div>

      {TOOL_GROUPS.map((group) => {
        const members = tools.filter((t) => t.group === group.key);
        if (members.length === 0) return null;
        return (
          <section key={group.key} aria-label={group.label}>
            <div className="flex items-baseline gap-2 border-b border-[var(--hairline)] bg-ink-50/60 px-4 py-1.5">
              <span className="t-small font-semibold text-ink-800">{group.label}</span>
              <span className="t-micro text-ink-500">{group.note}</span>
            </div>
            <ul className="divide-y divide-[var(--hairline)] border-b border-[var(--hairline)]">
              {members.map((tool) => {
                const effect = EFFECT[tool.effect as keyof typeof EFFECT] ?? EFFECT.READ_ONLY;
                const isOpen = open === tool.name;
                return (
                  <li key={tool.name}>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : tool.name)}
                      aria-expanded={isOpen}
                      className="grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-ink-50/70"
                    >
                      <ChevronRight className={cn("mt-0.5 size-3.5 text-ink-400 transition-transform", isOpen && "rotate-90")} aria-hidden />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[12.5px] font-medium text-ink-900">{tool.name}</span>
                          {tool.terminal ? <span className="t-micro rounded bg-ink-900 px-1.5 font-medium text-white">ends run</span> : null}
                          {tool.idempotent ? <span className="t-micro text-ink-400">idempotent</span> : null}
                        </span>
                        <span className={cn("t-small mt-0.5 block text-ink-600", !isOpen && "line-clamp-1")}>{tool.description}</span>
                      </span>
                      <span className={cn("inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium ring-1 ring-inset", effect.cls)}>
                        {effect.label}
                      </span>
                    </button>
                    {isOpen ? (
                      <div className="animate-in space-y-2.5 bg-ink-50/50 px-4 pb-3 pl-[42px] pt-1">
                        <p className="t-small text-ink-600">
                          <span className="font-medium text-ink-900">{effect.label}.</span> {tool.effectNote}
                        </p>
                        <div className="grid gap-3 xl:grid-cols-2">
                          <Schema label="Input — the JSON Schema the model is sent" body={tool.inputSchema} />
                          <Schema label="Output — validated before the model sees it" body={tool.outputSchema} />
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Schema({ label, body }: { label: string; body: string }) {
  return (
    <div className="min-w-0">
      <div className="t-micro font-medium text-ink-500">{label}</div>
      <pre className="mt-1 max-h-64 overflow-auto rounded border border-[var(--hairline)] bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-700">
        {body}
      </pre>
    </div>
  );
}
