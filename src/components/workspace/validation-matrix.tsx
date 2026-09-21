import Link from "next/link";
import { Check, ChevronRight, CircleHelp, Minus, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { Mono } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

/**
 * Requirement × candidate, with every value cited.
 *
 * This is where the product shows its technical reasoning, so the design goal
 * is that nobody could mistake it for prose a model wrote. Each cell is a
 * value the compatibility engine compared, a verdict it reached, and the
 * data-sheet section the value came from. A candidate's column shows exactly
 * which requirement ruled it out.
 */

export interface MatrixCheck {
  dimension: string;
  label: string;
  result: string;
  severity: string;
  requirement: string;
  actual: string;
  detail: string;
}

export interface Citation {
  docNumber: string;
  anchor: string;
  claim: string;
}

export interface MatrixCandidate {
  sku: string;
  name: string;
  verdict: string;
  role: "recommended" | "requested" | "alternative";
  checks: MatrixCheck[];
  citations: Record<string, Citation | undefined>;
}

const RESULT: Record<string, { icon: LucideIcon; label: string; cell: string; chip: string }> = {
  PASS: { icon: Check, label: "Pass", cell: "", chip: "bg-pass-50 text-pass-700 ring-pass-200" },
  WARNING: { icon: TriangleAlert, label: "Warning", cell: "bg-warn-50/70", chip: "bg-warn-50 text-warn-700 ring-warn-200" },
  FAIL: { icon: X, label: "Fail", cell: "bg-fail-50/80", chip: "bg-fail-50 text-fail-700 ring-fail-200" },
  UNKNOWN: { icon: CircleHelp, label: "Unknown", cell: "bg-ink-50", chip: "bg-ink-50 text-ink-600 ring-ink-200" },
  NOT_APPLICABLE: { icon: Minus, label: "N/A", cell: "", chip: "bg-ink-50 text-ink-500 ring-ink-200" },
};

const VERDICT: Record<string, { label: string; cls: string }> = {
  RECOMMENDED: { label: "Recommended", cls: "bg-pass-600 text-white" },
  REQUIRES_REVIEW: { label: "Viable · needs review", cls: "bg-warn-100 text-warn-700" },
  VIABLE: { label: "Viable", cls: "bg-ink-100 text-ink-700" },
  REJECTED: { label: "Rejected", cls: "bg-fail-100 text-fail-700" },
};

export function ValidationMatrix({
  columns,
  furtherRejected,
}: {
  columns: MatrixCandidate[];
  /** Candidates beyond the columns shown, each with the check that ruled it out. */
  furtherRejected: { sku: string; name: string; reason: string }[];
}) {
  if (columns.length === 0) return null;

  // Rows follow the recommended part's check order, then anything only a
  // rejected part was tested on.
  const rows: { dimension: string; label: string; requirement: string; severity: string }[] = [];
  for (const column of columns) {
    for (const check of column.checks) {
      if (!rows.some((r) => r.dimension === check.dimension)) {
        rows.push({ dimension: check.dimension, label: check.label, requirement: check.requirement, severity: check.severity });
      }
    }
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th className="sticky left-0 z-10 w-[190px] bg-white px-4 py-3 align-bottom">
                <div className="t-small font-medium text-ink-500">Requirement</div>
              </th>
              {columns.map((column) => {
                const verdict = VERDICT[column.verdict] ?? { label: column.verdict, cls: "bg-ink-100 text-ink-700" };
                return (
                  <th
                    key={column.sku}
                    className={cn(
                      "min-w-[150px] border-l border-[var(--hairline)] px-3 py-3 align-bottom",
                      column.role === "recommended" && "bg-pass-50/40",
                    )}
                  >
                    <div className="t-micro font-medium text-ink-500">
                      {column.role === "recommended" ? "Recommended" : column.role === "requested" ? "Customer asked for" : "Alternative"}
                    </div>
                    <Link href={`/catalog/${column.sku}`} className="mt-0.5 block font-mono text-[14px] font-semibold tracking-[-0.02em] text-ink-900 hover:text-accent-700">
                      {column.sku}
                    </Link>
                    <span className={cn("mt-1.5 inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium", verdict.cls)}>
                      {verdict.label}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.dimension} className="border-b border-[var(--hairline)] last:border-0">
                <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-2.5 align-top font-normal">
                  <div className="t-small font-medium text-ink-900">{row.label}</div>
                  <div className="t-small mt-0.5 text-ink-500">
                    Needs <span className="font-medium text-ink-700">{row.requirement}</span>
                  </div>
                  {row.severity === "HARD" ? (
                    <div className="t-micro mt-1 text-ink-400">Hard requirement</div>
                  ) : (
                    <div className="t-micro mt-1 text-ink-400">Soft · warns, does not block</div>
                  )}
                </th>
                {columns.map((column) => {
                  const check = column.checks.find((c) => c.dimension === row.dimension);
                  const citation = column.citations[row.dimension];
                  if (!check) {
                    return (
                      <td key={column.sku} className="border-l border-[var(--hairline)] px-3 py-2.5 align-top">
                        <span className="t-small text-ink-300">Not checked</span>
                      </td>
                    );
                  }
                  const meta = RESULT[check.result] ?? RESULT.UNKNOWN;
                  const Icon = meta.icon;
                  return (
                    <td
                      key={column.sku}
                      title={check.detail}
                      className={cn(
                        "border-l border-[var(--hairline)] px-3 py-2.5 align-top",
                        meta.cell,
                        column.role === "recommended" && check.result === "PASS" && "bg-pass-50/40",
                      )}
                    >
                      <div className="flex items-start gap-1.5">
                        <span className={cn("mt-px flex size-4 shrink-0 items-center justify-center rounded ring-1 ring-inset", meta.chip)}>
                          <Icon className="size-3" strokeWidth={2.5} aria-label={meta.label} />
                        </span>
                        <span
                          className={cn(
                            "t-small min-w-0 break-words",
                            check.result === "FAIL" ? "font-semibold text-fail-700" : "text-ink-800",
                          )}
                        >
                          {check.actual}
                        </span>
                      </div>
                      {citation ? (
                        <Link
                          href={`/library/${citation.docNumber}#${citation.anchor}`}
                          title={citation.claim}
                          className="mt-1 ml-[22px] inline-block font-mono text-[11px] text-ink-400 hover:text-accent-700 hover:underline"
                        >
                          {citation.docNumber} §{citation.anchor}
                        </Link>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {furtherRejected.length > 0 ? (
        <details className="group border-t border-[var(--hairline)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[12.5px] font-medium text-ink-600 transition-colors hover:bg-ink-50">
            <ChevronRight className="size-3.5 text-ink-400 transition-transform group-open:rotate-90" aria-hidden />
            {furtherRejected.length} more {furtherRejected.length === 1 ? "part was" : "parts were"} screened and ruled out
          </summary>
          <ul className="animate-in divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
            {furtherRejected.map((item) => (
              <li key={item.sku} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 px-4 py-2">
                <Mono className="!text-[12px]">{item.sku}</Mono>
                <div className="min-w-0">
                  <span className="t-small text-fail-700">{item.reason}</span>
                  <span className="t-micro ml-2 text-ink-400">{item.name}</span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
