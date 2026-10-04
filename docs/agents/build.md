# Build conventions

Read this document first in every build session. It fixes where code lives, how HQ and Porter exchange messages, how to verify a change, and what a session must show before it merges its pull request.

The specs in `docs/spec/`, the ADRs in `docs/adr/`, and `CONTEXT.md` define what to build. This document defines how.

## Repository layout

| Path | Contents |
| --- | --- |
| `hq/` | Everything Bun: `src/`, `tests/`, `bin/`, `package.json`, `bun.lock`, and the config files |
| `porter/` | The Go module for Porter, with its own `go.mod` |
| `protocol/` | `catalog.json` and the fixture messages that HQ and Porter share |
| `e2e/` | Level 3 tests, written as Bun tests that start both programs |
| `dev/` | Development tooling, such as `dev/vm/vm.sh` |
| `scripts/` | `install.sh` |
| `docs/` | Specs, ADRs, research, and agent documents |
| `package.json` | Scripts only, no dependencies. Runs every test level from the root. |

No Alfredo installation exists yet, and v1 is the first release. Move, rename, and delete files freely. Don't keep dead code working.

## Message format

HQ and Porter exchange JSON text frames over the one WebSocket. See [ADR 0007](../adr/0007-json-messages-with-shared-fixtures.md) for the reasons.

- **Envelope:** every message is an object with a `type` field. Operation requests add an `id`, a `name`, and an `args` object.
- **HQ:** one Zod schema per message, joined with `z.discriminatedUnion`. Types come from `z.infer`. HQ validates every incoming frame.
- **Porter:** Go structs with `json` tags. Decode the envelope into a struct with `type` and a `json.RawMessage` body, then decode the body by type. Porter validates operation arguments itself.
- **Shared contract:** `protocol/catalog.json` lists every message type and operation name. `protocol/` also holds at least one fixture file per message type. Both test suites round-trip every fixture strictly, so an extra or a missing field fails. Both check their registered types against the catalog.
- **Compatibility:** a handshake in which Porter states its version, a protocol number, and the operations that it supports.
- **Log and progress chunks:** JSON strings. Porter replaces bytes that aren't valid UTF-8 with the Unicode replacement character.
- **Read limit:** deploy operations carry compose files and a `.env` file. Set the WebSocket read limit on both sides deliberately. Don't rely on a library default.

To add or change a message, change all four in the same pull request: the fixture, the Zod schema, the Go struct, and the catalog entry.

## HQ user interface

The look of HQ follows variant A of the [HQ look prototype](https://github.com/getalfredo/alfredo/tree/prototype/hq-look/src/prototype/hq-look), agreed in [Initial look of HQ](https://github.com/getalfredo/alfredo/issues/44). To see it, check out the `prototype/hq-look` branch, run `bun run prototype:hq-look`, and open `/prototype/hq-look?variant=A`.

- **Shell:** a persistent sidebar on the left. It holds **Dashboard**, the list of projects with a status dot each and **New project**, and an **Infrastructure** group with **Porters**, **Trays**, and **People** for Admins. The signed-in user sits at the bottom.
- **Content:** a centered column of cards, built from the components in `hq/src/components/ui` and the color tokens in `styles/globals.css`.
- **Dashboard:** the three sections of the dashboard spec, stacked. Projects are a grid of cards.
- **Porter list:** one card per Porter, with its badges, usage meters, and a small chart.
- **Project page:** a header with the source, the Porter, and the actions, then tabs. The **Overview** tab shows the last deploy with its phases, the services, the Routes, and one status card per Workspace.
- **Workspace page:** its own page under the project, with the tabs that the Tray type defines.
- **Status:** a colored dot next to a text label. Never show status by color alone.
- **Theme:** light and dark, from the two token sets in `styles/globals.css`. HQ follows the system setting. Check every screen in both themes.
- **Background:** plain. Remove the animated background pattern from `index.css`.

The prototype is a reference for the look, not code to copy. Write each screen test-first against the specs.

## Test levels

Run every command from the repository root. A level passes when its command exits with status 0. On failure, each command must print enough for an agent to act on.

| Level | Command | What it proves | Run it after |
| --- | --- | --- | --- |
| 1. Unit | `bun run test` | Logic in HQ (`bun test`) and in Porter (`go test ./...`) | Every change |
| 2. Porter with Docker | `bun run test:integration` | Porter's operations against the local Docker daemon (`go test -tags integration ./...`) | A change to Porter's Docker code |
| 3. HQ with Porter | `bun run test:e2e` | Enrollment, heartbeats, and operations over the real connection, with both programs as local processes | A change to the message format, to HQ's Porter handling, or to Porter |
| 4. Virtual machine | `bun run test:vm` | `install.sh`, the systemd services, rootless Docker, reboots, and upgrades on disposable Ubuntu 24.04 virtual machines | A change to `install.sh`, a systemd unit, or anything that depends on rootless Docker, and before a release |

Level 4 doesn't exist until the install and release slice builds `dev/vm/vm.sh`. Automatic HTTPS, DNS status, and the release download need the real server and can't run at any level.

The design of each level is in [the test environment research](../research/build-test-environment.md).

### Rules for tests on the development machine

- Level 2 tests sit behind the Go build tag `integration`, so that `go test ./...` stays at level 1.
- Give HQ and Porter a temporary data directory for each test.
- Use a unique compose project name for each test, and remove what the test created when it ends.
- Never bind ports 80 or 443. Use high ports, or no published ports.
- Don't run `install.sh` on the development machine. It changes the host.
- Don't use `sudo` on the development machine. No level needs it.
- Don't leave virtual machines running.

## Continuous integration

Every pull request runs levels 1, 2, and 3 in GitHub Actions. The Bun version in the workflow matches the development machine.

The installer smoke job, on a pinned `ubuntu-24.04` runner, arrives with the install and release slice. Virtual machine runs stay local.

Branch protection on `main` requires the test jobs to pass before a merge. The build ticket that creates the jobs turns the protection on as its last step and lists the required check names here:

- _Not set yet._

## Merge gate

Build tickets run test-first with /tdd. A session merges its own pull request when all of the following are true:

1. The commands for every level that the change touches pass locally. The pull request description lists the commands and their results.
2. The checks on the pull request are green: `gh pr checks <number>`.
3. A review subagent on the Fable model reports no open findings.
4. The pull request description names every spec change that the pull request makes.

Then squash-merge. Don't merge on red, and don't skip a level because it's slow.
