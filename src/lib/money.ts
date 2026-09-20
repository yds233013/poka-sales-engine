/**
 * Money is handled as integer cents everywhere inside the engines.
 *
 * Floating point dollars silently drift once you multiply by a quantity and
 * then apply a percentage discount, and a quote whose lines do not add up to
 * its own total is worse than no quote at all. Every arithmetic path in the
 * pricing, freight and margin engines therefore operates on integers and
 * rounds at exactly one place: the point where a percentage is applied.
 */

export type Cents = number;

export function toCents(value: number | string | { toString(): string }): Cents {
  const n = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(n)) throw new Error(`Cannot convert ${String(value)} to cents`);
  return Math.round(n * 100);
}

export function centsToNumber(cents: Cents): number {
  return Math.round(cents) / 100;
}

/** Banker-free, deterministic half-up rounding on the absolute value. */
export function roundCents(value: number): Cents {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Apply a percentage discount to a cent amount. Single rounding point. */
export function applyDiscountPct(amount: Cents, pct: number): Cents {
  if (pct < 0 || pct > 100) throw new Error(`Discount percent out of range: ${pct}`);
  return roundCents(amount * (1 - pct / 100));
}

export function pctOf(part: Cents, whole: Cents): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 10000) / 100;
}

/** Discount percentage implied by a unit price against list. */
export function impliedDiscountPct(listPrice: Cents, unitPrice: Cents): number {
  if (listPrice <= 0) return 0;
  return Math.round(((listPrice - unitPrice) / listPrice) * 10000) / 100;
}

export function formatCurrency(cents: Cents, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centsToNumber(cents));
}

export function formatCompactCurrency(cents: Cents, currency = "USD"): string {
  const n = centsToNumber(cents);
  if (Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return formatCurrency(cents, currency);
}

export function formatPct(pct: number, digits = 1): string {
  return `${pct.toFixed(digits)}%`;
}
