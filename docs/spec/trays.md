# Trays

Status: agreed in [Tray model](https://github.com/getalfredo/alfredo/issues/6). Designed against the [selected anchor trays](https://github.com/getalfredo/alfredo/issues/3#issuecomment-5756842163), self-hosted Convex and Purelymail. Provider facts come from the official Convex self-hosting documentation and the Purelymail API (v0), checked in September 2026.

## Concepts

A **Tray type** is a service integration built into HQ, such as Purelymail or self-hosted Convex. The UI shows it by its service name. "Tray type" is a term for code and specs, not a UI label.

A **Tray** is one Admin-configured instance of a Tray type, such as a Purelymail account or a Convex host on a Porter. A Tray is shared across projects. An installation can have several Trays of the same type, such as two Purelymail accounts.

A **Workspace** is one project's isolated share of a Tray. It belongs to exactly one project and one Tray. A project can have several Workspaces, including several in the same Tray, such as app and staging Convex deployments.

Each Tray type defines what isolation means for its Workspaces. A Purelymail Workspace owns mail domains within one account. A Convex Workspace is a separate backend and dashboard container pair. See [the shared Trays ADR](../adr/0002-shared-trays-with-isolated-workspaces.md).

Admins manage Trays in settings. Collaborators see only the Workspaces of projects they belong to, never the Tray itself.

## Modes

Each Tray type has exactly one mode:

- **Self-hosted**: the Tray runs as compose projects on one Porter, which the Admin selects when creating the Tray. The Tray's compose projects are separate from the application's compose stack. [Compose stack management via Porter](https://github.com/getalfredo/alfredo/issues/8) defines compose operations.
- **Connected**: the Tray connects to an external provider's account through its API.

A service offered in both forms, such as Convex Cloud and self-hosted Convex, is two Tray types.

## Tray type packaging

Tray types ship inside the HQ binary; there is no third-party marketplace in v1. Each Tray type is a TypeScript module compiled into HQ, containing:

- A declarative **manifest**: mode, config fields, outputs, function permissions, and for self-hosted types the compose template and pinned image versions.
- **Backend functions**, such as "create mailbox" or "restart backend".
- **React UI components** for the Workspace page tabs.

### Config fields

The manifest declares config fields at two levels: Tray and Workspace. Each field has a type (string, number, boolean, select, hostname, or secret) and validation. HQ generates setup and settings forms from these fields; Tray types don't provide custom setup UI.

## Backend functions

Functions run in HQ. Porter stays generic and contains no Tray-specific code.

A function receives a context with:

- The Tray's and Workspace's config and secrets.
- The calling user and, for Workspace functions, the project.
- A handle for sending defined operations to the Porter hosting a self-hosted Tray.

Functions are either **Workspace functions**, scoped to one Workspace, or **Tray functions**, acting on the whole Tray. HQ checks permissions before running a function.

### Permissions

Each function declares its minimum project role. Tray types follow these defaults:

| Function kind | Minimum role |
| --- | --- |
| Reads, such as status, lists, and health | Viewer |
| Starting, stopping, or restarting Workspace services | Operator |
| Changing configuration, or creating or changing credentials, such as mailboxes and passwords | Admin |
| Any Tray function | Admin |

This follows the [users spec](users.md): configuration and credentials remain under Admin control.

## State on disk

Tray state is filesystem-first:

```
trays/<tray-slug>/tray.yml
trays/<tray-slug>/workspaces/<workspace-slug>/workspace.yml
```

- `tray.yml` holds the Tray type, display name, Porter (self-hosted only), and Tray-level config values.
- `workspace.yml` holds the owning project, Workspace-level config values, and output wiring.

Neither file contains secret values; they reference secrets by name. [Secrets storage & wiring](https://github.com/getalfredo/alfredo/issues/7) decides where secret values live.

## Outputs and wiring

A Workspace publishes **outputs**: named values, each marked secret or not, that the project's application consumes as environment variables.

The manifest declares each output with a default environment variable name. Creating a Workspace wires all its outputs into the project under their default names. An Admin can rename an output's variable, such as `VITE_CONVEX_URL`, or unwire it.

When an output's value changes, such as a regenerated key, the project's services pick it up on their next deployment. [Projects & deploy flow](https://github.com/getalfredo/alfredo/issues/11) owns how outputs are injected.

## UI

A Tray type's UI appears in fixed slots:

- **Status card**: on the project overview, one per Workspace. The unified dashboard reuses it.
- **Workspace page**: common status plus tabs the Tray type defines, such as mailbox management.
- **Settings forms**: generated from the manifest's config fields.
- **Setup checklist**: an ordered list of steps, each with a status and instructions, filled in by the Tray type. It covers guided steps that HQ can't complete alone, such as DNS setup.

## Dashboard data contract

For each Workspace, a Tray type provides:

- **Health**: OK, degraded, down, or unknown, with a short reason.
- **Metrics**: a few named current values, such as a version, a mailbox count, or DNS checks passing (4/4).
- **Links**: to the Workspace's pages and to external pages, such as the Convex dashboard.
- **Warnings**: optional, each with a severity and a message, such as "account credit low".

A Tray provides the same metrics and warnings at Tray level, such as account credit.

HQ polls this data at an interval each Tray type sets. The contract carries current values only, without history. Historical charts belong to the unified dashboard decision, and push notifications belong to alerting.

## Lifecycle

Trays and Workspaces each move through **Setup**, **Active**, and **Removed**.

- A Tray can be removed only after all its Workspaces are removed.
- A project can be removed only after all its Workspaces are removed.
- Removing a self-hosted Workspace asks whether to keep or delete its data volumes. The default is to keep them.
- Removing a connected Workspace or Tray removes only Alfredo's records and stored connection. It never deletes anything at the provider unless the Admin takes a separate, explicit delete action.

## V1 lineup

V1 ships two Tray types, as agreed in [V1 Tray type lineup](https://github.com/getalfredo/alfredo/issues/19):

- **Self-hosted Convex**, the self-hosted anchor.
- **Purelymail**, the connected anchor.

The two anchors cover both modes, so they prove the Tray model without further types. Analytics, payments, uptime, errors, support, other databases, queues, schedulers, and monitoring wait for a later release. Each added Tray type needs its provider's multi-tenancy and API verified first.

## Anchor: self-hosted Convex

A Convex backend serves exactly one deployment, with one instance secret, admin key, and database. A Convex Tray is therefore a managed host on one Porter, and each Workspace is its own backend and dashboard container pair with its own volume and admin key.

**Scope in v1:**

- Storage is SQLite on the Workspace volume only. Postgres, MySQL, and S3 storage are not supported.
- Each Workspace asks for three hostnames: API URL, HTTP-actions URL, and dashboard URL. [Reverse proxy manager](https://github.com/getalfredo/alfredo/issues/10) routes them.
- The Tray doesn't deploy Convex functions. The project's deploy flow runs the deployment using the wired outputs.

**Outputs:** `CONVEX_SELF_HOSTED_URL`, `CONVEX_SELF_HOSTED_ADMIN_KEY` (secret), and the client URL for the application frontend.

**Functions:**

| Function | Scope | Minimum role |
| --- | --- | --- |
| View health (from `/version`), version, and dashboard link | Workspace | Viewer |
| Start, stop, or restart the backend and dashboard containers | Workspace | Operator |
| Show or regenerate the admin key | Workspace | Admin |
| Export data to a backup file on the Porter | Workspace | Admin |
| Upgrade all Workspaces to the Tray type's pinned image version | Tray | Admin |

Backend and dashboard versions always match. Before an upgrade, HQ prompts the Admin to export each Workspace.

## Anchor: Purelymail

The Purelymail API token has access to the whole account, and the provider has no scoped credentials. HQ enforces isolation: a Workspace owns one or more domains, and its functions operate only on those domains. A domain belongs to at most one Workspace. The application receives SMTP credentials for a mailbox in its own domain, never the account token. Collaborators never see the account token.

Applications send email over SMTP only; Purelymail has no send API. Outbound sending is capped at about 3,000 messages a day.

**Outputs:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD` (secret), sourced from the Workspace's SMTP mailbox.

**Functions:**

| Function | Scope | Minimum role |
| --- | --- | --- |
| List domains with DNS check status (MX, SPF, DKIM, DMARC), mailboxes, and routing rules | Workspace | Viewer |
| Add a domain, or attach one already in the account | Workspace | Admin |
| Create or delete mailboxes and reset their passwords | Workspace | Admin |
| Manage routing rules and aliases | Workspace | Admin |
| Create the application's SMTP mailbox | Workspace | Admin |
| Delete a domain at Purelymail, which deletes all its mailboxes | Workspace | Admin |
| Check account credit | Tray | Admin |

Adding a domain uses the setup checklist: it shows the required DNS records and the ownership code, then rechecks DNS until the domain passes.

**Not in v1:** automated DNS changes at a DNS provider, and app password management, because the API can't list app passwords.

## Handoff boundaries

Implementation owns the manifest's concrete TypeScript shape, polling intervals, compose templates, port allocation on the Porter, slug rules, and validation details.

Other decisions cover the adjacent contracts:

- [Secrets storage & wiring](https://github.com/getalfredo/alfredo/issues/7): where secret values live and how they're referenced.
- [Projects & deploy flow](https://github.com/getalfredo/alfredo/issues/11): injecting outputs into deployments.
- [Reverse proxy manager](https://github.com/getalfredo/alfredo/issues/10): routing Workspace hostnames.
- [Compose stack management via Porter](https://github.com/getalfredo/alfredo/issues/8): the compose operations self-hosted Trays use.
