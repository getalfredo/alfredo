# Secrets and environment variables

Status: agreed in [Secrets storage & wiring](https://github.com/getalfredo/alfredo/issues/7). The design is deliberately simple: plain `.env` files, no extra machinery.

## Protection

Values are stored in plaintext `.env` files with `0600` permissions. Encryption at rest, audit, and credential rotation belong to [Security model: secret protection & integration credential lifecycle](https://github.com/getalfredo/alfredo/issues/12), which may add protection without changing this layout.

## Storage on HQ

Each owner has one `.env` file next to its YAML file:

```
projects/<project-slug>/.env
trays/<tray-slug>/.env
trays/<tray-slug>/workspaces/<workspace-slug>/.env
```

The YAML files never contain secret values; they reference values in the neighboring `.env` file by name. Removing an owner removes its `.env` file.

There are three scopes: project, Tray, and Workspace. V1 has no installation-wide or Porter-level variables. A value that several projects need is set in each project.

## Project environment variables

A project's environment variables are one `.env` file. There is no per-variable secret flag: every value is treated as sensitive.

Only Admins view and edit values, following the [users spec](users.md). Collaborators see variable names only.

Each project has one set of variables. If [Projects & deploy flow](https://github.com/getalfredo/alfredo/issues/11) introduces environments such as staging and production, it extends this model.

## Wiring and collisions

A deployment's environment is the project's variables plus the outputs of its wired Workspaces, as defined in the [Trays spec](trays.md#outputs-and-wiring).

Each variable name has exactly one source. If a save would give two sources the same name, such as a project variable and a Workspace output, HQ rejects the save and names both sources. The Admin resolves it by renaming or unwiring an output, or by renaming the project variable.

## Delivery to Porter

At deploy time, HQ resolves the full environment and sends it with the deploy operation. Porter writes it as `.env` with `0600` permissions in the compose project directory. Restarts and host reboots then work without HQ.

Self-hosted Tray services, such as a Convex backend, receive their Tray and Workspace values the same way.

Changed values take effect on the next deployment.

Anyone with root or Docker access on the Porter host can read deployed values, from the `.env` file or from container configuration. [Porter privilege & blast-radius model](https://github.com/getalfredo/alfredo/issues/14) owns that boundary.

## Handoff boundaries

Implementation owns file parsing and quoting, slug rules, the exact wire format of the environment in the deploy operation, and file ownership details on Porter.
