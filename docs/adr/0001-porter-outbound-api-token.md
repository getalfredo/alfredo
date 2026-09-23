# Porter connects outbound using an HQ API token

For v1's trusted-private-network deployment model, Porter always connects to HQ using an Admin-created API token, which users may share across Porters. Plain WebSockets are permitted on a trusted network path, with WSS available when encryption is needed; this deliberately replaces the research proposal for two connection directions and mandatory mutually pinned identities to keep setup to an HQ address and token.

HQ must be reachable from Porter, while Porter needs no incoming connection endpoint. Plain WebSockets expose credentials and payloads to anyone able to intercept traffic; private addressing does not provide encryption, and shared tokens do not isolate their holders. Revoking a token disconnects all Porters using it, while removing a stale Porter record does not revoke access.

Agreed in the live session for [Porter contract & security model](https://github.com/getalfredo/alfredo/issues/5); see [the spec](../spec/porter.md) for the full contract.
