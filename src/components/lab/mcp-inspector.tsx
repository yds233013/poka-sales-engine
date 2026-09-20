"use client";

import { useState } from "react";
import { Panel, PanelHeader, Pill, SectionLabel, Mono, type Tone } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export interface ToolSpec {
  name: string;
  title: string;
  description: string;
  effect: string;
  effectNote: string;
  idempotent: boolean;
  terminal: boolean;
  inputSchema: string;
  outputSchema: string;
}

const EFFECT_TONE: Record<string, Tone> = {
  READ_ONLY: "neutral",
  DETERMINISTIC_COMPUTATION: "accent",
  MUTATION: "warn",
  HUMAN_GATED_MUTATION: "fail",
};

/**
 * The tool catalogue, as the agent sees it.
 *
 * Exists to make the boundary inspectable: which capabilities are reachable,
 * what each one does to the world, and the exact contract it is held to.
 */
export function McpInspector({ tools, serverName, serverVersion }: { tools: ToolSpec[]; serverName: string; serverVersion: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const byEffect = ["READ_ONLY", "DETERMINISTIC_COMPUTATION", "MUTATION", "HUMAN_GATED_MUTATION"];

  return (
    <Panel>
      <PanelHeader
        title="MCP tool surface"
        subtitle={`${tools.length} tools served by ${serverName} v${serverVersion} over the Model Context Protocol. This is the complete set of capabilities the agent can reach.`}
      />
      {/* The security claim, where someone checking it will look. It is the
          first question a reviewer asks about an agent with tools. */}
      <div className="border-b border-[var(--hairline)] bg-ink-50/60 px-4 py-2.5">
        <p className="text-[11.5px] leading-relaxed text-ink-700">
          The model has <span className="font-medium">no database handle, no connection string and no
          credentials</span>. It receives these typed capabilities and nothing else, and every result
          it sees is a validated structure rather than a row. Business logic stays behind this line:
          a tool takes <span className="font-medium">selectors</span> — which part, which document —
          never facts. <Mono className="!text-[10.5px]">check_compatibility</Mono> accepts a part
          number and loads the requirements itself, because a caller that could supply its own
          requirements could make anything pass.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-[var(--hairline)] px-4 py-2">
        {byEffect.map((effect) => {
          const count = tools.filter((t) => t.effect === effect).length;
          if (count === 0) return null;
          return (
            <Pill key={effect} tone={EFFECT_TONE[effect]} dot>
              {count} {effect.replace(/_/g, " ").toLowerCase()}
            </Pill>
          );
        })}
      </div>

      <ul className="divide-y divide-[var(--hairline)]">
        {tools.map((tool) => (
          <li key={tool.name}>
            <button
              type="button"
              onClick={() => setOpen(open === tool.name ? null : tool.name)}
              className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink-50"
            >
              <span className={cn("mt-0.5 shrink-0 text-ink-400 transition-transform", open === tool.name && "rotate-90")}>
                ›
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Mono className="!text-[12.5px] text-accent-700">{tool.name}</Mono>
                  <Pill tone={EFFECT_TONE[tool.effect]} className="!px-1 !py-0 !text-[10px]">
                    {tool.effect.replace(/_/g, " ").toLowerCase()}
                  </Pill>
                  {tool.terminal ? (
                    <Pill tone="neutral" className="!px-1 !py-0 !text-[10px]">
                      terminal
                    </Pill>
                  ) : null}
                  {tool.idempotent ? (
                    <span className="text-[10.5px] text-ink-400">idempotent</span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-ink-600">{tool.description}</span>
              </span>
            </button>

            {open === tool.name ? (
              <div className="border-t border-[var(--hairline)] bg-ink-50/50 px-4 py-3">
                <p className="text-[11.5px] leading-relaxed text-ink-600">
                  <span className="font-medium text-ink-800">{tool.effect.replace(/_/g, " ")}</span> — {tool.effectNote}
                </p>
                <div className="mt-2.5 grid gap-3 lg:grid-cols-2">
                  <div>
                    <SectionLabel>Input schema</SectionLabel>
                    <pre className="mt-1 max-h-60 overflow-auto rounded border border-[var(--hairline)] bg-white px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-ink-700">
                      {tool.inputSchema}
                    </pre>
                  </div>
                  <div>
                    <SectionLabel>Output schema</SectionLabel>
                    <pre className="mt-1 max-h-60 overflow-auto rounded border border-[var(--hairline)] bg-white px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-ink-700">
                      {tool.outputSchema}
                    </pre>
                  </div>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
