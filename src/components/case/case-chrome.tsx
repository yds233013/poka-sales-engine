"use client";

import { CaseActions } from "./case-actions";
import { useActingUser } from "@/components/acting-user";

/** Bridges the server-rendered case header to the acting-user context. */
export function CaseChrome({
  requestId,
  status,
  hasQuote,
  blockingApprovals,
}: {
  requestId: string;
  status: string;
  hasQuote: boolean;
  blockingApprovals: number;
}) {
  const { user } = useActingUser();
  return (
    <CaseActions
      requestId={requestId}
      status={status}
      hasQuote={hasQuote}
      blockingApprovals={blockingApprovals}
      actingUserId={user.id}
      actingUserName={user.name}
    />
  );
}
