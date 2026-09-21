import Link from "next/link";
import { getCatalog } from "@/lib/queries";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel, Pill, EmptyState, Mono, statusLabel } from "@/components/ui/primitives";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const KEY_SPECS = ["max_fluid_temp_c", "max_flow_m3h", "max_head_m", "inlet_connection", "wetted_material"];

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const params = await searchParams;
  const { products, categories } = await getCatalog(params);

  // Pumps before accessories in the filter row — that is the order an operator
  // thinks in, and code order would put the adapter kits first.
  const orderedCategories = [
    ...categories.filter((c) => !c.code.startsWith("ACC-")),
    ...categories.filter((c) => c.code.startsWith("ACC-")),
  ];

  return (
    <PageBody>
      <PageHeader
        eyebrow="Catalog"
        title="Product catalog"
        description="The synthetic catalog the engine selects from — specifications, stock position and published price for every line."
      />

      <form className="mt-4 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search part number, description or specification…"
          className="h-8 w-80 rounded border border-[var(--hairline-strong)] bg-white px-2.5 text-[12.5px] text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
        />
        <button
          type="submit"
          className="h-8 rounded bg-ink-900 px-3 text-[12.5px] font-medium text-white hover:bg-ink-800"
        >
          Search
        </button>
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href="/catalog"
            className={cn(
              "rounded px-2 py-1 text-[12px] font-medium",
              !params.category ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100",
            )}
          >
            All
          </Link>
          {orderedCategories.map((category) => (
            <Link
              key={category.code}
              href={`/catalog?category=${category.code}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`}
              title={category.description}
              className={cn(
                "rounded px-2 py-1 text-[12px] font-medium",
                params.category === category.code ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100",
              )}
            >
              {category.family}
            </Link>
          ))}
        </div>
      </form>

      <Panel className="mt-4">
        {products.length === 0 ? (
          <EmptyState title="Nothing matches" description="Try a broader search term or clear the category filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--hairline)] bg-ink-50/60">
                  {["Part number", "Description", "Temp", "Flow", "Head", "Connection", "Material", "Stock (ATP)", "List price"].map(
                    (h) => (
                      <th key={h} className="label-xs px-3 py-2 text-left whitespace-nowrap last:text-right">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const spec = (key: string) => product.specs.find((s) => s.key === key);
                  const atp = product.inventory.reduce(
                    (sum, i) => sum + Math.max(0, i.onHand - i.reserved),
                    0,
                  );
                  return (
                    <tr key={product.id} className="group border-b border-[var(--hairline)] last:border-0 hover:bg-ink-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link href={`/catalog/${product.sku}`}>
                          <Mono className="group-hover:text-accent-600">{product.sku}</Mono>
                          <div className="mt-0.5 flex items-center gap-1">
                            <span className="text-[11px] text-ink-400">{product.category.family}</span>
                            {product.lifecycle !== "ACTIVE" ? (
                              <Pill
                                tone={product.lifecycle === "DISCONTINUED" ? "fail" : "warn"}
                                className="!px-1 !py-0 !text-[11px]"
                              >
                                {statusLabel(product.lifecycle)}
                              </Pill>
                            ) : null}
                          </div>
                        </Link>
                      </td>
                      <td className="max-w-[280px] px-3 py-2">
                        <Link href={`/catalog/${product.sku}`} className="block truncate text-[12.5px] text-ink-800">
                          {product.name}
                        </Link>
                      </td>
                      {KEY_SPECS.map((key) => {
                        const s = spec(key);
                        const value =
                          s?.numValue !== null && s?.numValue !== undefined
                            ? `${Number(s.numValue)}${s.unit ? ` ${s.unit}` : ""}`
                            : (s?.textValue ?? "—");
                        return (
                          <td
                            key={key}
                            className="tnum max-w-[150px] truncate px-3 py-2 text-[12px] whitespace-nowrap text-ink-600"
                            title={value}
                          >
                            {key === "inlet_connection" ? value.replace("ANSI 150# flange ", "") : value}
                          </td>
                        );
                      })}
                      <td className="tnum px-3 py-2 text-[12px] whitespace-nowrap">
                        <span className={atp === 0 ? "text-fail-700" : "text-ink-800"}>{atp}</span>
                        <span className="ml-1 text-ink-400">
                          / {product.inventory.filter((i) => i.onHand > 0).length} sites
                        </span>
                      </td>
                      <td className="tnum px-3 py-2 text-right text-[12.5px] font-medium whitespace-nowrap">
                        {money(product.listPrice)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-3 text-[11.5px] text-ink-400">
        {products.length} of a synthetic catalog built for this demonstration. No real manufacturer, part number or
        price is represented.
      </p>
    </PageBody>
  );
}
