// PROTOTYPE - variant A: a persistent sidebar with projects in it, content in cards, project page with tabs.
import { Boxes, LayoutDashboard, Server, Users, Layers } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { attention, mail, phases, porters, projects, shop, trays, user, type Nav } from "./data";
import { Badge, Dot, Meter, Spark, porterBadges } from "./shared";

export const name = "Sidebar and cards";

export function Variant({ screen, go }: Nav) {
  const item = (label: string, icon: ReactNode, active: boolean, onClick?: () => void) => (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
        active ? "bg-sidebar-accent font-medium" : "text-muted-foreground hover:bg-sidebar-accent/60",
      )}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4">
        <div className="px-2 text-lg font-semibold">Alfredo</div>
        <nav className="space-y-1">{item("Dashboard", <LayoutDashboard className="size-4" />, screen === "dashboard", () => go("dashboard"))}</nav>
        <nav className="space-y-1">
          <div className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Projects</div>
          {projects.map((p) => (
            <div key={p.slug}>
              {item(p.name, <Dot h={p.health} />, p === shop && (screen === "project" || screen === "workspace"), () => go("project"))}
            </div>
          ))}
          <button className="px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground">+ New project</button>
        </nav>
        <nav className="space-y-1">
          <div className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Infrastructure</div>
          {item("Porters", <Server className="size-4" />, screen === "porters", () => go("porters"))}
          {item("Trays", <Layers className="size-4" />, false)}
          {item("People", <Users className="size-4" />, false)}
        </nav>
        <div className="mt-auto px-2 text-xs text-muted-foreground">{user}</div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl space-y-6 p-8">
          {screen === "dashboard" && <Dashboard go={go} />}
          {screen === "porters" && <Porters />}
          {screen === "project" && <Project go={go} />}
          {screen === "workspace" && <Workspace go={go} />}
        </div>
      </main>
    </div>
  );
}

