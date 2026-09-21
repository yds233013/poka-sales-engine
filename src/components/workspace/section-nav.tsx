"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * A table of contents for the case that stays in view and follows the reader.
 *
 * The workspace is long by nature — a decision, its reasons, its evidence,
 * its logistics and its paper trail — so the page has to be navigable
 * without scrolling past what you have already read.
 */
export function SectionNav({
  sections,
  aside,
}: {
  sections: { id: string; label: string; badge?: string | number | null }[];
  aside?: React.ReactNode;
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const root = document.querySelector("main");
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { root, rootMargin: "-120px 0px -65% 0px", threshold: 0 },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="no-print sticky top-0 z-20 -mx-6 mb-5 border-b border-[var(--hairline)] bg-white/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="flex items-center gap-4">
        <nav aria-label="Case sections" className="-mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={() => setActive(section.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2.5 text-[12.5px] font-medium transition-colors",
                active === section.id
                  ? "border-ink-900 text-ink-900"
                  : "border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-800",
              )}
            >
              {section.label}
              {section.badge !== undefined && section.badge !== null && section.badge !== 0 ? (
                <span className="tnum rounded bg-warn-100 px-1 text-[11px] font-semibold text-warn-700">{section.badge}</span>
              ) : null}
            </a>
          ))}
        </nav>
        {aside ? <div className="hidden shrink-0 lg:block">{aside}</div> : null}
      </div>
    </div>
  );
}
