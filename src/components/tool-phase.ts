import {
  BadgeDollarSign,
  BookOpen,
  Boxes,
  CircleCheckBig,
  ScanSearch,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";

/**
 * Which part of an investigation a tool belongs to.
 *
 * Shared by the case timeline, the adaptive-path comparison and the MCP
 * toolbox, so a tool is the same colour and the same kind of thing wherever
 * it appears.
 */
export type PhaseKey = "understand" | "technical" | "evidence" | "fulfillment" | "commercial" | "policy" | "conclude";

export const PHASE: Record<PhaseKey, { label: string; icon: LucideIcon; tone: string; chip: string }> = {
  understand: { label: "Understand", icon: UserRound, tone: "bg-ink-100 text-ink-600", chip: "bg-ink-50 text-ink-700 ring-ink-200" },
  technical: { label: "Technical", icon: ScanSearch, tone: "bg-accent-50 text-accent-700", chip: "bg-accent-50 text-accent-700 ring-accent-200" },
  evidence: { label: "Evidence", icon: BookOpen, tone: "bg-accent-50 text-accent-700", chip: "bg-[#eef5ff] text-[#1f4f8f] ring-[#c9dcf5]" },
  fulfillment: { label: "Fulfillment", icon: Boxes, tone: "bg-pass-50 text-pass-700", chip: "bg-pass-50 text-pass-700 ring-pass-200" },
  commercial: { label: "Commercial", icon: BadgeDollarSign, tone: "bg-warn-50 text-warn-700", chip: "bg-warn-50 text-warn-700 ring-warn-200" },
  policy: { label: "Policy", icon: ShieldCheck, tone: "bg-fail-50 text-fail-700", chip: "bg-fail-50 text-fail-700 ring-fail-200" },
  conclude: { label: "Conclude", icon: CircleCheckBig, tone: "bg-ink-900 text-white", chip: "bg-ink-900 text-white ring-ink-900" },
};

export const TOOL_PHASE: Record<string, PhaseKey> = {
  resolve_customer: "understand",
  get_request_state: "understand",
  resolve_sku: "understand",
  get_customer_history: "understand",
  search_catalog: "technical",
  get_product: "technical",
  find_substitutes: "technical",
  screen_candidates: "technical",
  check_compatibility: "technical",
  apply_adapter: "technical",
  search_technical_docs: "evidence",
  get_inventory: "fulfillment",
  check_inventory: "fulfillment",
  build_fulfillment_plan: "fulfillment",
  calculate_price: "commercial",
  calculate_freight: "commercial",
  check_margin: "commercial",
  evaluate_approvals: "policy",
  create_quote_draft: "conclude",
  request_clarification: "conclude",
  respond_with_information: "conclude",
  escalate_for_review: "conclude",
};

export function phaseOf(tool: string): PhaseKey {
  return TOOL_PHASE[tool] ?? "technical";
}

/** Capability groups for the MCP toolbox. */
export const TOOL_CAPABILITY: Record<string, "discovery" | "technical" | "inventory" | "commercial" | "workflow"> = {
  resolve_customer: "discovery",
  get_request_state: "discovery",
  resolve_sku: "discovery",
  search_catalog: "discovery",
  get_product: "discovery",
  get_customer_history: "discovery",
  check_compatibility: "technical",
  find_substitutes: "technical",
  search_technical_docs: "technical",
  get_inventory: "inventory",
  build_fulfillment_plan: "inventory",
  calculate_price: "commercial",
  create_quote_draft: "workflow",
  request_clarification: "workflow",
  respond_with_information: "workflow",
  escalate_for_review: "workflow",
};
