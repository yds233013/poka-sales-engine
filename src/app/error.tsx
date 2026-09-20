"use client";

import { useEffect } from "react";
import { PageBody } from "@/components/ui/page";
import { Panel, PanelHeader, Button } from "@/components/ui/primitives";

/**
 * Surfaces the failure rather than showing a blank screen. An operations tool
 * that silently swallows an error is worse than one that says what broke.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageBody className="max-w-2xl">
      <Panel className="mt-12">
        <PanelHeader
          title="Something went wrong on this screen"
          subtitle="Nothing has been changed. The error below is what the server reported."
        />
        <div className="px-4 py-4">
          <pre className="overflow-x-auto rounded border border-[var(--hairline)] bg-ink-50 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-700">
            {error.message}
            {error.digest ? `\n\nDigest: ${error.digest}` : ""}
          </pre>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>
          </div>
        </div>
      </Panel>
    </PageBody>
  );
}
