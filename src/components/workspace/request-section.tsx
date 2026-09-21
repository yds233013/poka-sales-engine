import { ChevronRight, Mail } from "lucide-react";
import { dateTime, titleCase } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * What the customer wrote, and what the engine took it to mean.
 *
 * Each requirement is one line — the value the compatibility engine will
 * compare against, and where that value came from. The customer's own words
 * for it are one click away rather than always open, because ten quoted
 * sentences stacked up is a page of reading before the reader reaches the
 * decision those requirements drove.
 */

export interface RequirementRow {
  id: string;
  label: string;
  kind: string;
  operator: string | null;
  numValue: number | null;
  textValue: string | null;
  unit: string | null;
  sourceQuote: string | null;
  confidence: number;
  note: string | null;
}

const SOURCE: Record<string, { label: string; cls: string; hint: string }> = {
  EXPLICIT: { label: "Stated", cls: "bg-pass-50 text-pass-700 ring-pass-200", hint: "Written in the customer's message" },
  INFERRED: { label: "Inferred", cls: "bg-accent-50 text-accent-700 ring-accent-200", hint: "Derived from the part the customer already runs" },
  AMBIGUOUS: { label: "Ambiguous", cls: "bg-warn-50 text-warn-700 ring-warn-200", hint: "Implied but not quantified — treated as unverified, never guessed" },
  MISSING: { label: "Missing", cls: "bg-fail-50 text-fail-700 ring-fail-200", hint: "Not present in the request" },
};

const ORDER = ["EXPLICIT", "INFERRED", "AMBIGUOUS", "MISSING"];

function value(r: RequirementRow): string {
  if (r.kind === "MISSING") return "Not stated";
  const op = r.operator === "GTE" ? "≥ " : r.operator === "LTE" ? "≤ " : r.operator === "WITHIN_TOLERANCE" ? "≈ " : "";
  if (r.numValue !== null) return `${op}${r.numValue}${r.unit ? ` ${r.unit}` : ""}`;
  return r.textValue ?? "—";
}

export function RequestSection({
  subject,
  body,
  channel,
  receivedAt,
  contactName,
  contactEmail,
  requirements,
}: {
  subject: string;
  body: string;
  channel: string;
  receivedAt: Date;
  contactName: string | null;
  contactEmail: string | null;
  requirements: RequirementRow[];
}) {
  const sorted = [...requirements].sort(
    (a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.label.localeCompare(b.label),
  );
  const counts = ORDER.map((k) => ({ k, n: requirements.filter((r) => r.kind === k).length })).filter((c) => c.n > 0);
  const lines = body.split("\n").filter((l) => l.trim().length > 0);
  const preview = lines.slice(0, 3).join(" ");

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--hairline)] bg-white shadow-[var(--shadow-xs)]">
      {/* The message */}
      <details className="group border-b border-[var(--hairline)]">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 transition-colors hover:bg-ink-50/60">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-ink-50 ring-1 ring-inset ring-[var(--hairline)]">
            <Mail className="size-3.5 text-ink-500" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="t-small flex flex-wrap items-center gap-x-2 text-ink-500">
              <span className="font-medium text-ink-800">{contactName ?? "Unknown sender"}</span>
              {contactEmail ? <span>{contactEmail}</span> : null}
              <span className="text-ink-300">·</span>
              <span>
                {titleCase(channel)} · {dateTime(receivedAt)}
              </span>
            </div>
            <div className="t-heading mt-0.5 text-ink-900">{subject}</div>
            <p className="t-small mt-1 line-clamp-2 text-ink-600 group-open:hidden">{preview}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 pt-0.5 text-[12px] font-medium text-accent-700">
            <span className="group-open:hidden">Read message</span>
            <span className="hidden group-open:inline">Hide</span>
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
          </span>
        </summary>
        <div className="animate-in px-4 pb-4 pl-[56px]">
          <div className="t-body whitespace-pre-wrap rounded-md border border-[var(--hairline)] bg-ink-50/50 px-3.5 py-3 text-ink-700">
            {body}
          </div>
        </div>
      </details>

      {/* What it was understood to mean */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
        <span className="t-heading text-ink-900">Understood requirements</span>
        <span className="t-small text-ink-500">What every compatibility check was run against</span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {counts.map((c) => (
            <span key={c.k} className={cn("inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium ring-1 ring-inset", SOURCE[c.k].cls)}>
              {c.n} {SOURCE[c.k].label.toLowerCase()}
            </span>
          ))}
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="t-small border-t border-[var(--hairline)] px-4 py-3 text-ink-500">Nothing was extracted from this request.</p>
      ) : (
        <ul className="grid grid-cols-1 border-t border-[var(--hairline)] md:grid-cols-2">
          {sorted.map((r) => {
            const src = SOURCE[r.kind] ?? SOURCE.EXPLICIT;
            return (
              <li key={r.id} className="border-b border-[var(--hairline)] md:odd:border-r">
                <details className="group">
                  <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2 transition-colors hover:bg-ink-50/60">
                    <span className="t-small truncate text-ink-600">{r.label}</span>
                    <span className={cn("tnum t-small font-semibold", r.kind === "MISSING" ? "text-fail-700" : "text-ink-900")}>{value(r)}</span>
                    <span className={cn("inline-flex h-5 w-[68px] items-center justify-center rounded text-[11px] font-medium ring-1 ring-inset", src.cls)}>
                      {src.label}
                    </span>
                  </summary>
                  <div className="animate-in space-y-1 bg-ink-50/50 px-4 py-2">
                    <p className="t-micro text-ink-500">{src.hint}</p>
                    {r.sourceQuote ? <p className="t-small italic text-ink-600">“{r.sourceQuote}”</p> : null}
                    {r.note ? <p className="t-small text-ink-600">{r.note}</p> : null}
                    {r.confidence < 1 && r.kind !== "MISSING" ? (
                      <p className="t-micro text-ink-400">{Math.round(r.confidence * 100)}% confidence</p>
                    ) : null}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
