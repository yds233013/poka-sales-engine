"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { repriceQuoteAction } from "@/app/actions";
import { useActingUser } from "@/components/acting-user";
import { useDemoMode } from "@/components/demo-mode";

/**
 * Apply a rep-entered discount off list.
 *
 * Repricing re-runs the whole investigation rather than patching the numbers,
 * so the approval engine sees the new figures and raises whatever they now
 * require. A rep can discount themselves into an approval; they cannot
 * discount their way past one.
 */
export function RepriceControl({
  requestId,
  currentDiscountPct,
  disabled,
  disabledReason,
}: {
  requestId: string;
  currentDiscountPct: number;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const { user } = useActingUser();
  const { readOnly, reason } = useDemoMode();
  const [value, setValue] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const discountPct = Number(value);
      if (!Number.isFinite(discountPct)) {
        setResult({ ok: false, message: "Enter a discount percentage." });
        return;
      }
      const outcome = await repriceQuoteAction({ requestId, discountPct, userId: user.id });
      setResult(outcome);
      if (outcome.ok) setValue("");
      router.refresh();
    });

  if (disabled || readOnly) {
    return (
      <p className="border-t border-[var(--hairline)] px-4 py-2.5 text-[11.5px] text-ink-400">
        {disabled ? disabledReason : `Repricing is switched off. ${reason}`}
      </p>
    );
  }

  return (
    <div className="border-t border-[var(--hairline)] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-xs">Reprice</span>
        <div className="flex items-center gap-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            placeholder={currentDiscountPct.toFixed(1)}
            aria-label="Manual discount percent off list"
            className="h-7 w-16 rounded border border-[var(--hairline-strong)] bg-white px-2 text-right text-[12px] tabular-nums text-ink-900 placeholder:text-ink-300 focus:border-accent-500 focus:outline-none"
          />
          <span className="text-[12px] text-ink-500">% off list</span>
        </div>
        <Button variant="secondary" size="sm" onClick={submit} disabled={pending || value === ""}>
          {pending ? "Repricing…" : "Apply"}
        </Button>
        <span className="text-[11px] text-ink-400">
          Re-runs the case, so policy is re-evaluated against the new figures.
        </span>
      </div>
      {result ? (
        <p className={`mt-1.5 text-[11.5px] ${result.ok ? "text-pass-700" : "text-fail-700"}`}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
