# Machine ops

Status: agreed in [Machine ops command set](https://github.com/getalfredo/alfredo/issues/9). This spec replaces the "Secure and prepare the VPS" step in `docs/index.md` as the definition of a secured host.

## Model

Machine ops in v1 are a read-only audit. Porter runs a fixed set of **Machine checks** on its host and reports the results to HQ. Neither HQ nor Porter changes the host's configuration.

The Admin secures the host by hand before installing Alfredo, using the check catalog in this spec as the checklist. [Install & upgrade flow for HQ and Porter](https://github.com/getalfredo/alfredo/issues/17) owns the user-facing install guide. That guide tells the Admin to secure the host first and links to this catalog.

Remediation, desired-state enforcement, and one-click fixes aren't part of v1.

## Supported hosts

Machine checks run only on Ubuntu 24.04 LTS.

Porter itself also runs on Arch Linux and macOS for local development. On any host other than Ubuntu 24.04, Porter runs no Machine checks, and HQ shows a neutral **Unsupported OS** badge. The badge doesn't count as failing.

## Access

Machine checks apply to a whole Porter, not to a project. Only Admins see results and trigger **Re-check**. Collaborators never see machine state, which follows the [users spec](users.md).

## Check catalog

The **Baseline** is the set of checks that decides whether a host counts as secured. Diagnostics inform the Admin but never affect the Porter's badge.

Each check reports one of these results: **Pass**, **Fail**, or **Unknown**. Diagnostics report a value instead, such as a count or a list.

### Baseline checks

| Check | Passes when |
| --- | --- |
| **SSH root login disabled** | The effective sshd configuration sets `PermitRootLogin no`. |
| **SSH password authentication disabled** | The effective sshd configuration sets `PasswordAuthentication no`. |
| **Non-root admin user** | A non-root user exists with `sudo` rights and at least one authorized SSH key. |
| **Host firewall active** | ufw is active with a default-deny policy for incoming traffic. |
| **Intrusion protection active** | fail2ban is running with the `sshd` jail enabled. |
| **Automatic security updates** | `unattended-upgrades` is installed and enabled. |
| **Time sync** | A time sync service is active and the clock reports as synchronized. |

The firewall check doesn't judge which ports are open. Deciding which ports should be open depends on the Admin's setup and on [Reverse proxy manager](https://github.com/getalfredo/alfredo/issues/10). The **Listening ports** diagnostic shows the open ports instead.

### Diagnostics

| Diagnostic | Reports |
| --- | --- |
| **Pending updates** | The number of pending security updates and other updates. |
| **Reboot required** | Whether the host needs a reboot to finish applying updates. |
| **Hostname** | The hostname, flagged when it looks like a provider default. |
| **Listening ports** | Ports that listen on public interfaces, with their process and whether Docker publishes them. |

Docker writes its own iptables rules, so ports that a Stack publishes bypass ufw. The firewall check can pass while a published port is reachable from the internet. The **Listening ports** diagnostic marks Docker-published ports so that the Admin can see this gap.

System logging isn't a check, because journald is always on in Ubuntu 24.04.

## Privileges

Machine checks run with Porter's normal privileges and don't require root. They read what an unprivileged user can read, such as sshd and ufw configuration files, service states, and time sync status.

When a check needs a fact that only root can read, the check reports **Unknown (needs root)** instead of guessing. Unknown doesn't count as Pass. [Porter privilege & blast-radius model](https://github.com/getalfredo/alfredo/issues/14) decides what Porter runs as, and it may raise check fidelity later. Machine checks alone aren't a reason to run Porter as root.

## Remediation help

Each check in HQ shows a one-line reason why the check matters and copyable Ubuntu commands that fix a failure. HQ never runs those commands. The Admin runs them over SSH.

## When checks run

Porter runs all Machine checks at these times:

- When Porter connects to HQ.
- Every 6 hours while connected.
- When an Admin clicks **Re-check**.

Running the checks is a Porter operation like any other, with an operation ID and output that follow the [Porter spec](porter.md#operations-and-disconnection).

## Results in HQ

HQ keeps only the latest result per Porter, with the time it ran. V1 keeps no history of past results.

Each Porter's page has a **Machine** section that lists every check with its result, reason, and remediation commands, plus the time of the last run and a **Re-check** button.

The Porter list shows one badge per Porter:

- **Passing**: every Baseline check passes.
- **N failing**: N Baseline checks fail or report Unknown.
- **Unsupported OS**: the host isn't Ubuntu 24.04.

While a Porter is Offline, HQ shows the cached result marked as stale.

HQ doesn't run Machine checks on its own host. To audit the HQ machine, the Admin installs a Porter on it.

## Handoff boundaries

Implementation owns how each check reads its facts, the exact remediation commands, the wire format of results, and the heuristic for provider-default hostnames.

Other decisions cover the adjacent contracts:

- [Install & upgrade flow for HQ and Porter](https://github.com/getalfredo/alfredo/issues/17): the install guide, including securing the host first, and replacing the first-run section of `docs/index.md`.
- [Porter privilege & blast-radius model](https://github.com/getalfredo/alfredo/issues/14): what Porter runs as, and therefore which checks can report Unknown.
- [Reverse proxy manager](https://github.com/getalfredo/alfredo/issues/10): which ports a host should expose.
- [Unified dashboard](https://github.com/getalfredo/alfredo/issues/20): aggregating Machine check results and any alerting when a check starts failing.
