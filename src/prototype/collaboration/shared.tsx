// PROTOTYPE - small pieces the variants share. Layout is never shared.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Invitation, InvitationStatus, Role } from "./store";

export const selectClass =
  "h-8 rounded-md border bg-background px-2 text-sm disabled:opacity-50";

export function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label="Role"
      className={selectClass}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Role)}
    >
      <option value="Viewer">Viewer</option>
      <option value="Operator">Operator</option>
    </select>
  );
}

export function StatusBadge({ status }: { status: InvitationStatus }) {
  const label = { pending: "Pending", expired: "Expired", canceled: "Canceled", consumed: "Accepted" }[status];
  const tone =
    status === "pending"
      ? "bg-yellow-500/10 text-yellow-700"
      : status === "consumed"
        ? "bg-green-500/10 text-green-700"
        : "bg-muted text-muted-foreground";
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tone}`}>{label}</span>;
}

// The link is visible once: HQ keeps only a hash of the invitation token.
export function InviteLinkBox({ invitation, onDone }: { invitation: Invitation; onDone?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-md border border-green-600/40 bg-green-500/5 p-3 space-y-2">
      <p className="text-sm font-medium">
        Invitation link for {invitation.email} - {invitation.role} on {invitation.project}
      </p>
      <div className="flex gap-2">
        <code className="flex-1 rounded bg-muted px-2 py-1.5 text-xs break-all">{invitation.link}</code>
        <Button
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(invitation.link);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Copy the link now and send it to {invitation.email}. Alfredo doesn't send email and can't show this link again.
        The link works once and expires in seven days.
      </p>
      {onDone && (
        <Button size="sm" variant="outline" onClick={onDone}>
          Done
        </Button>
      )}
    </div>
  );
}

// Two-step destructive button: first click arms, second click confirms.
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed)
    return (
      <Button size="sm" variant="ghost" onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  return (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="destructive" onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>
        Keep
      </Button>
    </span>
  );
}
