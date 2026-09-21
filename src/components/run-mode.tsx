import { Cpu, FlaskConical, Radio } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * How a run was orchestrated. Three kinds, never blurred:
 *
 *  - Deterministic: the fixed pipeline, no model anywhere.
 *  - Scripted: the adaptive runtime driven by a test double — real MCP, real
 *    engines, but no provider call and nothing billed.
 *  - Live: the adaptive runtime directed by a real model.
 *
 * A scripted run labelled "adaptive" would be presenting a test as evidence
 * of model behaviour, so the distinction is carried everywhere a run appears.
 */
export function RunModeBadge({
  mode,
  modelSource,
  model,
  className,
}: {
  mode: string;
  modelSource?: string | null;
  model?: string | null;
  className?: string;
}) {
  const kind = mode !== "ADAPTIVE_AGENT" ? "deterministic" : modelSource === "LIVE" ? "live" : "scripted";
  const config = {
    deterministic: { label: "Deterministic", icon: Cpu, cls: "bg-ink-50 text-ink-700 ring-ink-200" },
    scripted: { label: "Scripted adaptive", icon: FlaskConical, cls: "bg-warn-50 text-warn-700 ring-warn-200" },
    live: { label: "Live adaptive", icon: Radio, cls: "bg-accent-50 text-accent-700 ring-accent-200" },
  }[kind];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap",
        config.cls,
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2} aria-hidden />
      {config.label}
      {kind === "live" && model ? <span className="font-mono text-[11px] opacity-75">{model}</span> : null}
    </span>
  );
}
