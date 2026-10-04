// PROTOTYPE - Variant C: an access matrix. People are rows, projects are columns,
// and every cell is the control. Granting access in a cell creates an invitation.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InviteLinkBox, selectClass } from "./shared";
import { expiresIn, statusOf, useStore, type Invitation, type Role } from "./store";

export const name = "Access matrix";

export function VariantC() {
  const { state, invite, cancel, regenerate, setRole, remove } = useStore();
  const [extraRows, setExtraRows] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [links, setLinks] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const openInvitations = state.invitations.filter((i) => ["pending", "expired"].includes(statusOf(i)));
  const collaborators = Array.from(
    new Set([
      ...state.accounts.filter((a) => !a.admin).map((a) => a.email),
      ...openInvitations.map((i) => i.email),
      ...extraRows,
    ]),
  );

  function onCell(email: string, project: string, value: string) {
    const member = state.memberships.find((m) => m.email === email && m.project === project);
    const inv = openInvitations.find((i) => i.email === email && i.project === project);
    setError(null);
    if (member) {
      if (value === "none") remove(email, project);
      else setRole(email, project, value as Role);
      return;
    }
    if (value === "none") {
      if (inv) cancel(inv.id);
      return;
    }
    if (value === "relink" && inv) {
      const next = regenerate(inv.id);
      if (next) setLinks((l) => [next, ...l]);
      return;
    }
    const result = invite(project, email, value as Role);
    if (result.ok) setLinks((l) => [result.invitation, ...l]);
    else setError(result.error);
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Access</h1>
        <p className="text-sm text-muted-foreground">
          Set a role in a cell. Access for someone who isn't a member yet starts as an invitation link.
        </p>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-3 font-medium">Person</th>
              {state.projects.map((p) => (
                <th key={p} className="p-3 font-medium font-mono">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.accounts
              .filter((a) => a.admin)
              .map((a) => (
                <tr key={a.email} className="border-b text-muted-foreground">
                  <td className="p-3">{a.email}</td>
                  <td className="p-3" colSpan={state.projects.length}>
                    Admin - full access to every project
                  </td>
                </tr>
              ))}
            {collaborators.map((email) => {
              const hasAccount = state.accounts.some((a) => a.email === email);
              return (
                <tr key={email} className="border-b last:border-0">
                  <td className="p-3">
                    {email}
                    {!hasAccount && <span className="block text-xs text-muted-foreground">No account yet</span>}
                  </td>
                  {state.projects.map((project) => {
                    const member = state.memberships.find((m) => m.email === email && m.project === project);
                    const inv = openInvitations.find((i) => i.email === email && i.project === project);
                    const pending = inv && statusOf(inv) === "pending";
                    return (
                      <td key={project} className="p-3 align-top">
                        <select
                          aria-label={`${email} on ${project}`}
                          className={`${selectClass} ${inv ? "border-dashed border-yellow-600/60" : ""} ${
                            !member && !inv ? "text-muted-foreground" : ""
                          }`}
                          value={member ? member.role : inv ? "invited" : "none"}
                          onChange={(e) => onCell(email, project, e.target.value)}
                        >
                          {inv && !member && (
                            <option value="invited">
                              {pending ? `Invited as ${inv.role}` : `Invitation expired (${inv.role})`}
                            </option>
                          )}
                          {inv && !member && <option value="relink">New link</option>}
                          <option value="none">{inv && !member ? "Cancel invitation" : "No access"}</option>
                          {(!inv || member) && <option value="Viewer">Viewer</option>}
                          {(!inv || member) && <option value="Operator">Operator</option>}
                        </select>
                        {pending && <span className="block text-xs text-muted-foreground mt-1">{expiresIn(inv)}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr>
              <td className="p-3" colSpan={state.projects.length + 1}>
                <form
                  className="flex gap-2 max-w-md"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const email = newEmail.trim().toLowerCase();
                    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address.");
                    setError(null);
                    setExtraRows((r) => [...r, email]);
                    setNewEmail("");
                  }}
                >
                  <Input
                    aria-label="Email"
                    placeholder="Add a person by email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                  <Button type="submit" variant="outline">
                    Add row
                  </Button>
                </form>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {links.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Links to send ({links.length})</h2>
          {links.map((l) => (
            <InviteLinkBox
              key={l.id}
              invitation={l}
              onDone={() => setLinks((all) => all.filter((x) => x.id !== l.id))}
            />
          ))}
        </section>
      )}
    </div>
  );
}
