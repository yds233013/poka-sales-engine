"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";

export interface ActingUser {
  id: string;
  name: string;
  role: string;
  title: string;
  initials: string;
}

const Ctx = createContext<{ user: ActingUser; setUserId: (id: string) => void; users: ActingUser[] } | null>(
  null,
);

const STORAGE_KEY = "poka.actingUserId";

/**
 * Minimal external store over localStorage so the selection can be read with
 * useSyncExternalStore — no effect, no cascading render, and a write in this
 * tab notifies subscribers (the native `storage` event does not).
 */
const actingUserStore = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    actingUserStore.listeners.add(listener);
    window.addEventListener("storage", listener);
    return () => {
      actingUserStore.listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  },
  get(): string | null {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(id: string) {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Private browsing or blocked storage — the selection simply does not persist.
    }
    for (const listener of actingUserStore.listeners) listener();
  },
};

/**
 * "Acting as" selector.
 *
 * This build has no authentication — that is a deliberate scope decision, not
 * an oversight, and the UI says so rather than pretending a session exists.
 * The selected user is still enforced server-side: the approval role gate in
 * the workflow module checks whoever is passed in, so switching to a sales
 * rep genuinely cannot approve an engineer's technical sign-off.
 */
export function ActingUserProvider({
  users,
  children,
}: {
  users: ActingUser[];
  children: React.ReactNode;
}) {
  // Read through useSyncExternalStore rather than an effect so the server
  // render and the first client render agree, and the choice survives a
  // navigation without flashing the default user.
  const storedId = useSyncExternalStore(actingUserStore.subscribe, actingUserStore.get, () => null);
  const activeId = storedId && users.some((u) => u.id === storedId) ? storedId : (users[0]?.id ?? "");

  const value = useMemo(
    () => ({
      user: users.find((u) => u.id === activeId) ?? users[0],
      users,
      setUserId: (id: string) => actingUserStore.set(id),
    }),
    [users, activeId],
  );

  if (!value.user) return <>{children}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActingUser() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useActingUser must be used inside ActingUserProvider");
  return ctx;
}

export function ActingUserPicker() {
  const { user, users, setUserId } = useActingUser();
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="label-xs shrink-0 whitespace-nowrap">Acting as</span>
      <select
        value={user.id}
        onChange={(e) => setUserId(e.target.value)}
        className="h-7 min-w-0 flex-1 truncate rounded border border-[var(--hairline-strong)] bg-white px-2 text-[12px] text-ink-800 focus:border-accent-500 focus:outline-none"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} · {u.title}
          </option>
        ))}
      </select>
    </label>
  );
}
