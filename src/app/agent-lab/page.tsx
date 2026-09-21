import Link from "next/link";
import { z } from "zod";
import { ArrowRight, Network, PlayCircle, Route, Waypoints, Wrench, Workflow } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel, Pill, Mono, EmptyState } from "@/components/ui/primitives";
import { executionModes } from "@/lib/ai/capability";
import { TOOL_CONTRACTS, TOOL_NAMES, TERMINAL_TOOLS, EFFECT_DESCRIPTION } from "@/lib/mcp/contracts";
import { SERVER_NAME, SERVER_VERSION } from "@/lib/mcp/client";
import { toolDefinitions } from "@/lib/agent/adaptive/runtime";
import { EVAL_SCENARIOS } from "@/lib/eval/scenario";
import { TOOL_CAPABILITY } from "@/components/tool-phase";
import { Toolbox, type ToolView } from "@/components/lab/toolbox";
import { RunConsole } from "@/components/lab/run-console";
import { Architecture } from "@/components/lab/architecture";
import { AdaptivePaths } from "@/components/lab/adaptive-paths";
import { Execution, type LiveRunView } from "@/components/lab/execution";
import { RunModeBadge } from "@/components/run-mode";
import { TERMINATION_LABEL } from "@/lib/status";
import { age, duration } from "@/lib/format";

export const dynamic = "force-dynamic";

/** A readable sketch of an output schema; the input schema is shown as sent. */
function sketch(schema: z.ZodObject<z.ZodRawShape>): string {
  const entries = Object.entries(schema.shape).map(([key, value]) => {
    const def = (value as { _def?: Record<string, unknown> })._def;
    const type = String((def?.typeName ?? def?.type) ?? "unknown").replace(/^Zod/, "").toLowerCase();
    return `  ${key}: ${type}`;
  });
  return `{\n${entries.join("\n")}\n}`;
}

/**
 * The engineering surface: how the agent is built, what it can touch, what it
 * did on a real model, and a console to run it yourself.
 */
