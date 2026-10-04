# Projects and deploys

Status: agreed in [Projects & deploy flow](https://github.com/getalfredo/alfredo/issues/11). It builds on the [compose spec](compose.md), the [Trays spec](trays.md), the [reverse proxy spec](reverse-proxy.md), and the secrets spec from [Secrets storage & wiring](https://github.com/getalfredo/alfredo/issues/7).

## Concepts

A **project** is one application that Alfredo deploys, together with its Workspaces, variables, Routes, and members.

A project's **source** is the Git repository, branch, and build settings that its Stack is built from.

A **deploy** turns the branch's latest commit and the project's current environment into a new Stack revision and runs it on the project's Porter.

## Project shape

A project owns exactly one Stack, on one Porter. To run parts of an application on different hosts, use separate projects.

V1 has no environments inside a project. A staging copy is a second project, such as `shop-staging`, with its own Workspaces, variables, and Routes. The secrets and reverse proxy specs therefore stay unchanged: one `.env` file and one Route list per project.

Only Admins create projects. Creating a project requires:

- A name, which determines the project's slug.
- A Porter. The Porter is fixed for the project's lifetime; v1 doesn't move Stacks between Porters.
- A source.

Projects without a source, such as a project that only holds a mail domain, aren't part of v1.

Project configuration lives in `projects/<project-slug>/project.yml`, next to the project's `.env` file and its Routes:

```yaml
# projects/shop/project.yml
name: Shop
porter: 3f9c2a61-...          # Porter ID, fixed at creation
source:
  repository: git@github.com:acme/shop.git
  branch: main
  kind: railpack               # railpack or compose
  directory: apps/web          # Railpack only
  port: 3000
  volumes: [/app/uploads]
  startCommand: node server.js
  healthCheckPath: /healthz
release:
  command: npx convex deploy
routes:
  - hostname: shop.example.com
    service: app
    port: 3000
```

## Sources

A source is always a Git repository: a URL, a branch, and one of two kinds. V1 doesn't accept uploaded archives or paths on the HQ host. An app that only runs published images is a repository that contains only a compose file.

### Compose sources

A compose source names one compose file in the repository, `compose.yml` by default. V1 doesn't merge several compose files. The compose file can use `build:` contexts anywhere in the repository.

### Railpack sources

A Railpack source builds one app from a directory in the repository, `.` by default. HQ generates the Stack's compose file with a single service named `app`. An app that needs several services or a bundled database uses a compose source instead.

The generated compose file exposes these settings:

| Setting | Effect |
| --- | --- |
| **Port** | The container port the app listens on. HQ sets `PORT` to it, and Routes target it. |
| **Volumes** | Container paths, each backed by a named volume that survives deploys. |
| **Start command** | Optional. Overrides the start command Railpack detects. |
| **Health check path** | Optional. An HTTP path that the deploy's health phase checks. |

V1 has no replicas, resource limits, or extra ports.

### Private repositories

HQ generates an SSH deploy key for each project. The Admin adds the public key to the repository as a read-only deploy key, which GitHub, GitLab, and Gitea all support. HQ stores the private key as a `0600` file in the project folder. Public repositories need no key.

The deploy key is Admin-only. Admins can regenerate it, which invalidates the old key.

### Changing the source

Admins can change any source setting after creation, including the repository and the source kind. Changes take effect on the next deploy. Earlier revisions keep their own commit and compose file, so rollback still works.

## Fetching source

Only HQ talks to the Git host. For each deploy, HQ resolves the branch to a commit, fetches it into a local mirror of the repository, and sends a `git archive` of that commit to the Porter with the build operation. Porter never holds Git credentials.

HQ's mirror keeps every commit that a revision references, even after a force-push, so any revision's source can be rebuilt.

## Environment

A deploy's environment is the project's variables plus the outputs of its wired Workspaces, resolved as the secrets spec describes.

### Missing variables

Before every deploy, HQ compares the compose file's `${VAR}` references with the resolved environment. References with a default value, such as `${VAR:-x}`, don't count. If any variables are missing, HQ blocks the deploy and lists their names. Admins get a form to fill them in. Operators see the list with a note to ask an Admin.

HQ can't detect variables the app reads at runtime without referencing them in the compose file.

### Build-time variables

- **Railpack sources**: the build receives every resolved variable as a BuildKit build secret, so values don't land in image layers. There's no build-time flag. A value still ends up in the built output when the app inlines it, as Vite does with `VITE_*` variables.
- **Compose sources**: the compose file's own `build.args` and `secrets` entries opt variables into the build. HQ interpolates them from the resolved environment. HQ never rewrites Dockerfiles.

## Deploying

### Triggers

A deploy always uses the branch's latest commit; nobody picks an arbitrary commit. Two things start a deploy:

- **Deploy** in the UI, for Operators and Admins.
- The project's **deploy webhook**, when an Admin turns it on. It's a secret URL that any Git host or CI system can call. Admins can view and regenerate it.

If the resolved commit and environment match the running revision, HQ skips the deploy and logs "Already up to date". This makes it safe to point the webhook at every push event. **Redeploy** always runs, even when nothing changed.

Creating a project doesn't deploy it. The project page shows a setup checklist, following the [Trays spec's](trays.md#ui) pattern. It covers the deploy key, missing variables, and each Route's DNS status. **Deploy** is a separate action.

### Phases

A deploy runs these phases in order. A failure stops the deploy at that phase.

1. **Fetch**: HQ resolves the commit, checks for missing variables, and sends the source to the Porter.
2. **Build**: Porter builds the images with Railpack or `docker compose build`, as the [compose spec](compose.md#builds-and-images) describes.
3. **Release**: runs the release command, if one is set.
4. **Start**: Porter writes the revision and runs `up`, following the compose spec's **deploy** operation.
5. **Health**: HQ waits until every service is running, and healthy if it defines a health check, within a timeout.

A deploy succeeds when the **Health** phase passes. A failed deploy doesn't roll back automatically. HQ shows the failing services and offers **Roll back**.

Project members see the phases, with live output for the current phase. The Stack's operation log records who triggered the deploy, or **Webhook**, plus the commit and the result.

### Release command

A project can set one optional **release command**, such as `npx convex deploy` or a database migration. It runs once per deploy in a one-off container of the new image, with the resolved environment, after **Build** and before **Start**. For a compose source, the Admin picks the service whose image runs it. If the command fails, the deploy stops, and the running services stay untouched.

The release command is how a project deploys its Convex functions to a self-hosted Convex Workspace, using the wired outputs.

## Revisions and rollback

Each Stack revision records:

- The commit.
- The compose file, from the repository or generated for a Railpack source.
- The resolved environment at deploy time.

HQ stores revisions in the project folder. Porter keeps the images of recent revisions, as the compose spec describes.

**Roll back** redeploys an earlier revision's commit, compose file, and image with the **current** environment, as Coolify does. It's recorded as a new revision. If Porter pruned the image, it rebuilds the commit from source that HQ sends. The stored environment of the old revision is a record; rollback doesn't restore it. Drift **Restore** still rewrites the current revision exactly as deployed.

## Permissions

These actions follow the [users spec](users.md):

| Action | Minimum role |
| --- | --- |
| View deploy phases, output, operation log, and the deployed compose file | Viewer |
| **Deploy**, **Redeploy**, and **Roll back** | Operator |
| Create or remove a project, change its source, release command, or variables | Admin |
| View or regenerate the deploy key and deploy webhook | Admin |

## Removing a project

A project can be removed only after all its Workspaces are removed, following the Trays spec. Removal runs the **remove** operation on the Porter and asks whether to keep or delete the Stack's volumes. The default is to keep them. The project's Routes, revisions, deploy key, and `.env` file go with it.

## Handoff boundaries

Implementation owns the webhook URL format and request validation, mirror storage and garbage collection, archive transfer and size limits, how HQ parses compose variable references, the health timeout, the one-off container mechanics, and the concurrency of overlapping deploys.

Other decisions cover the adjacent contracts:

- [Unified dashboard](https://github.com/getalfredo/alfredo/issues/20): showing deploy status across projects, and any alerting on failed deploys.
- [Security model: secret protection & integration credential lifecycle](https://github.com/getalfredo/alfredo/issues/12): protecting deploy keys and variables at rest.
- [Collaboration UI: invitations and project membership](https://github.com/getalfredo/alfredo/issues/15): the membership screens around a project.
