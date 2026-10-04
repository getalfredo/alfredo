// PROTOTYPE - floating variant switcher for throwaway UI prototypes. Not part of any design.
import { useEffect } from "react";

export interface PrototypeVariant {
  key: string;
  name: string;
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: PrototypeVariant[];
  current: string;
  onChange: (key: string) => void;
}) {
  const index = Math.max(0, variants.findIndex((v) => v.key === current));
  const step = (delta: number) => onChange(variants[(index + delta + variants.length) % variants.length]!.key);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.matches("input, textarea, select") || el.isContentEditable)) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-fuchsia-600 text-white px-3 py-1.5 text-sm shadow-lg">
      <button aria-label="Previous variant" className="px-2 hover:opacity-70" onClick={() => step(-1)}>
        &larr;
      </button>
      <span className="font-medium whitespace-nowrap">
        {variants[index]!.key} - {variants[index]!.name}
      </span>
      <button aria-label="Next variant" className="px-2 hover:opacity-70" onClick={() => step(1)}>
        &rarr;
      </button>
    </div>
  );
}
