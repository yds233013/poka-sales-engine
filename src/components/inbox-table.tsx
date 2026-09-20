"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Panel,
  Pill,
  REQUEST_STATUS_TONE,
  RISK_TONE,
  statusLabel,
  EmptyState,
  Mono,
} from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { age, money, shortDate, titleCase } from "@/lib/format";

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
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "review", label: "Needs review" },
  { key: "approval", label: "Awaiting approval" },
  { key: "ready", label: "Ready to send" },
  { key: "blocked", label: "Blocked" },
  { key: "closed", label: "Completed" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function matches(row: InboxRowView, filter: FilterKey): boolean {
  switch (filter) {
    case "open":
      return !["COMPLETED"].includes(row.status);
    case "review":
      return row.status === "NEEDS_REVIEW";
    case "approval":
      return row.status === "READY_FOR_APPROVAL" || row.pendingApprovals > 0;
    case "ready":
      return row.status === "RESPONSE_READY" || row.status === "APPROVED";
    case "blocked":
      return row.status === "BLOCKED";
    case "closed":
      return row.status === "COMPLETED";
    default:
      return true;
  }
}

const OUTCOME_LABEL: Record<string, string> = {
  EXACT_MATCH: "Exact match",
  SUBSTITUTE: "Substitution",
  SPLIT_FULFILLMENT: "Split shipment",
  NO_VIABLE_OPTION: "No viable option",
  INFORMATION_REQUIRED: "Information required",
  INFORMATION_PROVIDED: "Question answered",
};

export function InboxTable({ rows }: { rows: InboxRowView[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const out = {} as Record<FilterKey, number>;
    for (const f of FILTERS) out[f.key] = rows.filter((r) => matches(r, f.key)).length;
    return out;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((row) => matches(row, filter))
      .filter((row) =>
        q.length === 0
          ? true
          : [row.reference, row.subject, row.customer, row.summary ?? "", row.owner]
              .join(" ")
              .toLowerCase()
              .includes(q),
      );
  }, [rows, filter, query]);

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--hairline)] px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded px-2 py-1 text-[12px] font-medium transition-colors",
                filter === f.key ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100",
              )}
            >
              {f.label}
              <span className={cn("tnum ml-1.5", filter === f.key ? "text-ink-300" : "text-ink-400")}>
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reference, customer, subject…"
            className="h-7 w-64 rounded border border-[var(--hairline-strong)] bg-white px-2.5 text-[12px] text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No requests match"
          description="Try a different filter or clear the search."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--hairline)] bg-ink-50/60">
                {["Reference", "Customer", "Request", "Outcome", "Status", "Risk", "Approvals", "Value", "Needed", "Owner", "Age"].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="label-xs px-3 py-2 text-left whitespace-nowrap"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="group border-b border-[var(--hairline)] last:border-0 hover:bg-ink-50">
                  <td className="px-3 py-2.5 align-top whitespace-nowrap">
                    <Link href={`/cases/${row.id}`} className="block">
                      <Mono className="group-hover:text-accent-600">{row.reference}</Mono>
                      <div className="mt-0.5 text-[11px] text-ink-400">{titleCase(row.channel)}</div>
                    </Link>
                  </td>
                  <td className="max-w-[180px] px-3 py-2.5 align-top">
                    <Link href={`/cases/${row.id}`} className="block">
                      <div className="truncate text-[12.5px] font-medium text-ink-900">{row.customer}</div>
                      <div className="truncate text-[11.5px] text-ink-500">{row.site}</div>
                    </Link>
                  </td>
                  <td className="max-w-[300px] px-3 py-2.5 align-top">
                    <Link href={`/cases/${row.id}`} className="block">
                      <div className="truncate text-[12.5px] text-ink-900">{row.subject}</div>
                      {row.summary ? (
                        <div className="truncate text-[11.5px] text-ink-500">{row.summary}</div>
                      ) : (
                        <div className="text-[11.5px] text-ink-400">Not yet analysed</div>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 align-top whitespace-nowrap text-[12px] text-ink-600">
                    {row.outcome ? OUTCOME_LABEL[row.outcome] ?? titleCase(row.outcome) : "—"}
                  </td>
                  <td className="px-3 py-2.5 align-top whitespace-nowrap">
                    <Pill tone={REQUEST_STATUS_TONE[row.status]}>{statusLabel(row.status)}</Pill>
                  </td>
                  <td className="px-3 py-2.5 align-top whitespace-nowrap">
                    <Pill tone={RISK_TONE[row.risk]} dot>
                      {statusLabel(row.risk)}
                    </Pill>
                  </td>
                  <td className="tnum px-3 py-2.5 align-top whitespace-nowrap text-[12px]">
                    {row.totalApprovals === 0 ? (
                      <span className="text-ink-400">None</span>
                    ) : row.pendingApprovals > 0 ? (
                      <span className="font-medium text-warn-700">
                        {row.pendingApprovals} of {row.totalApprovals} open
                      </span>
                    ) : (
                      <span className="text-pass-700">All cleared</span>
                    )}
                  </td>
                  <td className="tnum px-3 py-2.5 align-top whitespace-nowrap text-[12.5px] font-medium text-ink-900">
                    {row.value === null ? <span className="font-normal text-ink-400">—</span> : money(row.value)}
                  </td>
                  <td className="tnum px-3 py-2.5 align-top whitespace-nowrap text-[12px] text-ink-600">
                    {row.requiredBy ? shortDate(row.requiredBy) : <span className="text-ink-400">Not stated</span>}
                  </td>
                  <td className="px-3 py-2.5 align-top whitespace-nowrap">
                    <span
                      className="inline-flex size-5 items-center justify-center rounded-full bg-ink-100 text-[10px] font-semibold text-ink-600"
                      title={row.owner}
                    >
                      {row.ownerInitials}
                    </span>
                  </td>
                  <td className="tnum px-3 py-2.5 align-top whitespace-nowrap text-[12px] text-ink-500">
                    {age(new Date(row.receivedAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
