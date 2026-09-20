import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader, Pill, Mono, SectionLabel, EmptyState, statusLabel } from "@/components/ui/primitives";
import { executionModes } from "@/lib/ai/capability";
import { TOOL_CONTRACTS, TOOL_NAMES, TERMINAL_TOOLS, EFFECT_DESCRIPTION } from "@/lib/mcp/contracts";
import { SERVER_NAME, SERVER_VERSION } from "@/lib/mcp/client";
import { EVAL_SCENARIOS } from "@/lib/eval/scenario";
import { McpInspector, type ToolSpec } from "@/components/lab/mcp-inspector";
import { RunConsole } from "@/components/lab/run-console";
import { EvalDashboard } from "@/components/lab/eval-dashboard";
import { dateTime, duration } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Render a Zod object's shape as a readable schema sketch for the inspector. */
function describeSchema(schema: z.ZodObject<z.ZodRawShape>): string {
  const entries = Object.entries(schema.shape).map(([key, value]) => {
    const def = (value as { _def?: Record<string, unknown>; description?: string })._def;
    const raw = String((def?.typeName ?? def?.type) ?? "unknown");
    const type = raw.replace(/^Zod/, "").toLowerCase();
    const description = (value as { description?: string }).description;
    return `  ${key}: ${type}${description ? `  // ${description.slice(0, 80)}` : ""}`;
  });
  return `{\n${entries.join("\n")}\n}`;
}

export default async function AgentLabPage() {
  const modes = executionModes();
  const adaptiveAvailable = modes.find((m) => m.mode === "ADAPTIVE_AGENT")!.available;

  const tools: ToolSpec[] = TOOL_NAMES.map((name) => {
    const contract = TOOL_CONTRACTS[name];
    return {
      name,
      title: contract.title,
      description: contract.description,
      effect: contract.effect,
      effectNote: EFFECT_DESCRIPTION[contract.effect],
      idempotent: contract.idempotent,
      terminal: (TERMINAL_TOOLS as string[]).includes(name),
      inputSchema: describeSchema(contract.input),
      outputSchema: describeSchema(contract.output),
    };
  });

  const [seededRefs, accounts, recentRuns] = await Promise.all([
    prisma.salesRequest.findMany({ select: { reference: true }, orderBy: { reference: "asc" } }),
    prisma.customer.findMany({ select: { accountNumber: true, name: true }, orderBy: { name: "asc" } }),
    prisma.agentRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 12,
      include: {
        request: { select: { id: true, reference: true, subject: true, status: true } },
        _count: { select: { toolCalls: true } },
      },
    }),
  ]);
  const seeded = new Set(seededRefs.map((r) => r.reference));

  const scenarios = EVAL_SCENARIOS.map((s) => ({
    id: s.id,
    title: s.title,
    demonstrates: s.demonstrates,
    seeded: s.reference !== null && seeded.has(s.reference),
  }));

  return (
    <PageBody>
      <PageHeader
        eyebrow="Agent lab"
        title="Agent lab"
        description="An internal surface for the AI engineering behind this product: the MCP tool boundary, the two execution modes, and how they score against the same domain truth. Not part of the salesperson's everyday workflow."
        actions={
          <div className="flex items-center gap-2">
            {modes.map((m) => (
              <Pill key={m.mode} tone={m.available ? "pass" : "neutral"} dot>
                {m.label}
                {m.available ? "" : " unavailable"}
              </Pill>
            ))}
          </div>
        }
      />

      {/* The architectural claim, stated once, where a reviewer will look. */}
      <Panel className="mt-5">
        <div className="grid gap-px bg-[var(--hairline)] md:grid-cols-2">
          <div className="bg-white px-4 py-3">
            <SectionLabel>The agent decides</SectionLabel>
            <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-ink-600">
              <li>· which tools to call, and in what order</li>
              <li>· how much evidence is enough</li>
              <li>· whether to quote, ask a question, or escalate</li>
              <li>· how to phrase what the engines found</li>
            </ul>
          </div>
          <div className="bg-white px-4 py-3">
            <SectionLabel>The engines decide</SectionLabel>
            <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-ink-600">
              <li>· compatibility, and what a hard failure means</li>
              <li>· available-to-promise and fulfillment</li>
              <li>· price, discount, freight and margin</li>
              <li>· which approvals a deal requires, and who decides them</li>
            </ul>
          </div>
        </div>
      </Panel>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-5">
          <RunConsole modes={modes} scenarios={scenarios} accounts={accounts} />
          <EvalDashboard adaptiveAvailable={adaptiveAvailable} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <McpInspector tools={tools} serverName={SERVER_NAME} serverVersion={SERVER_VERSION} />

          <Panel>
            <PanelHeader
              title="Recent runs"
              subtitle="Every run, in either mode, with what it actually executed."
            />
            {recentRuns.length === 0 ? (
              <EmptyState title="No runs yet" />
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {recentRuns.map((run) => (
                  <li key={run.id}>
                    <Link href={`/cases/${run.request.id}#trace`} className="block px-4 py-2.5 hover:bg-ink-50">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Mono>{run.request.reference}</Mono>
                        <Pill tone={run.mode === "ADAPTIVE_AGENT" ? "accent" : "neutral"}>
                          {run.mode === "ADAPTIVE_AGENT" ? "Adaptive" : "Deterministic"}
                        </Pill>
                        {run.termination ? (
                          <Pill
                            tone={
                              run.termination === "READY_FOR_APPROVAL"
                                ? "pass"
                                : run.termination === "FAILED" || run.termination === "GUARDRAIL_STOP"
                                  ? "fail"
                                  : "warn"
                            }
                          >
                            {statusLabel(run.termination)}
                          </Pill>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-ink-700">{run.request.subject}</p>
                      <p className="tnum mt-0.5 text-[11px] text-ink-400">
                        {run._count.toolCalls} tool calls
                        {run.turnCount ? ` · ${run.turnCount} turns` : ""}
                        {run.durationMs ? ` · ${duration(run.durationMs)}` : ""}
                        {run.estimatedCostUsd ? ` · $${Number(run.estimatedCostUsd).toFixed(4)}` : ""}
                        {" · "}
                        {dateTime(run.startedAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </PageBody>
  );
}
