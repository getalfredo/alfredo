// PROTOTYPE - the initial look of HQ, for "Initial look of HQ"
// (https://github.com/getalfredo/alfredo/issues/44).
//
// Three variants of the UI shell and four key screens (dashboard, Porter list, project page,
// Workspace page), switchable via `?variant=` and `?screen=`, on the throwaway `/prototype/hq-look`
// route. All data is mock data, and nothing is saved. Never merge this into main.
import { useState } from "react";
import { PrototypeSwitcher } from "@/components/PrototypeSwitcher";
import type { Screen } from "./data";
import * as A from "./VariantA";
import * as B from "./VariantB";
import * as C from "./VariantC";

const variants = [
  { key: "A", name: A.name, Variant: A.Variant },
  { key: "B", name: B.name, Variant: B.Variant },
  { key: "C", name: C.name, Variant: C.Variant },
];

const screens: { key: Screen; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "porters", label: "Porter list" },
  { key: "project", label: "Project page" },
  { key: "workspace", label: "Workspace page" },
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

export function HqLookPrototype() {
  const [variant, setVariant] = useSearchParam("variant", "A");
  const [screen, setScreen] = useSearchParam("screen", "dashboard");
  const [dark, setDark] = useSearchParam("theme", "light");
  const current = variants.find((v) => v.key === variant) ?? variants[0]!;

  document.documentElement.classList.toggle("dark", dark === "dark");

  return (
    <div>
      <current.Variant screen={screen as Screen} go={setScreen} />
      <div className="fixed bottom-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-1 text-xs text-white shadow-lg">
        {screens.map((s) => (
          <button
            key={s.key}
            onClick={() => setScreen(s.key)}
            className={`rounded-full px-2 py-0.5 ${screen === s.key ? "bg-white text-fuchsia-700" : "hover:opacity-70"}`}
          >
            {s.label}
          </button>
        ))}
        <span className="opacity-50">|</span>
        <button className="rounded-full px-2 py-0.5 hover:opacity-70" onClick={() => setDark(dark === "dark" ? "light" : "dark")}>
          {dark === "dark" ? "Light theme" : "Dark theme"}
        </button>
      </div>
      <PrototypeSwitcher variants={variants} current={current.key} onChange={setVariant} />
    </div>
  );
}
