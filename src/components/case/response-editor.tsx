"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button, Panel, PanelHeader, Pill } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { saveResponseAction } from "@/app/actions";
import { useActingUser } from "@/components/acting-user";
import { useDemoMode } from "@/components/demo-mode";

export function ResponseEditor({
  requestId,
  subject,
  body,
  version,
  edited,
  locked,
  lockReason,
  checks,
}: {
  requestId: string;
  subject: string;
  body: string;
  version: number;
  edited: boolean;
  locked: boolean;
  lockReason?: string;
  /** Verified on the server against this case's own figures, not asserted. */
  checks?: { label: string; ok: boolean; detail: string }[];
}) {
  const router = useRouter();
  const { user } = useActingUser();
  const { readOnly, reason } = useDemoMode();
  const [draftSubject, setDraftSubject] = useState(subject);
  const [draftBody, setDraftBody] = useState(body);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // When the server sends a newer version (after a save or a re-run), reset the
  // editor to it. Adjusting state during render is the documented pattern for
  // "derive state from props" and avoids a second render pass.
  const [seen, setSeen] = useState({ subject, body });
  if (seen.subject !== subject || seen.body !== body) {
    setSeen({ subject, body });
    setDraftSubject(subject);
    setDraftBody(body);
  }

  const dirty = draftSubject !== subject || draftBody !== body;

  const copy = async () => {
    await navigator.clipboard.writeText(`Subject: ${draftSubject}\n\n${draftBody}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const save = () =>
    start(async () => {
      const result = await saveResponseAction({
        requestId,
        subject: draftSubject,
        body: draftBody,
        actor: user.name,
        userId: user.id,
      });
      setSaved(result.message);
      router.refresh();
      setTimeout(() => setSaved(null), 2500);
    });

  return (
    <Panel>
      <PanelHeader
        title="Customer response"
        subtitle={
          locked
            ? "Held until every approval on this case is decided."
            : `Draft v${version} · ${edited ? "edited by a person" : "generated from the case's computed facts, not yet edited"}`
        }
        actions={
          locked ? (
            <Pill tone="warn" dot>
              Locked
            </Pill>
          ) : (
            <div className="flex items-center gap-2">
              {dirty && !readOnly ? (
                <Button variant="secondary" size="sm" onClick={save} disabled={pending}>
                  {pending ? "Saving…" : "Save draft"}
                </Button>
              ) : null}
              <Button variant="primary" size="sm" onClick={copy}>
                {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                {copied ? "Copied" : "Copy response"}
              </Button>
            </div>
          )
        }
      />

      {checks?.length ? (
        <div className="flex flex-wrap gap-2 border-b border-[var(--hairline)] bg-ink-50/50 px-4 py-2">
          {checks.map((check) => (
            <span
              key={check.label}
              title={check.detail}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium ring-1 ring-inset",
                check.ok ? "bg-white text-pass-700 ring-pass-200" : "bg-fail-50 text-fail-700 ring-fail-200",
              )}
            >
              {check.ok ? <ShieldCheck className="size-3.5" aria-hidden /> : <TriangleAlert className="size-3.5" aria-hidden />}
              {check.label}
            </span>
          ))}
        </div>
      ) : null}

      {locked ? (
        <div className="flex items-start gap-3 px-4 py-5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warn-50 ring-1 ring-inset ring-warn-200">
            <Lock className="size-4 text-warn-700" aria-hidden />
          </span>
          <p className="t-body text-ink-600">{lockReason}</p>
        </div>
      ) : (
        <div className="p-4">
          <div className="overflow-hidden rounded-md border border-[var(--hairline-strong)] bg-white shadow-[var(--shadow-xs)] focus-within:border-accent-500">
            <div className="flex items-center gap-2 border-b border-[var(--hairline)] bg-ink-50/40 px-3 py-2">
              <span className="t-small shrink-0 text-ink-500">Subject</span>
              <input
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
                readOnly={readOnly}
                title={readOnly ? reason : undefined}
                aria-label="Subject"
                className="t-body min-w-0 flex-1 bg-transparent font-medium text-ink-900 focus:outline-none"
              />
            </div>
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              readOnly={readOnly}
              title={readOnly ? reason : undefined}
              aria-label="Response body"
              rows={draftBody.split("\n").length + 2}
              className="block w-full resize-y bg-white px-4 py-3 text-[13.5px] leading-[1.65] text-ink-800 focus:outline-none"
            />
          </div>
          <div className="mt-2 flex min-h-5 items-center gap-2">
            {dirty ? <Pill tone="warn">Unsaved changes</Pill> : null}
            {saved ? <span className="t-small text-pass-700">{saved}</span> : null}
          </div>
        </div>
      )}
    </Panel>
  );
}
