# Porter contract and security

Status: agreed in [Porter contract & security model](https://github.com/getalfredo/alfredo/issues/5). Detailed mechanics are left to implementation at the user's request.

## Connection and enrollment

Each Porter belongs to one HQ installation at a time. Moving to another HQ requires explicit unpairing and fresh enrollment.

Porter always initiates the connection to HQ. HQ sends operations over that connection; Porter needs no incoming connection endpoint. HQ must be reachable from Porter. This supersedes the earlier proposal to support both connection directions.

An Admin creates an API key in HQ. The user configures Porter with the HQ address/IP and key. Porter connects and appears in HQ's Porter dashboard. Users may reuse one key across any number of Porters.

Revoking a key disconnects all Porters using it and prevents reconnection with that key. Affected Porters need another valid API key to reconnect.

## Transport and trust

V1 permits API-token authentication over plain `ws://` on trusted private networks, explicitly treating the network path as trusted. `wss://` is supported when encryption is needed. This permits plain transport; it does not imply that private networks encrypt traffic.

Custom pairing-token and certificate-pinning machinery is not required. This decision supersedes the earlier research recommendation for mandatory mutually pinned identities and WSS. See [the transport and enrollment ADR](../adr/0001-porter-outbound-api-token.md).

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

## Removal and upgrades

Removing a Porter from HQ cleans up its stale record; it does not revoke access or block its ID. A Porter that is still running with a valid API key can reconnect immediately and reappear in HQ. Revoking the API key remains a separate action affecting every Porter using that key.

Porter upgrades are manual in v1. HQ displays Porter versions and flags incompatibility. V1 does not automatically update Porter binaries.

HQ continues to show connection status and versions when versions are incompatible, but blocks commands it cannot safely exchange with Porter. A version difference alone does not block operations. The protocol's concrete compatibility mechanism remains to be specified.

## Handoff boundaries

Implementation owns wire schemas and endpoints, WSS configuration, reconnect backoff, API-key representation, duplicate-ID handling, concurrency, cancellation mechanics, crash recovery, exact size caps, and the compatibility mechanism. These are not additional product-decision tickets unless implementation exposes a material product trade-off.

Existing decisions cover the remaining subsystem contracts:

- [Compose stack management via Porter](https://github.com/getalfredo/alfredo/issues/8) defines compose operations.
- [Machine ops command set](https://github.com/getalfredo/alfredo/issues/9) defines machine operations.
- [Porter privilege & blast-radius model](https://github.com/getalfredo/alfredo/issues/14) defines local execution privileges.
- [Secrets storage & wiring](https://github.com/getalfredo/alfredo/issues/7) and [Security model: secret protection & integration credential lifecycle](https://github.com/getalfredo/alfredo/issues/12) cover credential protection and storage.
- The map's dashboard and install/upgrade work cover any historical charts and installation instructions beyond this contract.
