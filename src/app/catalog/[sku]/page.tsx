import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/queries";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader, Pill, Mono, SectionLabel, EmptyState, statusLabel } from "@/components/ui/primitives";
import { money, shortDate, titleCase } from "@/lib/format";
import { SPEC_META } from "../../../../prisma/seed/spec-meta";

export const dynamic = "force-dynamic";

const GROUP_ORDER = ["Process", "Hydraulic", "Mechanical", "Electrical", "Compliance", "Physical"];

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const product = await getProduct(decodeURIComponent(sku).toUpperCase());
  if (!product) notFound();

  const grouped = new Map<string, typeof product.specs>();
  for (const spec of product.specs) {
    const group = SPEC_META[spec.key]?.group ?? "Process";
    grouped.set(group, [...(grouped.get(group) ?? []), spec]);
  }

  const atp = product.inventory.reduce((sum, i) => sum + Math.max(0, i.onHand - i.reserved), 0);

  return (
    <PageBody>
      <PageHeader
        crumbs={[{ label: "Catalog", href: "/catalog" }, { label: product.sku }]}
        title={product.name}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Mono className="!text-[13px] font-semibold">{product.sku}</Mono>
            <Pill tone={product.lifecycle === "ACTIVE" ? "pass" : product.lifecycle === "DISCONTINUED" ? "fail" : "warn"} dot>
              {statusLabel(product.lifecycle)}
            </Pill>
            <Pill tone="neutral">{product.category.family}</Pill>
          </div>
        }
        description={product.description}
        actions={
          <div className="flex divide-x divide-[var(--hairline)] rounded-lg border border-[var(--hairline)] bg-white shadow-[var(--shadow-xs)]">
            {[
              ["List price", money(product.listPrice), ""],
              ["Available to promise", String(atp), atp === 0 ? "text-fail-700" : ""],
              ["Factory lead time", `${product.leadTimeDays} days`, ""],
            ].map(([label, value, tone]) => (
              <div key={label} className="px-4 py-2.5">
                <div className="t-micro text-ink-500">{label}</div>
                <div className={`tnum mt-0.5 text-[16px] font-semibold text-ink-900 ${tone}`}>{value}</div>
              </div>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="Specification" subtitle="The values the compatibility engine compares against" />
            <div className="grid grid-cols-1 gap-px bg-[var(--hairline)] sm:grid-cols-2">
              {GROUP_ORDER.filter((g) => grouped.has(g)).map((group) => (
                <div key={group} className="bg-white px-4 py-3">
                  <SectionLabel>{group}</SectionLabel>
                  <dl className="mt-1.5 space-y-1">
                    {(grouped.get(group) ?? []).map((spec) => (
                      <div key={spec.id} className="flex items-baseline justify-between gap-4">
                        <dt className="text-[12px] text-ink-500">{spec.label}</dt>
                        <dd className="tnum text-right text-[12px] font-medium text-ink-900">
                          {spec.numValue !== null
                            ? `${Number(spec.numValue).toLocaleString()}${spec.unit ? ` ${spec.unit}` : ""}`
                            : (spec.textValue ?? (spec.boolValue ? "yes" : "no"))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Stock by location" subtitle="Available to promise is on hand less reserved" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--hairline)] bg-ink-50/60">
                    {["Location", "Zone", "On hand", "Reserved", "ATP", "Safety", "Inbound"].map((h) => (
                      <th key={h} className="label-xs px-3 py-1.5 text-left whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {product.inventory.map((row) => {
                    const available = Math.max(0, row.onHand - row.reserved);
                    return (
                      <tr key={row.id} className="border-b border-[var(--hairline)] last:border-0">
                        <td className="px-3 py-2 text-[12px] text-ink-800">
                          {row.warehouse.name}
                          <span className="ml-1.5 text-ink-400">{row.warehouse.code}</span>
                        </td>
                        <td className="px-3 py-2 text-[11.5px] whitespace-nowrap text-ink-500">
                          {titleCase(row.warehouse.freightZone)}
                        </td>
                        <td className="tnum px-3 py-2 text-[12px]">{row.onHand}</td>
                        <td className="tnum px-3 py-2 text-[12px] text-ink-500">{row.reserved}</td>
                        <td className={`tnum px-3 py-2 text-[12px] font-medium ${available === 0 ? "text-ink-400" : "text-ink-900"}`}>
                          {available}
                        </td>
                        <td className="tnum px-3 py-2 text-[12px] text-ink-400">{row.safetyStock}</td>
                        <td className="px-3 py-2 text-[11.5px] text-ink-600">
                          {row.incoming.length === 0 ? (
                            <span className="text-ink-300">—</span>
                          ) : (
                            row.incoming
                              .map((i) => `${i.quantity} on ${shortDate(i.expectedAt)} (${i.poNumber})`)
                              .join(", ")
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {product.documents.length > 0 ? (
            <Panel>
              <PanelHeader title="Technical documentation" subtitle="What the engine cites when it recommends this part" />
              <ul className="divide-y divide-[var(--hairline)]">
                {product.documents.map((doc) => (
                  <li key={doc.id}>
                    <Link href={`/library/${doc.docNumber}`} className="block px-4 py-2.5 hover:bg-ink-50">
                      <div className="flex items-center gap-2">
                        <Mono>{doc.docNumber}</Mono>
                        <Pill tone="neutral">{statusLabel(doc.type)}</Pill>
                        <span className="text-[11px] text-ink-400">{doc.revision}</span>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-ink-800">{doc.title}</p>
                      <p className="text-[11.5px] text-ink-500">{doc.sections.length} citable sections</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="Replacement relationships" subtitle="Curated by engineering; still re-validated on every case" />
            {product.substitutesFrom.length === 0 && product.substitutesTo.length === 0 ? (
              <EmptyState title="No replacement links" description="Substitutes for this part are found by catalog screen only." />
            ) : (
              <div className="divide-y divide-[var(--hairline)]">
                {product.substitutesFrom.map((link) => (
                  <div key={link.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-400">replace with →</span>
                      <Link href={`/catalog/${link.toProduct.sku}`} className="font-mono text-[12.5px] font-medium text-ink-900 hover:text-accent-600">
                        {link.toProduct.sku}
                      </Link>
                      <Pill tone="accent" className="!px-1 !py-0 !text-[11px]">
                        {statusLabel(link.kind)}
                      </Pill>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-ink-600">{link.note}</p>
                    {link.requiresSku ? (
                      <p className="mt-1 text-[11.5px] text-warn-700">Requires {link.requiresSku}</p>
                    ) : null}
                  </div>
                ))}
                {product.substitutesTo.map((link) => (
                  <div key={link.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-400">← replaces</span>
                      <Link href={`/catalog/${link.fromProduct.sku}`} className="font-mono text-[12.5px] font-medium text-ink-900 hover:text-accent-600">
                        {link.fromProduct.sku}
                      </Link>
                      <Pill tone="neutral" className="!px-1 !py-0 !text-[11px]">
                        {statusLabel(link.kind)}
                      </Pill>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {product.requiresAcc.length > 0 ? (
            <Panel>
              <PanelHeader title="Accessories" />
              <ul className="divide-y divide-[var(--hairline)]">
                {product.requiresAcc.map((link) => (
                  <li key={link.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Link href={`/catalog/${link.accessory.sku}`} className="font-mono text-[12.5px] font-medium text-ink-900 hover:text-accent-600">
                        {link.accessory.sku}
                      </Link>
                      {link.required ? <Pill tone="warn">required</Pill> : <Pill tone="neutral">optional</Pill>}
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-600">{link.reason}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title="Commercial" subtitle="Internal — cost and margin are never customer-facing" />
            <dl className="px-4 py-3">
              <Row label="List price">{money(product.listPrice)}</Row>
              <Row label="Standard cost">{money(product.standardCost)}</Row>
              <Row label="Margin at list">
                {(((Number(product.listPrice) - Number(product.standardCost)) / Number(product.listPrice)) * 100).toFixed(1)}%
              </Row>
              <Row label="Weight">{Number(product.weightKg).toLocaleString()} kg</Row>
              <Row label="Category">{product.category.name}</Row>
            </dl>
            {product.priceBookEntries.length > 0 ? (
              <div className="border-t border-[var(--hairline)] px-4 py-3">
                <SectionLabel>Price book overrides</SectionLabel>
                <dl className="mt-1">
                  {product.priceBookEntries.map((entry) => (
                    <Row key={entry.id} label={entry.priceBook.name}>
                      {Number(entry.discountPct)}% off list
                    </Row>
                  ))}
                </dl>
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </PageBody>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-[12px] text-ink-500">{label}</dt>
      <dd className="tnum text-[12px] font-medium text-ink-900">{children}</dd>
    </div>
  );
}
