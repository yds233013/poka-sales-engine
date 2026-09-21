"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Globe, Mail, Phone, Search, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { EmptyState, Mono, Pill, RISK_TONE, StatusBadge, statusLabel } from "@/components/ui/primitives";
import { RunModeBadge } from "@/components/run-mode";
import { cn } from "@/lib/cn";
import { money, shortDate } from "@/lib/format";
import { OUTCOME_LABEL, OUTCOME_TONE } from "@/lib/status";
import { INBOX_FILTERS, type FilterKey } from "@/lib/inbox-filters";

export interface InboxRowView {
  id: string;
  reference: string;
  subject: string;
  summary: string | null;
  customer: string;
  site: string;
  owner: string;
  ownerInitials: string;
  status: string;
  risk: string;
  channel: string;
  receivedAt: string;
  requiredBy: string | null;
  value: number | null;
  outcome: string | null;
  pendingApprovals: number;
  totalApprovals: number;
  run: { mode: string; modelSource: string } | null;
  lastActivity: { at: string; summary: string } | null;
  /** Computed on the server: rendering must not read the clock. */
  overdue: boolean;
  lastActivityAgo: string;
}


function matches(row: InboxRowView, filter: FilterKey): boolean {
  switch (filter) {
    case "open":
      return row.status !== "COMPLETED";
    case "new":
      return row.status === "NEW";
    case "review":
      // Blocked and needs-review are both "a person has to look", which is
      // how the overview counts them too.
      return row.status === "NEEDS_REVIEW" || row.status === "BLOCKED";
    case "approval":
      return row.status === "READY_FOR_APPROVAL";
    case "ready":
      return row.status === "RESPONSE_READY" || row.status === "APPROVED";
    case "closed":
      return row.status === "COMPLETED";
    default:
      return true;
  }
}

const CHANNEL_ICON: Record<string, typeof Mail> = { EMAIL: Mail, PHONE: Phone, PORTAL: Globe };

/** A status stripe down the left edge, so the list can be scanned by colour. */
const STRIPE: Record<string, string> = {
  BLOCKED: "bg-fail-500",
  NEEDS_REVIEW: "bg-warn-500",
  READY_FOR_APPROVAL: "bg-warn-500",
  APPROVED: "bg-accent-500",
  RESPONSE_READY: "bg-pass-500",
  NEW: "bg-ink-300",
  COMPLETED: "bg-ink-200",
  ANALYZING: "bg-accent-400",
};

