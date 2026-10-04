# Trays are shared across projects, with an isolated Workspace per project

A Tray is one instance of a service, such as a Purelymail account or a Convex host, and it serves many projects. Each project gets its own isolated Workspace inside it. The alternative was a Tray per project, which would have been simpler to authorize but would duplicate the same account or host for every project. We prefer services that support multi-tenancy, so one Tray can run once and serve every project through separate credentials and isolated Workspaces.

The Tray type defines what isolation means. For Purelymail, a Workspace is a set of domains in one account. The account-wide API token can't be scoped, so HQ enforces the isolation. Self-hosted Convex doesn't support multi-tenancy, so a Convex Tray is a managed host on one Porter, and each Workspace gets its own backend and dashboard containers. Collaborators see only their project's Workspaces. Trays, and Tray-level functions such as upgrades and account billing, remain Admin-only.

Agreed in [Tray model](https://github.com/getalfredo/alfredo/issues/6); see [the spec](../spec/trays.md).
