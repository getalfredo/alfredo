# Compose Stacks

Status: agreed in [Compose stack management via Porter](https://github.com/getalfredo/alfredo/issues/8). This spec replaces the host-local compose handling in `src/lib/docker.ts`: HQ keeps state and orchestration, and Porter owns execution.

## Concepts

A **Stack** is one compose project running on one Porter. It's owned by either a project or a self-hosted Workspace. The UI and specs say "Stack", never "project", for a compose project.

A **Stack revision** is everything needed to run a Stack at one point in time: its file set, such as `compose.yml` plus any auxiliary files it mounts, and its resolved environment. Every deploy runs a Stack revision.

## Sources

A Stack gets its files from one of these sources:

- **Compose source**: a project's compose files. They can use `build:` contexts.
- **Railpack source**: a project's application source, built into an image with [Railpack](https://railpack.com). HQ generates the Stack's `compose.yml` for the built image, so a Railpack app runs like any other Stack.
- **Tray template**: a self-hosted Tray type's manifest template, rendered by HQ for one Workspace. See the [Trays spec](trays.md).

[Projects & deploy flow](https://github.com/getalfredo/alfredo/issues/11) owns how a project configures its source, such as the repository, branch, and the settings a generated compose file exposes.

HQ has no compose editor. Stack behavior comes only from sources and templates, so it stays predictable. Project members can view the deployed compose file read-only.

## State on HQ

HQ stores every deployed Stack revision on its filesystem, next to the owning project or Workspace. **Restore** reruns the current revision exactly as stored. Rollback reuses an earlier revision's files with the current environment, as the [projects spec](projects.md#revisions-and-rollback) describes. [Secrets storage & wiring](https://github.com/getalfredo/alfredo/issues/7) defines where environment values live and how HQ resolves them.

HQ keeps an append-only operation log per Stack, recording who ran which operation, when, and with what result. Project members see it. Full operation output stays in Porter's rotated operation logs, and HQ fetches it on demand, following the [Porter spec](porter.md#operations-and-disconnection).

The `bunqueue` action queue, `config.yaml` directory scanning, and the "Create Stack" flow go away. Porter operation IDs replace the queue.

## Layout on Porter

Porter stores each Stack under its own data directory, by default `~/.alfredo-porter/stacks/<stack-id>/`. A flag can change that location. The directory holds the revision's files and its `.env` file, written with `0600` permissions. Storing Stacks doesn't require root. The [Porter spec](porter.md#privileges) defines what Porter runs as.

Containers can write files into a Stack directory through bind mounts, and those files can belong to other user IDs than Porter's service user. Porter removes a Stack directory through Docker's own tooling, so removal never needs root.

The compose project name is `alfredo-<stack-id>`, and Porter labels every container, network, volume, and image it creates. Porter manages only labelled resources. It ignores compose projects that Alfredo didn't create, and v1 has no discovery or import of existing compose projects.

## Operations

Porter exposes a fixed set of compose operations. There's no generic "run compose with these arguments" operation.

| Operation | Effect | Minimum role |
| --- | --- | --- |
| **status** | Lists the Stack's containers with service, state, status, and ports. | Viewer |
| **logs** | Returns the last N lines, optionally following live, for the Stack or one service. | Viewer |
| **build** | Builds images for a revision on the Porter, with Railpack or `docker compose build`. | Operator |
| **deploy** | Writes the revision's files and `.env`, validates with `docker compose config`, then runs `pull` and `up -d --remove-orphans`. | Operator |
| **start**, **stop**, **restart** | Acts on the whole Stack or one service. | Operator |
| **down** | Removes containers and networks. Keeps volumes. | Operator |
| **remove** | Runs **down** and deletes the Stack directory. Deletes volumes only when asked; the default keeps them. | Admin |

Roles follow the [users spec](users.md): Operators deploy, roll back, and control services, and Admins keep control over configuration. A Tray backend function calls these same operations and declares its own minimum role, as the [Trays spec](trays.md#permissions) describes.

A failed validation stops a deploy before it touches running containers.

## Host access

By default, a Stack can't reach the Porter host beyond its own containers. During validation, Porter checks the normalized output of `docker compose config` and fails the deploy when any service requests one of these settings:

- Privileged mode, added capabilities, or host devices.
- Host mode for the network, PID, IPC, or user namespace.
- A bind mount of a path outside the Stack directory, including the Docker socket.

Bind mounts inside the Stack directory are always allowed, so a Stack can mount configuration files from its own source. The error names the service and the setting.

An Admin can turn on **Allow host access** for a project, as the [projects spec](projects.md#host-access) describes. HQ sends that setting with the operation, and Porter then skips the check. Tray templates go through the same check, and no v1 Tray type requests host access.

The check protects a Porter host from the people who can push to a project's repository. It isn't a sandbox, and it doesn't defend against a compromised HQ, because HQ sends the setting. See the [accepted risk](porter.md#accepted-risk) in the Porter spec.

## Builds and images

Builds run on the Porter that runs the Stack. The image stays in that host's local Docker image store, so v1 needs no registry. Build output streams to HQ like any other operation output. Remote builders and registries aren't part of v1.

Porter tags built images per revision, such as `alfredo/<stack-id>:<revision>`. After a successful deploy, Porter keeps the images of the current revision and the two previous revisions of each Stack, and prunes older Alfredo-tagged images. Porter never prunes images that it didn't build. Implementation can tune the retention count.

Porter hosts need Railpack and BuildKit for builds. Docker's built-in BuildKit can provide BuildKit. [Install & upgrade flow for HQ and Porter](https://github.com/getalfredo/alfredo/issues/17) owns installing them.

## Status

With every 10-second heartbeat, Porter runs one label-filtered `docker ps -a` for all its Stacks and reports the result. There's no separate event stream. HQ caches the last known state of each Stack. While a Porter is Offline, HQ shows the cached state marked as stale, separately from the Porter's connection status.

## Drift

Porter compares each Stack directory with its deployed revision and reports changed files. HQ shows a "modified on host" warning on the Stack that names those files. HQ never corrects drift automatically and doesn't show a content diff in v1.

**Restore** rewrites the Stack directory from the deployed revision on HQ and runs `up -d --remove-orphans`. It's equivalent to redeploying the current revision, so its minimum role is Operator.

## Handoff boundaries

Implementation owns the exact list of settings in the host access check, the wire format of operations, the revision identifier, the auxiliary-file size cap, the drift-check mechanics, how Porter reports only changed status, log tail defaults, and the image retention count.

Other decisions cover the adjacent contracts:

- [Projects & deploy flow](https://github.com/getalfredo/alfredo/issues/11): project sources, source checkout on the Porter, Railpack settings, the generated compose file's options, Stack placement, and rollback.
- [Reverse proxy manager](https://github.com/getalfredo/alfredo/issues/10): routing Stack services to hostnames.
- [Install & upgrade flow for HQ and Porter](https://github.com/getalfredo/alfredo/issues/17): installing Docker, Railpack, and BuildKit on Porter hosts.
