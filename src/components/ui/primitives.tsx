/**
 * Shared UI primitives.
 *
 * Hand-built rather than pulled from a component library, so the product has
 * its own density and voice: hairline borders, 11px uppercase section labels,
 * tabular figures, and colour used only where it encodes state.
 */

import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

// ────────────────────────────── Surface ────────────────────────────────────

export function Panel({
  children,
  className,
  flush,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-md border border-[var(--hairline)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        !flush && "overflow-hidden",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-4 border-b border-[var(--hairline)] px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[12px] text-ink-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("label-xs", className)}>{children}</div>;
}

// ─────────────────────────────── Status ────────────────────────────────────

const STATUS_TONES = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  accent: "bg-accent-50 text-accent-700 ring-accent-200",
  pass: "bg-pass-50 text-pass-700 ring-pass-200",
  warn: "bg-warn-50 text-warn-700 ring-warn-200",
  fail: "bg-fail-50 text-fail-700 ring-fail-200",
  solid: "bg-ink-900 text-white ring-ink-900",
} as const;

export type Tone = keyof typeof STATUS_TONES;

export function Pill({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap",
        STATUS_TONES[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}

export const REQUEST_STATUS_TONE: Record<string, Tone> = {
  NEW: "neutral",
  ANALYZING: "accent",
  NEEDS_REVIEW: "warn",
  READY_FOR_APPROVAL: "warn",
  APPROVED: "pass",
  RESPONSE_READY: "pass",
  COMPLETED: "neutral",
  BLOCKED: "fail",
};

export const RISK_TONE: Record<string, Tone> = {
  LOW: "pass",
  MEDIUM: "warn",
  HIGH: "fail",
  BLOCKED: "fail",
};

export const CHECK_TONE: Record<string, Tone> = {
  PASS: "pass",
  FAIL: "fail",
  WARNING: "warn",
  UNKNOWN: "neutral",
  NOT_APPLICABLE: "neutral",
};

export function statusLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

// ─────────────────────────────── Buttons ───────────────────────────────────

const BUTTON_VARIANTS = {
  primary:
    "bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-300 focus-visible:outline-ink-900",
  secondary:
    "bg-white text-ink-800 ring-1 ring-inset ring-[var(--hairline-strong)] hover:bg-ink-50 disabled:text-ink-400",
  ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-300",
  danger:
    "bg-white text-fail-700 ring-1 ring-inset ring-fail-200 hover:bg-fail-50 disabled:text-ink-400",
  approve:
    "bg-pass-600 text-white hover:bg-pass-700 disabled:bg-ink-300 focus-visible:outline-pass-600",
} as const;

export function Button({
  children,
  variant = "secondary",
  className,
  type = "button",
  size = "md",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: "sm" | "md";
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed",
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[12.5px]",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ──────────────────────────────── Data ─────────────────────────────────────

export function DataRow({
  label,
  children,
  className,
  mono,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-6 py-1.5", className)}>
      <dt className="shrink-0 text-[12px] text-ink-500">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-[12.5px] font-medium text-ink-900",
          mono && "tnum",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "warn" | "fail" | "pass";
}) {
  const valueTone =
    tone === "warn"
      ? "text-warn-700"
      : tone === "fail"
        ? "text-fail-700"
        : tone === "pass"
          ? "text-pass-700"
          : "text-ink-900";
  return (
    <div className="px-4 py-3">
      <div className="label-xs">{label}</div>
      <div className={cn("tnum mt-1.5 text-[22px] font-semibold tracking-[-0.02em]", valueTone)}>
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[11.5px] text-ink-500">{hint}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-[13px] font-medium text-ink-700">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-ink-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-[var(--hairline)]", className)} />;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-[12px] tracking-[-0.02em] text-ink-800", className)}>
      {children}
    </span>
  );
}
