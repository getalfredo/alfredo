# Worker-agent patterns in comparable tools

How do comparable self-hosted deploy/orchestration systems solve the control-plane ↔ worker-agent problem? This document surveys Coolify, Dokploy, Portainer (regular and Edge agents), Kamal, and Komodo across six facets — enrollment, authn/z, transport, command execution/streaming, metrics, and self-update — from primary sources only (official docs and the tools' own source trees, fetched 2026-07-12). It exists to feed the Porter contract and security-model decision: HQ (Bun single binary) needs a defined way to enroll, command, and observe Porter (Go single binary) on machines that may be same-host, LAN, or internet.

Citation convention: every claim links to the doc page or source file that owns it. Claims read from source rather than doc prose are marked *(source-inferred)*. Unverifiable facets are marked **unverified**.

---

## Coolify

Model: **agentless SSH from the control plane**, plus an optional metrics sidecar (Sentinel).

### 1. Enrollment / pairing
- Pure SSH enrollment; no agent install to add a server. Requirements: SSH key auth, public key in **root**'s `authorized_keys`, Docker Engine 24+ on the worker ([docs: server introduction](https://coolify.io/docs/knowledge-base/server/introduction)).
- Keys generated in the UI (ED25519/RSA, no passphrase) or supplied ([docs: openssh](https://coolify.io/docs/knowledge-base/server/openssh)). Private keys stored Laravel-`encrypted` in Postgres, materialized to `storage/app/ssh/keys/` with 0600 perms ([app/Models/PrivateKey.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Models/PrivateKey.php)).
- Validation on add: sequential SSH-reachability → OS → Docker checks ([app/Actions/Server/ValidateServer.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Actions/Server/ValidateServer.php)). "Localhost" self-pairs during install: `ssh-keygen` + append to root's `authorized_keys` ([scripts/install.sh](https://raw.githubusercontent.com/coollabsio/coolify/main/scripts/install.sh)).

### 2. Authn/z
- Control plane holds per-server SSH private keys; worker holds only the pubkey — i.e. Coolify gets an **unrestricted root shell**, no command-level granularity *(source-inferred: [SshMultiplexingHelper.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Helpers/SshMultiplexingHelper.php))*.
- Worker→control direction (Sentinel only): per-server `sentinel_token` = Laravel-Crypt-encrypted JSON `{server_uuid}` ([app/Models/ServerSetting.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Models/ServerSetting.php)). The push endpoint has no auth middleware; the controller decrypts the bearer token and exact-matches it ([routes/api.php](https://raw.githubusercontent.com/coollabsio/coolify/main/routes/api.php), [SentinelController.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Http/Controllers/Api/SentinelController.php)).

### 3. Transport security
- Control→worker is OpenSSH, control plane dials as root, with `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null` — **host keys are not verified** ([SshMultiplexingHelper.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Helpers/SshMultiplexingHelper.php)).
- SSH multiplexing (`ControlMaster=auto`, per-server mux socket, `ControlPersist`) for connection reuse (same file).
- NAT/internet option: Cloudflare Tunnel per server, `cloudflared` mapping a hostname to `ssh://localhost:22` ([docs: CF tunnels](https://coolify.io/docs/integrations/cloudflare/tunnels/server-ssh)).
- Sentinel is the only worker-side agent: container with docker.sock + `--pid host`, local API on `127.0.0.1:8888`; it **dials the control plane outbound** (plain Go `http.Client` POST with bearer header; TLS only if `PUSH_ENDPOINT` is https — no custom TLS config, no retries) ([StartSentinel.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Actions/Server/StartSentinel.php), [sentinel pkg/push/push.go](https://raw.githubusercontent.com/coollabsio/sentinel/main/pkg/push/push.go), [sentinel pkg/config/config.go](https://raw.githubusercontent.com/coollabsio/sentinel/main/pkg/config/config.go)).

### 4. Command execution & output streaming
- Everything (deploys, docker CLI) is SSH exec of shell commands: `instant_remote_process()` (sync) and `remote_process()` (queued job + activity log) ([bootstrap/helpers/remoteProcess.php](https://raw.githubusercontent.com/coollabsio/coolify/main/bootstrap/helpers/remoteProcess.php)).
- Deploy streaming: process output chunks appended as JSON rows to the `application_deployment_queue.logs` DB column ([app/Traits/ExecuteRemoteCommand.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Traits/ExecuteRemoteCommand.php)).
- UI "streaming" is **Livewire polling of the database every 2 s**, not a live pipe ([deployment/show.blade.php](https://raw.githubusercontent.com/coollabsio/coolify/main/resources/views/livewire/project/application/deployment/show.blade.php), [ActivityMonitor.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Livewire/ActivityMonitor.php)).

### 5. Resource metrics
- Hybrid push+pull. Push: Sentinel POSTs container states + root FS usage every 60 s (default); controller records heartbeat, dispatches update job on state-hash change ([SentinelController.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Http/Controllers/Api/SentinelController.php), [PushServerUpdateJob.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Jobs/PushServerUpdateJob.php)).
- Pull (dashboard graphs): Coolify SSHes in and runs `docker exec coolify-sentinel curl http://localhost:8888/api/cpu/history...` against Sentinel's local API, then downsamples ([app/Traits/HasMetrics.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Traits/HasMetrics.php)).
- Without Sentinel: basic SSH polling (e.g. `df /`) ([app/Models/Server.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Models/Server.php)). Sentinel liveness also gates SSH health checks (skip if heartbeat fresh) ([ServerManagerJob.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Jobs/ServerManagerJob.php)).

### 6. Agent self-update
- Sentinel does **not** self-update; the control plane updates it: a scheduled job reads the running version over SSH, compares with the CDN manifest, and re-runs StartSentinel with the newer image ([CheckAndStartSentinelJob.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Jobs/CheckAndStartSentinelJob.php)).
- Coolify core self-updates via scheduled jobs downloading and running its own upgrade script ([UpdateCoolify.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Actions/Server/UpdateCoolify.php), [Console/Kernel.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Console/Kernel.php)).

---

## Dokploy

Model: **agentless SSH from the control plane** (ssh2 in Node), each remote server its own single-node swarm; optional Go monitoring container.

### 1. Enrollment / pairing
- UI-driven: generate an SSH key in the dashboard, put the pubkey on the VPS, add server (IP + username, typically root, + key), then click **Setup Server**, which runs an init script over SSH ([docs: remote-servers instructions](https://docs.dokploy.com/docs/core/remote-servers/instructions)).
- Keypair generated control-plane-side via ssh2 (`rsa` 4096 or `ed25519`) ([packages/server/src/utils/filesystem/ssh.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/utils/filesystem/ssh.ts)).
- Setup script installs utilities, Docker, **`docker swarm init`** (each worker is its own single-node swarm, not joined to the control plane), overlay network, Traefik, Nixpacks/Buildpacks ([packages/server/src/setup/server-setup.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/setup/server-setup.ts)). Multi-node is a separate Cluster feature using `docker swarm join` per server ([docs: cluster](https://docs.dokploy.com/docs/core/cluster)).

### 2. Authn/z
- Control plane holds everything (server rows + private keys in Postgres); worker holds only the pubkey. Root login, no command-level granularity ([db/schema/server.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/db/schema/server.ts), [services/ssh-key.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/services/ssh-key.ts)). No encryption-at-rest of private keys seen in the service layer *(source-inferred, not fully verified)*.
- App-level ACL only: owners/admins see all org servers, members a subset ([services/server.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/services/server.ts)).

### 3. Transport security
- Pure SSH, control plane dials outbound (`ssh2.Client().connect(...)`); no inbound tunnel, no persistent agent daemon ([utils/process/execAsync.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/utils/process/execAsync.ts)).
- Docker API also tunneled over SSH: `new Dockerode({ protocol: "ssh", ... })` — never an exposed Docker TCP socket ([utils/servers/remote-docker.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/utils/servers/remote-docker.ts)). Same path for LAN and internet; only exception is the monitoring HTTP port (facet 5).

### 4. Command execution & output streaming
- `execAsyncRemote(serverId, command, onData?)` over ssh2 with chunked callbacks; swarm service create/update via Dockerode-over-SSH ([execAsync.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/utils/process/execAsync.ts), [utils/builders/index.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/utils/builders/index.ts)).
- Builds run on the target (nixpacks/dockerfile via SSH); dedicated build servers push to a registry that deploy servers pull ([docs: remote-servers](https://docs.dokploy.com/docs/core/remote-servers)).
- Log streaming to UI is WebSocket-based: server-side WSS path `/listen-deployment` tails the remote log file over SSH (`tail -f`) and pipes chunks to the browser ([apps/dokploy/server/wss/listen-deployment.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/apps/dokploy/server/wss/listen-deployment.ts)); setup logs stream via a tRPC subscription ([server/api/routers/server.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/apps/dokploy/server/api/routers/server.ts)).

### 5. Resource metrics
- Free tier: WSS endpoint polling `docker stats --no-stream` every 1.3 s, local host only ([wss/docker-stats.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/apps/dokploy/server/wss/docker-stats.ts)); remote monitoring excluded from base feature ([docs: remote-servers](https://docs.dokploy.com/docs/core/remote-servers)).
- Full monitoring is an **agent container** (`dokploy/monitoring:latest`, Go) deployed on the worker via Dockerode-over-SSH, with docker.sock/`/sys`/`/proc` mounts and a sqlite store; exposes `/metrics` behind a bearer token on port 4500; pushes only threshold-breach alerts to a callback URL ([setup/monitoring-setup.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/setup/monitoring-setup.ts), [apps/monitoring/main.go](https://raw.githubusercontent.com/Dokploy/dokploy/canary/apps/monitoring/main.go), [docs: monitoring](https://docs.dokploy.com/docs/core/monitoring)).
- Dashboard data flow is a **direct browser → worker fetch** of `http://<serverIp>:4500/metrics` with the bearer token — plain HTTP, not proxied through the control plane ([pages/dashboard/monitoring.tsx](https://raw.githubusercontent.com/Dokploy/dokploy/canary/apps/dokploy/pages/dashboard/monitoring.tsx)). Docs say cloud-only; current `canary` source shows no paywall check on the setup procedure — gating status **unverified**.

### 6. Agent self-update
- No long-lived worker agent beyond Traefik and the optional monitoring container; worker components are updated by re-running Setup Server ([docs: instructions](https://docs.dokploy.com/docs/core/remote-servers/instructions)). Monitoring uses mutable `:latest`/`:canary` tags; automatic upgrade cadence **unverified**.
- Dokploy itself updates via `docker service update --force --image dokploy/dokploy:<tag>` on its own swarm, or the install script in update mode ([services/settings.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/services/settings.ts), [docs: installation](https://docs.dokploy.com/docs/core/installation)).

---

## Portainer (regular Agent and Edge Agent)

Model: **installed agent as Docker-API proxy**. Two dial directions: regular agent is dialed by the server; Edge agent dials home (polling + on-demand reverse tunnel, or pure-async polling).

### 1. Enrollment / pairing
- Regular: deploy the `portainer/agent` container, then add environment in UI with `IP:9001` ("Do not provide a protocol — communication ... is performed over HTTPS"); optional shared `AGENT_SECRET` must match server ([docs: add docker agent](https://docs.portainer.io/admin/environments/add/docker/agent)). Safety valve: an agent never contacted by a server shuts its API down after 72 h ([agent.go](https://raw.githubusercontent.com/portainer/agent/develop/agent.go), [agent README](https://raw.githubusercontent.com/portainer/agent/develop/README.md)).
- Edge: server generates a **join token** (`EDGE_KEY`) + random UUID `EDGE_ID`; you run the generated docker command on the remote host ([docs: edge agent](https://docs.portainer.io/advanced/edge-agent)). The key is base64 of `<server_url>|<tunnel_addr>|<tunnel_server_fingerprint>|<endpoint_id>`; endpoint 0 = global key for auto-creation ([agent edge/key.go](https://raw.githubusercontent.com/portainer/agent/develop/edge/key.go), [portainer api/chisel/key.go](https://raw.githubusercontent.com/portainer/portainer/develop/api/chisel/key.go)).

### 2. Authn/z
- Both models: the **server signs every request to the agent** — headers `X-PortainerAgent-PublicKey` (ECDSA P-256) + `X-PortainerAgent-Signature` (ECDSA over an MD5-hashed constant message, or over `AGENT_SECRET` when set) ([agent.go](https://raw.githubusercontent.com/portainer/agent/develop/agent.go), [portainer api/crypto/ecdsa.go](https://raw.githubusercontent.com/portainer/portainer/develop/api/crypto/ecdsa.go)).
- Trust model without secret: **TOFU / first-key-wins** — agent caches the first valid public key and only accepts that key thereafter; with `AGENT_SECRET`, any server knowing the secret is accepted ([agent crypto/ecdsa.go](https://raw.githubusercontent.com/portainer/agent/develop/crypto/ecdsa.go)).
- Authorization granularity: none on the agent — the signature gate ("notary" middleware, 403 on failure) is all-or-nothing, then the agent proxies the full Docker API; RBAC is server-side *(source-inferred: [http/security/notary.go](https://raw.githubusercontent.com/portainer/agent/develop/http/security/notary.go))*. Edge adds an `X-PortainerAgent-EdgeID` identity header on polls ([agent README](https://raw.githubusercontent.com/portainer/agent/develop/README.md)).

### 3. Transport security
- Regular (server dials agent, TCP 9001): HTTPS with **self-signed cert auto-generated by the agent; clients skip TLS verification** — transport is encrypted but not server-authenticated; authenticity rests on the signature headers ([agent README](https://raw.githubusercontent.com/portainer/agent/develop/README.md), [agent crypto/tls.go](https://raw.githubusercontent.com/portainer/agent/develop/crypto/tls.go)). Docs position it for same-network environments ([docs: architecture](https://docs.portainer.io/start/architecture)).
- Edge (agent dials server): HTTPS polling every 5 s + on-demand **chisel reverse tunnel** to server port 8000, with the tunnel-server fingerprint pinned via the edge key (MITM prevention) ([docs: edge agent](https://docs.portainer.io/advanced/edge-agent), [agent chisel/client.go](https://raw.githubusercontent.com/portainer/agent/develop/chisel/client.go), [portainer api/chisel/service.go](https://raw.githubusercontent.com/portainer/portainer/develop/api/chisel/service.go)).
- Async edge mode: pure outbound HTTPS polling, no tunnel, only the UI port needed ([docs: edge async](https://docs.portainer.io/admin/environments/add/docker/edge-async)).

### 4. Command execution & output streaming
- The agent is a Docker API proxy. Exec/attach/logs: the server runs a **websocket-to-websocket proxy**, dialing the agent (regular) or the local end of the chisel tunnel (edge standard), adding the signature headers ([websocket/exec.go](https://raw.githubusercontent.com/portainer/portainer/develop/api/http/handler/websocket/exec.go), [websocket/proxy.go](https://raw.githubusercontent.com/portainer/portainer/develop/api/http/handler/websocket/proxy.go)).
- Edge standard: tunnel opened on demand — poll response returns `TunnelStatusRequired` + port + credentials; agent creates the tunnel; closed on idle ([agent edge/poll.go](https://raw.githubusercontent.com/portainer/agent/develop/edge/poll.go), [chisel/service.go](https://raw.githubusercontent.com/portainer/portainer/develop/api/chisel/service.go)). Edge stacks/jobs are delivered via polling, not the tunnel (same poll.go).
- Edge async: no interactive exec; the agent executes declarative `AsyncCommands` returned by polls (stack/job/config/container ops, log collection) ([agent edge/poll_async.go](https://raw.githubusercontent.com/portainer/agent/develop/edge/poll_async.go)).

### 5. Resource metrics
- No live metrics; periodic environment **snapshots** from the Docker API only: total CPU/memory (from daemon info), container/image/volume/stack counts, versions — **no host disk usage** ([internal/snapshot/snapshot.go](https://raw.githubusercontent.com/portainer/portainer/develop/api/internal/snapshot/snapshot.go), [pkg/snapshot/docker.go](https://raw.githubusercontent.com/portainer/portainer/develop/pkg/snapshot/docker.go)).
- Regular: server pulls snapshots. Edge standard: snapshot through an opened tunnel. Edge async: agent **pushes** snapshots (default 1/min) ([docs: edge async](https://docs.portainer.io/admin/environments/add/docker/edge-async), [poll_async.go](https://raw.githubusercontent.com/portainer/agent/develop/edge/poll_async.go)).

### 6. Agent self-update
- Regular agent: manual redeploy with new image, version matched to server ([docs: upgrade agent](https://docs.portainer.io/start/upgrade/tobe/agent); per-platform details **partially unverified**).
- Edge manual: stop/remove/pull/redeploy with same Edge credentials ([docs: upgrade edge](https://docs.portainer.io/start/upgrade/edge)).
- Edge auto-update: Business Edition only — a companion **`portainer-updater` image** performs scheduled updates and rollbacks per Edge Group ([docs: environments update](https://docs.portainer.io/admin/environments/update)).

---

## Kamal

Model: **fully agentless SSH from the operator's machine/CI**; no control plane at all; kamal-proxy on the host is a traffic router, not a control agent.

### 1. Enrollment / pairing
- A server is enrolled by listing its IP under `servers:` in `config/deploy.yml` and having SSH access; `kamal setup` / `kamal server bootstrap` installs Docker via get.docker.com if missing (root needed) ([kamal-deploy.org](https://kamal-deploy.org/), [docs: installation](https://kamal-deploy.org/docs/installation/), [docs: server commands](https://kamal-deploy.org/docs/commands/server/), [lib/kamal/commands/docker.rb](https://raw.githubusercontent.com/basecamp/kamal/main/lib/kamal/commands/docker.rb)). No registration handshake exists *(source-inferred: no server-side enrollment code in the repo)*.

### 2. Authn/z
- SSH config maps straight to net-ssh: `user` (default root), `port`, `proxy`, `keys`, `key_data`, `config`, `forward_agent` (default true) ([docs: ssh config](https://kamal-deploy.org/docs/configuration/ssh/), [lib/kamal/configuration/ssh.rb](https://raw.githubusercontent.com/basecamp/kamal/main/lib/kamal/configuration/ssh.rb)).
- Registry credentials are pushed to every host via `docker login` (password from local secrets) ([docs: registry](https://kamal-deploy.org/docs/configuration/docker-registry/), [lib/kamal/commands/registry.rb](https://raw.githubusercontent.com/basecamp/kamal/main/lib/kamal/commands/registry.rb)).
- One SSH identity for all hosts; authorization = whatever that Unix user can do *(source-inferred; no permission layer exists)*.

### 3. Transport security
- Operator/CI always dials servers outbound over SSH (SSHKit); nothing dials back ([README](https://github.com/basecamp/kamal)). Bastion support via `Net::SSH::Proxy::Jump` / `proxy_command` ([configuration/ssh.rb](https://raw.githubusercontent.com/basecamp/kamal/main/lib/kamal/configuration/ssh.rb)).
- No resident control agent *(source-inferred: repo is CLI/SSHKit only)*. kamal-proxy is "a tiny HTTP proxy ... for zero-downtime deployments" — routing and draining, commanded locally via `docker exec <proxy> kamal-proxy deploy ...` ([kamal-proxy README](https://github.com/basecamp/kamal-proxy), [lib/kamal/commands/app/proxy.rb](https://raw.githubusercontent.com/basecamp/kamal/main/lib/kamal/commands/app/proxy.rb)).

### 4. Command execution & output streaming
- Fleet exec via SSHKit `on(hosts)` blocks with host-tagged output ([lib/kamal/sshkit_with_ext.rb](https://raw.githubusercontent.com/basecamp/kamal/main/lib/kamal/sshkit_with_ext.rb)).
- `kamal app logs -f` is literally ssh + `docker logs --follow`, shelling out to the real `ssh` binary ([lib/kamal/commands/app/logging.rb](https://raw.githubusercontent.com/basecamp/kamal/main/lib/kamal/commands/app/logging.rb), [lib/kamal/commands/base.rb](https://raw.githubusercontent.com/basecamp/kamal/main/lib/kamal/commands/base.rb)).
- Ad-hoc: `kamal app exec`, `kamal server exec` (incl. interactive) ([docs: app](https://kamal-deploy.org/docs/commands/app/), [docs: server](https://kamal-deploy.org/docs/commands/server/)).
- Auditing: local `.kamal/hooks` scripts with performer/hosts/command env vars, plus a server-side append-only audit log per host ([docs: hooks](https://kamal-deploy.org/docs/hooks/overview/), [lib/kamal/commands/auditor.rb](https://raw.githubusercontent.com/basecamp/kamal/main/lib/kamal/commands/auditor.rb)). Deploy locking via an atomically created directory on the primary server ([docs: lock](https://kamal-deploy.org/docs/commands/lock/)).

### 5. Resource metrics
- **None.** No host metrics feature exists (verified absence: [README](https://github.com/basecamp/kamal), [docs: all commands](https://kamal-deploy.org/docs/commands/view-all-commands/)). Only kamal-proxy's own Prometheus endpoint (traffic metrics) ([docs: proxy config](https://kamal-deploy.org/docs/configuration/proxy/)).

### 6. Self-update
- No agent to update; Kamal is a local Ruby gem. kamal-proxy upgrades via `kamal proxy reboot` (optionally `--rolling`, with drain hooks); a new Kamal release pins a newer proxy `MINIMUM_VERSION` ([docs: proxy commands](https://kamal-deploy.org/docs/commands/proxy/), [lib/kamal/commands/proxy.rb](https://raw.githubusercontent.com/basecamp/kamal/main/lib/kamal/commands/proxy.rb)) *(upgrade path source-inferred from version defaults)*.

---

## Komodo

Model: **purpose-built resident agent (Periphery, Rust) with typed RPC over a multiplexed WebSocket**; since v2, mutual public-key (Noise) auth and both dial directions.

### 1. Enrollment / pairing
- Flow: create an **onboarding key** in Core UI/API → install Periphery passing that key → confirm status ([docs: connect servers](https://komo.do/docs/setup/connect-servers)).
- Recommended install: a Python setup script creating a systemd service (`--core-address`, `--connect-as`, `--onboarding-key`); Docker install via `ghcr.io/moghtech/komodo-periphery:2` with equivalent env vars ([connect-servers](https://komo.do/docs/setup/connect-servers), [compose/periphery.compose.yaml](https://github.com/moghtech/komodo/blob/main/compose/periphery.compose.yaml)).
- Onboarding keys are reusable with options (`enabled`, `expires`, `tags`, `privileged`) ([connect-servers](https://komo.do/docs/setup/connect-servers)). Legacy inbound flow (Core dials a listening Periphery at a ws/s `address`) still supported ([entities/server.rs](https://github.com/moghtech/komodo/blob/main/client/core/rs/src/entities/server.rs)).

### 2. Authn/z
- **v2: mutual public-key auth via Noise handshake.** Periphery connects once with the onboarding key, generates its own keypair, sends the public key to Core; all subsequent communication validates pinned public keys on both sides; "the Periphery private key never leaves the server" ([connect-servers](https://komo.do/docs/setup/connect-servers)).
- Periphery holds `private_key` (X25519 at `keys/periphery.key`, auto-generated) and pins Core via `core_public_keys`; Core stores each server's `public_key` (plus `attempted_public_key` staged for admin acceptance of unknown agents) ([config/periphery.rs](https://github.com/moghtech/komodo/blob/main/client/core/rs/src/entities/config/periphery.rs), [entities/server.rs](https://github.com/moghtech/komodo/blob/main/client/core/rs/src/entities/server.rs)).
- Legacy `passkeys` (shared secret) deprecated, Core→Periphery only (same config source). `allowed_ips` CIDR allowlist on the agent API; empty = allow all *(source-inferred: [connection/server.rs](https://github.com/moghtech/komodo/blob/main/bin/periphery/src/connection/server.rs))*. Bulk key rotation: `RotateAllServerKeys` + per-server `auto_rotate_keys` ([connect-servers](https://komo.do/docs/setup/connect-servers)).

### 3. Transport security
- Bi-directional WebSocket, two modes ([connect-servers](https://komo.do/docs/setup/connect-servers)):
  - **Inbound**: Core dials a Periphery server (port 8120 default) ([config/periphery.rs](https://github.com/moghtech/komodo/blob/main/client/core/rs/src/entities/config/periphery.rs)).
  - **Outbound** (v2): Periphery dials Core's `/ws/periphery` route — no inbound port needed on the worker ([v2.0.0 release notes](https://komo.do/docs/releases/v2.0.0), [core api/ws/mod.rs](https://github.com/moghtech/komodo/blob/main/bin/core/src/api/ws/mod.rs) *(source-inferred)*).
- TLS: Periphery serves WSS by default and **generates self-signed certs at startup** if missing ([config/periphery.rs](https://github.com/moghtech/komodo/blob/main/client/core/rs/src/entities/config/periphery.rs), [periphery/helpers.rs](https://github.com/moghtech/komodo/blob/main/bin/periphery/src/helpers.rs)); per-server `insecure_tls` defaults true for Core→Periphery (self-signed reality), while outbound Periphery→Core validates Core's certs by default ([entities/server.rs](https://github.com/moghtech/komodo/blob/main/client/core/rs/src/entities/server.rs)). Channel authenticity comes from the Noise key pinning, not TLS. Explicit internet-exposure guidance for the inbound port: **unverified** (not found in docs).

### 4. Command execution & output streaming
- Periphery exposes a **typed request API** (build, compose, container/docker ops, git, swarm, stats, terminal) that Core calls over the WebSocket ([client/periphery/rs/src/api](https://github.com/moghtech/komodo/tree/main/client/periphery/rs/src/api), [bin/periphery/src/api](https://github.com/moghtech/komodo/tree/main/bin/periphery/src/api)).
- The single WebSocket **multiplexes four frame types** — Login, Request, Response, Terminal — each with a channel id, so concurrent requests and terminals share one connection *(source-inferred: [transport/mod.rs](https://github.com/moghtech/komodo/blob/main/client/periphery/rs/src/transport/mod.rs))*.
- Long actions produce `Update` records on Core; the browser gets them via Core's own UI WebSocket (`/ws/update`); the browser never talks to Periphery directly *(source-inferred: [core api/ws/mod.rs](https://github.com/moghtech/komodo/blob/main/bin/core/src/api/ws/mod.rs))*.
- Terminals: browser-based persistent PTY sessions (server shell, or container Exec/Attach) with a 1 MiB replay buffer; kill-switches `disable_terminals` / `disable_container_terminals` on the agent ([docs: terminals](https://komo.do/docs/terminals), [config/periphery.rs](https://github.com/moghtech/komodo/blob/main/client/core/rs/src/entities/config/periphery.rs)). Non-interactive `ExecuteTerminal` streams output line-wise through Core ([core api/terminal.rs](https://github.com/moghtech/komodo/blob/main/bin/core/src/api/terminal.rs)).

### 5. Resource metrics
- Periphery polls the host into a local cache (`stats_polling_rate` 5 s, container stats 30 s; disk-mount filters) ([config/periphery.rs](https://github.com/moghtech/komodo/blob/main/client/core/rs/src/entities/config/periphery.rs)).
- Core polls each server every `monitoring_interval` (default 15 s) with one `PollStatus` request returning agent info + system stats (CPU/mem/disk) + docker lists ([config/core.config.toml](https://github.com/moghtech/komodo/blob/main/config/core.config.toml), [core monitor/mod.rs](https://github.com/moghtech/komodo/blob/main/bin/core/src/monitor/mod.rs), [periphery api/poll.rs](https://github.com/moghtech/komodo/blob/main/client/periphery/rs/src/api/poll.rs)).
- Alerting: per-server CPU/mem/disk warning/critical thresholds, unreachable + version-mismatch alerts, maintenance windows ([entities/server.rs](https://github.com/moghtech/komodo/blob/main/client/core/rs/src/entities/server.rs), [monitor/alert/server.rs](https://github.com/moghtech/komodo/blob/main/bin/core/src/monitor/alert/server.rs)).

### 6. Agent self-update
- No self-update. Systemd installs: **re-run the setup script** — idempotent, preserves config, updates the binary to the latest (or `--version`-pinned) GitHub release ([connect-servers](https://komo.do/docs/setup/connect-servers), [scripts/setup-periphery.py](https://github.com/moghtech/komodo/blob/main/scripts/setup-periphery.py)). Docker installs: major-pinned tag, ordinary pull/recreate ([periphery.compose.yaml](https://github.com/moghtech/komodo/blob/main/compose/periphery.compose.yaml)).
- Core does not push agent versions; it observes agent version and can **alert on version mismatch**; fleet rollout explicitly delegated to tools like Ansible ([entities/server.rs](https://github.com/moghtech/komodo/blob/main/client/core/rs/src/entities/server.rs), [connect-servers](https://komo.do/docs/setup/connect-servers)).

---

## Other patterns (brief, background only — not deep-verified this pass)

- **Dokku**: single-host by design; the "control plane" is `git push` + CLI over SSH to that one host — no multi-server worker problem at all.
- **CapRover**: multi-node via plain Docker Swarm — workers `docker swarm join` the leader; CapRover itself only talks to the local swarm manager socket, delegating all node communication to Swarm's own mTLS raft/gossip.
- **Nomad**: the reference client/server split — resident client agent, server-dials-nothing (clients register and heartbeat to servers over RPC), mTLS with a private CA + gossip encryption, and typed RPC for everything. The heavyweight end of the spectrum: what Komodo approximates with far less machinery.

---

## Cross-tool patterns

**Two families, and a hybrid.**
1. **SSH-from-control-plane, agentless** — Coolify, Dokploy, Kamal. The control plane (or operator laptop) holds SSH private keys and dials workers as root. Zero worker-side install; enrollment = "put a pubkey in authorized_keys". Tradeoffs: unrestricted root (no granularity anywhere in the three tools), NAT-unfriendly (Coolify needs Cloudflare Tunnel for that), streaming is bolted on (Coolify polls its DB; Dokploy tails files over SSH into a WSS), and per-command SSH exec makes structured RPC and metrics awkward — both Coolify and Dokploy ended up **adding a metrics sidecar anyway** (Sentinel, dokploy/monitoring).
2. **Resident agent** — Portainer, Komodo. Sub-split by what the agent *is*: Portainer's is a **generic Docker-API proxy** (all smarts stay server-side; agent authz is all-or-nothing), Komodo's is a **purpose-built typed RPC server** (build/deploy/stats/terminal endpoints, agent-side kill-switches like `disable_terminals`, `allowed_ips`).
3. The hybrid nobody quite ships: SSH transport + resident helper. Coolify comes closest (SSH for control, Sentinel for telemetry).

**Dial direction.** Control-plane-dials-worker: all SSH tools, Portainer regular, Komodo inbound. Agent-dials-home: Portainer Edge (poll + on-demand chisel reverse tunnel, or pure async polling), Komodo v2 outbound WebSocket, Coolify Sentinel push. The clear trend: both agent-based tools **added an outbound mode later** (Portainer Edge, Komodo v2) because inbound-only fails NAT/firewall deployments. Outbound requires the control plane to be reachable; inbound requires the worker to be reachable — supporting both (Komodo) covers same-host/LAN/internet cleanly.

**Bootstrap credentials.** Three schemes: (a) SSH pubkey placement (Coolify, Dokploy, Kamal) — manual but universally understood; (b) long-lived shared secret (`AGENT_SECRET`, Komodo v1 passkeys) — simple, but the secret is the permanent credential; (c) **short-lived token upgraded to pinned keypairs** (Komodo onboarding key → Noise keys; Portainer Edge key → TOFU'd server pubkey) — the most modern pattern: the bootstrap token becomes worthless after enrollment, and per-machine keys enable rotation (Komodo's `RotateAllServerKeys`) and revocation.

**Transport authenticity is consistently *not* TLS-based.** Portainer regular and Komodo inbound both use auto-generated self-signed certs with client-side verification skipped; authenticity comes from an application-layer mechanism instead (Portainer's ECDSA request signatures, Komodo's Noise key pinning, chisel's fingerprint pinning). TLS is for confidentiality; identity lives above it. Observed warts to avoid: Coolify's `StrictHostKeyChecking=no` (no host authentication at all), Dokploy's browser→worker plain-HTTP metrics fetch, Portainer's MD5-in-signature and FIPS-mode verification bypass.

**Command layer.** Raw shell strings over SSH (Coolify, Dokploy, Kamal) vs Docker-API proxy (Portainer) vs typed purpose RPC (Komodo). The proxy approach gets every Docker feature for free but can express *only* Docker and gives the agent no say in authorization. Typed RPC costs API surface but enables agent-side policy, non-Docker operations (git, builds, host stats), and clean multiplexing (Komodo's one-socket Login/Request/Response/Terminal framing is the tightest design surveyed).

**Streaming.** Weakest: DB-write + UI-poll (Coolify, 2 s Livewire). Middle: SSH `tail -f` piped into a server-side WebSocket (Dokploy). Strongest: end-to-end socket paths — Portainer's ws-to-ws proxy for exec/logs, Komodo's channel-multiplexed frames with PTY replay buffers.

**Metrics.** None (Kamal), Docker-snapshot-only (Portainer — no host disk), SSH-poll fallback + push sidecar (Coolify), token-guarded pull agent with alert push (Dokploy), and **agent-cached local polling + control-plane bundle poll with threshold alerting** (Komodo — the most complete: one `PollStatus` returns health, stats, and container state together).

**Self-update.** Almost universally punted: manual redeploy (Portainer CE, Dokploy re-setup), idempotent re-run of the install script (Komodo), Ansible explicitly recommended for fleets (Komodo). The two managed exceptions: Coolify's control plane version-checks Sentinel over SSH and redeploys it itself; Portainer BE ships a separate `portainer-updater` companion container. Komodo's lighter alternative — Core merely **alerts on version mismatch** — buys most of the value at a fraction of the risk.

---

## Recommendation shortlist for Porter

Constraints recap: HQ = Bun single binary, Porter = new Go single binary, v1 single-operator self-hosted, workers may be same-host / LAN / internet, filesystem-transparent state preferred.

### A. Komodo-shape: Porter as a typed-RPC agent on one multiplexed WebSocket, keypair-pinned, both dial directions (primary candidate)
HQ mints a short-lived onboarding token; the Porter install one-liner takes token + HQ address; on first connect Porter generates a keypair, registers its pubkey, and the token dies. Both sides pin each other's public keys; keys live as plain files (`~/.porter/keys/porter.key`, HQ pubkey alongside) — exactly the filesystem-transparent preference, and Komodo proves the whole pattern works with keys-on-disk and TOML config. One WSS connection multiplexes request/response/log-stream/terminal channels. Dial direction per worker: HQ→Porter for same-host/LAN (no public HQ needed), Porter→HQ outbound for internet/NAT workers (no inbound port on the worker). This is the only surveyed architecture that natively covers all three network placements, gives structured RPC for build/deploy/stats in one contract, and streams properly. Cost: the largest v1 surface (handshake, framing, reconnect logic) — though Komodo demonstrates it's tractable for a small team, and Go + Bun both have first-class WebSocket support.

### B. Kamal/Coolify-shape with a twist: SSH transport, Porter as the remote-executed brain
HQ holds per-worker SSH keys (files on disk — maximally transparent) and never runs a listener-agent; instead of raw shell strings it executes `porter <verb> --json` over SSH and streams stdout (NDJSON events) back. Porter is installed once (or even pushed on demand) but is a CLI, not a daemon. Wins: sshd provides transport, auth, and host trust for free; near-zero enrollment (authorized_keys); trivially debuggable — the operator can run the same `porter` commands by hand. Costs seen in the wild: no worker→HQ push (metrics/heartbeats need HQ-side polling or an eventual push endpoint, cf. Coolify growing Sentinel anyway), root-shell-grade authorization, NAT traversal needs a tunnel, and interactive/persistent sessions are clunky. Strong fallback if v1 wants minimum machinery; do SSH host-key pinning properly (Coolify doesn't).

### C. Portainer-Edge-shape: outbound-only polling agent with on-demand streaming channel
Porter only ever dials HQ: periodic HTTPS poll for queued commands + pushed snapshots, plus an on-demand WSS (or chisel-style reverse tunnel) opened when the operator needs live logs/terminal. Simplest firewall story (workers need zero inbound ports; only HQ is reachable) and degrades gracefully to pure-async on flaky links. Costs: HQ must be network-reachable from every worker (awkward when HQ sits on a laptop/LAN and the worker is same-host is fine, but LAN-HQ + internet-worker breaks), and poll latency bounds command responsiveness unless the poll interval is aggressive. Best if Alfredo expects internet workers to dominate.

### D. Not recommended: Docker-API-proxy agent (Portainer regular shape)
Porter as a thin authenticated proxy to dockerd. Cheapest agent to write, but it locks the contract to "whatever Docker's API says", gives Porter no authorization or policy voice, and one leaked credential = full root-equivalent Docker on the worker. Alfredo wants Porter to own builds/deploys/host state, so a purpose contract (A) or CLI contract (B) fits better.

**Suggested decision frame:** A is the destination; B is a legitimate v1 if speed matters more than push telemetry — and B's `porter --json` CLI verbs can be designed as the same verb set A's RPC would expose, making B → A a transport swap rather than a rewrite. Whichever wins: bootstrap-token → pinned per-machine keypairs (not a permanent shared secret), authenticity at the application layer with TLS for confidentiality, keys and agent config as plain files on disk, and Komodo-style version-mismatch alerting instead of v1 self-update machinery.
