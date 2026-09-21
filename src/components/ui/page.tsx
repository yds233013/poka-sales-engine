import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The band at the top of every page: where you are, what this is, and what
 * you can do here. It sits on white against the grey canvas so the page's
 * identity is visually separate from its content.
 */
export function PageHeader({
  eyebrow,
  crumbs,
  title,
  description,
  actions,
  meta,
  className,
}: {
  eyebrow?: ReactNode;
  crumbs?: Crumb[];
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** A line of facts under the title — account, owner, dates. */
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("-mx-6 -mt-5 mb-5 border-b border-[var(--hairline)] bg-white px-6 pb-4 pt-4", className)}>
      {crumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-[12px] text-ink-500">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <ChevronRight className="size-3 text-ink-300" aria-hidden /> : null}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-ink-900">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-ink-700">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : eyebrow ? (
        <div className="mb-1 text-[12px] font-medium text-ink-500">{eyebrow}</div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="t-display text-ink-900">{title}</h1>
          {meta ? <div className="mt-1.5">{meta}</div> : null}
          {description ? <p className="t-body mt-1 max-w-3xl text-ink-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1480px] px-6 pb-10 pt-5", className)}>{children}</div>;
}
