import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuoteByNumber } from "@/lib/queries";
import { Pill, statusLabel, Mono } from "@/components/ui/primitives";
import { PrintButton } from "@/components/print-button";
import { money, shortDate, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Allocation {
  warehouseName: string;
  quantity: number;
  readyDate: string;
  source: string;
}

export default async function QuotePage({ params }: { params: Promise<{ quoteNumber: string }> }) {
  const { quoteNumber } = await params;
  const quote = await getQuoteByNumber(decodeURIComponent(quoteNumber));
  if (!quote) notFound();

  const released = quote.status === "APPROVED" || quote.status === "SENT";
  const blocking = quote.approvals.filter((a) => a.status === "PENDING" || a.status === "CHANGES_REQUESTED");

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-5">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/cases/${quote.requestId}`} className="text-[12px] text-ink-400 hover:text-ink-700">
            ← Back to case
          </Link>
          <Pill tone={released ? "pass" : quote.status === "REJECTED" ? "fail" : "warn"}>
            {statusLabel(quote.status)}
          </Pill>
        </div>
        <PrintButton />
      </div>

      {!released ? (
        <div className="no-print mb-4 rounded-md border border-warn-200 bg-warn-50 px-4 py-2.5">
          <p className="text-[12.5px] text-warn-700">
            {blocking.length > 0
              ? `Draft only — ${blocking.length} approval${blocking.length === 1 ? "" : "s"} outstanding. This document is not releasable to the customer yet.`
              : "Draft — not yet released."}
          </p>
        </div>
      ) : null}

      <article className="print-full rounded-md border border-[var(--hairline)] bg-white px-8 py-8 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <header className="flex items-start justify-between gap-8 border-b border-ink-900 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-[3px] bg-ink-900 text-[10px] font-bold text-white">
                P
              </span>
              <span className="text-[14px] font-semibold tracking-[-0.015em] text-ink-900">
                Poka Sales Engine
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-500">
              Technical Sales Operations — demonstration system, synthetic data
            </p>
          </div>
          <div className="text-right">
            <div className="label-xs">Quotation</div>
            <div className="tnum text-[18px] font-semibold tracking-[-0.02em] text-ink-900">
              {quote.quoteNumber}
            </div>
            <div className="text-[11.5px] text-ink-500">Issued {shortDate(quote.createdAt)}</div>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-8">
          <div>
            <div className="label-xs">Quoted to</div>
            <p className="mt-1 text-[13px] font-medium text-ink-900">{quote.customer.legalName}</p>
            <p className="text-[12px] text-ink-600">
              Account {quote.customer.accountNumber}
              {quote.request.contact ? ` · ${quote.request.contact.name}` : ""}
            </p>
          </div>
          <div>
            <div className="label-xs">Ship to</div>
            <p className="mt-1 text-[13px] font-medium text-ink-900">{quote.site.name}</p>
            <p className="text-[12px] whitespace-pre-line text-ink-600">
              {quote.site.addressLine1}
              {"\n"}
              {quote.site.city}, {quote.site.state} {quote.site.postalCode}
            </p>
          </div>
        </div>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-y border-[var(--hairline-strong)]">
              {["#", "Part number", "Description", "Qty", "Unit price", "Amount"].map((h, i) => (
                <th
                  key={h}
                  className={`label-xs py-2 whitespace-nowrap ${
                    i >= 3 ? "pl-4 text-right" : "pr-4 text-left"
                  } ${i === 0 ? "w-8" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => {
              const allocations = item.allocations as unknown as Allocation[];
              return (
                <tr key={item.id} className="border-b border-[var(--hairline)] align-top">
                  <td className="tnum py-2.5 text-[12px] text-ink-400">{item.lineNumber}</td>
                  <td className="py-2.5 pr-3">
                    <Mono>{item.product.sku}</Mono>
                  </td>
                  <td className="py-2.5 pr-3">
                    <p className="text-[12.5px] text-ink-800">{item.description}</p>
                    <p className="mt-0.5 text-[11px] text-ink-500">
                      {allocations.length > 1
                        ? `Shipped in ${allocations.length} deliveries: ${allocations
                            .map((a) => `${a.quantity} from ${a.warehouseName}`)
                            .join("; ")}`
                        : allocations[0]
                          ? `From ${allocations[0].warehouseName}, ready ${shortDate(allocations[0].readyDate)}`
                          : ""}
                    </p>
                  </td>
                  <td className="tnum py-2.5 pl-4 text-right text-[12.5px]">{item.quantity}</td>
                  <td className="tnum py-2.5 pl-4 text-right text-[12.5px]">{money(item.unitPrice)}</td>
                  <td className="tnum py-2.5 pl-4 text-right text-[12.5px] font-medium">
                    {money(item.extended)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <dl className="w-72">
            <Row label="Subtotal">{money(quote.subtotal)}</Row>
            <Row label={`Freight (${titleCase(quote.freightService)})`}>{money(quote.freightCost)}</Row>
            <div className="mt-1 border-t border-ink-900 pt-1.5">
              <Row label={<span className="font-semibold text-ink-900">Total {quote.currency}</span>} strong>
                {money(quote.total)}
              </Row>
            </div>
          </dl>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-8 border-t border-[var(--hairline)] pt-4">
          <div>
            <div className="label-xs">Validity</div>
            <p className="mt-1 text-[12px] text-ink-700">
              This quotation is valid until {shortDate(quote.validUntil)}.
            </p>
            <div className="label-xs mt-3">Estimated delivery</div>
            <p className="mt-1 text-[12px] text-ink-700">
              {quote.estimatedDelivery ? shortDate(quote.estimatedDelivery) : "To be confirmed"}
            </p>
          </div>
          <div>
            <div className="label-xs">Terms</div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-700">{quote.terms}</p>
          </div>
        </div>

        <footer className="mt-6 border-t border-[var(--hairline)] pt-3">
          <p className="text-[11px] leading-relaxed text-ink-400">
            Prepared by {quote.request.owner?.name ?? "Technical Sales"}. This document is generated by a
            demonstration system using entirely synthetic company, product and pricing data. It is not a real
            commercial offer.
          </p>
        </footer>
      </article>
    </div>
  );
}

function Row({
  label,
  children,
  strong,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-1">
      <dt className="text-[12px] text-ink-600">{label}</dt>
      <dd
        className={
          strong
            ? "tnum text-[14px] font-semibold text-ink-900"
            : "tnum text-[12.5px] font-medium text-ink-900"
        }
      >
        {children}
      </dd>
    </div>
  );
}
