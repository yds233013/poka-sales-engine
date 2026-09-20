import Link from "next/link";
import { cn } from "@/lib/cn";

export interface EvidenceView {
  id: string;
  kind: string;
  label: string;
  claim: string;
  docNumber?: string | null;
  anchor?: string | null;
  heading?: string | null;
  body?: string | null;
  recordRef?: string | null;
}

const KIND_LABEL: Record<string, string> = {
  document: "Document",
  spec: "Catalog",
  inventory: "Stock",
  pricing: "Pricing",
  policy: "Policy",
  account: "Account",
};

/**
 * One citation. Document evidence links through to the exact section of the
 * seeded data sheet or bulletin the claim came from; non-document evidence
 * names the record it was read from.
 */
export function EvidenceChip({ item, className }: { item: EvidenceView; className?: string }) {
  const isDoc = Boolean(item.docNumber);
  const inner = (
    <>
      <span className="label-xs shrink-0 !text-ink-400">{KIND_LABEL[item.kind] ?? item.kind}</span>
      <span className="truncate">{item.label}</span>
    </>
  );

  if (isDoc) {
    return (
      <Link
        href={`/library/${item.docNumber}#${item.anchor}`}
        title={item.claim}
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded border border-[var(--hairline)] bg-white px-1.5 py-0.5 text-[11.5px] text-ink-600 transition-colors hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700",
          className,
        )}
      >
        {inner}
      </Link>
    );
  }
  return (
    <span
      title={item.claim}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded border border-[var(--hairline)] bg-ink-50 px-1.5 py-0.5 text-[11.5px] text-ink-600",
        className,
      )}
    >
      {inner}
    </span>
  );
}

export function EvidenceList({ items }: { items: EvidenceView[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <EvidenceChip key={item.id} item={item} />
      ))}
    </div>
  );
}
