"use client";

import { createContext, useContext } from "react";

/**
 * Whether this deployment is a read-only public demo, made available to client
 * controls so they can say why they are disabled. It is presentation only: the
 * server actions refuse writes on their own (see src/lib/demo-mode.ts).
 */
const Ctx = createContext<{ readOnly: boolean; reason: string }>({ readOnly: false, reason: "" });

export function DemoModeProvider({
  readOnly,
  reason,
  children,
}: {
  readOnly: boolean;
  reason: string;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={{ readOnly, reason }}>{children}</Ctx.Provider>;
}

export function useDemoMode() {
  return useContext(Ctx);
}
