// PROTOTYPE - what the invitee sees when opening an invitation link.
// Pick an invitation and who opens the link; the screen follows from both.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { selectClass } from "./shared";
import { statusOf, useStore } from "./store";

type Visitor = "signed-out" | "signed-in-invited" | "signed-in-other";

export function Invitee() {
  const { state, accept } = useStore();
  const [id, setId] = useState(state.invitations[0]!.id);
  const [visitor, setVisitor] = useState<Visitor>("signed-out");
  const [generic, setGeneric] = useState(false);
  const [accepted, setAccepted] = useState<string | null>(null);

  const inv = state.invitations.find((i) => i.id === id) ?? state.invitations[0]!;
  const status = statusOf(inv);
  const hasAccount = state.accounts.some((a) => a.email === inv.email);
  const isMember = state.memberships.some((m) => m.email === inv.email && m.project === inv.project);
  const otherEmail = "someone.else@example.com";

  function doAccept() {
    accept(inv.id);
    setAccepted(inv.id);
  }

  let screen: React.ReactNode;
  if (accepted === inv.id) {
    screen = (
      <Shell title={`You joined ${inv.project}`}>
        <p className="text-sm">
          You're a {inv.role} on <span className="font-mono">{inv.project}</span>. Alfredo opens the project page next.
        </p>
        {!hasAccount || visitor === "signed-out" ? (
          <p className="text-xs text-muted-foreground">
            New accounts see the optional two-factor authentication reminder on the dashboard.
          </p>
        ) : null}
        <Button>Open {inv.project}</Button>
      </Shell>
    );
  } else if (status !== "pending") {
    const signedInMember = status === "consumed" && visitor === "signed-in-invited" && isMember;
    const specific = {
      expired: "This invitation expired. Invitation links work for seven days.",
      canceled: "This invitation was canceled.",
      consumed: "This invitation link was already used.",
    }[status];
    screen = signedInMember ? (
      <Shell title={`You already have access to ${inv.project}`}>
        <Button>Open {inv.project}</Button>
      </Shell>
    ) : (
      <Shell title="This invitation link doesn't work">
        <p className="text-sm">{generic ? "The link is no longer valid." : specific}</p>
        <p className="text-sm text-muted-foreground">Ask the Admin who invited you for a new link.</p>
        {status === "consumed" && visitor === "signed-out" && <Button variant="outline">Sign in</Button>}
      </Shell>
    );
  } else if (visitor === "signed-in-other") {
    screen = (
      <Shell title="This invitation is for a different account">
        <p className="text-sm">
          You're signed in as <strong>{otherEmail}</strong>. This invitation is for <strong>{inv.email}</strong>.
        </p>
        <p className="text-sm text-muted-foreground">
          To accept the invitation, sign out and continue as {inv.email}. The invitation stays valid.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => setVisitor("signed-out")}>Sign out and continue</Button>
          <Button variant="ghost">Stay signed in</Button>
        </div>
      </Shell>
    );
  } else if (visitor === "signed-in-invited") {
    screen = (
      <Shell title={`Join ${inv.project}?`}>
        <p className="text-sm">
          You're invited to <span className="font-mono">{inv.project}</span> as {inv.role}.
        </p>
        <RoleBlurb role={inv.role} />
        <Button onClick={doAccept}>Join {inv.project}</Button>
      </Shell>
    );
  } else if (hasAccount) {
    screen = (
      <Shell title={`Sign in to join ${inv.project}`}>
        <p className="text-sm">
          You're invited to <span className="font-mono">{inv.project}</span> as {inv.role}.
        </p>
        <Input aria-label="Email" value={inv.email} disabled />
        <Input aria-label="Password" type="password" placeholder="Password" />
        <p className="text-xs text-muted-foreground">Accounts with two-factor authentication enter a code next.</p>
        <Button onClick={doAccept}>Sign in and join</Button>
      </Shell>
    );
  } else {
    screen = (
      <Shell title={`Create your account to join ${inv.project}`}>
        <p className="text-sm">
          You're invited to <span className="font-mono">{inv.project}</span> as {inv.role}.
        </p>
        <RoleBlurb role={inv.role} />
        <Input aria-label="Email" value={inv.email} disabled />
        <Input aria-label="Password" type="password" placeholder="Password (8 characters or more)" />
        <Input aria-label="Confirm password" type="password" placeholder="Confirm password" />
        <Button onClick={doAccept}>Create account and join</Button>
      </Shell>
    );
  }

  return (
    <div className="p-8 grid grid-cols-[20rem_1fr] gap-8">
      <aside className="space-y-4 text-sm">
        <h2 className="font-semibold">Scenario</h2>
        <label className="block space-y-1">
          <span>Invitation link</span>
          <select
            className={`${selectClass} w-full`}
            value={inv.id}
            onChange={(e) => {
              setId(e.target.value);
              setAccepted(null);
            }}
          >
            {state.invitations.map((i) => (
              <option key={i.id} value={i.id}>
                {statusOf(i)}: {i.email} to {i.project}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span>Who opens the link</span>
          <select
            className={`${selectClass} w-full`}
            value={visitor}
            onChange={(e) => {
              setVisitor(e.target.value as Visitor);
              setAccepted(null);
            }}
          >
            <option value="signed-out">Signed out</option>
            <option value="signed-in-invited">Signed in as the invited email</option>
            <option value="signed-in-other">Signed in as a different email</option>
          </select>
        </label>
        <label className="flex gap-2 items-center">
          <input type="checkbox" checked={generic} onChange={(e) => setGeneric(e.target.checked)} />
          One generic message for expired, canceled, and used links
        </label>
        <p className="text-xs text-muted-foreground">
          {inv.email} {hasAccount ? "has an account" : "has no account yet"}. Link status: {status}.
        </p>
      </aside>
      <div className="flex justify-center pt-8">{screen}</div>
    </div>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="w-[26rem] h-fit">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function RoleBlurb({ role }: { role: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      {role === "Viewer"
        ? "Viewers read dashboards, status, and service logs."
        : "Operators read dashboards, status, and service logs, and can deploy, roll back, and start, stop, or restart services."}
    </p>
  );
}
