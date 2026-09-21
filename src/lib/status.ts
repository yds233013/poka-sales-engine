/**
 * One vocabulary for case state, used on every screen.
 *
 * The enum names are for the database. A salesperson should read "Awaiting
 * approval", not "Ready For Approval", and should read it the same way on the
 * dashboard, the inbox, the case header and the approval queue — a state that
 * is described three ways looks like three states.
 */

export type StatusTone = "neutral" | "accent" | "pass" | "warn" | "fail";

export interface StatusMeaning {
  label: string;
  tone: StatusTone;
  /** What a person should do about it, in a few words. */
  next: string;
}

export const REQUEST_STATUS: Record<string, StatusMeaning> = {
  NEW: { label: "New", tone: "neutral", next: "Run analysis" },
  ANALYZING: { label: "Analyzing", tone: "accent", next: "In progress" },
  NEEDS_REVIEW: { label: "Needs review", tone: "warn", next: "A person must look" },
  READY_FOR_APPROVAL: { label: "Awaiting approval", tone: "warn", next: "Decide approvals" },
  APPROVED: { label: "Approved", tone: "accent", next: "Release the quote" },
  RESPONSE_READY: { label: "Ready to send", tone: "pass", next: "Review and send" },
  COMPLETED: { label: "Sent", tone: "neutral", next: "Closed" },
  BLOCKED: { label: "Blocked", tone: "fail", next: "Needs engineering" },
};

export function requestStatus(status: string): StatusMeaning {
  return REQUEST_STATUS[status] ?? { label: status, tone: "neutral", next: "" };
}

export const OUTCOME_LABEL: Record<string, string> = {
  EXACT_MATCH: "Exact match",
  SUBSTITUTE: "Substitution",
  SPLIT_FULFILLMENT: "Split shipment",
  NO_VIABLE_OPTION: "No viable option",
  INFORMATION_REQUIRED: "Information required",
  INFORMATION_PROVIDED: "Question answered",
};

export const OUTCOME_TONE: Record<string, StatusTone> = {
  EXACT_MATCH: "pass",
  SUBSTITUTE: "accent",
  SPLIT_FULFILLMENT: "accent",
  NO_VIABLE_OPTION: "fail",
  INFORMATION_REQUIRED: "warn",
  INFORMATION_PROVIDED: "pass",
};

export const APPROVAL_KIND_LABEL: Record<string, string> = {
  DELIVERY_DATE_MISS: "Delivery date miss",
  DISCOUNT_THRESHOLD: "Discount threshold",
  MARGIN_FLOOR: "Margin floor",
  TECHNICAL_SUBSTITUTION: "Technical substitution",
  COMPATIBILITY_WARNING: "Compatibility warning",
  EXPEDITED_FREIGHT: "Expedited freight",
  LARGE_QUOTE_VALUE: "Large quote value",
  TECHNICAL_UNCERTAINTY: "Technical uncertainty",
  SPLIT_FULFILLMENT: "Split fulfillment",
};

export const ROLE_LABEL: Record<string, string> = {
  SALES_REP: "Sales rep",
  SALES_MANAGER: "Sales manager",
  APPLICATION_ENGINEER: "Application engineer",
  ADMIN: "Admin",
};

export const TERMINATION_LABEL: Record<string, string> = {
  READY_FOR_APPROVAL: "Ready for approval",
  INFORMATION_PROVIDED: "Information provided",
  READY_TO_DRAFT: "Ready to draft",
  NEEDS_CUSTOMER_CLARIFICATION: "Needs customer clarification",
  NEEDS_INTERNAL_REVIEW: "Needs internal review",
  BLOCKED_TECHNICAL: "Blocked — technical",
  GUARDRAIL_STOP: "Stopped by guardrail",
  FAILED: "Failed",
  COMPLETED: "Completed",
};
