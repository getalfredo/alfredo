// PROTOTYPE - variant C: an icon rail, a list pane, and a detail pane. A Workspace opens as a drawer over its project.
import { Layers, LayoutDashboard, Package, Server, Users, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { attention, checks, mail, phases, porters, projects, shop, trays, type Nav, type Screen } from "./data";
import { Badge, Dot, Meter, Spark, porterBadges } from "./shared";

export const name = "Rail, list, and detail panes";

export function Variant({ screen, go }: Nav) {
  const rail: [string, ReactNode, Screen | null][] = [
    ["Dashboard", <LayoutDashboard className="size-5" />, "dashboard"],
    ["Projects", <Package className="size-5" />, "project"],
    ["Porters", <Server className="size-5" />, "porters"],
    ["Trays", <Layers className="size-5" />, null],
    ["People", <Users className="size-5" />, null],
  ];
  return (
    <div className="flex h-screen overflow-hidden bg-background text-sm">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-1 bg-zinc-950 py-3 text-zinc-400">
        <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-white font-bold text-zinc-950">A</div>
        {rail.map(([label, icon, to]) => (
          <button
            key={label}
            title={label}
            onClick={() => to && go(to)}
            className={cn(
              "flex w-14 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px]",
              to === screen || (to === "project" && screen === "workspace") ? "bg-zinc-800 text-white" : "hover:text-white",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>
      {screen === "dashboard" && <Dashboard go={go} />}
      {screen === "porters" && <Porters />}
      {(screen === "project" || screen === "workspace") && <Project go={go} drawer={screen === "workspace"} />}
    </div>
  );
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col border-r last:border-r-0">
      <h2 className="border-b px-4 py-3 font-semibold">{title}</h2>
      <div className="flex-1 space-y-2 overflow-auto bg-muted/40 p-3">{children}</div>
    </div>
  );
}

const tile = "block w-full rounded-lg border bg-card p-3 text-left hover:border-foreground/30";

function Dashboard({ go }: { go: Nav["go"] }) {
  return (
    <div className="flex min-w-0 flex-1">
      <Column title={`Needs attention · ${attention.length}`}>
        {attention.map((a, i) => (
          <button key={i} className={cn(tile, "border-l-4", a.health === "down" ? "border-l-red-500" : "border-l-amber-500")} onClick={() => go(a.to)}>
            <div className="font-medium">{a.subject}</div>
            <div className="text-muted-foreground">{a.problem}</div>
          </button>
        ))}
      </Column>
      <Column title="Projects">
        {projects.map((p, i) => (
          <button key={p.slug} className={tile} onClick={() => go("project")}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <Dot h={p.health} />
                {p.name}
              </span>
              <Spark seed={i + 3} className="h-6 w-20" />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
              {p.services.map((s) => (
                <span key={s.name} className="flex items-center gap-1">
                  <Dot h={s.health} />
                  {s.name}
                </span>
              ))}
            </div>
            <div className="mt-2 text-muted-foreground">
              {p.deploy.ok ? "Deployed" : `Failed in ${phases[p.deploy.failedPhase]}`} {p.deploy.when}
            </div>
            {p.workspaces.map((w) => (
              <div key={w.name} className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                <Dot h={w.health} />
                {w.type}: {w.reason}
              </div>
            ))}
          </button>
        ))}
      </Column>
      <Column title="Infrastructure">
        {porters.map((p, i) => (
          <button key={p.name} className={tile} onClick={() => go("porters")}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <Dot h={p.online ? "ok" : "down"} />
                {p.name} <span className="font-normal text-muted-foreground">v{p.version}</span>
              </span>
              <Spark seed={i + 11} className="h-6 w-20" gapAt={p.online ? undefined : 20} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">{porterBadges(p)}</div>
          </button>
        ))}
        {trays.map((t) => (
          <div key={t.name} className={tile}>
            <span className="flex items-center gap-2 font-medium">
              <Dot h={t.health} />
              {t.name}
            </span>
            <div className="mt-1 text-muted-foreground">{t.metric}</div>
          </div>
        ))}
      </Column>
    </div>
  );
}

function ListPane({ title, action, children }: { title: string; action: string; children: ReactNode }) {
  return (
    <div className="flex w-72 shrink-0 flex-col border-r bg-muted/40">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button className="text-muted-foreground hover:text-foreground">+ {action}</button>
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function Porters() {
  const sel = porters[1]!;
  return (
    <>
      <ListPane title="Porters" action="Add">
        {porters.map((p) => (
          <div key={p.name} className={cn("border-b px-4 py-3", p === sel && "bg-background")}>
            <div className="flex items-center gap-2 font-medium">
              <Dot h={p.online ? "ok" : "down"} />
              {p.name}
              <span className="ml-auto text-xs font-normal text-muted-foreground">v{p.version}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{p.online ? "Connected" : `Offline, last seen ${p.lastSeen}`}</div>
            <div className="mt-2 flex flex-wrap gap-1">{porterBadges(p)}</div>
          </div>
        ))}
      </ListPane>
      <div className="min-w-0 flex-1 space-y-6 overflow-auto p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{sel.name}</h1>
          {porterBadges(sel)}
          <span className="ml-auto text-muted-foreground">
            {sel.docker} Docker · {sel.stacks} Stacks
          </span>
        </div>
        <div className="flex items-end gap-8 rounded-lg border p-4">
          <Meter label="CPU" value={sel.cpu} />
          <Meter label="Memory" value={sel.mem} />
          <Meter label="Disk" value={sel.disk} />
          <Spark seed={12} className="ml-auto h-12 w-64" />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Machine</h2>
            <span className="flex items-center gap-3 text-muted-foreground">
              Last run 3 hours ago
              <Button variant="outline" size="sm">
                Re-check
              </Button>
            </span>
          </div>
          <div className="divide-y rounded-lg border">
            {checks.map((c) => (
              <div key={c.name} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <Badge tone={c.result === "Pass" ? "ok" : c.result === "Fail" ? "down" : "warn"}>{c.result}</Badge>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">{c.why}</span>
                </div>
                {c.fix && <pre className="mt-2 overflow-auto rounded bg-muted px-3 py-2 text-xs">{c.fix}</pre>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Project({ go, drawer }: { go: Nav["go"]; drawer: boolean }) {
  const p = shop;
  return (
    <>
      <ListPane title="Projects" action="New">
        {projects.map((x) => (
          <div key={x.slug} className={cn("border-b px-4 py-3", x === p && "bg-background")}>
            <div className="flex items-center gap-2 font-medium">
              <Dot h={x.health} />
              {x.name}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {x.deploy.ok ? "Deployed" : `Failed in ${phases[x.deploy.failedPhase]}`} {x.deploy.when} · {x.porter}
            </div>
          </div>
        ))}
      </ListPane>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div className="h-full space-y-6 overflow-auto p-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{p.name}</h1>
            <span className="text-muted-foreground">
              {p.kind} · {p.branch} · {p.porter}
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm">
                Roll back
              </Button>
              <Button size="sm">Deploy</Button>
            </div>
          </div>
          <div className="flex overflow-hidden rounded-lg border">
            {phases.map((ph) => (
              <div key={ph} className="flex-1 border-r bg-emerald-500/10 px-3 py-2 last:border-r-0">
                <div className="text-xs text-muted-foreground">Done</div>
                <div className="font-medium">{ph}</div>
              </div>
            ))}
            <div className="flex items-center px-4 text-muted-foreground">
              <code className="text-xs">{p.deploy.commit}</code>, {p.deploy.when}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h2 className="mb-2 font-semibold">Services</h2>
              <div className="divide-y rounded-lg border">
                {p.services.map((s) => (
                  <div key={s.name} className="flex items-center gap-3 px-4 py-2.5">
                    <Dot h={s.health} />
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground">
                      {s.state} · {s.cpu} · {s.mem}
                    </span>
                    <Spark seed={7} className="ml-auto h-6 w-20" />
                  </div>
                ))}
              </div>
              <h2 className="mt-6 mb-2 font-semibold">Routes</h2>
              <div className="rounded-lg border px-4 py-2.5">
                {p.routes.map((r) => (
                  <div key={r.hostname} className="flex items-center gap-3">
                    <Dot h={r.health} />
                    <span className="font-medium">{r.hostname}</span>
                    <span className="ml-auto text-muted-foreground">{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-2 font-semibold">Workspaces</h2>
              <div className="space-y-2">
                {p.workspaces.map((w) => (
                  <button key={w.name} className={tile} onClick={() => go("workspace")}>
                    <span className="flex items-center gap-2 font-medium">
                      <Dot h={w.health} />
                      {w.type} · {w.name}
                    </span>
                    <div className="mt-1 text-muted-foreground">{w.reason}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        {drawer && (
          <aside className="absolute inset-y-0 right-0 w-[32rem] space-y-5 overflow-auto border-l bg-background p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">
                {mail.type} · {mail.name}
              </h2>
              <Badge tone="warn">Degraded</Badge>
              <button className="ml-auto" aria-label="Close" onClick={() => go("project")}>
                <X className="size-4" />
              </button>
            </div>
            <p className="text-muted-foreground">{mail.reason}</p>
            <div className="flex gap-6">
              {mail.metrics.map((m) => (
                <div key={m.label}>
                  <div className="text-xs text-muted-foreground">{m.label}</div>
                  <div className="text-lg font-semibold">{m.value}</div>
                </div>
              ))}
            </div>
            <div>
              <h3 className="mb-2 font-semibold">shop.example.com</h3>
              <div className="divide-y rounded-lg border">
                {mail.dns.map((d) => (
                  <div key={d.record} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Dot h={d.ok ? "ok" : "warn"} />
                      <span className="font-medium">{d.record}</span>
                      <span className="ml-auto text-muted-foreground">{d.ok ? "Found" : "Missing"}</span>
                    </div>
                    {!d.ok && <pre className="mt-2 rounded bg-muted px-2 py-1 text-xs">{d.value}</pre>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Mailboxes</h3>
              <div className="divide-y rounded-lg border">
                {mail.mailboxes.map((m) => (
                  <div key={m.address} className="px-3 py-2">
                    <code className="text-xs">{m.address}</code>
                    {m.note && <div className="text-xs text-muted-foreground">{m.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
