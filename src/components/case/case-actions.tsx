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
  adaptiveAvailable,
  adaptiveUnavailableReason,
}: {
  requestId: string;
  status: string;
  hasQuote: boolean;
  blockingApprovals: number;
  actingUserId: string;
  actingUserName: string;
  adaptiveAvailable: boolean;
  adaptiveUnavailableReason: string | null;
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
  const runLabel = status === "NEW" ? "Run analysis" : "Re-run analysis";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => run(() => runAnalysisAction(requestId, "DETERMINISTIC"))}
          disabled={pending}
        >
          {pending ? "Working…" : runLabel}
        </Button>

        {/*
          Adaptive is offered only when it genuinely exists. When it does not,
          the reason is shown rather than the button being silently absent —
          and the deterministic path is never labelled as an agent.
        */}
        {adaptiveAvailable ? (
          <Button
            variant="secondary"
            onClick={() => run(() => runAnalysisAction(requestId, "ADAPTIVE_AGENT"))}
            disabled={pending}
            title="The model chooses which tools to call. Compatibility, stock, pricing and approvals stay deterministic."
          >
            {pending ? "Working…" : "Run adaptive agent"}
          </Button>
        ) : (
          <span
            className="cursor-not-allowed rounded bg-ink-100 px-3 py-1.5 text-[12px] font-medium text-ink-400"
            title={adaptiveUnavailableReason ?? "Adaptive mode is not configured."}
          >
            Adaptive unavailable
          </span>
        )}

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
