// PROTOTYPE - Variant B: one installation-wide People page, organized by person.
// Master-detail layout; inviting is a two-step dialog.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton, InviteLinkBox, RoleSelect, StatusBadge, selectClass } from "./shared";
import { expiresIn, statusOf, useStore, type Invitation, type Role } from "./store";

export const name = "People page, by person";

export function VariantB() {
  const { state, invite, cancel, regenerate, setRole, remove } = useStore();
  const [selected, setSelected] = useState<string>("maria@studio.example");
  const [dialog, setDialog] = useState<{ email: string; locked: boolean } | null>(null);
  const [fresh, setFresh] = useState<Invitation | null>(null);

  const openInvitations = state.invitations.filter((i) => ["pending", "expired"].includes(statusOf(i)));
  const emails = Array.from(
    new Set([...state.accounts.map((a) => a.email), ...openInvitations.map((i) => i.email)]),
  );
  const account = state.accounts.find((a) => a.email === selected);
  const memberships = state.memberships.filter((m) => m.email === selected);
  const invitations = openInvitations.filter((i) => i.email === selected);

  function summary(email: string): string {
    const acc = state.accounts.find((a) => a.email === email);
    if (acc?.admin) return "Admin";
    if (!acc) return "Invited, no account yet";
    const n = state.memberships.filter((m) => m.email === email).length;
    return n === 0 ? "No project access" : n === 1 ? "1 project" : `${n} projects`;
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-72 border-r p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="font-semibold">People</h1>
          <Button size="sm" onClick={() => setDialog({ email: "", locked: false })}>
            Invite
          </Button>
        </div>
        <ul className="space-y-1">
          {emails.map((email) => (
            <li key={email}>
              <button
                onClick={() => {
                  setSelected(email);
                  setFresh(null);
                }}
                className={`w-full text-left rounded-md px-3 py-2 ${
                  email === selected ? "bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <div className="text-sm font-medium truncate">{email}</div>
                <div className="text-xs text-muted-foreground">{summary(email)}</div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex-1 p-8 max-w-3xl space-y-6">
        <div>
          <h2 className="text-xl font-semibold">{selected}</h2>
          <p className="text-sm text-muted-foreground">{summary(selected)}</p>
        </div>

        {account?.admin ? (
          <p className="text-sm text-muted-foreground">
            Admins have full access to every project. To grant or remove Admin access, use the{" "}
            <code>alfredo</code> command line on the HQ host.
          </p>
        ) : (
          <>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Project access</h3>
              {memberships.length === 0 && <p className="text-sm text-muted-foreground">No project access.</p>}
              {memberships.map((m) => (
                <div key={m.project} className="flex items-center gap-3 border rounded-md px-3 py-2">
                  <span className="flex-1 font-mono text-sm">{m.project}</span>
                  <RoleSelect value={m.role} onChange={(r) => setRole(selected, m.project, r)} />
                  <ConfirmButton
                    label="Remove"
                    confirmLabel={`Remove from ${m.project}`}
                    onConfirm={() => remove(selected, m.project)}
                  />
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Invitations</h3>
              {invitations.length === 0 && <p className="text-sm text-muted-foreground">No open invitations.</p>}
              {invitations.map((i) => (
                <div key={i.id} className="flex items-center gap-3 border border-dashed rounded-md px-3 py-2">
                  <span className="flex-1 font-mono text-sm">{i.project}</span>
                  <span className="text-sm">{i.role}</span>
                  <StatusBadge status={statusOf(i)} />
                  {statusOf(i) === "pending" && (
                    <span className="text-xs text-muted-foreground">{expiresIn(i)}</span>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setFresh(regenerate(i.id) ?? null)}>
                    New link
                  </Button>
                  {statusOf(i) === "pending" && (
                    <ConfirmButton label="Cancel" confirmLabel="Cancel invitation" onConfirm={() => cancel(i.id)} />
                  )}
                </div>
              ))}
              {fresh && <InviteLinkBox invitation={fresh} onDone={() => setFresh(null)} />}
              <Button size="sm" variant="outline" onClick={() => setDialog({ email: selected, locked: true })}>
                Invite to another project
              </Button>
            </section>
          </>
        )}
      </main>

      {dialog && (
        <InviteDialog
          initialEmail={dialog.email}
          locked={dialog.locked}
          projects={state.projects}
          onInvite={invite}
          onClose={(email) => {
            setDialog(null);
            if (email) setSelected(email);
          }}
        />
      )}
    </div>
  );
}

function InviteDialog({
  initialEmail,
  locked,
  projects,
  onInvite,
  onClose,
}: {
  initialEmail: string;
  locked: boolean;
  projects: string[];
  onInvite: ReturnType<typeof useStore>["invite"];
  onClose: (email?: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [project, setProject] = useState(projects[0]!);
  const [role, setRole] = useState<Role>("Viewer");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Invitation | null>(null);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
      <div className="bg-background rounded-xl border shadow-lg w-[30rem] p-6 space-y-4">
        <h2 className="font-semibold">{created ? "Send the invitation link" : "Invite a collaborator"}</h2>
        {created ? (
          <InviteLinkBox invitation={created} onDone={() => onClose(created.email)} />
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const result = onInvite(project, email, role);
              if (result.ok) setCreated(result.invitation);
              else setError(result.error);
            }}
          >
            <label className="block text-sm space-y-1">
              <span>Email</span>
              <Input value={email} disabled={locked} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block text-sm space-y-1">
              <span>Project</span>
              <select
                className={`${selectClass} w-full`}
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <fieldset className="text-sm space-y-1">
              <legend>Role</legend>
              {(["Viewer", "Operator"] as Role[]).map((r) => (
                <label key={r} className="flex gap-2 items-start border rounded-md p-2">
                  <input type="radio" checked={role === r} onChange={() => setRole(r)} className="mt-1" />
                  <span>
                    <span className="font-medium">{r}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r === "Viewer"
                        ? "Reads dashboards, status, and service logs."
                        : "Viewer access, plus deploy, roll back, and start, stop, or restart services."}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onClose()}>
                Close
              </Button>
              <Button type="submit">Create invitation link</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
