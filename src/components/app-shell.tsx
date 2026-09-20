"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Dashboard", match: (p: string) => p === "/" },
  { href: "/inbox", label: "Request inbox", match: (p: string) => p.startsWith("/inbox") || p.startsWith("/cases") },
  { href: "/approvals", label: "Approvals", match: (p: string) => p.startsWith("/approvals") },
  { href: "/catalog", label: "Catalog", match: (p: string) => p.startsWith("/catalog") },
  { href: "/library", label: "Technical library", match: (p: string) => p.startsWith("/library") },
  { href: "/customers", label: "Accounts", match: (p: string) => p.startsWith("/customers") },
  { href: "/agent-lab", label: "Agent lab", match: (p: string) => p.startsWith("/agent-lab") },
];

export function AppShell({
  children,
  provider,
}: {
  children: ReactNode;
  provider: { id: string; label: string; remote: boolean; note: string };
}) {
  const pathname = usePathname() ?? "/";

  return (
    <div className="flex h-full flex-col">
      <header className="no-print sticky top-0 z-30 flex h-12 shrink-0 items-center gap-6 border-b border-[var(--hairline)] bg-white px-4">
        <Link href="/" className="flex items-baseline gap-2.5">
          <span className="flex size-5 items-center justify-center rounded-[3px] bg-ink-900 text-[10px] font-bold text-white">
            P
          </span>
          <span className="text-[13.5px] font-semibold tracking-[-0.015em] text-ink-900">
            Poka Sales Engine
          </span>
          <span className="hidden text-[11.5px] text-ink-400 sm:inline">Technical Sales Operations</span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative shrink-0 rounded px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  active ? "bg-ink-100 text-ink-900" : "text-ink-500 hover:bg-ink-50 hover:text-ink-800",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div
          className="hidden shrink-0 items-center gap-2 lg:flex"
          title={provider.note}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              provider.remote ? "bg-accent-500" : "bg-pass-600",
            )}
          />
          <span className="text-[11.5px] text-ink-500">
            {provider.remote ? provider.label : "Deterministic mode"}
          </span>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
