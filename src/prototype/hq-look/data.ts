// PROTOTYPE - mock data for the HQ look prototype. Nothing here is real.

export type Health = "ok" | "warn" | "down" | "unknown";
export type Screen = "dashboard" | "porters" | "project" | "workspace";
export interface Nav {
  screen: Screen;
  go: (screen: Screen) => void;
}

export const user = "alper@example.com";

export const porters = [
  {
    name: "hq-1",
    isHq: true,
    online: true,
    lastSeen: "now",
    version: "1.0.0",
    encrypted: true,
    machine: "Passing",
    machineHealth: "ok" as Health,
    cpu: 23,
    mem: 48,
    disk: 37,
    stacks: 2,
    docker: "Rootless",
  },
  {
    name: "dover",
    isHq: false,
    online: true,
    lastSeen: "now",
    version: "1.0.0",
    encrypted: false,
    machine: "2 failing",
    machineHealth: "down" as Health,
    cpu: 61,
    mem: 72,
    disk: 55,
    stacks: 4,
    docker: "Rootless",
  },
  {
    name: "windsor",
    isHq: false,
    online: false,
    lastSeen: "14 minutes ago",
    version: "0.9.4",
    encrypted: true,
    machine: "Passing (stale)",
    machineHealth: "unknown" as Health,
    cpu: 0,
    mem: 0,
    disk: 81,
    stacks: 1,
    docker: "Rootful",
  },
];

export const checks = [
  { name: "SSH root login disabled", result: "Pass", why: "Stops direct root sign-in over SSH.", fix: "" },
  {
    name: "SSH password authentication disabled",
    result: "Fail",
    why: "Passwords can be guessed. Keys can't.",
    fix: "sudo sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && sudo systemctl reload ssh",
  },
  { name: "Non-root admin user", result: "Pass", why: "Daily work shouldn't run as root.", fix: "" },
  { name: "Host firewall active", result: "Pass", why: "Blocks ports that you didn't open on purpose.", fix: "" },
  {
    name: "Intrusion protection active",
    result: "Unknown (needs root)",
    why: "Bans addresses that keep failing to sign in.",
    fix: "sudo apt install fail2ban && sudo systemctl enable --now fail2ban",
  },
  { name: "Automatic security updates", result: "Pass", why: "Applies security patches without you.", fix: "" },
  { name: "Time sync", result: "Pass", why: "Certificates and 2FA codes need a correct clock.", fix: "" },
  { name: "Rootless Docker", result: "Pass", why: "A container escape doesn't become root.", fix: "" },
];

export const phases = ["Fetch", "Build", "Release", "Start", "Health"];

export const projects = [
  {
    name: "Shop",
    slug: "shop",
    porter: "dover",
    kind: "Railpack",
    repository: "git@github.com:acme/shop.git",
    branch: "main",
    health: "warn" as Health,
    services: [{ name: "app", state: "running", health: "ok" as Health, cpu: "12%", mem: "310 MB" }],
    deploy: { ok: true, failedPhase: -1, commit: "a41c9e2", when: "2 hours ago", by: "alper@example.com" },
    workspaces: [
      { name: "Mail", type: "Purelymail", health: "warn" as Health, reason: "DNS checks 3/4: DMARC record missing" },
      { name: "Backend", type: "Convex", health: "ok" as Health, reason: "Version 1.27.0" },
    ],
    routes: [{ hostname: "shop.example.com", target: "app:3000", status: "Certificate valid", health: "ok" as Health }],
    drift: false,
  },
  {
    name: "Blog",
    slug: "blog",
    porter: "hq-1",
    kind: "Compose",
    repository: "git@github.com:acme/blog.git",
    branch: "main",
    health: "down" as Health,
    services: [
      { name: "web", state: "running", health: "ok" as Health, cpu: "3%", mem: "120 MB" },
      { name: "db", state: "running", health: "ok" as Health, cpu: "1%", mem: "210 MB" },
      { name: "worker", state: "exited (1)", health: "down" as Health, cpu: "0%", mem: "0 MB" },
    ],
    deploy: { ok: false, failedPhase: 1, commit: "9be02f7", when: "12 minutes ago", by: "Webhook" },
    workspaces: [],
    routes: [{ hostname: "blog.example.com", target: "web:8080", status: "Certificate valid", health: "ok" as Health }],
    drift: false,
  },
  {
    name: "Shop staging",
    slug: "shop-staging",
    porter: "dover",
    kind: "Railpack",
    repository: "git@github.com:acme/shop.git",
    branch: "staging",
    health: "warn" as Health,
    services: [{ name: "app", state: "running", health: "ok" as Health, cpu: "2%", mem: "280 MB" }],
    deploy: { ok: true, failedPhase: -1, commit: "77d3a10", when: "3 days ago", by: "alper@example.com" },
    workspaces: [{ name: "Backend", type: "Convex", health: "ok" as Health, reason: "Version 1.27.0" }],
    routes: [
      { hostname: "staging.shop.example.com", target: "app:3000", status: "DNS doesn't point here", health: "warn" as Health },
    ],
    drift: true,
  },
];

