import Link from "next/link";
import { ArrowUpRight, EyeOff, Lock, Users } from "lucide-react";
import { Mono } from "@/components/ui/primitives";
import { RepriceControl } from "@/components/case/reprice-control";
import { money, pct, titleCase } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * What the customer pays, and — behind a visible line — what it earns.
 *
 * The two halves are styled differently on purpose. Everything left of the
 * line can appear on a quotation; everything right of it is computed from
 * cost and never leaves the building. The server enforces that separately;
 * this makes the boundary legible to the person looking at it.
 */

export interface CommercialLine {
  id: string;
  sku: string;
  description: string;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  discountPct: number;
  priceSource: string;
  extended: number;
}

export function Commercials({
  requestId,
  quoteNumber,
  lines,
  subtotal,
  discountTotal,
  freightCost,
  freightService,
  total,
  costTotal,
  marginAmount,
  marginPct,
  marginFloorPct,
  triggeredApprovals,
  repriceDisabledReason,
  account,
}: {
  /** The account terms the pricing engine read. */
  account: { tier: string; priceBook: string; paymentTerms: string; creditLimit: string };
  requestId: string;
  quoteNumber: string;
  lines: CommercialLine[];
  subtotal: number;
  discountTotal: number;
  freightCost: number;
  freightService: string;
  total: number;
  costTotal: number;
  marginAmount: number;
  marginPct: number;
  marginFloorPct: number;
  /** Commercial approvals this deal raised, named. */
  triggeredApprovals: string[];
  repriceDisabledReason?: string;
}) {
  const belowFloor = marginPct < marginFloorPct;
  // A meter from 0% to twice the floor, with the floor marked. The point is
  // the distance to policy, not the absolute figure.
  const scale = Math.max(marginFloorPct * 2, marginPct + 5);

  return (
    <div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-[var(--hairline)] bg-ink-50/50 px-4 py-2">
        {[
          ["Account tier", account.tier],
          ["Price book", account.priceBook],
          ["Payment terms", account.paymentTerms],
          ["Credit limit", account.creditLimit],
        ].map(([label, value]) => (
          <span key={label} className="t-small text-ink-500">
            {label} <span className="font-medium text-ink-800">{value}</span>
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-[var(--hairline)] bg-ink-50/50">
              {["Part", "Qty", "List", "Discount", "Unit price", "Price source", "Extended"].map((h, i) => (
                <th key={h} className={cn("t-small px-4 py-2 font-medium text-ink-500", i >= 1 && i !== 5 && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-[var(--hairline)]">
                <td className="px-4 py-2.5">
                  <Link href={`/catalog/${line.sku}`} className="font-mono text-[12.5px] font-medium text-ink-900 hover:text-accent-700">
                    {line.sku}
                  </Link>
                  <div className="t-micro max-w-[260px] truncate text-ink-500">{line.description}</div>
                </td>
                <td className="tnum t-body px-4 py-2.5 text-right">{line.quantity}</td>
                <td className="tnum t-body px-4 py-2.5 text-right text-ink-500">{money(line.listPrice)}</td>
                <td className="tnum t-body px-4 py-2.5 text-right text-ink-700">{pct(line.discountPct)}</td>
                <td className="tnum t-body px-4 py-2.5 text-right font-medium">{money(line.unitPrice)}</td>
                <td className="t-small px-4 py-2.5 text-ink-600">{titleCase(line.priceSource)}</td>
                <td className="tnum t-body px-4 py-2.5 text-right font-medium">{money(line.extended)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Customer-facing */}
        <div className="px-4 py-3.5">
          <div className="t-small flex items-center gap-1.5 font-medium text-ink-700">
            <Users className="size-3.5 text-ink-400" aria-hidden />
            On the quotation
          </div>
          <dl className="mt-2 space-y-1.5">
            <Line label="Subtotal at list" value={money(subtotal + discountTotal)} />
            <Line label="Customer discount" value={`−${money(discountTotal)}`} tone="muted" />
            <Line label="Net goods" value={money(subtotal)} />
            <Line label={`Freight · ${freightService}`} value={money(freightCost)} />
          </dl>
          <div className="mt-2.5 flex items-baseline justify-between border-t border-[var(--hairline)] pt-2.5">
            <span className="t-heading text-ink-900">Total</span>
            <span className="tnum text-[18px] font-semibold tracking-[-0.015em] text-ink-900">{money(total)}</span>
          </div>
          <Link
            href={`/quotes/${quoteNumber}`}
            className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-700 hover:text-accent-900"
          >
            View quotation {quoteNumber} <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        {/* Internal only */}
        <div className="border-t border-dashed border-ink-300 bg-[repeating-linear-gradient(135deg,#fafbfc_0,#fafbfc_8px,#f5f6f8_8px,#f5f6f8_16px)] px-4 py-3.5 md:border-l md:border-t-0">
          <div className="flex items-center justify-between gap-2">
            <div className="t-small flex items-center gap-1.5 font-medium text-ink-700">
              <Lock className="size-3.5 text-ink-400" aria-hidden />
              Internal only
            </div>
            <span className="flex items-center gap-1 rounded bg-ink-900 px-1.5 py-0.5 text-[11px] font-medium text-white">
              <EyeOff className="size-3" aria-hidden /> Never sent to the customer
            </span>
          </div>
          <dl className="mt-2 space-y-1.5">
            <Line label="Cost of goods" value={money(costTotal)} />
            <Line label="Freight, billed at cost" value={money(freightCost)} tone="muted" />
            <Line label="Gross margin" value={money(marginAmount)} />
          </dl>

          <div className="mt-2.5 border-t border-[var(--hairline)] pt-2.5">
            <div className="flex items-baseline justify-between">
              <span className="t-heading text-ink-900">Margin</span>
              <span className={cn("tnum text-[18px] font-semibold tracking-[-0.015em]", belowFloor ? "text-fail-700" : "text-pass-700")}>
                {pct(marginPct)}
              </span>
            </div>
            <div className="relative mt-2 h-1.5 rounded-full bg-ink-200" role="img" aria-label={`Margin ${pct(marginPct)} against a ${pct(marginFloorPct, 0)} policy floor`}>
              <div
                className={cn("absolute inset-y-0 left-0 rounded-full", belowFloor ? "bg-fail-500" : "bg-pass-500")}
                style={{ width: `${Math.min(100, Math.max(0, (marginPct / scale) * 100))}%` }}
              />
              <div className="absolute -top-1 bottom-[-4px] w-px bg-ink-700" style={{ left: `${(marginFloorPct / scale) * 100}%` }} />
            </div>
            <div className="t-micro mt-1.5 text-ink-500">
              Policy floor {pct(marginFloorPct, 0)} ·{" "}
              {belowFloor ? (
                <span className="font-medium text-fail-700">below floor — margin approval required</span>
              ) : (
                <span>{pct(marginPct - marginFloorPct)} above floor</span>
              )}
            </div>
          </div>

          {triggeredApprovals.length > 0 ? (
            <div className="mt-3 rounded-md border border-warn-200 bg-warn-50 px-2.5 py-2">
              <div className="t-micro font-medium text-warn-700">Commercial approvals this deal raised</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {triggeredApprovals.map((a) => (
                  <Mono key={a} className="rounded bg-white px-1.5 py-0.5 !text-[11px] text-warn-700 ring-1 ring-inset ring-warn-200">
                    {a}
                  </Mono>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <RepriceControl
        requestId={requestId}
        currentDiscountPct={lines[0]?.discountPct ?? 0}
        disabled={Boolean(repriceDisabledReason)}
        disabledReason={repriceDisabledReason}
      />
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "muted" }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="t-small text-ink-500">{label}</dt>
      <dd className={cn("tnum t-body", tone === "muted" ? "text-ink-500" : "font-medium text-ink-900")}>{value}</dd>
    </div>
  );
}
