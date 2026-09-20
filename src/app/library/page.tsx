import Link from "next/link";
import { getLibrary } from "@/lib/queries";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel, Pill, EmptyState, Mono, statusLabel } from "@/components/ui/primitives";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const TYPES = [
  "SPEC_SHEET",
  "REPLACEMENT_GUIDE",
  "COMPATIBILITY_NOTE",
  "TECHNICAL_BULLETIN",
  "INSTALLATION_GUIDE",
  "SAFETY_NOTICE",
];

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const params = await searchParams;
  const docs = await getLibrary(params);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Technical library"
        title="Documentation"
        description="Every claim the engine makes about a product resolves to a section in here. Data sheets are generated from the catalog so the text and the compared value cannot drift apart; guides and bulletins carry the engineering judgement."
      />

      <form className="mt-4 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search document text…"
          className="h-8 w-80 rounded border border-[var(--hairline-strong)] bg-white px-2.5 text-[12.5px] text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
        />
        <button type="submit" className="h-8 rounded bg-ink-900 px-3 text-[12.5px] font-medium text-white hover:bg-ink-800">
          Search
        </button>
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href="/library"
            className={cn(
              "rounded px-2 py-1 text-[12px] font-medium",
              !params.type ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100",
            )}
          >
            All
          </Link>
          {TYPES.map((type) => (
            <Link
              key={type}
              href={`/library?type=${type}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`}
              className={cn(
                "rounded px-2 py-1 text-[12px] font-medium",
                params.type === type ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100",
              )}
            >
              {statusLabel(type)}
            </Link>
          ))}
        </div>
      </form>

      <Panel className="mt-4">
        {docs.length === 0 ? (
          <EmptyState title="No documents match" />
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {docs.map((doc) => (
              <li key={doc.id}>
                <Link href={`/library/${doc.docNumber}`} className="block px-4 py-3 hover:bg-ink-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <Mono>{doc.docNumber}</Mono>
                    <Pill tone={doc.type === "SAFETY_NOTICE" ? "fail" : doc.type === "SPEC_SHEET" ? "neutral" : "accent"}>
                      {statusLabel(doc.type)}
                    </Pill>
                    <span className="text-[11px] text-ink-400">{doc.revision}</span>
                    <span className="text-[11px] text-ink-400">{shortDate(doc.publishedAt)}</span>
                    {doc.product ? (
                      <span className="text-[11px] text-ink-400">{doc.product.sku}</span>
                    ) : doc.families.length > 0 ? (
                      <span className="text-[11px] text-ink-400">{doc.families.join(", ")}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[13px] font-medium text-ink-900">{doc.title}</p>
                  <p className="mt-0.5 text-[12px] text-ink-500">{doc.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="mt-3 text-[11.5px] text-ink-400">
        {docs.length} documents shown. All documentation is synthetic and written for this demonstration.
      </p>
    </PageBody>
  );
}
