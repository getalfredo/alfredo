// PROTOTYPE - the few primitives that all variants share. Layout is never shared.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { series, type Health } from "./data";

const dotColor: Record<Health, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  down: "bg-red-500",
  unknown: "bg-zinc-400",
};

export function Dot({ h, className }: { h: Health; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", dotColor[h], className)} />;
}

const badgeTone = {
  neutral: "border-border text-muted-foreground",
  ok: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-500/50 text-amber-700 dark:text-amber-400",
  down: "border-red-500/50 text-red-700 dark:text-red-400",
  unknown: "border-border text-muted-foreground",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs whitespace-nowrap", badgeTone[tone])}>
      {children}
    </span>
  );
}

export function Spark({ seed, className, gapAt }: { seed: number; className?: string; gapAt?: number }) {
  const data = series(seed);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${30 - (v / 100) * 30}`);
  // A gap in the data shows as a gap in the chart.
  const lines = gapAt ? [pts.slice(0, gapAt), pts.slice(gapAt + 5)] : [pts];
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cn("h-8 w-28 text-chart-2", className)} role="img" aria-label="Usage over the last 24 hours">
      {lines.map((l, i) => (
        <polyline key={i} points={l.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

export function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-muted">
        <div className={cn("h-full rounded-full", value > 75 ? "bg-amber-500" : "bg-foreground/60")} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function porterBadges(p: { isHq: boolean; online: boolean; encrypted: boolean; machine: string; machineHealth: Health; version: string }) {
  return (
    <>
      {p.isHq && <Badge>HQ Porter</Badge>}
      <Badge tone={p.machineHealth}>{p.machine}</Badge>
      {!p.encrypted && <Badge tone="warn">Unencrypted connection</Badge>}
      {p.version !== "1.0.0" && <Badge tone="warn">Behind HQ</Badge>}
    </>
  );
}