export function InboxTable({ rows, initialFilter = "all" }: { rows: InboxRowView[]; initialFilter?: FilterKey }) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>(initialFilter);
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => Object.fromEntries(INBOX_FILTERS.map((f) => [f.key, rows.filter((r) => matches(r, f.key)).length])),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        matches(row, filter) &&
        (!q ||
          [row.reference, row.customer, row.subject, row.summary ?? "", row.site, row.owner]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
  }, [rows, filter, query]);

  const choose = (key: FilterKey) => {
    setFilter(key);
    // Keep the filter in the URL so a lane on the overview and a shared link
    // land on the same view.
    router.replace(key === "all" ? "/inbox" : `/inbox?filter=${key}`, { scroll: false });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--hairline)] bg-white shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--hairline)] px-3 py-2.5">
        <div role="tablist" aria-label="Filter requests" className="flex flex-wrap gap-0.5">
          {INBOX_FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              type="button"
              onClick={() => choose(f.key)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors",
                filter === f.key ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
              )}
            >
              {f.label}
              <span className={cn("tnum text-[11px]", filter === f.key ? "text-white/70" : "text-ink-400")}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reference, customer, part, owner…"
            aria-label="Search requests"
            className="h-8 w-full rounded-md border border-[var(--hairline-strong)] bg-white pl-8 pr-8 text-[12.5px] text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No requests match"
          description={query ? `Nothing matches "${query}" in this view.` : "Nothing is in this state right now."}
        />
      ) : (
        <ul className="divide-y divide-[var(--hairline)]">
          {visible.map((row) => {
            const ChannelIcon = CHANNEL_ICON[row.channel] ?? Mail;
            return (
              <li key={row.id}>
                <Link href={`/cases/${row.id}`} className="group relative flex items-stretch transition-colors hover:bg-ink-50/70">
                  <span className={cn("w-[3px] shrink-0", STRIPE[row.status] ?? "bg-ink-200")} aria-hidden />
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-5 gap-y-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_200px_150px]">
                    {/* What it is */}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Mono className="!text-[12px] text-ink-500">{row.reference}</Mono>
                        <ChannelIcon className="size-3.5 text-ink-400" aria-label={statusLabel(row.channel)} />
                        <StatusBadge status={row.status} />
                        {/* A blocked case is its own risk statement; saying it twice is noise. */}
                        {row.risk !== "LOW" && !(row.risk === "BLOCKED" && row.status === "BLOCKED") ? (
                          <Pill tone={RISK_TONE[row.risk]} dot>
                            {statusLabel(row.risk)} risk
                          </Pill>
                        ) : null}
                      </div>
                      <div className="t-heading mt-1 truncate text-ink-900 group-hover:text-accent-700">{row.subject}</div>
                      <div className="t-small mt-0.5 truncate text-ink-500">
                        <span className="font-medium text-ink-700">{row.customer}</span>
                        <span className="mx-1.5 text-ink-300">·</span>
                        {row.site}
                        {row.summary ? (
                          <>
                            <span className="mx-1.5 text-ink-300">·</span>
                            {row.summary}
                          </>
                        ) : null}
                      </div>
                    </div>

                    {/* Where it stands */}
                    <div className="flex min-w-0 flex-row flex-wrap items-center gap-2 lg:flex-col lg:items-start lg:justify-center lg:gap-1">
                      {row.outcome ? (
                        <span
                          className={cn(
                            "t-small font-medium",
                            OUTCOME_TONE[row.outcome] === "fail"
                              ? "text-fail-700"
                              : OUTCOME_TONE[row.outcome] === "warn"
                                ? "text-warn-700"
                                : "text-ink-800",
                          )}
                        >
                          {OUTCOME_LABEL[row.outcome] ?? row.outcome}
                        </span>
                      ) : (
                        <span className="t-small text-ink-400">Not analysed</span>
                      )}
                      {row.totalApprovals > 0 ? (
                        <span className={cn("t-small flex items-center gap-1", row.pendingApprovals > 0 ? "text-warn-700" : "text-pass-700")}>
                          {row.pendingApprovals > 0 ? <ShieldAlert className="size-3.5" aria-hidden /> : <ShieldCheck className="size-3.5" aria-hidden />}
                          {row.pendingApprovals > 0 ? `${row.pendingApprovals} of ${row.totalApprovals} approvals open` : "Approvals cleared"}
                        </span>
                      ) : null}
                      {row.run ? <RunModeBadge mode={row.run.mode} modelSource={row.run.modelSource} className="!h-5 !text-[11px]" /> : null}
                    </div>

                    {/* Money and time */}
                    <div className="flex min-w-0 items-center justify-between gap-3 lg:flex-col lg:items-end lg:justify-center lg:gap-1">
                      <span className="tnum t-heading text-ink-900">{row.value !== null ? money(row.value) : "—"}</span>
                      {row.requiredBy ? (
                        <span className={cn("t-small flex items-center gap-1", row.overdue ? "text-fail-700" : "text-ink-500")}>
                          <CalendarClock className="size-3.5" aria-hidden />
                          Needed {shortDate(row.requiredBy)}
                        </span>
                      ) : null}
                      <span className="t-micro flex items-center gap-1.5 text-ink-400" title={row.lastActivity?.summary}>
                        <span className="flex size-4 items-center justify-center rounded-full bg-ink-100 text-[9px] font-semibold text-ink-600" title={row.owner}>
                          {row.ownerInitials}
                        </span>
                        {row.lastActivityAgo}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="t-small border-t border-[var(--hairline)] bg-ink-50/50 px-4 py-2 text-ink-500">
        Showing {visible.length} of {rows.length} requests
      </div>
    </div>
  );
}
