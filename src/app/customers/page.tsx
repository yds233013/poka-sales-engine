import Link from "next/link";
import { getCustomers } from "@/lib/queries";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader, Pill, Mono, SectionLabel, statusLabel } from "@/components/ui/primitives";
import { money, shortDate, titleCase } from "@/lib/format";
import { cents } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await getCustomers();

  return (
    <PageBody>
      <PageHeader
        eyebrow="Accounts"
        title="Customer accounts"
        description="Commercial terms, sites and contract pricing — the inputs the pricing engine reads when it builds a quote."
      />

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {customers.map((customer) => {
          const value = customer.requests.reduce(
            (sum, r) => sum + (r.quotes[0] ? cents(r.quotes[0].total) : 0),
            0,
          );
          const open = customer.requests.filter(
            (r) => !["COMPLETED", "BLOCKED"].includes(r.status),
          ).length;
          return (
            <Panel key={customer.id}>
              <PanelHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {customer.name}
                    <Pill tone={customer.tier === "STRATEGIC" ? "accent" : "neutral"}>
                      {titleCase(customer.tier)}
                    </Pill>
                  </span>
                }
                subtitle={`${customer.accountNumber} · ${customer.industry}`}
              />
              <div className="grid grid-cols-2 gap-px bg-[var(--hairline)] sm:grid-cols-4">
                {[
                  { label: "Price book", value: customer.priceBook?.name ?? "List" },
                  { label: "Terms", value: `Net ${customer.paymentTerms}` },
                  { label: "Open cases", value: String(open) },
                  { label: "Quoted value", value: money(value / 100) },
                ].map((cell) => (
                  <div key={cell.label} className="bg-white px-3 py-2">
                    <SectionLabel>{cell.label}</SectionLabel>
                    <div className="tnum mt-0.5 text-[12.5px] leading-snug font-medium text-ink-900">
                      {cell.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3">
                <SectionLabel>Sites</SectionLabel>
                <ul className="mt-1 space-y-0.5">
                  {customer.sites.map((site) => (
                    <li key={site.id} className="flex items-baseline justify-between gap-3 text-[12px]">
                      <span className="text-ink-800">
                        {site.name}
                        {site.isPrimary ? <span className="ml-1.5 text-[10px] text-ink-400">primary</span> : null}
                      </span>
                      <span className="text-ink-500">
                        {site.city}, {site.state} · {titleCase(site.freightZone)}
                      </span>
                    </li>
                  ))}
                </ul>

                {customer.customerPricing.length > 0 ? (
                  <>
                    <SectionLabel className="mt-3">Contract pricing</SectionLabel>
                    <ul className="mt-1 space-y-0.5">
                      {customer.customerPricing.map((contract) => (
                        <li key={contract.id} className="flex items-baseline justify-between gap-3 text-[12px]">
                          <span className="text-ink-800">
                            <Mono>{contract.product.sku}</Mono>
                            <span className="ml-1.5 text-ink-400">{contract.contractRef}</span>
                          </span>
                          <span className="tnum text-ink-700">
                            {money(contract.contractPrice)} to {shortDate(contract.effectiveTo)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {customer.requests.length > 0 ? (
                  <>
                    <SectionLabel className="mt-3">Recent requests</SectionLabel>
                    <ul className="mt-1 space-y-0.5">
                      {customer.requests.slice(0, 4).map((request) => (
                        <li key={request.id}>
                          <Link
                            href={`/cases/${request.id}`}
                            className="flex items-baseline justify-between gap-3 text-[12px] hover:text-accent-600"
                          >
                            <span className="truncate text-ink-700">{request.subject}</span>
                            <span className="shrink-0 text-[11px] text-ink-400">{statusLabel(request.status)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {customer.notes ? (
                  <p className="mt-3 border-t border-[var(--hairline)] pt-2.5 text-[11.5px] leading-relaxed text-ink-500">
                    {customer.notes}
                  </p>
                ) : null}
              </div>
            </Panel>
          );
        })}
      </div>
      <p className="mt-3 text-[11.5px] text-ink-400">
        All companies, people, addresses and contract references are invented for this demonstration.
      </p>
    </PageBody>
  );
}
