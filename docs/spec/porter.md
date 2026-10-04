# Porter contract and security

Status: agreed in [Porter contract & security model](https://github.com/getalfredo/alfredo/issues/5) and [Porter privilege & blast-radius model](https://github.com/getalfredo/alfredo/issues/14). Detailed mechanics are left to implementation at the user's request.

## Connection and enrollment

Each Porter belongs to one HQ installation at a time. Moving to another HQ requires explicit unpairing and fresh enrollment.

Porter always initiates the connection to HQ. HQ sends operations over that connection; Porter needs no incoming connection endpoint. HQ must be reachable from Porter. This supersedes the earlier proposal to support both connection directions.

An Admin creates an API key in HQ. The user configures Porter with the HQ address/IP and key. Porter connects and appears in HQ's Porter dashboard. Users may reuse one key across any number of Porters.

Revoking a key disconnects all Porters using it and prevents reconnection with that key. Affected Porters need another valid API key to reconnect.

## Transport and trust

V1 permits API-token authentication over plain `ws://` on trusted private networks, explicitly treating the network path as trusted. `wss://` is supported when encryption is needed. This permits plain transport; it does not imply that private networks encrypt traffic.

Custom pairing-token and certificate-pinning machinery is not required. This decision supersedes the earlier research recommendation for mandatory mutually pinned identities and WSS. See [the transport and enrollment ADR](../adr/0001-porter-outbound-api-token.md).

Porter reports whether its connection uses `ws://` or `wss://`. HQ shows an **Unencrypted connection** badge on every Porter that connects over `ws://`.

Porter trusts whoever answers at the HQ address that it dials. It doesn't verify HQ's identity beyond what `wss://` certificate validation provides. The [accepted risk](#accepted-risk) covers what that means.

HQ enforces user and project permissions. Porter accepts defined operations from its paired HQ and does not maintain user accounts or project memberships.

## Porter identity

Porter generates an ID on first startup and saves it locally. HQ uses it to recognize the Porter across restarts and API-key changes. The hostname supplies the default display name, which an Admin can edit in HQ.

The ID identifies a Porter; it is not itself an authentication credential. Shared API keys do not establish cryptographic isolation between their holders.

## Connection health

Porter sends a heartbeat every 10 seconds. HQ displays Offline after 30 seconds without a heartbeat and shows the last-seen timestamp. This status describes connectivity, separately from the health of services on the machine.

Each heartbeat includes CPU usage, memory usage, and disk usage. The Porter dashboard shows current values. Historical charts are not part of this agreed baseline; their scope remains a separate decision.

## Operations and disconnection

Porter finishes already-accepted work when its connection to HQ drops and reports the result on reconnection. HQ shows the outcome as unknown while disconnected and rejects new commands until reconnection. Existing services keep running.

Each operation has an ID remembered on disk by Porter. Reconnection retrieves its status rather than accidentally executing it again. This is not a guarantee of exactly-once external effects across process or machine crashes.

Porter streams operation progress and logs to HQ, buffering output during disconnection for retrieval afterward. Completed operation results and logs have size-based retention with rotating logs and a visible indication when output has been truncated. There is no day-based retention limit. Exact size limits and the relationship between output rotation and operation-ID retention remain implementation details to specify.

Concurrency policy and detailed edge cases are left to implementation rather than additional product decisions in this session. No specific busy-rejection policy has been agreed.

## Operation catalog

Porter runs only **operations** from a fixed catalog that's compiled into the Porter binary. Each operation has a name and typed arguments. HQ can't send a script or a shell command, and v1 has no operation that runs an arbitrary command on the host, not even for Admins. See [the operation catalog ADR](../adr/0005-closed-operation-catalog.md).

The catalog in v1 is the compose operations in the [compose spec](compose.md#operations), the Machine checks in the [machine ops spec](machine-ops.md), and applying the Proxy configuration in the [reverse proxy spec](reverse-proxy.md#proxy-configuration). Tray functions run in HQ and call these same operations, so they add nothing to the catalog.

Porter writes files only inside its own data directory, and it manages only the Docker resources that it labelled, as the compose spec describes.

The catalog bounds what a Porter bug or a malformed message can do. It doesn't stop a hostile HQ, because a compose file, an image build, and a release command are arbitrary code that runs under Docker.

## Privileges

Porter runs as a dedicated non-root service user, such as `porter`. It never runs as root. Its data directory is in that user's home, with `0700` permissions.

The service user has no general `sudo` rights. The installer adds one sudoers file that lets the service user run a short, fixed list of read-only commands with fixed arguments, such as `sshd -T`, `ufw status verbose`, and `fail2ban-client status sshd`. Machine checks use them to read facts that only root can read. The Admin can read that file to see exactly what Porter can run. Without the file, the affected checks report **Unknown (needs root)**, as the [machine ops spec](machine-ops.md#privileges) describes.

On the HQ host, Porter's service user is a different user than HQ's service user, so Porter can't read HQ's data directory.

V1 has no operation that changes the host's configuration. When firewall or SSH management arrives in a later version, a separate privileged helper runs it as named, validated operations in the catalog. Porter's service user and data directory stay as they are. Porter reports its Docker mode and whether the read-only sudoers file is present when it connects, so that HQ can show them on the Porter page.

## Docker mode

The installer sets up **rootless Docker** under Porter's service user. See [the rootless Docker ADR](../adr/0006-rootless-docker-by-default.md). In rootless mode:

- A container's root user is Porter's service user on the host, not root.
- ufw applies to the ports that Stacks publish.
- Files that containers write belong to the service user or to its subordinate user IDs, and Porter removes them without root.

Porter uses whatever Docker socket it's configured with, so it also works with a rootful daemon and on development hosts. Rootful mode is the Admin's explicit choice at install time. The installer adds the service user to the `docker` group only in that case, and that membership is root-equivalent on the host. The **Rootless Docker** Baseline check reports which mode a Porter uses.

The installer never stops, turns off, or reconfigures a Docker daemon that it didn't set up. On a host that already runs rootful Docker, the rootless daemon runs next to it, and Alfredo never manages the existing daemon's containers.

[Install & upgrade flow for HQ and Porter](https://github.com/getalfredo/alfredo/issues/17) owns the installer. A [prototype script](https://github.com/getalfredo/alfredo/blob/research/docker-modes-test/docs/research/docker-modes-test/install-rootless-porter.sh) shows that one unattended command can do the rootless setup.

## Removal and upgrades

Removing a Porter from HQ cleans up its stale record; it does not revoke access or block its ID. A Porter that is still running with a valid API key can reconnect immediately and reappear in HQ. Revoking the API key remains a separate action affecting every Porter using that key.

Porter upgrades are manual in v1. HQ displays Porter versions and flags incompatibility. V1 does not automatically update Porter binaries.

HQ continues to show connection status and versions when versions are incompatible, but blocks commands it cannot safely exchange with Porter. A version difference alone does not block operations. The protocol's concrete compatibility mechanism remains to be specified.

## Accepted risk

This section states what v1 doesn't defend against, so that the risk is a decision and not an assumption.

**What a compromised HQ gets.** HQ already holds every secret in the installation, as the [security spec](security.md#protection-at-rest) states. Through Porter, a compromised HQ also controls every Porter host as Porter's service user: every Stack's containers, volumes, and environment, the Proxy's private keys, and the ability to run any workload there. With rootless Docker, that control stops short of root, unless the kernel has an exploitable flaw. On a host where Porter uses a rootful daemon, a compromised HQ gets root.

**Who else can get that.** Anyone who can impersonate HQ to a Porter gets the same control over that Porter. Over `ws://`, that's anyone on the network path. Anyone who holds a Porter API key can connect a Porter and receive the environment of every Stack placed on it.

**What Git push access gets.** Code that runs inside the project's containers with the project's environment. With [host access](compose.md#host-access) turned on for the project, it gets Porter's service user on that Porter, and so every other Stack there.

**What v1 doesn't defend.** Stacks on one Porter aren't isolated from each other beyond standard container isolation. They share a Docker daemon, a kernel, and the Proxy's network. Put projects that must not trust each other on separate Porters.

**Why this is acceptable for v1.** Alfredo v1 is for one operator who controls HQ and every Porter host. HQ is already the single point that holds all secrets, so the model's job is to limit what a compromise gets beyond that data: no root on Porter hosts by default, no host-level shell, and no host reach from a project's repository without an Admin's choice.

**What wasn't verified.** The statement that rootless control stops short of root comes from Docker's documentation and from the user ID mapping that the [Docker mode test](https://github.com/getalfredo/alfredo/blob/research/docker-modes-test/docs/research/docker-modes-test.md) observed. The test didn't attempt an escape from a container.

**Known next steps.** A certificate fingerprint in the string that the Admin copies to a Porter would let Porter verify HQ without a public hostname, which closes the impersonation gap. A privileged helper adds host-changing operations as typed operations.

## Handoff boundaries

Implementation owns the service user's name, the exact commands in the read-only sudoers file, wire schemas and endpoints, WSS configuration, reconnect backoff, API-key representation, duplicate-ID handling, concurrency, cancellation mechanics, crash recovery, exact size caps, and the compatibility mechanism. These are not additional product-decision tickets unless implementation exposes a material product trade-off.

Existing decisions cover the remaining subsystem contracts:

- [Compose stack management via Porter](https://github.com/getalfredo/alfredo/issues/8) defines compose operations.
- [Machine ops command set](https://github.com/getalfredo/alfredo/issues/9) defines machine operations.
- [Secrets storage & wiring](https://github.com/getalfredo/alfredo/issues/7) and [Security model: secret protection & integration credential lifecycle](https://github.com/getalfredo/alfredo/issues/12) cover credential protection and storage.
- The map's dashboard and install/upgrade work cover any historical charts and installation instructions beyond this contract.
