// PROTOTYPE - variant B: a top bar, full-width dense tables, no cards. The project page is one long page with section links.
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { attention, mail, phases, porters, projects, shop, trays, user, type Nav, type Screen } from "./data";
import { Badge, Dot, Spark, porterBadges } from "./shared";

export const name = "Top bar and dense tables";

const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground";
const td = "px-3 py-2 align-middle";

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Variant({ screen, go }: Nav) {
  const tabs: [string, Screen | null][] = [
    ["Dashboard", "dashboard"],
    ["Projects", "project"],
    ["Porters", "porters"],
    ["Trays", null],
    ["People", null],
  ];
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-12 items-center gap-6 border-b bg-primary px-6 text-sm text-primary-foreground">
        <span className="font-semibold">Alfredo</span>
        {tabs.map(([label, to]) => (
          <button
            key={label}
            onClick={() => to && go(to)}
            className={cn(
              "h-12 border-b-2",
              to === screen || (to === "project" && screen === "workspace") ? "border-primary-foreground" : "border-transparent opacity-70 hover:opacity-100",
            )}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto opacity-70">{user}</span>
      </header>
      <main className="mx-auto max-w-7xl space-y-8 px-6 py-6 text-sm">
        {screen === "dashboard" && <Dashboard go={go} />}
        {screen === "porters" && <Porters />}
        {screen === "project" && <Project go={go} />}
        {screen === "workspace" && <Workspace go={go} />}
      </main>
    </div>
  );
}

function Dashboard({ go }: { go: Nav["go"] }) {
  return (
    <>
      <Section title={`Needs attention (${attention.length})`}>
        <table className="w-full">
          <tbody className="divide-y">
            {attention.map((a, i) => (
              <tr key={i} className="cursor-pointer hover:bg-accent/50" onClick={() => go(a.to)}>
                <td className={cn(td, "w-24")}>
                  <Badge tone={a.health}>{a.health === "down" ? "Failed" : "Warning"}</Badge>
                </td>
                <td className={cn(td, "w-40 font-medium")}>{a.subject}</td>
                <td className={td}>{a.problem}</td>
                <td className={cn(td, "w-16 text-right text-muted-foreground")}>Open →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Projects">
        <table className="w-full">
          <thead>
            <tr>
              {["Project", "Services", "Last deploy", "Workspaces", "CPU, 24 hours", "Memory, 24 hours"].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {projects.map((p, i) => (
              <tr key={p.slug} className="cursor-pointer hover:bg-accent/50" onClick={() => go("project")}>
                <td className={cn(td, "font-medium")}>
                  {p.name} {p.drift && <Badge tone="warn">Drift</Badge>}
                </td>
                <td className={td}>
                  {p.services.map((s) => (
                    <span key={s.name} className="mr-3 inline-flex items-center gap-1.5">
                      <Dot h={s.health} />
                      {s.name}
                    </span>
                  ))}
                </td>
                <td className={td}>
                  <span className={p.deploy.ok ? "" : "text-red-600 dark:text-red-400"}>
                    {p.deploy.ok ? "Succeeded" : `Failed: ${phases[p.deploy.failedPhase]}`}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {p.deploy.when}, <code>{p.deploy.commit}</code>
                  </span>
                </td>
                <td className={td}>
                  {p.workspaces.length === 0 && <span className="text-muted-foreground">None</span>}
                  {p.workspaces.map((w) => (
                    <span key={w.name} className="mr-3 inline-flex items-center gap-1.5">
                      <Dot h={w.health} />
                      {w.type}
                    </span>
                  ))}
                </td>
                <td className={td}>
                  <Spark seed={i + 3} />
                </td>
                <td className={td}>
                  <Spark seed={i + 21} className="text-chart-1" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Infrastructure">
        <PorterTable />
        <table className="mt-4 w-full">
          <thead>
            <tr>
              {["Tray", "Health", "Metrics", "Workspaces"].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {trays.map((t) => (
              <tr key={t.name}>
                <td className={cn(td, "font-medium")}>{t.name}</td>
                <td className={td}>
                  <Badge tone={t.health}>{t.health === "ok" ? "OK" : "Warning"}</Badge>
                </td>
                <td className={td}>{t.metric}</td>
                <td className={td}>{t.workspaces}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}

function PorterTable() {
  return (
    <table className="w-full">
      <thead>
        <tr>
          {["Porter", "Connection", "Version", "Badges", "CPU", "Memory", "Disk", "Stacks", "24 hours"].map((h) => (
            <th key={h} className={th}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y">
        {porters.map((p, i) => (
          <tr key={p.name} className="hover:bg-accent/50">
            <td className={cn(td, "font-medium")}>{p.name}</td>
            <td className={td}>
              <span className="inline-flex items-center gap-1.5">
                <Dot h={p.online ? "ok" : "down"} />
                {p.online ? "Connected" : `Offline, last seen ${p.lastSeen}`}
              </span>
            </td>
            <td className={cn(td, "font-mono text-xs")}>{p.version}</td>
            <td className={td}>
              <span className="flex flex-wrap gap-1">{porterBadges(p)}</span>
            </td>
            <td className={cn(td, "tabular-nums")}>{p.online ? `${p.cpu}%` : "-"}</td>
            <td className={cn(td, "tabular-nums")}>{p.online ? `${p.mem}%` : "-"}</td>
            <td className={cn(td, "tabular-nums")}>{p.disk}%</td>
            <td className={cn(td, "tabular-nums")}>{p.stacks}</td>
            <td className={td}>
              <Spark seed={i + 11} gapAt={p.online ? undefined : 20} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Porters() {
  return (
    <Section title="Porters" action={<Button size="sm">Add Porter</Button>}>
      <PorterTable />
    </Section>
  );
}

function Project({ go }: { go: Nav["go"] }) {
  const p = shop;
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">Projects /</span>
        <h1 className="text-lg font-semibold">{p.name}</h1>
        <Badge>{p.kind}</Badge>
        <code className="text-xs text-muted-foreground">
          {p.repository}#{p.branch}
        </code>
        <Badge>Porter {p.porter}</Badge>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm">
            Roll back
          </Button>
          <Button size="sm">Deploy</Button>
        </div>
      </div>
      <div className="grid grid-cols-[10rem_1fr] gap-8">
        <nav className="sticky top-4 space-y-1 self-start text-muted-foreground">
          {["Deploy", "Services", "Workspaces", "Routes", "Variables", "Operation log", "Members", "Settings"].map((s, i) => (
            <div key={s} className={cn("border-l-2 px-3 py-1", i === 0 ? "border-primary text-foreground" : "border-transparent")}>
              {s}
            </div>
          ))}
        </nav>
        <div className="space-y-8">
          <Section title="Deploy">
            <div className="grid grid-cols-[14rem_1fr] gap-4 pt-3">
              <ol className="space-y-1">
                {phases.map((ph, i) => (
                  <li key={ph} className={cn("flex justify-between rounded px-2 py-1", i === 4 && "bg-muted")}>
                    <span>
                      {i + 1}. {ph}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400">Done</span>
                  </li>
                ))}
              </ol>
              <pre className="overflow-auto rounded bg-zinc-950 p-3 text-xs text-zinc-200">
                {`Health: waiting for app...\napp  running, health check /healthz returned 200\nDeploy a41c9e2 succeeded, 2 hours ago, by ${p.deploy.by}`}
              </pre>
            </div>
          </Section>
          <Section title="Services">
            <table className="w-full">
              <tbody className="divide-y">
                {p.services.map((s) => (
                  <tr key={s.name}>
                    <td className={cn(td, "font-medium")}>{s.name}</td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-1.5">
                        <Dot h={s.health} />
                        {s.state}
                      </span>
                    </td>
                    <td className={cn(td, "tabular-nums")}>CPU {s.cpu}</td>
                    <td className={cn(td, "tabular-nums")}>{s.mem}</td>
                    <td className={td}>
                      <Spark seed={7} />
                    </td>
                    <td className={cn(td, "space-x-3 text-right")}>
                      <button className="underline">Logs</button>
                      <button className="underline">Restart</button>
                      <button className="underline">Stop</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="Workspaces" action={<button className="underline">Add Workspace</button>}>
            <table className="w-full">
              <tbody className="divide-y">
                {p.workspaces.map((w) => (
                  <tr key={w.name} className="cursor-pointer hover:bg-accent/50" onClick={() => go("workspace")}>
                    <td className={cn(td, "font-medium")}>{w.name}</td>
                    <td className={td}>{w.type}</td>
                    <td className={td}>
                      <Badge tone={w.health}>{w.health === "ok" ? "OK" : "Degraded"}</Badge>
                    </td>
                    <td className={cn(td, "text-muted-foreground")}>{w.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="Routes">
            <table className="w-full">
              <tbody>
                {p.routes.map((r) => (
                  <tr key={r.hostname}>
                    <td className={cn(td, "font-medium")}>{r.hostname}</td>
                    <td className={cn(td, "font-mono text-xs")}>{r.target}</td>
                    <td className={td}>
                      <Badge tone={r.health}>{r.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      </div>
    </>
  );
}

function Workspace({ go }: { go: Nav["go"] }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <button className="text-muted-foreground hover:underline" onClick={() => go("project")}>
          Projects / {mail.project} /
        </button>
        <h1 className="text-lg font-semibold">{mail.name}</h1>
        <Badge>{mail.type}</Badge>
        <Badge tone="warn">Degraded</Badge>
        <span className="text-muted-foreground">{mail.reason}</span>
      </div>
      <dl className="grid grid-cols-4 divide-x border-y">
        {mail.metrics.map((m) => (
          <div key={m.label} className="px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{m.value}</dd>
          </div>
        ))}
        <div className="px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Outputs</dt>
          <dd className="font-mono text-xs">{mail.outputs.join(", ")}</dd>
        </div>
      </dl>
      <Section title="Domain shop.example.com: DNS" action={<button className="underline">Check again</button>}>
        <table className="w-full">
          <tbody className="divide-y">
            {mail.dns.map((d) => (
              <tr key={d.record}>
                <td className={cn(td, "w-24 font-medium")}>{d.record}</td>
                <td className={cn(td, "font-mono text-xs")}>{d.value}</td>
                <td className={cn(td, "w-24 text-right")}>
                  <Badge tone={d.ok ? "ok" : "warn"}>{d.ok ? "Found" : "Missing"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Mailboxes" action={<button className="underline">Create mailbox</button>}>
        <table className="w-full">
          <tbody className="divide-y">
            {mail.mailboxes.map((m) => (
              <tr key={m.address}>
                <td className={cn(td, "font-mono text-xs")}>{m.address}</td>
                <td className={cn(td, "text-muted-foreground")}>{m.note}</td>
                <td className={cn(td, "space-x-3 text-right")}>
                  <button className="underline">Reset password</button>
                  <button className="underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