function Dashboard({ go }: { go: Nav["go"] }) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Card className="border-amber-500/40">
        <CardHeader>
          <CardTitle>Needs attention</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {attention.map((a, i) => (
            <button key={i} onClick={() => go(a.to)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-accent/50">
              <Dot h={a.health} />
              <span className="w-32 shrink-0 font-medium">{a.subject}</span>
              <span className="text-muted-foreground">{a.problem}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold">Projects</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p, i) => (
          <Card key={p.slug} className="cursor-pointer gap-4 hover:border-foreground/30" onClick={() => go("project")}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{p.name}</CardTitle>
              <Spark seed={i + 3} />
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-3">
                {p.services.map((s) => (
                  <span key={s.name} className="flex items-center gap-1.5">
                    <Dot h={s.health} />
                    {s.name} <span className="text-muted-foreground">{s.state}</span>
                  </span>
                ))}
              </div>
              <div className="text-muted-foreground">
                {p.deploy.ok ? "Deployed" : `Deploy failed in ${phases[p.deploy.failedPhase]}`} {p.deploy.when} ·{" "}
                <code className="text-xs">{p.deploy.commit}</code>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.workspaces.map((w) => (
                  <span key={w.name} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                    <Dot h={w.health} />
                    {w.type} · {w.name}
                  </span>
                ))}
                {p.drift && <Badge tone="warn">Drift</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-lg font-semibold">Infrastructure</h2>
      <Card>
        <CardContent className="divide-y text-sm">
          {porters.map((p, i) => (
            <div key={p.name} className="flex items-center gap-4 py-3">
              <Dot h={p.online ? "ok" : "down"} />
              <span className="w-24 font-medium">{p.name}</span>
              <span className="w-28 text-muted-foreground">{p.online ? "Connected" : "Offline"}</span>
              <div className="flex flex-1 flex-wrap gap-1.5">{porterBadges(p)}</div>
              <Spark seed={i + 11} gapAt={p.online ? undefined : 20} />
            </div>
          ))}
          {trays.map((t) => (
            <div key={t.name} className="flex items-center gap-4 py-3">
              <Dot h={t.health} />
              <span className="w-24 font-medium">{t.name}</span>
              <span className="flex-1 text-muted-foreground">
                {t.detail} · {t.metric}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function Porters() {
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Porters</h1>
        <Button size="sm">Add Porter</Button>
      </div>
      {porters.map((p, i) => (
        <Card key={p.name} className="gap-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Dot h={p.online ? "ok" : "down"} />
              {p.name}
              <span className="text-sm font-normal text-muted-foreground">
                {p.online ? "Connected" : `Offline, last seen ${p.lastSeen}`} · v{p.version} · {p.stacks} Stacks
              </span>
            </CardTitle>
            <div className="flex gap-1.5">{porterBadges(p)}</div>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <Meter label="CPU" value={p.cpu} />
            <Meter label="Memory" value={p.mem} />
            <Meter label="Disk" value={p.disk} />
            <Spark seed={i + 11} className="ml-auto w-48" gapAt={p.online ? undefined : 20} />
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function Project({ go }: { go: Nav["go"] }) {
  const p = shop;
  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{p.name}</h1>
          <p className="text-sm text-muted-foreground">
            {p.kind} · {p.repository} · {p.branch} · on Porter {p.porter}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Roll back
          </Button>
          <Button size="sm">Deploy</Button>
        </div>
      </div>
      <div className="flex gap-1 border-b">
        {["Overview", "Deploys", "Logs", "Variables", "Routes", "Members", "Settings"].map((t, i) => (
          <button
            key={t}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium",
              i === 0 ? "border-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <Card className="gap-4">
            <CardHeader>
              <CardTitle>Last deploy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center">
                {phases.map((ph, i) => (
                  <div key={ph} className="flex flex-1 items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-xs text-white">✓</span>
                    {ph}
                    {i < phases.length - 1 && <span className="h-px flex-1 bg-border" />}
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground">
                Succeeded {p.deploy.when} · <code className="text-xs">{p.deploy.commit}</code> · by {p.deploy.by}
              </p>
            </CardContent>
          </Card>
          <Card className="gap-4">
            <CardHeader>
              <CardTitle>Services</CardTitle>
            </CardHeader>
            <CardContent className="divide-y text-sm">
              {p.services.map((s) => (
                <div key={s.name} className="flex items-center gap-4 py-2">
                  <Dot h={s.health} />
                  <span className="w-20 font-medium">{s.name}</span>
                  <span className="text-muted-foreground">{s.state}</span>
                  <span className="ml-auto text-muted-foreground">
                    CPU {s.cpu} · {s.mem}
                  </span>
                  <Spark seed={7} />
                  <Button variant="outline" size="sm">
                    Restart
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="gap-4">
            <CardHeader>
              <CardTitle>Routes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {p.routes.map((r) => (
                <div key={r.hostname} className="flex items-center gap-3">
                  <Dot h={r.health} />
                  <span className="font-medium">{r.hostname}</span>
                  <span className="text-muted-foreground">→ {r.target}</span>
                  <span className="ml-auto text-muted-foreground">{r.status}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Boxes className="size-4" /> Workspaces
          </h2>
          {p.workspaces.map((w) => (
            <Card key={w.name} className="cursor-pointer gap-2 py-4 hover:border-foreground/30" onClick={() => go("workspace")}>
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Dot h={w.health} />
                  {w.type} · {w.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-sm text-muted-foreground">{w.reason}</CardContent>
            </Card>
          ))}
          <Button variant="outline" size="sm" className="w-full">
            Add Workspace
          </Button>
        </div>
      </div>
    </>
  );
}

function Workspace({ go }: { go: Nav["go"] }) {
  return (
    <>
      <div>
        <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => go("project")}>
          {mail.project} /
        </button>
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          {mail.type} · {mail.name} <Badge tone="warn">Degraded</Badge>
        </h1>
        <p className="text-sm text-muted-foreground">{mail.reason}</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {mail.metrics.map((m) => (
          <Card key={m.label} className="gap-1 py-4">
            <CardContent className="px-4">
              <div className="text-xs text-muted-foreground">{m.label}</div>
              <div className="text-2xl font-semibold">{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex gap-1 border-b">
        {["Domains", "Mailboxes", "Routing", "Outputs", "Settings"].map((t, i) => (
          <button
            key={t}
            className={cn("border-b-2 px-4 py-2 text-sm font-medium", i === 0 ? "border-primary" : "border-transparent text-muted-foreground")}
          >
            {t}
          </button>
        ))}
      </div>
      <Card className="gap-4">
        <CardHeader>
          <CardTitle>shop.example.com: setup checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {mail.dns.map((d) => (
            <div key={d.record} className="flex items-center gap-3">
              <Dot h={d.ok ? "ok" : "warn"} />
              <span className="w-16 font-medium">{d.record}</span>
              <code className="flex-1 rounded bg-muted px-2 py-1 text-xs">{d.value}</code>
              <span className="w-20 text-right text-muted-foreground">{d.ok ? "Found" : "Missing"}</span>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm">
              Check DNS again
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
