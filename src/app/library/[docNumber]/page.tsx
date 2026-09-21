import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument } from "@/lib/queries";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel, Pill, Mono, statusLabel } from "@/components/ui/primitives";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ docNumber: string }> }) {
  const { docNumber } = await params;
  const doc = await getDocument(decodeURIComponent(docNumber));
  if (!doc) notFound();

  return (
    <PageBody>
      <PageHeader
        crumbs={[{ label: "Technical library", href: "/library" }, { label: doc.docNumber }]}
        title={doc.title}
        meta={
          <div className="t-small flex flex-wrap items-center gap-2 text-ink-500">
            <Mono className="!text-[12.5px] font-semibold">{doc.docNumber}</Mono>
            <Pill tone={doc.type === "SAFETY_NOTICE" ? "fail" : "neutral"}>{statusLabel(doc.type)}</Pill>
            <span>
              {doc.revision} · published {shortDate(doc.publishedAt)}
            </span>
            {doc.product ? (
              <span>
                · applies to{" "}
                <Link href={`/catalog/${doc.product.sku}`} className="font-medium text-accent-700 hover:underline">
                  {doc.product.sku}
                </Link>
              </span>
            ) : doc.families.length > 0 ? (
              <span>· applies to {doc.families.join(", ")}</span>
            ) : null}
          </div>
        }
        description={doc.summary}
      />

      <div className="max-w-4xl">
      <Panel>
        <div className="divide-y divide-[var(--hairline)]">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.anchor} className="scroll-mt-16 border-l-2 border-transparent px-5 py-4 target:border-accent-500 target:bg-accent-50">
              <div className="flex items-baseline gap-2.5">
                <Mono className="!text-[12px] text-ink-400">§{section.anchor}</Mono>
                <h2 className="text-[13.5px] font-semibold text-ink-900">{section.heading}</h2>
              </div>
              <div className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-700">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      </Panel>

      <p className="mt-3 text-[11.5px] text-ink-400">
        Synthetic documentation created for this demonstration. It does not describe a real product.
      </p>
      </div>
    </PageBody>
  );
}
