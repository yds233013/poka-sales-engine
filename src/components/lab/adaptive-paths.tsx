import { CAPTURED_PATHS } from "@/lib/eval/captured";
import { PHASE, phaseOf, type PhaseKey } from "@/components/tool-phase";
import { TERMINATION_LABEL } from "@/lib/status";
import { cn } from "@/lib/cn";

/**
 * Three requests, three different investigations.
 *
 * The strongest evidence that this is an agent rather than a pipeline with a
 * model attached: given a question, it answers the question; given an
 * availability check, it checks availability; given a purchase, it does the
 * full technical and commercial work. Every sequence here is a captured
 * live run, exactly as persisted.
 */

const COVERAGE: PhaseKey[] = ["understand", "technical", "evidence", "fulfillment", "commercial", "conclude"];

export function AdaptivePaths() {
  return (
    <div>
      <div className="divide-y divide-[var(--hairline)]">
        {CAPTURED_PATHS.map((path) => (
          <div key={path.label} className="px-4 py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="t-heading text-ink-900">{path.label}</span>
                <span className="t-small italic text-ink-500">“{path.request}”</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="tnum t-heading text-ink-900">{path.tools.length}</span>
                <span className="t-small text-ink-500">calls</span>
                <span
                  className={cn(
                    "t-micro rounded px-1.5 py-0.5 font-medium",
                    path.producedQuote ? "bg-accent-50 text-accent-700" : "bg-pass-50 text-pass-700",
                  )}
                >
                  {TERMINATION_LABEL[path.termination] ?? path.termination}
                </span>
              </div>
            </div>
            <ol className="mt-2.5 flex flex-wrap items-center gap-1" aria-label={`${path.label} tool sequence`}>
              {path.tools.map((tool, i) => {
                const phase = PHASE[phaseOf(tool)];
                return (
                  <li key={`${tool}-${i}`} className="flex items-center gap-1">
                    <span className={cn("inline-flex h-6 items-center rounded px-1.5 font-mono text-[11px] ring-1 ring-inset", phase.chip)}>
                      <span className="mr-1 text-[10px] opacity-60">{i + 1}</span>
                      {tool}
                    </span>
                    {i < path.tools.length - 1 ? <span className="text-[10px] text-ink-300">→</span> : null}
                  </li>
                );
              })}
            </ol>
            <p className="t-small mt-2 text-ink-600">{path.note}</p>
          </div>
        ))}
      </div>

      {/* Which kinds of work each request triggered. An empty cell is the
          point: the question never touched pricing, freight or margin. */}
      <div className="border-t border-[var(--hairline)] px-4 py-3.5">
        <div className="t-small mb-2 font-medium text-ink-700">What each request made the agent do</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr>
                <th className="t-micro pb-1.5 font-medium text-ink-500" />
                {COVERAGE.map((k) => (
                  <th key={k} className="t-micro pb-1.5 text-center font-medium text-ink-500">
                    {PHASE[k].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPTURED_PATHS.map((path) => (
                <tr key={path.label} className="border-t border-[var(--hairline)]">
                  <td className="t-small py-1.5 pr-3 text-ink-800">{path.label}</td>
                  {COVERAGE.map((k) => {
                    const n = path.tools.filter((t) => phaseOf(t) === k).length;
                    return (
                      <td key={k} className="py-1.5 text-center">
                        {n > 0 ? (
                          <span className={cn("inline-flex size-6 items-center justify-center rounded text-[11px] font-semibold tnum ring-1 ring-inset", PHASE[k].chip)}>
                            {n}
                          </span>
                        ) : (
                          <span className="inline-block size-1.5 rounded-full bg-ink-200" aria-label="none" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
