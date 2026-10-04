// PROTOTYPE - Variant A: a Members tab inside each project page.
// Everything is scoped to one project; inviting is an inline form.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConfirmButton, InviteLinkBox, RoleSelect, StatusBadge, selectClass } from "./shared";
import { expiresIn, statusOf, useStore, type Invitation, type Role } from "./store";

export const name = "Members tab in the project";

export function VariantA() {
  const { state, invite, cancel, regenerate, setRole, remove } = useStore();
  const [project, setProject] = useState(state.projects[0]!);
  const [email, setEmail] = useState("");
  const [role, setRoleDraft] = useState<Role>("Viewer");
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Invitation | null>(null);

  const members = state.memberships.filter((m) => m.project === project);
  const admins = state.accounts.filter((a) => a.admin);
  const open = state.invitations.filter(
    (i) => i.project === project && (statusOf(i) === "pending" || statusOf(i) === "expired"),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = invite(project, email, role);
    if (!result.ok) return setError(result.error);
    setError(null);
    setEmail("");
    setFresh(result.invitation);
  }

  return (
    <div className="container mx-auto p-8 max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground text-sm">&larr; Back</span>
        <select
          aria-label="Project"
          className={`${selectClass} text-xl font-semibold h-10`}
          value={project}
          onChange={(e) => {
            setProject(e.target.value);
            setFresh(null);
            setError(null);
          }}
        >
          {state.projects.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 border-b">
        {["Status", "Logs", "Compose", "Members"].map((t) => (
          <span
            key={t}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              t === "Members" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
            }`}
          >
            {t}
          </span>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              {members.map((m) => (
                <tr key={m.email} className="border-b last:border-0">
                  <td className="py-2">{m.email}</td>
                  <td className="py-2 w-32">
                    <RoleSelect value={m.role} onChange={(r) => setRole(m.email, project, r)} />
                  </td>
                  <td className="py-2 text-right w-56">
                    <ConfirmButton
                      label="Remove"
                      confirmLabel={`Remove from ${project}`}
                      onConfirm={() => remove(m.email, project)}
                    />
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td className="py-2 text-muted-foreground">No collaborators yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-3">
            Admins ({admins.map((a) => a.email).join(", ")}) have full access to every project.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submit} className="flex gap-2 items-start">
            <Input
              aria-label="Email"
              placeholder="collaborator@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="pt-0.5">
              <RoleSelect value={role} onChange={setRoleDraft} />
            </div>
            <Button type="submit">Create invitation link</Button>
          </form>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {fresh && <InviteLinkBox invitation={fresh} onDone={() => setFresh(null)} />}

          <table className="w-full text-sm">
            <tbody>
              {open.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="py-2">{i.email}</td>
                  <td className="py-2 w-24">{i.role}</td>
                  <td className="py-2 w-44">
                    <StatusBadge status={statusOf(i)} />{" "}
                    {statusOf(i) === "pending" && (
                      <span className="text-xs text-muted-foreground">{expiresIn(i)}</span>
                    )}
                  </td>
                  <td className="py-2 text-right w-64">
                    <Button size="sm" variant="ghost" onClick={() => setFresh(regenerate(i.id) ?? null)}>
                      New link
                    </Button>
                    {statusOf(i) === "pending" && (
                      <ConfirmButton label="Cancel" confirmLabel="Cancel invitation" onConfirm={() => cancel(i.id)} />
                    )}
                  </td>
                </tr>
              ))}
              {open.length === 0 && (
                <tr>
                  <td className="py-2 text-muted-foreground">No open invitations.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
