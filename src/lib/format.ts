import { formatCurrency, formatCompactCurrency } from "@/lib/money";
import { cents } from "@/lib/decimal";

export function money(value: { toString(): string } | number | null | undefined): string {
  return formatCurrency(cents(value));
}

export function compactMoney(value: { toString(): string } | number | null | undefined): string {
  return formatCompactCurrency(cents(value));
}

export function shortDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function dayMonth(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function dateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** "4h", "2d" — the age column in the inbox. */
export function age(from: Date): string {
  const hours = (Date.now() - from.getTime()) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function pct(value: { toString(): string } | number | null | undefined, digits = 1): string {
  const n = value === null || value === undefined ? 0 : Number(value.toString());
  return `${n.toFixed(digits)}%`;
}

export function titleCase(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export function duration(ms: number | null | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** True when the date is before now. Kept here so render code never reads the clock directly. */
export function isPast(date: Date): boolean {
  return date.getTime() < Date.now();
}
