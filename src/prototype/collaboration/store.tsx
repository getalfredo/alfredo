// PROTOTYPE - throwaway in-memory state for the collaboration UI prototype.
// Nothing here is persisted; a reload resets everything.
import { createContext, useContext, useState, type ReactNode } from "react";

export type Role = "Viewer" | "Operator";
export type InvitationStatus = "pending" | "expired" | "canceled" | "consumed";

export interface Account {
  email: string;
  admin: boolean;
}

export interface Membership {
  email: string;
  project: string;
  role: Role;
}

export interface Invitation {
  id: string;
  project: string;
  email: string;
  role: Role;
  createdAt: number;
  expiresAt: number;
  // "expired" is derived from expiresAt, never stored.
  stored: "pending" | "canceled" | "consumed";
  // HQ stores only a hash of the token, so the link is visible once, at creation.
  link: string;
}

export interface State {
  projects: string[];
  accounts: Account[];
  memberships: Membership[];
  invitations: Invitation[];
  log: string[];
}

const DAY = 24 * 60 * 60 * 1000;
export const ADMIN_EMAIL = "alper@example.com";

function makeInvitation(project: string, email: string, role: Role, ageDays = 0): Invitation {
  const createdAt = Date.now() - ageDays * DAY;
  const token = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
  return {
    id: crypto.randomUUID(),
    project,
    email,
    role,
    createdAt,
    expiresAt: createdAt + 7 * DAY,
    stored: "pending",
    link: `https://hq.example.com/invite/${token}`,
  };
}

const seed: State = {
  projects: ["storefront", "docs-site", "internal-api"],
  accounts: [
    { email: ADMIN_EMAIL, admin: true },
    { email: "maria@studio.example", admin: false },
    { email: "tom@agency.example", admin: false },
  ],
  memberships: [
    { email: "maria@studio.example", project: "storefront", role: "Operator" },
    { email: "maria@studio.example", project: "docs-site", role: "Viewer" },
    { email: "tom@agency.example", project: "storefront", role: "Viewer" },
  ],
  invitations: [
    makeInvitation("storefront", "lena@freelance.example", "Operator", 2),
    makeInvitation("internal-api", "tom@agency.example", "Operator", 1),
    makeInvitation("docs-site", "jo@writer.example", "Viewer", 9),
    { ...makeInvitation("docs-site", "sam@old.example", "Viewer", 3), stored: "canceled" },
    { ...makeInvitation("storefront", "tom@agency.example", "Viewer", 20), stored: "consumed" },
  ],
  log: [],
};

export function statusOf(inv: Invitation): InvitationStatus {
  if (inv.stored !== "pending") return inv.stored;
  return inv.expiresAt < Date.now() ? "expired" : "pending";
}

export function expiresIn(inv: Invitation): string {
  const days = Math.ceil((inv.expiresAt - Date.now()) / DAY);
  if (days <= 0) return "expired";
  return days === 1 ? "expires in 1 day" : `expires in ${days} days`;
}

export type InviteResult = { ok: true; invitation: Invitation } | { ok: false; error: string };

interface Store {
  state: State;
  invite(project: string, email: string, role: Role): InviteResult;
  cancel(id: string): void;
  regenerate(id: string): Invitation | undefined;
  accept(id: string): void;
  setRole(email: string, project: string, role: Role): void;
  remove(email: string, project: string): void;
  reset(): void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(seed);
  const log = (s: State, line: string): State => ({ ...s, log: [line, ...s.log].slice(0, 30) });

  const store: Store = {
    state,
    invite(project, rawEmail, role) {
      const email = rawEmail.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
      if (state.accounts.some((a) => a.email === email && a.admin))
        return { ok: false, error: "Admins already have access to every project." };
      if (state.memberships.some((m) => m.email === email && m.project === project))
        return { ok: false, error: `${email} is already a member of ${project}. Change the role instead.` };
      const invitation = makeInvitation(project, email, role);
      setState((s) => {
        // ASSUMPTION: a new invitation for the same email and project replaces the pending one.
        const replaced = s.invitations.filter(
          (i) => i.email === email && i.project === project && statusOf(i) === "pending",
        );
        const invitations = s.invitations.map((i) =>
          replaced.includes(i) ? { ...i, stored: "canceled" as const } : i,
        );
        return log(
          { ...s, invitations: [invitation, ...invitations] },
          `invite ${email} to ${project} as ${role}${replaced.length ? " (replaced a pending invitation)" : ""}`,
        );
      });
      return { ok: true, invitation };
    },
    cancel(id) {
      setState((s) => {
        const inv = s.invitations.find((i) => i.id === id);
        return log(
          { ...s, invitations: s.invitations.map((i) => (i.id === id ? { ...i, stored: "canceled" } : i)) },
          `cancel invitation for ${inv?.email} to ${inv?.project}`,
        );
      });
    },
    regenerate(id) {
      const old = state.invitations.find((i) => i.id === id);
      if (!old) return;
      const next = makeInvitation(old.project, old.email, old.role);
      setState((s) =>
        log(
          {
            ...s,
            invitations: [next, ...s.invitations.map((i) => (i.id === id ? { ...i, stored: "canceled" as const } : i))],
          },
          `new link for ${old.email} to ${old.project} (old link stops working, seven days restart)`,
        ),
      );
      return next;
    },
    accept(id) {
      setState((s) => {
        const inv = s.invitations.find((i) => i.id === id);
        if (!inv || statusOf(inv) !== "pending") return s;
        const hasAccount = s.accounts.some((a) => a.email === inv.email);
        return log(
          {
            ...s,
            accounts: hasAccount ? s.accounts : [...s.accounts, { email: inv.email, admin: false }],
            memberships: [...s.memberships, { email: inv.email, project: inv.project, role: inv.role }],
            invitations: s.invitations.map((i) => (i.id === id ? { ...i, stored: "consumed" } : i)),
          },
          `${inv.email} accepted: ${inv.role} on ${inv.project}${hasAccount ? "" : " (new account)"}`,
        );
      });
    },
    setRole(email, project, role) {
      setState((s) =>
        log(
          {
            ...s,
            memberships: s.memberships.map((m) => (m.email === email && m.project === project ? { ...m, role } : m)),
          },
          `${email} is now ${role} on ${project}`,
        ),
      );
    },
    remove(email, project) {
      setState((s) =>
        log(
          { ...s, memberships: s.memberships.filter((m) => !(m.email === email && m.project === project)) },
          `removed ${email} from ${project}`,
        ),
      );
    },
    reset() {
      setState(seed);
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error("StoreProvider missing");
  return store;
}
