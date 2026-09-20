"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import {
  completeCaseAction,
  releaseQuoteAction,
  runAnalysisAction,
  type ActionResult,
} from "@/app/actions";

export function CaseActions({
  requestId,
  status,
  hasQuote,
  blockingApprovals,
  actingUserId,
  actingUserName,
}: {
  requestId: string;
  status: string;
  hasQuote: boolean;
  blockingApprovals: number;
  actingUserId: string;
  actingUserName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setResult(null);
      const outcome = await fn();
      setResult(outcome);
      router.refresh();
    });

  const canRelease = hasQuote && blockingApprovals === 0 && ["APPROVED", "READY_FOR_APPROVAL"].includes(status);
  const canComplete = status === "RESPONSE_READY";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => run(() => runAnalysisAction(requestId))}
          disabled={pending}
        >
          {pending ? "Working…" : status === "NEW" ? "Run analysis" : "Re-run analysis"}
        </Button>

        {canRelease ? (
          <Button
            variant="primary"
            onClick={() => run(() => releaseQuoteAction({ requestId, userId: actingUserId }))}
            disabled={pending}
          >
            Release quote
          </Button>
        ) : null}

        {canComplete ? (
          <Button
            variant="primary"
            onClick={() => run(() => completeCaseAction({ requestId, actor: actingUserName }))}
            disabled={pending}
          >
            Mark sent &amp; close
          </Button>
        ) : null}

        {hasQuote && blockingApprovals > 0 ? (
          <span
            className="cursor-not-allowed rounded bg-ink-100 px-3 py-1.5 text-[12px] font-medium text-ink-400"
            title={`${blockingApprovals} approval(s) must be decided before this quote can be released.`}
          >
            Release blocked
          </span>
        ) : null}
      </div>
      {result ? (
        <p className={`text-[11.5px] ${result.ok ? "text-pass-700" : "text-fail-700"}`}>{result.message}</p>
      ) : null}
    </div>
  );
}
