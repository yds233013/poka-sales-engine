import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument } from "@/lib/queries";
import { PageBody } from "@/components/ui/page";
import { Panel, Pill, Mono, statusLabel } from "@/components/ui/primitives";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ docNumber: string }> }) {
  const { docNumber } = await params;
  const doc = await getDocument(decodeURIComponent(docNumber));
  if (!doc) notFound();

  return (
    <PageBody className="max-w-4xl">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/library" className="text-[12px] text-ink-400 hover:text-ink-700">
          Technical library
        </Link>
        <span className="text-ink-300">/</span>
        <Mono>{doc.docNumber}</Mono>
        <Pill tone={doc.type === "SAFETY_NOTICE" ? "fail" : "neutral"}>{statusLabel(doc.type)}</Pill>
        <span className="text-[11.5px] text-ink-400">
          {doc.revision} · published {shortDate(doc.publishedAt)}
        </span>
      </div>
      <h1 className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-ink-900">{doc.title}</h1>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">{doc.summary}</p>
      {doc.product ? (
        <p className="mt-2 text-[12px] text-ink-500">
          Applies to{" "}
          <Link href={`/catalog/${doc.product.sku}`} className="font-medium text-accent-600 hover:underline">
            {doc.product.sku}
          </Link>
        </p>
      ) : doc.families.length > 0 ? (
        <p className="mt-2 text-[12px] text-ink-500">Applies to {doc.families.join(", ")}</p>
      ) : null}

      <Panel className="mt-5">
        <div className="divide-y divide-[var(--hairline)]">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.anchor} className="scroll-mt-16 px-5 py-4 target:bg-accent-50">
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
    </PageBody>
  );
}