export const shop = projects[0]!;

export const trays = [
  { name: "Purelymail", detail: "Connected account", health: "warn" as Health, metric: "Credit $1.20", workspaces: 1 },
  { name: "Convex on dover", detail: "Self-hosted on dover", health: "ok" as Health, metric: "Version 1.27.0", workspaces: 2 },
];

export const attention: { subject: string; problem: string; health: Health; to: Screen; admin: boolean }[] = [
  { subject: "Blog", problem: "Deploy failed in the Build phase", health: "down", to: "project", admin: false },
  { subject: "Shop / Mail", problem: "Degraded: DMARC record missing", health: "warn", to: "workspace", admin: false },
  { subject: "Shop staging", problem: "Stack drift: 1 service differs from the deployed revision", health: "warn", to: "project", admin: false },
  { subject: "Shop staging", problem: "Route staging.shop.example.com: DNS doesn't point here", health: "warn", to: "project", admin: false },
  { subject: "Porter windsor", problem: "Disconnected, last seen 14 minutes ago. Behind HQ's version.", health: "down", to: "porters", admin: true },
  { subject: "Porter dover", problem: "2 Baseline checks failing", health: "warn", to: "porters", admin: true },
  { subject: "Purelymail", problem: "Account credit low: $1.20", health: "warn", to: "workspace", admin: true },
];

// The Shop project's Mail Workspace, in the Purelymail Tray.
export const mail = {
  name: "Mail",
  project: "Shop",
  type: "Purelymail",
  health: "warn" as Health,
  reason: "DNS checks 3/4: DMARC record missing",
  metrics: [
    { label: "Domains", value: "1" },
    { label: "Mailboxes", value: "3" },
    { label: "DNS checks", value: "3/4" },
  ],
  outputs: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD (secret)"],
  dns: [
    { record: "MX", ok: true, value: "mailserver.purelymail.com" },
    { record: "SPF", ok: true, value: "v=spf1 include:_spf.purelymail.com ~all" },
    { record: "DKIM", ok: true, value: "purelymail1._domainkey" },
    { record: "DMARC", ok: false, value: "_dmarc  TXT  v=DMARC1; p=quarantine" },
  ],
  mailboxes: [
    { address: "app@shop.example.com", note: "SMTP mailbox for the application" },
    { address: "hello@shop.example.com", note: "" },
    { address: "orders@shop.example.com", note: "" },
  ],
};

// Deterministic fake series for the small charts.
export function series(seed: number, n = 32): number[] {
  let x = seed * 9301 + 49297;
  const out: number[] = [];
  let v = 40 + (seed % 30);
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    v = Math.max(5, Math.min(95, v + (x / 233280 - 0.5) * 22));
    out.push(v);
  }
  return out;
}
