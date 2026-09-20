"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Panel, PanelHeader, Pill } from "@/components/ui/primitives";
import { saveResponseAction } from "@/app/actions";
import { useActingUser } from "@/components/acting-user";

export function ResponseEditor({
  requestId,
  subject,
  body,
  version,
  edited,
  locked,
  lockReason,
}: {
  requestId: string;
  subject: string;
  body: string;
  version: number;
  edited: boolean;
  locked: boolean;
  lockReason?: string;
}) {
  const router = useRouter();
  const { user } = useActingUser();
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
            ? lockReason
            : `Draft v${version}${edited ? " — edited by a person" : " — generated, not yet edited"}. No internal cost or margin figure appears in this text.`
        }
        actions={
          locked ? null : (
            <div className="flex items-center gap-2">
              {dirty ? (
                <Button variant="secondary" size="sm" onClick={save} disabled={pending}>
                  {pending ? "Saving…" : "Save draft"}
                </Button>
              ) : null}
              <Button variant="primary" size="sm" onClick={copy}>
                {copied ? "Copied" : "Copy response"}
              </Button>
            </div>
          )
        }
      />
      {locked ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[12.5px] text-ink-500">{lockReason}</p>
        </div>
      ) : (
        <div className="p-4">
          <label className="label-xs">Subject</label>
          <input
            value={draftSubject}
            onChange={(e) => setDraftSubject(e.target.value)}
            className="mt-1 w-full rounded border border-[var(--hairline-strong)] bg-white px-2.5 py-1.5 text-[13px] font-medium text-ink-900 focus:border-accent-500 focus:outline-none"
          />
          <label className="label-xs mt-3 block">Body</label>
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            rows={draftBody.split("\n").length + 2}
            className="mt-1 w-full resize-y rounded border border-[var(--hairline-strong)] bg-white px-3 py-2.5 font-mono text-[12px] leading-relaxed text-ink-800 focus:border-accent-500 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            {dirty ? <Pill tone="warn">Unsaved changes</Pill> : null}
            {saved ? <span className="text-[11.5px] text-pass-700">{saved}</span> : null}
          </div>
        </div>
      )}
    </Panel>
  );
}
