import { CHECK_TONE, Pill } from "@/components/ui/primitives";
import { EvidenceChip, type EvidenceView } from "@/components/evidence";
import { cn } from "@/lib/cn";

export interface CheckView {
  id: string;
  dimension: string;
  label: string;
  result: string;
  severity: string;
  requirement: string;
  actual: string;
  detail: string;
  ruleCode: string | null;
}

const RESULT_ORDER: Record<string, number> = {
  FAIL: 0,
  WARNING: 1,
  UNKNOWN: 2,
  PASS: 3,
  NOT_APPLICABLE: 4,
};

/**
 * The compatibility matrix.
 *
 * Shows every dimension that was tested, including the ones that passed —
 * an operator who can only see failures cannot distinguish "checked and fine"
 * from "never checked", and that distinction is the whole point.
 */
export function CheckMatrix({
  checks,
  evidenceBySpec,
  compact,
}: {
  checks: CheckView[];
  evidenceBySpec?: Record<string, EvidenceView | undefined>;
  compact?: boolean;
}) {
  const sorted = [...checks].sort(
    (a, b) => (RESULT_ORDER[a.result] ?? 9) - (RESULT_ORDER[b.result] ?? 9) || a.label.localeCompare(b.label),
  );

  return (
    <div className="divide-y divide-[var(--hairline)]">
      {sorted.map((check) => {
        const evidence = evidenceBySpec?.[check.dimension];
        return (
          <div
            key={check.id}
            className={cn(
              "grid grid-cols-[104px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-2.5 lg:grid-cols-[104px_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.6fr)]",
              check.result === "FAIL" && "bg-fail-50/40",
              check.result === "WARNING" && "bg-warn-50/40",
            )}
          >
            <div className="flex items-center gap-1.5">
              <Pill tone={CHECK_TONE[check.result]}>{check.result === "NOT_APPLICABLE" ? "N/A" : check.result}</Pill>
              {check.severity === "HARD" && check.result === "FAIL" ? (
                <span className="text-[11px] font-semibold tracking-wide text-fail-700">HARD</span>
              ) : null}
            </div>
            <div className="text-[12.5px] font-medium text-ink-900">{check.label}</div>
            <div className="hidden text-[12px] text-ink-500 lg:block">
              <span className="label-xs mr-1 !text-ink-400">need</span>
              {check.requirement}
            </div>
            <div className="col-span-2 lg:col-span-1">
              <div className="text-[12px] text-ink-700">
                <span className="label-xs mr-1 !text-ink-400 lg:hidden">need {check.requirement} ·</span>
                <span className="label-xs mr-1 !text-ink-400">has</span>
                {check.actual}
              </div>
              {!compact ? (
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">{check.detail}</p>
              ) : null}
              {evidence ? <EvidenceChip item={evidence} className="mt-1.5" /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
