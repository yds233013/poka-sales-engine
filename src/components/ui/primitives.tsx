/**
 * Shared UI primitives.
 *
 * Hand-built rather than pulled from a component library, so the product has
 * its own density and voice: hairline borders, a disciplined type scale,
 * tabular figures, and colour used only where it encodes state.
 */

import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { requestStatus } from "@/lib/status";

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
        "rounded-lg border border-[var(--hairline)] bg-white shadow-[var(--shadow-xs)]",
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
  icon: Icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-4 border-b border-[var(--hairline)] px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-ink-400" strokeWidth={1.75} aria-hidden /> : null}
        <div className="min-w-0">
          <h2 className="t-heading text-ink-900">{title}</h2>
          {subtitle ? <p className="t-small mt-0.5 text-ink-500">{subtitle}</p> : null}
        </div>
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
        "inline-flex h-[22px] items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap",
        STATUS_TONES[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}

/** A case's status, named and coloured the same way on every screen. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meaning = requestStatus(status);
  return (
    <Pill tone={meaning.tone} dot className={className}>
      {meaning.label}
    </Pill>
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
    "bg-ink-900 text-white shadow-[var(--shadow-xs)] hover:bg-ink-800 disabled:bg-ink-300 disabled:shadow-none",
  accent:
    "bg-accent-600 text-white shadow-[var(--shadow-xs)] hover:bg-accent-700 disabled:bg-ink-300 disabled:shadow-none",
  secondary:
    "bg-white text-ink-800 shadow-[var(--shadow-xs)] ring-1 ring-inset ring-[var(--hairline-strong)] hover:bg-ink-50 disabled:text-ink-400 disabled:shadow-none",
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
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-[background-color,box-shadow,transform] active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0",
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3.5 text-[13px]",
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
      <div className={cn("t-figure mt-1.5", valueTone)}>
        {value}
      </div>
      {hint ? <div className="t-small mt-0.5 text-ink-500">{hint}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {Icon ? (
        <span className="mb-3 flex size-9 items-center justify-center rounded-lg bg-ink-50 ring-1 ring-inset ring-[var(--hairline)]">
          <Icon className="size-4 text-ink-400" strokeWidth={1.75} aria-hidden />
        </span>
      ) : null}
      <p className="t-heading text-ink-800">{title}</p>
      {description ? (
        <p className="t-small mt-1 max-w-sm text-ink-500">{description}</p>
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