export default async function AgentLabPage() {
  const modes = executionModes();
  const adaptive = modes.find((m) => m.mode === "ADAPTIVE_AGENT")!;
  const definitions = new Map(toolDefinitions().map((d) => [d.name, d]));

  const tools: ToolView[] = TOOL_NAMES.map((name) => {
    const contract = TOOL_CONTRACTS[name];
    return {
      name,
      title: contract.title,
      description: contract.description,
      effect: contract.effect,
      effectNote: EFFECT_DESCRIPTION[contract.effect],
      idempotent: contract.idempotent,
      terminal: (TERMINAL_TOOLS as string[]).includes(name),
      group: TOOL_CAPABILITY[name] ?? "discovery",
      inputSchema: JSON.stringify(definitions.get(name)?.input_schema ?? {}, null, 2),
      outputSchema: sketch(contract.output),
    };
  });

  const [seededRefs, accounts, recentRuns, latestLive] = await Promise.all([
    prisma.salesRequest.findMany({ select: { reference: true }, orderBy: { reference: "asc" } }),
    prisma.customer.findMany({ select: { accountNumber: true, name: true }, orderBy: { name: "asc" } }),
    prisma.agentRun.findMany({
      where: { NOT: { request: { reference: { startsWith: "EVAL-" } } } },
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { request: { select: { id: true, reference: true, subject: true } }, _count: { select: { toolCalls: true } } },
    }),
    prisma.agentRun.findFirst({
      where: { mode: "ADAPTIVE_AGENT", modelSource: "LIVE", NOT: { request: { reference: { startsWith: "EVAL-" } } } },
      orderBy: { startedAt: "desc" },
      include: {
        request: { select: { id: true, reference: true } },
        toolCalls: {
          orderBy: { sequence: "asc" },
          include: { evidence: { include: { section: { include: { document: true } } } } },
        },
      },
    }),
  ]);
  const seeded = new Set(seededRefs.map((r) => r.reference));

  const live: LiveRunView | null = latestLive
    ? {
        requestId: latestLive.request.id,
        reference: latestLive.request.reference,
        model: latestLive.model,
        termination: latestLive.termination,
        turnCount: latestLive.turnCount,
        durationMs: latestLive.durationMs,
        costUsd: latestLive.estimatedCostUsd ? Number(latestLive.estimatedCostUsd) : null,
        groundingIssues: latestLive.groundingIssues.length,
        guardrails: ((latestLive.guardrailEvents as unknown[] | null) ?? []).length,
        agentSteps: latestLive.toolCalls.filter((c) => c.modelInitiated).length,
        totalSteps: latestLive.toolCalls.length,
        startedAt: latestLive.startedAt.toISOString(),
        steps: latestLive.toolCalls.map((call) => ({
          id: call.id,
          sequence: call.sequence,
          toolName: call.toolName,
          summary: call.summary,
          status: call.status,
          safety: call.safety,
          effect: call.effect,
          modelInitiated: call.modelInitiated,
          durationMs: call.durationMs,
          input: call.input,
          output: call.output,
          evidence: call.evidence.map((e) => ({
            id: e.id,
            claim: e.claim,
            docNumber: e.section?.document.docNumber ?? null,
            anchor: e.section?.anchor ?? null,
          })),
        })),
      }
    : null;

  const scenarios = EVAL_SCENARIOS.map((s) => ({
    id: s.id,
    title: s.title,
    demonstrates: s.demonstrates,
    seeded: s.reference !== null && seeded.has(s.reference),
  }));

  return (
    <PageBody>
      <PageHeader
        eyebrow="Agent"
        title="Agent lab"
        description="How the adaptive agent is built, what it is allowed to touch, what it did against a real model, and a console to run it yourself."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="pass" dot>
              Deterministic engines online
            </Pill>
            <Pill tone={adaptive.available ? "accent" : "neutral"} dot>
              {adaptive.available ? `Live agent · ${adaptive.model}` : "Live agent off"}
            </Pill>
            <Link
              href="/evaluations"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-[13px] font-medium text-ink-800 shadow-[var(--shadow-xs)] ring-1 ring-inset ring-[var(--hairline-strong)] hover:bg-ink-50"
            >
              Evaluations <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        <Section icon={Network} title="Who decides what" note="The ownership boundary, drawn as the path a request takes through the system.">
          <Panel>
            <Architecture />
          </Panel>
        </Section>

        <Section
          icon={Waypoints}
          title="Agent execution"
          note="One adaptive run, in order: every tool the model chose, what it established, and what the run cost."
        >
          <Panel>
            <Execution live={live} />
          </Panel>
        </Section>

        <Section
          icon={Route}
          title="Investigation depth responds to the request"
          note="Three requests run live against the same agent and the same tools. None of these sequences is a template."
          badge={<Pill tone="neutral">Captured live runs</Pill>}
        >
          <Panel>
            <AdaptivePaths />
          </Panel>
        </Section>

        <Section
          icon={Wrench}
          title="MCP toolbox"
          note="The agent's complete capability surface. Everything it can do to the world is visible in the effect column."
        >
          <Panel>
            <Toolbox tools={tools} serverName={SERVER_NAME} serverVersion={SERVER_VERSION} />
          </Panel>
        </Section>

        <div id="console" className="grid scroll-mt-4 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Section icon={PlayCircle} title="Run an investigation" note="Pick a seeded scenario or paste a request, choose how it is orchestrated, and inspect what executed.">
            <RunConsole modes={modes} scenarios={scenarios} accounts={accounts} />
          </Section>

          <Section icon={Workflow} title="Recent runs" note="Every run in either mode, as recorded.">
            <Panel>
              {recentRuns.length === 0 ? (
                <EmptyState title="No runs yet" />
              ) : (
                <ul className="divide-y divide-[var(--hairline)]">
                  {recentRuns.map((run) => (
                    <li key={run.id}>
                      <Link href={`/cases/${run.request.id}#activity`} className="block px-4 py-2.5 transition-colors hover:bg-ink-50/70">
                        <div className="flex flex-wrap items-center gap-2">
                          <Mono className="!text-[12px] text-ink-500">{run.request.reference}</Mono>
                          <RunModeBadge mode={run.mode} modelSource={run.modelSource} />
                        </div>
                        <div className="t-small mt-1 truncate text-ink-800">{run.request.subject}</div>
                        <div className="t-micro mt-0.5 flex flex-wrap gap-x-3 text-ink-500">
                          <span>{run.termination ? TERMINATION_LABEL[run.termination] ?? run.termination : run.status.toLowerCase()}</span>
                          <span>{run._count.toolCalls} calls</span>
                          <span>{duration(run.durationMs)}</span>
                          <span>{age(run.startedAt)} ago</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </Section>
        </div>
      </div>
    </PageBody>
  );
}

function Section({
  icon: Icon,
  title,
  note,
  badge,
  children,
}: {
  icon: typeof Network;
  title: string;
  note?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="t-title flex items-center gap-2 text-ink-900">
            <Icon className="size-4 text-ink-400" strokeWidth={1.75} aria-hidden />
            {title}
          </h2>
          {note ? <p className="t-small mt-0.5 max-w-3xl pl-6 text-ink-500">{note}</p> : null}
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}
