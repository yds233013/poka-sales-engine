/**
 * Inbox filter keys, shared by the server page (which reads ?filter=) and the
 * client list (which renders the tabs). Kept out of the client module because
 * a value exported from a "use client" file is a client reference on the
 * server, not the value itself.
 */
export const INBOX_FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "new", label: "Not analysed" },
  { key: "review", label: "Needs review" },
  { key: "approval", label: "Awaiting approval" },
  { key: "ready", label: "Ready to send" },
  { key: "closed", label: "Sent" },
] as const;

export type FilterKey = (typeof INBOX_FILTERS)[number]["key"];
