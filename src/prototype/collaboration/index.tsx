// PROTOTYPE - collaboration UI for "Collaboration UI: invitations and project membership"
// (https://github.com/getalfredo/alfredo/issues/15).
//
// Three variants of the Admin membership screens, switchable via `?variant=`, plus the invitee
// and access-change screens via `?scene=`, on the throwaway `/prototype/collaboration` route.
// All state is in memory and shared across variants. Never merge this into main.
import { useState } from "react";
import { PrototypeSwitcher } from "@/components/PrototypeSwitcher";
import { AccessChange } from "./AccessChange";
import { Invitee } from "./Invitee";
import { StoreProvider, statusOf, useStore } from "./store";
import * as A from "./VariantA";
import * as B from "./VariantB";
import * as C from "./VariantC";

const variants = [
  { key: "A", name: A.name },
  { key: "B", name: B.name },
  { key: "C", name: C.name },
];

const scenes = [
  { key: "admin", label: "Admin: membership screens" },
  { key: "invitee", label: "Invitee: opening a link" },
  { key: "access", label: "Collaborator: access changed" },
];

function useSearchParam(key: string, fallback: string): [string, (value: string) => void] {
  const [value, setValue] = useState(() => new URLSearchParams(window.location.search).get(key) ?? fallback);
  return [
    value,
    (next) => {
      const url = new URL(window.location.href);
      url.searchParams.set(key, next);
      window.history.replaceState(null, "", url);
      setValue(next);
    },
  ];
}

export function CollaborationPrototype() {
  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  );
}

function Root() {
  const [variant, setVariant] = useSearchParam("variant", "A");
  const [scene, setScene] = useSearchParam("scene", "admin");

  return (
    <div className="pb-24">
      <div className="flex items-center gap-2 bg-fuchsia-600 text-white px-4 py-1.5 text-sm">
        <span className="font-semibold mr-2">Prototype</span>
        {scenes.map((s) => (
          <button
            key={s.key}
            onClick={() => setScene(s.key)}
            className={`px-2 py-0.5 rounded ${scene === s.key ? "bg-white text-fuchsia-700" : "hover:bg-white/20"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {scene === "admin" && variant === "A" && <A.VariantA />}
      {scene === "admin" && variant === "B" && <B.VariantB />}
      {scene === "admin" && variant === "C" && <C.VariantC />}
      {scene === "invitee" && <Invitee />}
      {scene === "access" && <AccessChange />}

      <StatePanel />
      {scene === "admin" && <PrototypeSwitcher variants={variants} current={variant} onChange={setVariant} />}
    </div>
  );
}

function StatePanel() {
  const { state, reset } = useStore();
  return (
    <details className="mx-8 mt-8 border rounded-lg text-xs" open>
      <summary className="px-3 py-2 cursor-pointer font-medium">
        State (in memory, shared across variants){" "}
        <button className="underline ml-2" onClick={reset}>
          Reset
        </button>
      </summary>
      <div className="grid grid-cols-3 gap-4 p-3 font-mono">
        <div>
          <div className="font-semibold mb-1">Memberships</div>
          {state.memberships.map((m) => (
            <div key={m.email + m.project}>
              {m.email} / {m.project} / {m.role}
            </div>
          ))}
        </div>
        <div>
          <div className="font-semibold mb-1">Invitations</div>
          {state.invitations.map((i) => (
            <div key={i.id}>
              [{statusOf(i)}] {i.email} / {i.project} / {i.role}
            </div>
          ))}
        </div>
        <div>
          <div className="font-semibold mb-1">Log (newest first)</div>
          {state.log.length === 0 && <div className="text-muted-foreground">No actions yet.</div>}
          {state.log.map((line, n) => (
            <div key={n}>{line}</div>
          ))}
        </div>
      </div>
    </details>
  );
}
