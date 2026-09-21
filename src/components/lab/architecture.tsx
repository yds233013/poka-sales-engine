import { ArrowDown, Bot, Cpu, FileCheck2, Inbox, ShieldCheck, UserCheck, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Who owns which decision, drawn as the path a request takes.
 *
 * Accurate to the implementation rather than tidied for effect: extraction is
 * deterministic and runs before the agent; both execution modes cross the same
 * MCP boundary; finalizeCase is the single path to a quote; grounding sits
 * between the agent's text and anything a customer sees; approvals are decided
 * by named roles on the server.
 */

interface Stage {
  icon: LucideIcon;
  title: string;
  detail: string;
  owner: "system" | "model" | "boundary" | "engine" | "human" | "output";
}

const STAGES: Stage[] = [
  { icon: Inbox, title: "Customer request", detail: "Email, portal or phone note — messy prose, untrusted input", owner: "output" },
  { icon: Cpu, title: "Request understanding", detail: "Deterministic extractor: parts, quantity, dates, duty requirements", owner: "system" },
  { icon: Bot, title: "Adaptive agent · Claude", detail: "Chooses which tools to call, in what order, and when evidence is sufficient", owner: "model" },
  { icon: Wrench, title: "MCP tool boundary", detail: "16 typed capabilities. No database handle, no credentials, selectors not facts", owner: "boundary" },
  { icon: Cpu, title: "Deterministic engines", detail: "Compatibility · available-to-promise · pricing · freight · margin · approval policy", owner: "engine" },
  { icon: FileCheck2, title: "Grounding", detail: "Every price, stock figure, part number and citation must match a tool result", owner: "engine" },
  { icon: UserCheck, title: "Human approval", detail: "Role-gated on the server. The agent has no tool that decides or releases", owner: "human" },
  { icon: ShieldCheck, title: "Customer-safe output", detail: "No cost, no margin, no internal figures — checked, not assumed", owner: "output" },
];

const OWNER = {
  system: { label: "System", band: "border-ink-200 bg-white", icon: "bg-ink-100 text-ink-600" },
  model: { label: "Model decides how", band: "border-accent-200 bg-accent-50/60", icon: "bg-accent-600 text-white" },
  boundary: { label: "Boundary", band: "border-[#f2b27a] bg-[#fff6ee]", icon: "bg-[#e0761f] text-white" },
  engine: { label: "Engines decide what", band: "border-pass-200 bg-pass-50/60", icon: "bg-pass-600 text-white" },
  human: { label: "People decide", band: "border-fail-200 bg-fail-50/50", icon: "bg-fail-600 text-white" },
  output: { label: "", band: "border-ink-200 bg-white", icon: "bg-ink-900 text-white" },
} as const;

export function Architecture() {
  return (
    <div className="grid gap-5 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <ol className="space-y-0">
        {STAGES.map((stage, index) => {
          const o = OWNER[stage.owner];
          const Icon = stage.icon;
          return (
            <li key={stage.title}>
              <div className={cn("flex items-center gap-3 rounded-md border px-3 py-2", o.band, stage.owner === "boundary" && "border-dashed")}>
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", o.icon)}>
                  <Icon className="size-3.5" strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="t-heading text-ink-900">{stage.title}</div>
                  <div className="t-small text-ink-600">{stage.detail}</div>
                </div>
                {o.label ? <span className="t-micro hidden shrink-0 font-medium text-ink-500 sm:block">{o.label}</span> : null}
              </div>
              {index < STAGES.length - 1 ? (
                <div className="flex h-4 items-center pl-[22px]">
                  <ArrowDown className="size-3 text-ink-300" aria-hidden />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="space-y-3 rounded-md border border-[var(--hairline)] bg-ink-50/50 p-3.5">
        <div className="t-heading text-ink-900">The ownership rule</div>
        <p className="t-small text-ink-600">
          The agent decides <span className="font-medium text-ink-900">how to investigate</span>. The engines decide{" "}
          <span className="font-medium text-ink-900">what is true</span>. People decide{" "}
          <span className="font-medium text-ink-900">what is allowed</span>.
        </p>
        <ul className="space-y-2 border-t border-[var(--hairline)] pt-3">
          {[
            ["A model cannot", "state a price, a stock level or a compatibility verdict that no tool returned."],
            ["A model cannot", "approve, release, discount or send — no such tool exists."],
            ["Both modes", "end at the same function, finalizeCase, so the numbers are identical."],
            ["If the model fails", "grounding routes the case to a person instead of the customer."],
          ].map(([lead, rest], i) => (
            <li key={i} className="t-small text-ink-600">
              <span className="font-medium text-ink-900">{lead}</span> {rest}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
