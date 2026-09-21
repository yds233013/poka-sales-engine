import Link from "next/link";
import { ChevronRight, ExternalLink, FileText } from "lucide-react";
import { Mono } from "@/components/ui/primitives";

/**
 * Claims, and the text they rest on.
 *
 * Every technical statement on a case resolves to a section of a document in
 * the library. Opening one here shows that section's text in place, so a
 * reviewer can check a claim against its source without leaving the case.
 */

export interface EvidenceItem {
  id: string;
  claim: string;
  docNumber: string | null;
  docTitle: string | null;
  anchor: string | null;
  heading: string | null;
  excerpt: string | null;
}

export interface EvidenceGroup {
  sku: string;
  role: string;
  items: EvidenceItem[];
}

export function EvidenceList({ groups }: { groups: EvidenceGroup[] }) {
  const visible = groups.filter((g) => g.items.length > 0);
  if (visible.length === 0) return null;
  return (
    <div className="divide-y divide-[var(--hairline)]">
      {visible.map((group) => (
        <div key={group.sku}>
          <div className="flex items-center gap-2 bg-ink-50/60 px-4 py-2">
            <Mono className="!text-[12px] font-semibold text-ink-900">{group.sku}</Mono>
            <span className="t-small text-ink-500">{group.role}</span>
            <span className="t-micro ml-auto text-ink-400">
              {group.items.length} cited claim{group.items.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="divide-y divide-[var(--hairline)]">
            {group.items.map((item) => (
              <li key={item.id} id={`ev-${item.id}`}>
                <details className="group">
                  <summary className="grid cursor-pointer list-none grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2.5 px-4 py-2 transition-colors hover:bg-ink-50/70">
                    <ChevronRight className="size-3.5 text-ink-400 transition-transform group-open:rotate-90" aria-hidden />
                    <span className="t-small truncate text-ink-800">{item.claim}</span>
                    {item.docNumber ? (
                      <span className="flex items-center gap-1 rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-ink-600 ring-1 ring-inset ring-[var(--hairline)]">
                        <FileText className="size-3 text-ink-400" aria-hidden />
                        {item.docNumber} §{item.anchor}
                      </span>
                    ) : null}
                  </summary>
                  <div className="animate-in border-t border-[var(--hairline)] bg-ink-50/40 px-4 py-3 pl-[42px]">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="t-small text-ink-600">
                        <span className="font-medium text-ink-800">{item.docTitle ?? item.docNumber}</span>
                        {item.heading ? (
                          <span>
                            {" "}
                            · §{item.anchor} {item.heading}
                          </span>
                        ) : null}
                      </div>
                      {item.docNumber ? (
                        <Link
                          href={`/library/${item.docNumber}#${item.anchor}`}
                          className="flex items-center gap-1 text-[12px] font-medium text-accent-700 hover:text-accent-900"
                        >
                          Open in library <ExternalLink className="size-3" aria-hidden />
                        </Link>
                      ) : null}
                    </div>
                    {item.excerpt ? (
                      <blockquote className="t-small mt-2 whitespace-pre-line border-l-2 border-accent-300 bg-white py-2 pl-3 pr-3 text-ink-700">
                        {item.excerpt}
                      </blockquote>
                    ) : null}
                    <p className="t-micro mt-2 text-ink-500">
                      Supports: <span className="text-ink-700">{item.claim}</span>
                    </p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
