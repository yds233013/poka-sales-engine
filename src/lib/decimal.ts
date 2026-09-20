/**
 * Prisma Decimal → number / cents helpers.
 *
 * Deliberately free of any Prisma import: client components format money too,
 * and a helper that reaches the database client would drag the whole engine
 * into the browser bundle.
 */

import { toCents, type Cents } from "@/lib/money";

export type Decimalish = { toString(): string } | number | null | undefined;

export function dec(value: Decimalish): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

export function decOrNull(value: Decimalish): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value.toString());
}

export function cents(value: Decimalish): Cents {
  return toCents(dec(value));
}
