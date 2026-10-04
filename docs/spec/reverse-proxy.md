# Reverse proxy

Status: agreed in [Reverse proxy manager](https://github.com/getalfredo/alfredo/issues/10). The proxy runs on each Porter, not centrally on HQ. See [the per-Porter proxy ADR](../adr/0003-proxy-on-each-porter.md).

## Concepts

A **Route** maps one public hostname to one Stack service and container port. Its Porter is always the Porter that runs its Stack.

A Porter's **Proxy** is the Caddy container that serves that Porter's Routes on ports 80 and 443. It isn't a Stack: Porter manages it, and no project or Workspace owns it.

The **HQ Porter** is the Porter that runs on the HQ host. Every installation has one.

## Where the proxy runs

Each Porter with **Public routes** turned on runs its own Proxy. Public traffic goes straight to the Porter that runs the service and never passes through HQ. Services keep serving traffic while HQ is down or being upgraded, consistent with the [Porter spec](porter.md#operations-and-disconnection).

**Public routes** is an Admin-only setting on each Porter:

- It's off by default, so build boxes, database hosts, and Porters behind NAT (network address translation) expose nothing.
- It's on by default for the HQ Porter.
- The Proxy container runs only while the setting is on.
- HQ refuses to save a Route whose Stack runs on a Porter with the setting off, and the error names the Porter.
- HQ refuses to turn the setting off while the Porter still has Routes, and it lists the blocking Routes.

## The HQ Porter

The HQ installer also installs a Porter on the same host and enrolls it automatically. Docker is therefore required on the HQ host. [Install & upgrade flow for HQ and Porter](https://github.com/getalfredo/alfredo/issues/17) owns the installer.

The HQ Porter is a normal Porter labeled **HQ host**. It runs Machine checks, and it can host Stacks and self-hosted Trays. Admins can't remove it while HQ runs.

An Admin sets **HQ hostname** in HQ settings. The HQ Porter's Proxy then serves a built-in **HQ route** from that hostname to HQ's local port, and HQ switches to secure cookies. Before the HQ hostname is set, the Admin finishes first-run setup at `http://<ip>:<port>`.

The Proxy reaches HQ through the host's own address, not through loopback. Rootless Docker keeps containers away from the host's loopback interface, and opening it would expose every loopback service on the host to every container.

HQ keeps listening on its own port after the HQ hostname is set. The install guide tells the Admin to close that port in the host firewall, and the **Listening ports** diagnostic in the [machine ops spec](machine-ops.md) shows whether it's still open.

## Routes

A Route has:

- A **hostname**, unique across the installation. HQ rejects a duplicate on save.
- Optional **aliases**, such as `www.shop.example.com`. Each alias redirects to the main hostname.
- A **target**: one service of the owner's Stack and one container port.
- A **TLS** setting: automatic HTTPS, which is the default, or **HTTP only**.

V1 has no path-prefix routing, basic authentication, custom headers, or generated default hostnames. Every hostname is entered by an Admin.

### Owners

Every Route belongs to the owner of its Stack: a project or a self-hosted Workspace.

**Project Routes** are edited by Admins in the project settings and stored in `project.yml`:

```yaml
# projects/shop/project.yml
routes:
  - hostname: shop.example.com
    aliases: [www.shop.example.com]
    service: web
    port: 3000
  - hostname: api.shop.example.com
    service: api
    port: 8080
```

**Workspace Routes** are derived. A self-hosted Tray type's manifest binds each `hostname` config field to a service and port in its compose template. The Admin fills in only the hostnames, and HQ derives one Route per field. Admins never edit derived Routes directly. For self-hosted Convex:

```yaml
# Convex manifest, compiled into HQ
hostnameFields:
  apiHost:       { service: backend,   port: 3210 }
  actionsHost:   { service: backend,   port: 3211 }
  dashboardHost: { service: dashboard, port: 6791 }
```

```yaml
# trays/convex-main/workspaces/shop-prod/workspace.yml
project: shop
config:
  apiHost: convex.shop.example.com
  actionsHost: actions.shop.example.com
  dashboardHost: convex-admin.shop.example.com
```

Workspace outputs can build on these hostnames, so `CONVEX_SELF_HOSTED_URL` becomes `https://convex.shop.example.com`. Connected Tray types, such as Purelymail, have no Routes.

### Permissions

Following the [users spec](users.md), only Admins create, edit, or delete Routes and set Workspace hostnames. Viewers and Operators see their project's Routes read-only: hostname, aliases, target, DNS status, and certificate status.

Admins also get an installation-wide Route list grouped by Porter. It's the fleet view of every public hostname.

## TLS

Routes use automatic HTTPS by default. Caddy obtains Let's Encrypt certificates with HTTP-01 challenges, for the hostname and each alias, and it redirects HTTP to HTTPS.

A Route set to **HTTP only** gets no certificate and no redirect. It suits private networks and setups where something in front of the Porter terminates TLS, consistent with Porter's trusted-network stance.

DNS-01 challenges and wildcard certificates aren't part of v1, because they need DNS provider credentials.

Certificates live in the Proxy's data under Porter's data directory, so they survive restarts and HQ outages. When a Route goes away, Porter doesn't revoke its certificate. Caddy stops renewing it.

## DNS

Alfredo doesn't manage DNS. It checks DNS and tells the Admin what to set.

Porter reports the public IPv4 and IPv6 addresses it detects. An Admin can override them with a **Public address** field on the Porter, for floating IPs, NAT, or load balancers. HQ uses the override when it's set.

Each Route shows two statuses:

- **DNS**: **Points here**, **Points elsewhere**, or **Unresolved**, comparing each hostname and alias with the Porter's public address.
- **Certificate**: whether Caddy holds a valid certificate, with the expiry date or the last issuance error. **HTTP only** Routes show no certificate status.

A new Route shows a setup checklist with the required A and AAAA records, reusing the setup-checklist pattern from the [Trays spec](trays.md#ui). HQ rechecks DNS until the Route passes.

## Proxy configuration

HQ owns the Proxy configuration completely. When any Route changes, HQ renders the full configuration for the affected Porter from the Route definitions in `project.yml` and `workspace.yml`, plus the HQ route. HQ sends it to the Porter as an operation, following the [Porter spec](porter.md#operations-and-disconnection), and Porter applies it with a graceful Caddy reload.

Nothing else edits the configuration. There are no custom snippets and no manual edits. Porter compares the Proxy's configuration with the one HQ last sent and reports drift the same way it does for Stacks, described in the [compose spec](compose.md#drift).

Admins see the Proxy's status and logs on the Porter page.

## Reaching services

Porter creates one Docker network for its Proxy, such as `alfredo-proxy`, and attaches the Proxy and every routed service to it. The Proxy dials `<container>:<port>` on that network.

Routed services need no `ports:` entry, so routing doesn't create published ports that bypass ufw. HQ doesn't rewrite a Stack's own `ports:` entries. On a Porter with **Public routes** on, a deploy fails validation if the Stack publishes port 80 or 443, before it touches running containers.

## Ports 80 and 443

Under rootless Docker, the installer grants the right to bind ports below 1024, and it sets up the daemon so that the Proxy sees real client IP addresses. Both need root once, as [the rootless Docker ADR](../adr/0006-rootless-docker-by-default.md) describes.

ufw applies to the Proxy's ports in rootless mode. On a host with ufw active, the Admin has to allow ports 80 and 443 before Routes work. HQ shows the two commands when the Admin turns on **Public routes**, and HQ never runs them.

If the Proxy can't bind a port, for example because another process holds port 80, Porter reports the error with the process that holds the port. Porter then recreates the Proxy container on the next attempt and doesn't restart the failed one, because a container that failed to bind can come back with no network and no error.

## Applying changes

Route changes apply on save; they don't wait for a deploy, because a Caddy reload doesn't restart the application. If a routed service isn't attached to the proxy network yet, Porter attaches it without a restart. Deploys also attach routed services.

A Route whose target service doesn't exist yet, such as before the first deploy, shows **Waiting for deploy**. It becomes active automatically after the service is deployed. The same status applies when a service is removed from the Stack's source; the Route stays until an Admin removes it.

Removing a project or Workspace removes its Routes, and the next Proxy reload drops them.

## Handoff boundaries

Implementation owns the Caddy configuration format and reload mechanics, the Proxy image version, the proxy network name, public address detection, DNS polling intervals, the drift-check mechanics, and how Porter reports certificate state.

Other decisions cover the adjacent contracts:

- [Projects & deploy flow](https://github.com/getalfredo/alfredo/issues/11): where Stacks run, and therefore which Porter serves each Route, plus any environment-specific hostnames.
- [Install & upgrade flow for HQ and Porter](https://github.com/getalfredo/alfredo/issues/17): installing the HQ Porter and rootless Docker on the HQ host, the port grant, and the firewall guidance for ports 80, 443, and HQ's own port.
- [Unified dashboard](https://github.com/getalfredo/alfredo/issues/20): showing Route and certificate problems across projects, and any alerting on certificate or DNS failures.
