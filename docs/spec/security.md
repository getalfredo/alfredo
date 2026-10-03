# Security model

Status: agreed in [Security model: secret protection & integration credential lifecycle](https://github.com/getalfredo/alfredo/issues/12). The design is deliberately simple. It builds on the secrets spec from [Secrets storage & wiring](https://github.com/getalfredo/alfredo/issues/7), the [users spec](users.md), the [Trays spec](trays.md), and the [projects spec](projects.md).

## Protection at rest

Secret values on HQ stay in plaintext files with `0600` permissions: `.env` files, project deploy keys, and deploy webhook secrets. V1 has no encryption at rest and no external secret backend. See [the plaintext secrets ADR](../adr/0004-plaintext-secrets-at-rest.md).

HQ runs as a dedicated non-root service user. Its data directory has `0700` permissions.

Whoever controls the HQ host, as root or as the HQ service user, has every secret in the installation. A copy of the data directory is a copy of every secret, so backups need the same protection as the host.

A Porter host holds only the environments of the Stacks it runs. [Porter privilege & blast-radius model](https://github.com/getalfredo/alfredo/issues/14) owns that boundary.

## Credentials that HQ only verifies

HQ stores Porter API keys, invitation tokens, and session tokens as hashes, because HQ never needs to read them back. HQ shows a Porter API key once, at creation. An Admin who loses a key creates a new one.

The deploy webhook URL stays readable, because Admins can view it, as the projects spec describes.

## Who sees values

Only Admins see secret values, following the users spec. Values are masked in the UI until the Admin reveals them. HQ never sends a value to a non-Admin's browser. Collaborators see variable names only.

HQ doesn't redact values from deploy output, release command output, or service logs. Applications can write secrets to that output, as the users spec already states.

V1 has no audit log. The Stack operation log records who triggered each deploy.

## Connected Tray credentials

An Admin creates a credential at the provider and pastes it into the Tray's secret config fields. When the Admin saves, HQ verifies the credential against the provider through a function that the Tray type provides, and rejects a credential that the provider doesn't accept.

V1 has no OAuth flows, so HQ handles no token expiry or refresh.

Tray functions run in HQ and read the credential there. Applications receive only Workspace outputs, never a Tray credential.

## Rotation

Rotation is always manual. HQ never rotates on a schedule, tracks expiry, or revokes anything at a provider on its own.

- **Tray credential**: the Admin creates a new credential at the provider and replaces the old one in Tray settings. HQ verifies it and uses it from the next function call. No deploy is needed.
- **Workspace output**, such as an SMTP password or a Convex admin key: the Admin runs the Tray type's regenerate or reset function. The new value takes effect at the provider immediately, but the running application keeps the old value until its next deploy. The confirmation dialog names the affected project and offers **Regenerate and redeploy** or **Regenerate only**.
- **Deploy key, deploy webhook, and Porter API keys**: the Admin regenerates or revokes them, as the projects spec and the [Porter spec](porter.md) describe.

## Rejected credentials

When a provider rejects a Tray's credential, the Tray and its Workspaces report **degraded** health with the reason "credential rejected", through the [dashboard data contract](trays.md#dashboard-data-contract). Admins get a warning that links to the Tray's settings. Collaborators see the degraded health without credential details.

## Handoff boundaries

Implementation owns the hash algorithm, the service user's name, how the installer sets permissions, the verify function's shape in the manifest, and the reveal interaction's details.

[Install & upgrade flow for HQ and Porter](https://github.com/getalfredo/alfredo/issues/17) owns creating the service user and the data directory.
