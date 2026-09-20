"use client";

import { ApprovalCard, type ApprovalView } from "./approval-card";
import { useActingUser } from "@/components/acting-user";

export function ApprovalListClient({ approvals }: { approvals: ApprovalView[] }) {
  const { user } = useActingUser();
  const order = ["PENDING", "CHANGES_REQUESTED", "REJECTED", "APPROVED"];
  const sorted = [...approvals].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <div>
      {sorted.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          actingUserId={user.id}
          actingUserRole={user.role}
        />
      ))}
    </div>
  );
}
