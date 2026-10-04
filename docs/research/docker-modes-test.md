# Docker modes test on Ubuntu 24.04

This document records a hands-on test of three Docker modes for Porter hosts. It answers [Test Docker modes on an Ubuntu 24.04 virtual machine](https://github.com/getalfredo/alfredo/issues/29) and feeds [Porter privilege & blast-radius model](https://github.com/getalfredo/alfredo/issues/14).

The three modes:

1. **Rootful**: standard Docker, service user in the `docker` group.
2. **Remap**: rootful Docker with `userns-remap`.
3. **Rootless**: rootless Docker under a dedicated service user.

Everything in the results table and the evidence appendix was observed in the virtual machines described below, unless a line is marked *(inferred)* or *(not tested)*. The earlier document, [Rootless Docker fit for Porter](rootless-docker.md) on the `research/rootless-docker` branch, was documentation-only. The section [Differences from the earlier research](#differences-from-the-earlier-research) lists where the observations disagree with it.

**The escape area wasn't tested.** The session was stopped by an automated safety check before those commands ran. See [What stayed untested](#what-stayed-untested). The decision in issue 14 depends most on that area, so it needs a separate run.

A later run tested whether one unattended command can do the whole rootless setup. See [One-command rootless install](#one-command-rootless-install).

## Method

### Virtual machines

- Workstation: Arch Linux, QEMU 11.1.1 with KVM, no `sudo`, no libvirt networks.
- Image: official Ubuntu 24.04 cloud image (`noble-server-cloudimg-amd64.img`, checksum verified against `SHA256SUMS`).
- Three server VMs, one for each mode, each on its own qcow2 overlay so that each mode starts clean. 4 vCPUs and 6 GB of memory each.
- One client VM that acts as "outside the virtual machine".
- Seed: a `cidata` ISO built with `genisoimage`, with a throwaway SSH key.

### Network

Each server VM has two network interfaces:

- `mgmt0`: QEMU user-mode networking. Used only for SSH from the workstation and for internet access.
- `lab0`: a point-to-point Ethernet link to the client VM, built with `-netdev dgram` over loopback UDP. Addresses are static: server `10.77.<mode>.10` and `fd77:<mode>::10`, client `10.77.<mode>.20` and `fd77:<mode>::20`.

All client-IP and firewall tests use the `lab0` link. Packets on that link are plain Ethernet frames between two guest kernels. QEMU doesn't translate addresses on a `dgram` link, so the source address that the server sees is the client VM's real address. QEMU user-mode networking with `hostfwd` would rewrite the source, so no test result relies on it.

One test artifact is worth knowing. RootlessKit's internal network uses `10.0.2.0/24`, which is also QEMU's default user-mode subnet. In the rootless VM, containers on the default bridge got the nameserver `10.0.2.3` (QEMU's DNS address), which RootlessKit's network swallowed, and image builds failed on DNS. Moving that VM's `mgmt0` to `10.0.9.0/24` fixed it. See [E5](#e5-compose-and-builds).

### Versions

| Component | Version |
| --- | --- |
| Ubuntu | 24.04.5 LTS |
| Kernel | 6.8.0-142-generic |
| Docker Engine and CLI | 29.8.2 (`docker-ce` 5:29.8.2-1~ubuntu.24.04~noble) |
| containerd | 2.3.6 |
| runc | 1.5.1 |
| RootlessKit | 3.1.0 (network driver `gvisor-tap-vsock`, port driver `builtin`) |
| Docker Compose | v5.6.0 |
| buildx | v0.37.1 |
| `uidmap` | 1:4.13+dfsg1-4ubuntu3.2 |
| Caddy | v2.11.6 (`caddy:2` image) |
| Railpack | 0.40.1 |

### Users and layout

- `porter`: the service user. `useradd --system --create-home --shell /usr/sbin/nologin`. Home is `0700`. Stacks live in `/home/porter/.alfredo-porter/stacks/<id>/`.
- `hq`: a second system user that stands in for HQ. Its data directory `/var/lib/alfredo-hq` is `0700` and holds a `0600` file.
- Every command "as the service user" ran through `sudo -u porter -H`, never through a login shell. In rootless mode the wrapper also set `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, and `DOCKER_HOST`.

## Results

| Area | Rootful | Remap | Rootless |
| --- | --- | --- | --- |
| **Install: root steps** | 2: install packages, add `porter` to the `docker` group. | 3: the same, plus `daemon.json` and a daemon restart. | 6 required: install packages and `uidmap`, turn off the rootful daemon, add a subordinate ID range, enable lingering, grant low ports, load `br_netfilter`. The rest runs as `porter`. |
| **Install: `nologin` service user** | Works. | Works. | Works. The setup tool needs `XDG_RUNTIME_DIR` set by hand, and it reports "systemd not detected" if it runs before the user manager is up. |
| **Install: subordinate IDs** | Not used. | Docker created `dockremap:100000:65536`, which overlaps the existing `ubuntu:100000:65536`. | `useradd --system` adds none. The setup tool suggests `100000:65536`, which overlaps `ubuntu`. `usermod --add-subuids 231072-296607` works. |
| **Install: after reboot** | Daemon, Proxy, and Stack came back. | Same. | Same, through lingering, with no login as `porter`. |
| **Proxy: ports 80 and 443** | Work. | Work. | Fail until root grants low ports. Both `setcap` and the sysctl work. The `setcap` grant disappeared after a package reinstall. |
| **Proxy: client IP in Caddy** | Real client address, IPv4 and IPv6. | Real client address, IPv4 and IPv6. | Default: the bridge gateway (`172.18.0.1`). With `userland-proxy: false` and `br_netfilter` loaded: real client address, IPv4 and IPv6. |
| **HQ route: host-gateway name to HQ on loopback** | Fails. | Fails. | Fails by default. Works with host loopback enabled and `host-gateway-ip` set to `10.0.2.1`, and then every container reaches every host-loopback service. |
| **HQ route: host-gateway name to HQ on all addresses** | Works. Blocked by ufw until a rule allows the Proxy network. | Same as rootful. | Fails. |
| **HQ route: HQ on a host address, Proxy dials that address** | Works. Blocked by ufw until a rule allows the Proxy network. | Same as rootful. | Works, with or without ufw. |
| **HQ route: Proxy with `network_mode: host`** | Works. | Refused by the daemon. | Works. |
| **HQ route: Unix socket bind-mounted into the Proxy** | Works. | Fails: permission denied. | Works, but not for a socket under `/run`. |
| **Compose: volume, bind mount, non-root user, healthcheck** | Work. | Work. Container root can't write to a `0755` bind directory owned by `porter`. | Work. |
| **Compose: memory and CPU limits** | Enforced. | Enforced. | Enforced. `cpuset` and `io` aren't available. |
| **`docker compose build`** | Works. | Works. | Works. |
| **Railpack: `prepare` plus buildx frontend** | Works. | Fails with the built-in BuildKit. | Works. |
| **Railpack: `railpack build`** | Works. | Fails: `--privileged` is refused. Works only with `--userns=host`. | Works, including the `--privileged` BuildKit container. |
| **Escape** | *(not tested)* | *(not tested)* | *(not tested)* |
| **Firewall: published port with ufw default-deny** | Reachable from outside over IPv4. | Reachable from outside over IPv4. | Blocked. Ports 80 and 443 also need `ufw allow`. |
| **File ownership: container root writes** | `0:0` (host root). | `100000:100000`. | `999:987` (`porter`). |
| **File ownership: container UID 1000 writes** | `1000:1000` (the host's `ubuntu` user). | `101000:101000`. | `232071:232071`. |
| **File ownership: service user deletes the Stack directory** | Files: yes. Directories that a container created: no. Needs a container to clean up. | Files: yes. Directories: no. A cleanup container removed their contents but reported an error on the directory that `porter` owns. | Files: yes. Directories made by container root: yes. Directories made by other container UIDs: only through `rootlesskit rm`. |

## Advantages and disadvantages

### Rootful

Advantages:

- The shortest install: two root steps.
- Ports 80 and 443 and real client addresses work with no configuration.
- Both Railpack paths work.
- Every HQ route candidate except host-gateway-to-loopback works.
- One cleanup path for Stack directories: a container that mounts the directory.

Disadvantages:

- A published port is reachable from outside with ufw active and default-deny. This confirms the gap that the machine ops spec documents.
- With ufw active, the Proxy can't reach a host port until a ufw rule allows the Proxy network. The HQ route returned `502` until the rule was added.
- Files that containers write are owned by host root or by unrelated host users, such as `ubuntu` for UID 1000. The service user can't remove container-created directories directly.
- The escape area wasn't tested here. The earlier research states, from documentation, that the socket is root-equivalent in this mode.

### Remap

Advantages:

- Ports, client addresses, and the reboot behavior match rootful mode.
- Container root is host UID 100000, which had no access to a `0750` directory owned by `hq:porter` in the Unix socket test.
- `--privileged` and `network_mode: host` are refused unless the container opts out with `--userns=host`.

Disadvantages:

- Railpack doesn't work as documented. The frontend path fails because `userns-remap` moves the daemon off the containerd image store. The CLI path needs a `--privileged` BuildKit container, which needs `--userns=host`, the same opt-out that removes the protection.
- Stack directory cleanup is the most awkward of the three. Container-created directories belong to UID 100000 or higher, and the service user can't remove them. A cleanup container can remove what containers created, but not entries that `porter` owns, so cleanup takes both steps.
- Container root can't write to a bind directory that the service user owns with mode `0755`.
- Docker's default `dockremap` range overlapped an existing user's range.
- Published ports bypass ufw, as in rootful mode.
- The Unix socket candidate for the HQ route fails.

### Rootless

Advantages:

- ufw applies to published ports. A published port was unreachable from outside until `ufw allow`.
- The Proxy reaches HQ on a host address with no firewall rule and no daemon option.
- Files that container root writes belong to the service user. `rootlesskit rm -rf` removes everything else as the service user, with no root.
- Both Railpack paths and `docker compose build` work, including a `--privileged` BuildKit container.
- Memory and CPU limits are enforced with Ubuntu's default delegation.
- The daemon and the Stack came back after a reboot with no login.

Disadvantages:

- The longest install: six root steps, and the setup tool is sensitive to timing and environment for a `nologin` user.
- Real client addresses need two settings. `userland-proxy: false` without `br_netfilter` loaded stops the daemon from starting.
- The `setcap` port grant is lost when the package is reinstalled. The Proxy then fails on the next daemon restart.
- After a failed start, a container ran with no network and no published ports, and reported no error. Only recreating it fixed it. See [E3](#e3-proxy).
- After the failed daemon start, the `alfredo-proxy` network was listed but unusable until `compose down` and `up`.
- Bind mounts of paths under `/run` show an empty directory.
- RootlessKit's `10.0.2.0/24` network can collide with the host's network.
- `journalctl --user` doesn't work for a system user. Reading the daemon's log needed root.
- Enabling host loopback for the HQ route opens every host-loopback service, including sshd, to every container.

## Differences from the earlier research

Observed results that contradict or sharpen [Rootless Docker fit for Porter](rootless-docker.md):

- **`br_netfilter` is required, not optional.** The earlier document lists it as optional and says when it's needed is unverified. With `userland-proxy: false` and no `br_netfilter`, the rootless daemon failed to start.
- **`host-gateway-ip` is `10.0.2.1`, not `10.0.2.2`.** With the `gvisor-tap-vsock` driver, the host-loopback address is the gateway `10.0.2.1`. `10.0.2.2` timed out.
- **The Proxy can dial the host's own address in rootless mode.** The earlier document marks this unverified. It worked with default settings, and HQ saw the connection come from the host's own address.
- **A `--privileged moby/buildkit` container works under rootless mode.** The earlier document marks this unverified and suggests that only the frontend path would work. Both paths built and ran. No change to `kernel.apparmor_restrict_unprivileged_userns` was needed.
- **Railpack under `userns-remap` fails on both documented paths.** The earlier document's `userns-remap` section doesn't mention builds and rates its compose compatibility as only "reduced".
- **The HQ route in rootful mode isn't free.** The earlier document says it "works through the bridge gateway". It works only if HQ listens on a non-loopback address, and with ufw active it needs an explicit allow rule.
- **`userns-remap` creates an overlapping range by default.** The earlier document quotes Docker's warning about overlap but doesn't note that the default setup produces one on a stock cloud image.
- **RootlessKit logs that `--disable-host-loopback` "is not yet supported for gvisor-tap-vsock".** Despite the warning, host loopback was unreachable by default and reachable when the flag was removed.

Confirmed as the earlier document predicted: the `nologin` install path with lingering, the `setcap` grant not surviving a package replacement, ufw filtering rootless published ports, real client addresses for IPv4 and IPv6 with `userland-proxy: false`, `Delegate=pids memory cpu` on Ubuntu's systemd, and `docker compose build` and the Railpack frontend under the rootless daemon.

## What stayed untested

- **The whole escape area, in all three modes.** This covers a container with `privileged`, a bind mount of `/`, and the Docker socket, and what it can read and write: the `0700` HQ directory, `/etc/shadow`, another Stack's `.env`, `userns_mode: host` under remap, and `pid: host`. An automated safety check stopped the session when it reached this step, and the commands never ran. No cell is filled from documentation. Three adjacent facts were observed in other tests and aren't a substitute: the user ID mappings in [E1](#e1-install), the daemon refusing `--privileged` under remap in [E5](#e5-compose-and-builds), and the service user being denied on the HQ directory in [E1](#e1-install).
- **Public certificates.** HTTP-01 needs a public hostname and inbound port 80 from the internet. Caddy used its internal certificate authority (`tls internal`).
- **`userland-proxy: false` under rootful and remap.** Both already logged the real client address, so the setting wasn't changed.
- **A real package upgrade.** The `setcap` test used `apt-get install --reinstall`, which replaces the binary the same way *(inferred)*.
- **`cpuset` and `io` limits under rootless mode.** The daemon warned that they aren't supported. No drop-in was tested.
- **HQ as a container.** The fourth candidate from the earlier document wasn't built. The Proxy reaching a container by name on `alfredo-proxy` was observed in every mode, so the network path works *(inferred for HQ)*.
- **Performance.** No throughput, latency, or CPU measurement of the rootless network path.
- **IPv6 outbound from rootless containers, overlay networks, `devices:`, and Stack-to-Stack isolation.**
- **Published-port reachability over IPv6 under rootful and remap** was blocked in the test, but the published container was on the default bridge, which has no IPv6. A network with IPv6 enabled wasn't tested for this.

## One-command rootless install

This section answers a follow-up question: can one unattended command, run as root, do the complete rootless setup for the `porter` service user? The earlier sections found six root steps and several hazards. This run put them into one script and ran it in three scenarios.

**Short answer.** Yes, on the hosts tested. The command worked unattended on a clean Ubuntu 24.04 host and on a host that already runs rootful Docker with containers. On a host where another process holds port 80, the setup itself completes, and the script reports the port conflict and exits with status 1. Two things stay outside the one command: opening ports 80 and 443 in ufw, and freeing a port that another process holds. The result covers one Ubuntu release, one Docker version, and one architecture. See [What stayed untested in this run](#what-stayed-untested-in-this-run).

Everything here was observed in the virtual machines unless a line is marked *(inferred)* or *(not tested)*. The escape area was out of scope for this run and wasn't touched.

### The command

```sh
curl -fsSL https://raw.githubusercontent.com/getalfredo/alfredo/research/docker-modes-test/docs/research/docker-modes-test/install-rootless-porter.sh | sudo sh
```

The script is [`docker-modes-test/install-rootless-porter.sh`](docker-modes-test/install-rootless-porter.sh). It's a prototype. It takes no input and no arguments.

In the test, the virtual machines fetched the same file from an HTTP server on the workstation: `curl -fsSL http://10.0.9.2:8765/install-rootless-porter.sh | sudo sh`. The command ran over SSH with no terminal attached. The GitHub URL above wasn't fetched from inside a virtual machine.

Output on a clean host, complete:

```console
$ curl -fsSL http://10.0.9.2:8765/install-rootless-porter.sh | sudo sh
==> Masking the rootful docker.service and docker.socket; nothing on this host uses them
==> Adding Docker's apt repository
==> Installing: docker-ce docker-ce-cli containerd.io docker-ce-rootless-extras docker-buildx-plugin docker-compose-plugin uidmap
==> Creating system user porter
==> Assigning subordinate IDs 165536-231071
==> Allowing unprivileged processes to bind ports from 80
==> Writing /home/porter/.config/docker/daemon.json
==> Running dockerd-rootless-setuptool.sh as porter

Self-check
PASS  daemon reachable as porter at /run/user/999/docker.sock
PASS  docker info reports rootless
PASS  porter has no access to a rootful socket
PASS  a container can publish port 80

RESULT: PASS. Rootless Docker is ready for porter.
exit status: 0
wall clock: 24.7 s
```

Wall-clock time on a clean host: 24.7 s and 21.2 s in two runs of the final script, and 25.0 s for the first version. That includes the package download (101 MB) and the `caddy:2` image pull for the self-check. The workstation has a fast connection, so expect longer elsewhere *(inferred)*.

### What the script does

1. Checks that it runs as root on Ubuntu. Sets a non-interactive environment for apt.
2. Finds which of the seven packages are missing: `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-ce-rootless-extras`, `docker-buildx-plugin`, `docker-compose-plugin`, `uidmap`. If none is missing, it skips to step 6.
3. Stops with an error if `docker.io` or the Docker snap is present. Installing `docker-ce` would remove them.
4. If `docker-ce` isn't installed, masks `docker.service` and `docker.socket` before the package arrives, so that no rootful daemon ever starts on a host that had none. If `docker-ce` is already installed, it leaves the rootful daemon as it is.
5. Adds Docker's apt repository if no Docker source file exists, then installs only the missing packages. It waits for apt locks instead of failing.
6. Creates the `porter` system user with a home directory and the `nologin` shell, if the user doesn't exist. It doesn't add `porter` to any group.
7. Assigns 65536 subordinate user and group IDs. The range starts above the highest range that `/etc/subuid` and `/etc/subgid` already hold. On the stock image that's `165536-231071`, next to `ubuntu:100000:65536`.
8. Writes `net.ipv4.ip_unprivileged_port_start=80` to `/etc/sysctl.d/90-alfredo-porter.conf` and applies it, if the current value is above 80.
9. Writes `br_netfilter` and `nf_tables` to `/etc/modules-load.d/alfredo-porter.conf` and loads both.
10. Enables lingering for `porter` and waits, for up to 60 seconds, until the user's systemd manager answers.
11. Writes `{"userland-proxy": false}` to `/home/porter/.config/docker/daemon.json`, if the file doesn't exist. This happens before the daemon's first start, so no restart is needed.
12. Runs `dockerd-rootless-setuptool.sh install` as `porter`, with `HOME`, `XDG_RUNTIME_DIR`, and `DBUS_SESSION_BUS_ADDRESS` set, if the user unit doesn't exist yet. It doesn't pass `--force`.
13. Enables and starts the user's `docker.service`.
14. Runs the self-check and prints one `PASS` or `FAIL` line for each check, then a `RESULT` line. The exit status is 0 only if every check passes. The checks:
    - The daemon answers `docker info` as `porter`.
    - `docker info` reports `rootless`.
    - `porter` can't write to `/var/run/docker.sock` and isn't in the `docker` group.
    - Ports 80 and 443: if the rootless daemon already publishes them, pass. If another process holds one, fail and name the process. Otherwise run a `caddy:2` container with `-p 80:80`, request it on loopback, and remove it.
15. If ufw is active, prints a note with the two `ufw allow` commands. It doesn't change the firewall.

The output of apt and of the setup tool goes to `/var/log/install-rootless-porter.log`. On an error, the script prints the last 15 lines of that file.

### Results

| | 1. Clean host | 2. Rootful Docker, container on 8080 | 3. Rootful Docker, container on 80 |
| --- | --- | --- | --- |
| **Worked unattended** | Yes. Exit status 0, all checks pass. | Yes. Exit status 0, all checks pass. No `--force` was needed. | Setup: yes. Exit status 1, because the port check fails. |
| **Wall clock** | 24.7 s, 21.2 s | 10.0 s | 7.2 s |
| **What it installed** | All seven packages. | `uidmap` only. | `uidmap` only. |
| **Rootful daemon afterward** | Never started. Units masked. No `/var/run/docker.sock`, no `docker0`. | Untouched: same process ID, container `StartedAt` unchanged, restart count 0, host iptables rules identical. | Untouched, same evidence. |
| **`porter` and the rootful socket** | No socket exists. | Permission denied. `porter` is in no group but its own. | Permission denied. |
| **Subordinate IDs** | `porter:165536:65536`, no overlap with `ubuntu:100000:65536`. | Same. | Same. |
| **Proxy as `porter` on 80 and 443** | Works. `308` on 80, `200` on 443. | Works. | Fails: `bind: address already in use`. Port 80 keeps serving the rootful container. |
| **Client IP in Caddy's log** | `10.77.1.20` and `fd77:1::20`, the real client. | `10.77.2.20` and `fd77:2::20`, the real client. | After the port was freed: `10.77.3.20` and `fd77:3::20`. |
| **After reboot, no login** | Rootless daemon, Proxy, and backend returned. Rootful units stayed masked. | Both daemons and all four containers returned. | Both daemons returned. The rootful container held port 80 again. The Proxy stayed in `Created`. |
| **Second run** | Exit status 0 in 0.6 s. Changed nothing. Containers kept running. | Exit status 0 in 0.3 s. Rootful daemon untouched. | Exit status 1 with the same `FAIL` line until the port was freed, then exit status 0. |

Coexistence in scenario 2, with ufw active, default deny incoming, and SSH allowed. Requests came from the client VM:

| Request | ufw default deny | After `ufw allow 80/tcp` and `443/tcp` | After reboot |
| --- | --- | --- | --- |
| Rootful container, port 8080 | `200` | `200` | `200` |
| Rootless Proxy, port 80 | no connection | `308` | `308` |
| Rootless Proxy, port 443 | no connection | `200` | `200` |
| Rootless container, port 8081 | no connection | no connection | no connection |

- **ufw.** The rootful daemon's published port bypasses ufw, as in the earlier test. The rootless daemon's ports obey ufw. Installing rootless Docker next to rootful Docker changes neither behavior.
- **iptables.** The host's non-ufw iptables rules had the same checksum before the installer, after it, and with rootless containers running. The rootless daemon keeps its rules in its own network namespace.
- **Networks.** Both daemons use `172.17.0.0/16` for their default bridge. They don't collide, because the rootless bridges exist only inside the rootless network namespace. The host shows only the rootful `docker0`.
- **Traffic.** Containers of both daemons reached the internet. A rootless container reached the rootful published port on the host address. A rootful container reached the rootless Proxy on the host address.
- **Reboot.** Both daemons and their containers came back with no login as `porter`.

### The port 80 conflict

In scenario 3 the script finishes the setup and the self-check reports:

```
FAIL  port 80 is taken by another process, so the Proxy can't publish it: users:(("docker-proxy",pid=2842,fd=8))

RESULT: FAIL. Fix the lines marked FAIL, then run this script again.
```

Starting the Proxy as `porter` anyway gives this error from `docker compose up -d`:

```
Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint proxy (48710cb3...): error while calling RootlessKit PortManager.AddPort(): listen tcp4 0.0.0.0:80: bind: address already in use
```

The Proxy container stays in `Created`. Nothing is taken from the rootful container: the client kept getting `200` from it on port 80.

The same happens when the rootful daemon runs with its own `userland-proxy: false`. In that case `dockerd` itself holds the listener, and both the self-check and RootlessKit report the conflict the same way.

After the Admin stopped the rootful container, a second run of the script passed. The Proxy container that had failed earlier was a different matter. A plain `docker compose up -d` started it with no network and no published ports, and reported no error. `up -d --force-recreate` fixed it. This is the same daemon behavior that [E3](#e3-proxy) recorded. The script's self-check doesn't detect it, because the check uses its own container.

### Failures hit while developing the script

The first version of the script passed scenarios 1, 2, and 3 on the first attempt. The failures below came from deliberate stress tests and from the changes they led to.

| # | Failure | Status |
| --- | --- | --- |
| 1 | **apt package-list lock.** With another process holding `/var/lib/apt/lists/lock`, `apt-get update` failed at once and the script exited with status 100. `DPkg::Lock::Timeout` covers only the dpkg lock. | Solved. The script retries each apt command every 10 seconds for 3 minutes. Observed with both locks held for 25 seconds: the script waited and passed. |
| 2 | **Interrupted first run left a rootful daemon.** The first version let the `docker-ce` package start the rootful daemon and turned it off afterward. When the SSH connection dropped after the packages were installed, the daemon stayed active and enabled. The next run saw `docker-ce` installed, treated the daemon as one that was there before, and left it running. | Solved. The script masks the rootful units before it installs the package, so the daemon never starts. In two interrupted runs of the final script the units stayed masked, and the next run on each host completed. |
| 3 | **Setup tool refused to run with the rootful units masked.** It printed `Missing system requirements` and `modprobe nf_tables`. On every earlier run the rootful daemon had loaded that module as a side effect. | Solved. The script loads `nf_tables` and persists it in `/etc/modules-load.d`. After a reboot with the rootful units masked, the rootless daemon and the Proxy returned. |
| 4 | **Error lines from the package scripts.** With the units masked, the `docker-ce` package prints `Failed to preset unit, unit /etc/systemd/system/docker.service is masked` and a `deb-systemd-helper: error` line. The install still succeeds. | Hidden, not solved. The script sends apt output to its log file. An Admin who later reinstalls or upgrades `docker-ce` by hand sees the lines. After a reinstall the units stayed masked and inactive. |
| 5 | **Port held by another process.** See [The port 80 conflict](#the-port-80-conflict). | Reported, not solved. The script names the process and exits with status 1. Freeing the port is the Admin's decision. |
| 6 | **Proxy with no ports after a failed start.** See the last paragraph of [The port 80 conflict](#the-port-80-conflict). | Remains. Porter has to recreate the Proxy container after a failed port bind. The installer can't fix it. |
| 7 | **A test mistake.** The first lock test used `flock`, which apt doesn't honor. The script passed without waiting. The test was repeated with `fcntl` locks, which gave failure 1. | Test fixed. |

Hazards from the earlier sections that the script handles in advance. None of them occurred in any run:

- **No subordinate IDs for a system user, and the setup tool's overlapping suggestion.** The script computes a free range. Observed: `165536-231071`.
- **"systemd not detected".** The script waits for the user manager before it runs the setup tool. The setup tool created and enabled the unit in every run.
- **Abort on a reachable rootful socket.** The setup tool checks whether the calling user can write to `/var/run/docker.sock`. `porter` isn't in the `docker` group and can't, so the tool didn't abort and the script doesn't pass `--force`. The `ubuntu` user's membership in the `docker` group had no effect.
- **Low ports.** The sysctl file was in place before the daemon's first start. The value was `80` after each reboot.
- **`userland-proxy: false` without `br_netfilter`.** The module is loaded and persisted before the daemon's first start. The daemon started in every run, and Caddy logged real client addresses.
- **A piped script eating its own input.** The script's body runs with standard input from `/dev/null`, so apt and Docker can't read the rest of the script from the pipe. The script worked with `| sudo sh`, with `| sudo bash`, and from a root login shell.

One hypothesis was tested and didn't hold. A rootful daemon with `userland-proxy: false` might have published port 80 with no listener, which would have let the self-check pass wrongly. It didn't: `dockerd` 29.8.2 holds the listener itself.

### What the one command doesn't cover

- **ufw.** With ufw active, the Proxy is unreachable until the Admin runs `ufw allow 80/tcp` and `ufw allow 443/tcp`. The script prints the two commands and doesn't run them. Adding them to the script is possible, but it changes the host's firewall *(a design decision, not tested)*.
- **A busy port 80 or 443.** The script reports it. The Admin has to move or stop the other service.
- **The low-port grant is host-wide.** After the script, every unprivileged process on the host can bind ports 80 to 1023, not only `porter`.
- **No `docker` command for the Admin on a clean host.** `sudo docker ps` fails with `failed to connect to the docker API at unix:///var/run/docker.sock`, because the rootful units are masked. To inspect Porter's containers, the Admin needs `sudo -u porter -H env XDG_RUNTIME_DIR=/run/user/<uid> docker ps`. An Admin who wants a rootful daemon later has to run `systemctl unmask docker.service docker.socket`.
- **The daemon's log.** Still readable only as root, with `journalctl _UID=<uid>`.

### What stayed untested in this run

- **The command with the GitHub URL.** The virtual machines fetched the script from the workstation. The pipe shape is the same.
- **Other hosts.** Only Ubuntu 24.04.5 on amd64, from the official cloud image, with Docker 29.8.2. No other Ubuntu release, no Debian, no arm64, no minimal or hardened image.
- **Hosts with `docker.io` or the Docker snap.** The script stops with an error. That path didn't run.
- **An existing rootful Docker that's older than the repository's current version.** The script installs only missing packages. In scenarios 2 and 3 the only missing package was `uidmap`. A host where `docker-ce-rootless-extras` is missing and `docker-ce` is old would get a newer extras package next to an older daemon.
- **A rootful daemon with `userns-remap`,** which adds a `dockremap` range. The range computation reads every line of both files, so it should pick a free range *(inferred)*.
- **A connection that drops while dpkg is unpacking.** Three interrupted runs were tested, with and without a terminal. None of them caught dpkg in the middle of a package, and `dpkg --audit` was clean each time. The script doesn't repair a half-configured dpkg.
- **No route to Docker Hub or to `download.docker.com`.** The self-check pulls `caddy:2`. A failed pull would show as `FAIL  a container can't publish port 80` with the pull error *(inferred)*.
- **A real package upgrade** of `docker-ce` or `docker-ce-rootless-extras` after the install. Only `apt-get install --reinstall docker-ce` ran.
- **An existing `porter` user or an existing `daemon.json`** with other settings. The script keeps both and prints a warning for the file.
- **Published ports over IPv6 through ufw, and performance.**
- **The escape area.** Out of scope for this run.

## Evidence appendix

Commands ran over SSH as `ubuntu` with `sudo`. `asporter` is the wrapper that runs a command as the service user. Output is trimmed. `N` is the mode number.

### E1. Install

Base state on all three VMs:

```console
$ lsb_release -ds; uname -r
Ubuntu 24.04.5 LTS
6.8.0-142-generic
$ grep -n . /etc/subuid
/etc/subuid:1:ubuntu:100000:65536
$ sysctl kernel.apparmor_restrict_unprivileged_userns net.ipv4.ip_unprivileged_port_start
kernel.apparmor_restrict_unprivileged_userns = 1
net.ipv4.ip_unprivileged_port_start = 1024
$ sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
Setting up docker-ce-rootless-extras (5:29.8.2-1~ubuntu.24.04~noble) ...
Setting up docker-ce (5:29.8.2-1~ubuntu.24.04~noble) ...
$ ls -l /usr/bin/newuidmap
ls: cannot access '/usr/bin/newuidmap': No such file or directory
$ sudo aa-status | grep -i rootless
   rootlesskit
```

Users, on all three:

```console
$ sudo useradd --system --create-home --home-dir /home/porter --shell /usr/sbin/nologin porter
$ sudo useradd --system --create-home --home-dir /var/lib/alfredo-hq --shell /usr/sbin/nologin hq
$ getent passwd porter hq
porter:x:999:987::/home/porter:/usr/sbin/nologin
hq:x:997:986::/var/lib/alfredo-hq:/usr/sbin/nologin
$ grep -n . /etc/subuid
/etc/subuid:1:ubuntu:100000:65536
$ sudo ls -ld /var/lib/alfredo-hq /var/lib/alfredo-hq/secrets.db
drwx------ 2 hq hq 4096 /var/lib/alfredo-hq
-rw------- 1 hq hq   30 /var/lib/alfredo-hq/secrets.db
$ sudo -u porter cat /var/lib/alfredo-hq/secrets.db
cat: /var/lib/alfredo-hq/secrets.db: Permission denied
```

Rootful:

```console
$ sudo usermod -aG docker porter
$ asporter docker info --format '{{.SecurityOptions}} {{.CgroupDriver}}/{{.CgroupVersion}} {{.Driver}} {{.DockerRootDir}}'
[name=apparmor,profile=default name=seccomp,profile=builtin name=cgroupns] systemd/2 overlayfs /var/lib/docker
$ asporter docker run --rm alpine cat /proc/self/uid_map
         0          0 4294967295
```

Remap:

```console
$ sudo usermod -aG docker porter
$ echo '{"userns-remap": "default"}' | sudo tee /etc/docker/daemon.json
$ sudo systemctl restart docker
$ grep -n . /etc/subuid
/etc/subuid:1:ubuntu:100000:65536
/etc/subuid:2:dockremap:100000:65536
$ asporter docker info --format '{{.SecurityOptions}} {{.Driver}} {{.DockerRootDir}}'
[name=apparmor,profile=default name=seccomp,profile=builtin name=userns name=cgroupns] overlay2 /var/lib/docker/100000.100000
$ asporter docker run --rm alpine cat /proc/self/uid_map
         0     100000      65536
```

The storage driver changed from `overlayfs` (containerd image store) to `overlay2`. That matters for Railpack in [E5](#e5-compose-and-builds).

Rootless. The setup tool before any prerequisite:

```console
$ sudo -u porter -H dockerd-rootless-setuptool.sh check
[ERROR] Missing system requirements. Run the following commands to
[ERROR] install the requirements and run this tool again.
apt-get install -y uidmap
echo "porter:100000:65536" >> /etc/subuid
echo "porter:100000:65536" >> /etc/subgid
```

Root steps:

```console
$ sudo apt-get install -y uidmap
$ ls -l /usr/bin/newuidmap
-rwsr-xr-x 1 root root 41864 /usr/bin/newuidmap
$ sudo systemctl disable --now docker.service docker.socket
$ sudo rm -f /var/run/docker.sock
$ sudo usermod --add-subuids 231072-296607 --add-subgids 231072-296607 porter
$ grep -n . /etc/subuid
/etc/subuid:1:ubuntu:100000:65536
/etc/subuid:2:porter:231072:65536
$ sudo loginctl enable-linger porter
$ loginctl show-user porter | grep -E 'Linger|State'
State=opening
Linger=yes
```

First install attempt, run right after `enable-linger` while the state was `opening`:

```console
$ asporter dockerd-rootless-setuptool.sh install
[INFO] systemd not detected, dockerd-rootless.sh needs to be started manually:
$ asporter systemctl --user is-enabled docker.service
not-found
```

Second attempt, with the state `lingering`:

```console
$ asporter dockerd-rootless-setuptool.sh install
 rootlesskit:
  Version:          3.1.0
  NetworkDriver:    gvisor-tap-vsock
  PortDriver:       builtin
Created symlink /home/porter/.config/systemd/user/default.target.wants/docker.service
[INFO] Installed docker.service successfully.
$ asporter systemctl --user is-active docker.service
active
$ asporter docker info --format '{{.SecurityOptions}} {{.CgroupDriver}}/{{.CgroupVersion}} {{.Driver}} {{.DockerRootDir}}'
[name=seccomp,profile=builtin name=rootless name=cgroupns] systemd/2 overlayfs /home/porter/.local/share/docker
$ asporter docker run --rm alpine cat /proc/self/uid_map
         0        999          1
         1     231072      65536
$ ps -eo user,args | grep -E 'rootlesskit|dockerd'
porter  rootlesskit --state-dir=/run/user/999/dockerd-rootless --net=gvisor-tap-vsock --mtu=65520 ... --disable-host-loopback --port-driver=builtin ... --detach-netns /usr/bin/dockerd-rootless.sh
porter  dockerd
$ cat /sys/fs/cgroup/user.slice/user-999.slice/user@999.service/cgroup.controllers
cpu memory pids
$ systemctl cat user@.service | grep Delegate=
Delegate=pids memory cpu
```

The system `containerd.service` stayed active as root in rootless mode. Only `docker.service` and `docker.socket` were turned off.

The service user can't read its own daemon log:

```console
$ asporter journalctl --user -u docker -n 15
No journal files were opened due to insufficient permissions.
```

After a reboot (`sudo systemctl reboot`), checked before any command ran as `porter`:

```console
# rootful and remap
$ systemctl is-active docker.service docker.socket containerd.service
active active active
$ asporter docker ps -a --format '{{.Names}} | {{.Status}} | {{.Ports}}'
pub | Up 3 seconds | 0.0.0.0:8081->80/tcp, [::]:8081->80/tcp
demo-web-1 | Up 3 seconds (healthy) |
proxy | Up 3 seconds | 0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp
whoami | Up 3 seconds | 80/tcp

# rootless
$ systemctl is-active docker.service docker.socket
inactive inactive
$ loginctl show-user porter | grep -E 'Linger|State'
State=lingering
Linger=yes
$ ps -eo user,args | grep -E 'rootlesskit|dockerd'
porter     rootlesskit --state-dir=/run/user/999/dockerd-rootless ...
porter     dockerd
$ asporter docker ps -a --format '{{.Names}} | {{.Status}} | {{.Ports}}'
pub | Up 8 seconds | 0.0.0.0:8081->80/tcp
demo-web-1 | Up 8 seconds (healthy) |
proxy | Up 8 seconds | 0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp
whoami | Up 8 seconds | 80/tcp
$ lsmod | grep -c br_netfilter; sysctl -n net.ipv4.ip_unprivileged_port_start
2
80
```

A request from the client after the rootless reboot still showed the client's address.

### E3. Proxy

The Proxy, in `/home/porter/.alfredo-porter/proxy/`:

```
app.test {
	tls internal
	log
	reverse_proxy whoami:80
}
```

```yaml
name: alfredo-proxy
services:
  proxy:
    image: caddy:2
    container_name: proxy
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile:ro, ./data:/data, ./config:/config]
    networks: [alfredo-proxy]
  whoami:
    image: traefik/whoami
    container_name: whoami
    restart: unless-stopped
    networks: [alfredo-proxy]
networks:
  alfredo-proxy:
    name: alfredo-proxy
    enable_ipv6: true
```

Rootful and remap, from the client VM (`10.77.N.20`):

```console
$ curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' --resolve app.test:80:10.77.1.10 http://app.test/
308 -> https://app.test/
$ curl -sk --resolve app.test:443:10.77.1.10 https://app.test/ | grep -E 'RemoteAddr|X-Forwarded-For'
RemoteAddr: 172.18.0.2:59242
X-Forwarded-For: 10.77.1.20
$ curl -sk --resolve 'app.test:443:[fd77:1::10]' https://app.test/ | grep X-Forwarded-For
X-Forwarded-For: fd77:1::20
```

Caddy's access log on the server:

```
"remote_ip":"10.77.1.20" "client_ip":"10.77.1.20" "proto":"HTTP/2.0" "status":200
"remote_ip":"fd77:1::20" "client_ip":"fd77:1::20" "proto":"HTTP/2.0" "status":200
```

Remap gave the same result with `10.77.2.20` and `fd77:2::20`. In both modes `docker-proxy` processes owned the host listeners.

Rootless, first start with no grant:

```console
$ asporter docker compose -f compose.yml up -d
Error response from daemon: ... error while calling RootlessKit PortManager.AddPort(): cannot expose privileged port 80, you can add 'net.ipv4.ip_unprivileged_port_start=80' to /etc/sysctl.conf (currently 1024), or set CAP_NET_BIND_SERVICE on rootlesskit binary, or choose a larger port number (>= 1024): listen tcp4 0.0.0.0:80: bind: permission denied
```

Grant with `setcap`, then start the same container again:

```console
$ sudo setcap cap_net_bind_service=ep /usr/bin/rootlesskit
$ asporter systemctl --user restart docker
$ asporter docker compose -f compose.yml up -d
 Container proxy Started
$ asporter docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'
proxy Up 9 seconds
$ asporter docker inspect proxy --format '{{json .HostConfig.PortBindings}} {{json .NetworkSettings.Ports}} {{json .NetworkSettings.Networks}}'
{"443/tcp":[{"HostIp":"","HostPort":"443"}],"80/tcp":[{"HostIp":"","HostPort":"80"}]} {} {}
```

The container whose first start failed was running with no network and no published ports, and no error. `docker restart proxy` didn't fix it. `up -d --force-recreate` did. This happened twice, after each failed port bind.

```console
$ asporter docker compose -f compose.yml up -d --force-recreate
$ sudo ss -ltnp | grep -E ':(80|443)\s'
LISTEN 0 4096 0.0.0.0:443 0.0.0.0:* users:(("rootlesskit",pid=4445,fd=18))
LISTEN 0 4096 0.0.0.0:80  0.0.0.0:* users:(("rootlesskit",pid=4445,fd=16))
LISTEN 0 4096    [::]:443    [::]:* users:(("rootlesskit",pid=4445,fd=19))
LISTEN 0 4096    [::]:80     [::]:* users:(("rootlesskit",pid=4445,fd=17))
```

Rootless, default `userland-proxy`, from the client:

```console
$ curl -sk --resolve app.test:443:10.77.3.10 https://app.test/ | grep X-Forwarded-For
X-Forwarded-For: 172.18.0.1
$ curl -sk --resolve 'app.test:443:[fd77:3::10]' https://app.test/ | grep X-Forwarded-For
X-Forwarded-For: fd4f:4e2d:892::1
```

```
"remote_ip":"172.18.0.1" "client_ip":"172.18.0.1" "status":200
"remote_ip":"fd4f:4e2d:892::1" "client_ip":"fd4f:4e2d:892::1" "status":200
```

`userland-proxy: false` without `br_netfilter`:

```console
$ echo '{"userland-proxy": false}' | asporter tee /home/porter/.config/docker/daemon.json
$ asporter systemctl --user restart docker
Job for docker.service failed because the control process exited with error code.
$ sudo journalctl _UID=999 | grep 'failed to start daemon'
failed to start daemon: Error initializing network controller: error creating default "bridge" network: cannot restrict inter-container communication or run without the userland proxy: stat /proc/sys/net/bridge/bridge-nf-call-iptables: no such file or directory: set environment variable DOCKER_IGNORE_BR_NETFILTER_ERROR=1 to ignore
```

With `br_netfilter` loaded as root:

```console
$ echo br_netfilter | sudo tee /etc/modules-load.d/docker.conf
$ sudo modprobe br_netfilter
$ asporter systemctl --user restart docker
$ asporter systemctl --user is-active docker
active
$ asporter docker ps -a --format '{{.Names}} {{.Status}}'
proxy Exited (128) 26 seconds ago
whoami Exited (2) 26 seconds ago
$ asporter docker inspect proxy --format '{{.State.Error}}'
failed to set up container networking: failed to create endpoint proxy on network alfredo-proxy: network 3972d40e... does not exist
$ asporter docker network ls --format '{{.Name}}'
alfredo-proxy
bridge
```

The network was listed but unusable after the failed daemon start. `compose down` then `up -d` recreated it. Then, from the client:

```console
$ curl -sk --resolve app.test:443:10.77.3.10 https://app.test/ | grep X-Forwarded-For
X-Forwarded-For: 10.77.3.20
$ curl -sk --resolve 'app.test:443:[fd77:3::10]' https://app.test/ | grep X-Forwarded-For
X-Forwarded-For: fd77:3::20
```

```
"remote_ip":"10.77.3.20" "client_ip":"10.77.3.20" "status":200
"remote_ip":"fd77:3::20" "client_ip":"fd77:3::20" "status":200
```

Capability after a package reinstall, then the sysctl grant:

```console
$ getcap /usr/bin/rootlesskit
/usr/bin/rootlesskit cap_net_bind_service=ep
$ sudo apt-get install -y --reinstall docker-ce-rootless-extras
$ getcap /usr/bin/rootlesskit
$ asporter systemctl --user restart docker
$ asporter docker ps -a --format '{{.Names}} {{.Status}}'
proxy Exited (128) 1 second ago
whoami Up Less than a second
$ echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee /etc/sysctl.d/90-alfredo-ports.conf
$ sudo sysctl --system | grep unprivileged_port
net.ipv4.ip_unprivileged_port_start = 80
$ asporter docker compose -f compose.yml up -d --force-recreate
$ asporter docker ps --format '{{.Names}} {{.Ports}}'
proxy 0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp
```

With the sysctl grant and `userland-proxy: false`, the client again saw `X-Forwarded-For: 10.77.3.20` and `fd77:3::20`. The rootless VM kept this configuration for the remaining tests.

### E4. HQ route

HQ stand-ins, run as `hq` with `systemd-run --uid=hq`:

- `127.0.0.1:3900` (loopback)
- `10.77.N.10:3901` (host address)
- `0.0.0.0:3902` (all addresses)
- A Unix socket, mode `0660`, owner `hq:porter`, in a `0750` directory owned by `hq:porter`.

The Proxy got `extra_hosts: ["host.docker.internal:host-gateway"]`. Requests ran as `docker exec proxy wget -q -T 3 -O- <url>`.

| Candidate | Rootful | Remap | Rootless, default |
| --- | --- | --- | --- |
| `host.docker.internal` resolves to | `172.17.0.1` | `172.17.0.1` | `172.17.0.1` |
| `host.docker.internal:3900` (HQ on loopback) | `Connection refused` | `Connection refused` | `Connection refused` |
| `host.docker.internal:3902` (HQ on all addresses) | `HQ-OK` | `HQ-OK` | `Connection refused` |
| `10.77.N.10:3901` (HQ on host address) | `HQ-OK` | `HQ-OK` | `HQ-OK` |
| `docker run --network host ... wget http://127.0.0.1:3900/` | `HQ-OK` | refused, see below | `HQ-OK` |
| Unix socket in `/run/alfredo-hq`, bind-mounted | `HQ-OK-UNIX` | `Permission denied` | directory appears empty |
| Unix socket in `/srv/alfredo-hq`, bind-mounted | `HQ-OK-UNIX` | `Permission denied` | `HQ-OK-UNIX` |

Remap, host network:

```console
$ asporter docker run --rm --network host caddy:2 wget -q -T 3 -O- http://127.0.0.1:3900/
docker: Error response from daemon: cannot share the host's network namespace when user namespaces are enabled
```

Source address that HQ logged:

```
rootful and remap:  172.18.0.2   (the Proxy container)
rootless:           10.77.3.10   (the host's own address), 127.0.0.1 for the host-network container
```

Rootless, the RootlessKit network namespace:

```console
$ nsenter -U --preserve-credentials -m -n -t $(cat /run/user/999/dockerd-rootless/child_pid) ip -br a
tap0             UP             10.0.2.100/24
br-96d50fe33c1c  UP             172.18.0.1/16 fd4f:4e2d:892::1/64
docker0          UP             172.17.0.1/16
$ ... ip route
default via 10.0.2.1 dev tap0
```

Rootless, default flags, even with `host-gateway-ip` pointed at the gateway:

```console
$ sudo journalctl _UID=999 | grep 'not yet supported'
level=warning msg="[rootlesskit:parent] \"--disable-host-loopback\" is not yet supported for gvisor-tap-vsock"
$ asporter docker exec proxy wget -q -T 3 -O- http://host.docker.internal:3900/     # resolves to 10.0.2.1
wget: download timed out
```

Rootless, host loopback enabled. No root needed:

```console
$ cat /home/porter/.config/systemd/user/docker.service.d/loopback.conf
[Service]
Environment=DOCKERD_ROOTLESS_ROOTLESSKIT_DISABLE_HOST_LOOPBACK=false
$ cat /home/porter/.config/docker/daemon.json
{"userland-proxy": false, "host-gateway-ip": "10.0.2.1"}
$ asporter systemctl --user daemon-reload; asporter systemctl --user restart docker
$ asporter docker exec proxy getent hosts host.docker.internal
10.0.2.1          host.docker.internal
$ asporter docker exec proxy wget -q -T 3 -O- http://host.docker.internal:3900/
HQ-OK
```

With `host-gateway-ip` set to `10.0.2.2`, the same request timed out.

The side effect, from an unrelated container with no options:

```console
$ asporter docker run --rm alpine sh -c 'nc -w 3 10.0.2.1 22 </dev/null | head -1; wget -q -T 3 -O- http://10.0.2.1:3900/'
SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.19
HQ-OK
```

The setting was reverted afterward.

End to end through Caddy, with `hq.test { tls internal; reverse_proxy 10.77.N.10:3901 }`, from the client, before ufw:

```console
$ curl -sk -w ' [%{http_code}]\n' --resolve hq.test:443:10.77.N.10 https://hq.test/
HQ-OK
 [200]        # all three modes
$ curl -s -w '[%{http_code}]\n' http://10.77.N.10:3901/
HQ-OK
[200]         # HQ's own port is also open to the outside until ufw closes it
```

With ufw active, see [E7](#e7-firewall).

### E5. Compose and builds

The Stack, in `/home/porter/.alfredo-porter/stacks/demo/`, with a `0600` `.env`:

```dockerfile
FROM alpine:3.20
RUN apk add --no-cache curl busybox-extras
RUN mkdir -p /www /data && echo demo-ok > /www/index.html && chown 1000:1000 /data
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]
```

```yaml
name: demo
services:
  web:
    build: ./app
    image: demo-web
    user: "1000:1000"
    restart: unless-stopped
    environment:
      SECRET: ${SECRET}
    volumes: [data:/data, ./bind:/bind, ./bind-open:/bind-open]
    command: sh -c 'id; date > /data/by-1000.txt ...; date > /bind/by-1000.txt ...; date > /bind-open/by-1000.txt ...; exec httpd -f -p 8080 -h /www'
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/"]
      interval: 3s
    deploy:
      resources:
        limits: {cpus: "0.5", memory: 64M}
    networks: [default, alfredo-proxy]
  rootjob:
    image: alpine
    volumes: [data:/data, ./bind:/bind, ./bind-open:/bind-open]
    command: sh -c 'id -u; date > /data/by-root.txt; date > /bind/by-root.txt; date > /bind-open/by-root.txt'
  hog:
    image: alpine
    profiles: [hog]
    command: sh -c 'tail /dev/zero'
    deploy:
      resources:
        limits: {memory: 64M}
volumes: {data: {}}
networks: {alfredo-proxy: {external: true}}
```

`./bind` is `0775` and owned by `porter`. `./bind-open` is `0777`.

All three modes:

```console
$ asporter docker compose --project-directory $S config -q && echo "config valid"
config valid
$ asporter docker compose --project-directory $S build
 Image demo-web Built
$ asporter docker compose --project-directory $S up -d
$ asporter docker ps -a --filter name=demo --format '{{.Names}} | {{.Status}}'
demo-web-1 | Up 3 seconds (healthy)
demo-rootjob-1 | Exited (0) 3 seconds ago
$ asporter docker logs demo-web-1
uid=1000 gid=1000 groups=1000
volume write ok
sh: can't create /bind/by-1000.txt: Permission denied
bind 0755 write FAILED
bind 0777 write ok
$ asporter docker exec proxy wget -q -T 3 -O- http://demo-web-1:8080/
demo-ok
```

Remap only, container root on the `porter`-owned bind directory:

```console
$ asporter docker logs demo-rootjob-1
0
sh: can't create /bind/by-root.txt: Permission denied
```

Limits, identical in all three modes:

```console
$ asporter docker inspect demo-web-1 --format 'Memory={{.HostConfig.Memory}} NanoCpus={{.HostConfig.NanoCpus}}'
Memory=67108864 NanoCpus=500000000
$ asporter docker exec demo-web-1 sh -c 'cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/cpu.max'
67108864
50000 100000
$ asporter docker exec demo-web-1 sh -c 'grep -E "usage_usec|nr_throttled" /sys/fs/cgroup/cpu.stat; timeout 4 sh -c "while :; do :; done"; grep -E "usage_usec|nr_throttled" /sys/fs/cgroup/cpu.stat'
usage_usec 55052
nr_throttled 0
Terminated
usage_usec 2062112        # about 2.0 s of CPU in 4 s of wall time
nr_throttled 40
$ asporter docker compose --project-directory $S --profile hog up hog
hog-1 exited with code 137
```

The `hog` container exited with 137 in every run. The `OOMKilled` flag in `docker inspect` wasn't consistent: it read `true` or `false` across runs in rootful and remap.

Rootless daemon warnings: `No cpuset support`, `No io.weight support`, `No io.max support`.

Rootless build failure caused by the test network, before the fix described in [Method](#network):

```console
$ asporter docker compose --project-directory $S build
ERROR: process "/bin/sh -c apk add --no-cache curl" did not complete successfully: exit code: 1
$ asporter docker run --rm alpine sh -c 'grep nameserver /etc/resolv.conf; nslookup dl-cdn.alpinelinux.org'
nameserver 10.0.2.3
;; connection timed out; no servers could be reached
$ asporter docker run --rm alpine nslookup dl-cdn.alpinelinux.org 10.0.2.1
Address: 151.101.130.132
$ asporter docker run --rm --network alfredo-proxy alpine wget -q -O /dev/null https://dl-cdn.alpinelinux.org/... && echo ok
ok
```

Containers on a user-defined network resolved names. Containers on the default bridge, which builds use, got the host's upstream nameserver, and that address fell inside RootlessKit's `10.0.2.0/24`.

Railpack, tiny Node app (`package.json` with a `start` script and a 1-line `index.js`):

```console
$ sudo sh install.sh --bin-dir /usr/local/bin; railpack --version
railpack version 0.40.1
```

Frontend path:

```console
$ asporter railpack prepare src --plan-out railpack-plan.json --info-out railpack-info.json
$ asporter docker buildx build --build-arg BUILDKIT_SYNTAX="ghcr.io/railwayapp/railpack-frontend" -f railpack-plan.json -t tiny-rp-frontend src

# rootful: 42 s
#24 naming to docker.io/library/tiny-rp-frontend:latest done
# rootless: 42 s
#24 naming to docker.io/library/tiny-rp-frontend:latest done
# remap
ERROR: failed to build: failed to solve: requested experimental feature mergeop  has been disabled on the build server: only enabled with containerd image store backend
```

CLI path:

```console
$ asporter docker run --rm --privileged -d --name buildkit moby/buildkit
$ asporter env BUILDKIT_HOST=docker-container://buildkit railpack build src --name tiny-rp-cli

# rootful
Successfully built image in 37.39s
# rootless
Successfully built image in 33.99s
# remap
docker: Error response from daemon: privileged mode is incompatible with user namespaces.  You must run the container in the host namespace when running privileged mode
```

Remap with the per-container opt-out:

```console
$ asporter docker run --rm --privileged --userns=host -d --name buildkit moby/buildkit
$ asporter env BUILDKIT_HOST=docker-container://buildkit railpack build src --name tiny-rp-cli
Successfully built image in 32.79s
$ asporter docker buildx create --name ext --driver remote docker-container://buildkit
$ asporter docker buildx build --builder ext --load --build-arg BUILDKIT_SYNTAX="ghcr.io/railwayapp/railpack-frontend" -f railpack-plan.json -t tiny-rp-frontend src
#25 importing to docker
```

Every image that built also ran and answered:

```console
$ asporter docker run -d --rm --name rprun -p 127.0.0.1:3000:3000 -e PORT=3000 tiny-rp-frontend
$ curl -s http://127.0.0.1:3000/
railpack-ok uid=0
```

### E6. Escape

Not tested. See [What stayed untested](#what-stayed-untested).

### E7. Firewall

On all three:

```console
$ sudo ufw default deny incoming; sudo ufw default allow outgoing; sudo ufw allow 22/tcp; sudo ufw --force enable
$ sudo ufw status verbose
Status: active
Default: deny (incoming), allow (outgoing), deny (routed)
22/tcp                     ALLOW IN    Anywhere
22/tcp (v6)                ALLOW IN    Anywhere (v6)
$ asporter docker run -d --name pub --restart unless-stopped -p 8081:80 traefik/whoami
```

Listeners:

```
rootful, remap:  0.0.0.0:8081 and [::]:8081   docker-proxy
rootless:        0.0.0.0:8081                 rootlesskit
```

From the client, before any extra rule:

| Request | Rootful | Remap | Rootless |
| --- | --- | --- | --- |
| `http://10.77.N.10:8081/` | `200` | `200` | no connection |
| `http://[fd77:N::10]:8081/` | no connection | no connection | no connection |
| Proxy, port 80 | `308` | `308` | no connection |
| Proxy, port 443 | `200` | `200` | no connection |
| `https://hq.test/` through the Proxy | `502` | `502` | no connection |
| `http://10.77.N.10:3901/` (HQ's own port) | no connection | no connection | no connection |

From the Proxy container, with ufw active:

```console
# rootful and remap
$ asporter docker exec proxy wget -q -T 3 -O- http://host.docker.internal:3902/
wget: download timed out
$ asporter docker exec proxy wget -q -T 3 -O- http://10.77.1.10:3901/
wget: download timed out
# rootless
$ asporter docker exec proxy wget -q -T 3 -O- http://10.77.3.10:3901/
HQ-OK
```

Rules added per mode:

```console
# rootful and remap
$ sudo ufw allow from 172.18.0.0/16 to any port 3901 proto tcp
$ asporter docker exec proxy wget -q -T 3 -O- http://10.77.1.10:3901/
HQ-OK
# rootless
$ sudo ufw allow 80/tcp; sudo ufw allow 443/tcp
```

From the client afterward:

| Request | Rootful | Remap | Rootless |
| --- | --- | --- | --- |
| `http://10.77.N.10:8081/` | `200` | `200` | no connection |
| Proxy, port 80 | `308` | `308` | `308` |
| Proxy, port 443 | `200` | `200` | `200` |
| `https://hq.test/` through the Proxy | `200` | `200` | `200` |
| `http://10.77.N.10:3901/` (HQ's own port) | no connection | no connection | no connection |

### E8. File ownership

After the Stack in [E5](#e5-compose-and-builds) ran, `ls -ln` on the host:

```
rootful
  bind/by-root.txt                         0 0
  bind-open/by-1000.txt                 1000 1000
  bind-open/by-root.txt                    0 0
  /var/lib/docker/volumes/demo_data/_data/by-1000.txt   1000 1000
  /var/lib/docker/volumes/demo_data/_data/by-root.txt      0 0

remap
  bind/                                  (empty; container root couldn't write)
  bind-open/by-1000.txt               101000 101000
  bind-open/by-root.txt               100000 100000
  /var/lib/docker/100000.100000/volumes/demo_data/_data/by-1000.txt   101000 101000
  /var/lib/docker/100000.100000/volumes/demo_data/_data/by-root.txt   100000 100000

rootless
  bind/by-root.txt                       999 987      (porter)
  bind-open/by-1000.txt               232071 232071
  bind-open/by-root.txt                  999 987
  /home/porter/.local/share/docker/volumes/demo_data/_data/by-1000.txt   232071 232071
  /home/porter/.local/share/docker/volumes/demo_data/_data/by-root.txt      999 987
```

Deleting that Stack directory as the service user, after `compose down -v`:

```console
$ asporter rm -rf /home/porter/.alfredo-porter/stacks/demo
$ sudo ls -ld /home/porter/.alfredo-porter/stacks/demo
ls: cannot access ...: No such file or directory        # all three modes
```

It worked because the foreign-owned entries were files inside directories that `porter` owns.

The harder case: containers create subdirectories inside a `0777` bind directory.

```console
$ asporter docker run --rm -v $S/bind:/b alpine sh -c 'mkdir -p /b/rootdir && date > /b/rootdir/f'
$ asporter docker run --rm -u 1000:1000 -v $S/bind:/b alpine sh -c 'mkdir -p /b/userdir && date > /b/userdir/f'
$ sudo ls -ln $S/bind
# rootful
drwxr-xr-x 2    0    0 rootdir
drwxr-xr-x 2 1000 1000 userdir
# remap
drwxr-xr-x 2 100000 100000 rootdir
drwxr-xr-x 2 101000 101000 userdir
# rootless
drwxr-xr-x 2    999    987 rootdir
drwxr-xr-x 2 232071 232071 userdir

$ asporter rm -rf $S
# rootful and remap
rm: cannot remove '.../bind/rootdir/f': Permission denied
rm: cannot remove '.../bind/userdir/f': Permission denied
# rootless
rm: cannot remove '.../bind/userdir/f': Permission denied
```

Cleanup:

```console
# rootful: a container that mounts the Stack directory, then rm as porter
$ asporter docker run --rm -v $S:/s alpine sh -c 'rm -rf /s/bind'
$ asporter rm -rf $S        # succeeds

# remap: the same container fails
$ asporter docker run --rm -v $S:/s alpine sh -c 'rm -rf /s/bind'
rm: can't remove '/s/bind': Permission denied

# rootless: Docker's documented tool, as the service user
$ asporter rootlesskit rm -rf $S        # succeeds
```

In the remap run, the directory was gone at the end of the script. The cleanup container removed the contents of `bind` and failed only on `bind` itself, which `porter` owns and then removed *(inferred from the single error line and the final `ls`)*.

### E9. One-command rootless install

Setup for this run: new qcow2 overlays on the same base image, one for each scenario and a new one for each repeated clean-host run. 4 vCPUs and 4 GB of memory for each server VM. Every VM's `mgmt0` used `10.0.9.0/24`. The lab links, addresses, and client VM layout match [Method](#method): scenario `N` is server `10.77.N.10` and client `10.77.N.20`. Versions match the [Versions](#versions) table. `URL` is `http://10.0.9.2:8765/install-rootless-porter.sh`, served from the workstation. `asporter` also sets `DOCKER_HOST` to the rootless socket.

#### Scenario 1: clean host

The installer's output is in [The command](#the-command). State afterward:

```console
$ grep -n . /etc/subuid /etc/subgid
/etc/subuid:1:ubuntu:100000:65536
/etc/subuid:2:porter:165536:65536
/etc/subgid:1:ubuntu:100000:65536
/etc/subgid:2:porter:165536:65536
$ id porter
uid=999(porter) gid=987(porter) groups=987(porter)
$ cat /etc/sysctl.d/90-alfredo-porter.conf /etc/modules-load.d/alfredo-porter.conf
net.ipv4.ip_unprivileged_port_start=80
br_netfilter
nf_tables
$ sudo cat /home/porter/.config/docker/daemon.json
{"userland-proxy": false}
$ systemctl is-active docker.service docker.socket containerd.service
inactive inactive active
$ systemctl is-enabled docker.service docker.socket
masked masked
$ ls -l /var/run/docker.sock
ls: cannot access '/var/run/docker.sock': No such file or directory
$ asporter docker info --format 'sec={{.SecurityOptions}} root={{.DockerRootDir}}'
sec=[name=seccomp,profile=builtin name=rootless name=cgroupns] root=/home/porter/.local/share/docker
$ asporter docker run --rm alpine cat /proc/self/uid_map
         0        999          1
         1     165536      65536
```

The Proxy from [E3](#e3-proxy), started as `porter`, then requests from the client:

```console
$ asporter docker ps -a --format '{{.Names}} | {{.Status}} | {{.Ports}}'
proxy | Up 4 seconds | 0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp, 443/udp, 2019/tcp
whoami | Up 4 seconds | 80/tcp
$ sudo ss -ltnp | grep -E ':(80|443)\s'
0.0.0.0:443 users:(("rootlesskit",pid=2482,fd=19))
0.0.0.0:80 users:(("rootlesskit",pid=2482,fd=17))

# client
$ curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' --resolve app.test:80:10.77.1.10 http://app.test/
308 -> https://app.test/
$ curl -sk --resolve app.test:443:10.77.1.10 https://app.test/ | grep X-Forwarded-For
X-Forwarded-For: 10.77.1.20
$ curl -sk --resolve 'app.test:443:[fd77:1::10]' https://app.test/ | grep X-Forwarded-For
X-Forwarded-For: fd77:1::20
```

```
"remote_ip":"10.77.1.20" "client_ip":"10.77.1.20" "proto":"HTTP/2.0" "status":200
"remote_ip":"fd77:1::20" "client_ip":"fd77:1::20" "proto":"HTTP/2.0" "status":200
```

After `sudo systemctl reboot`. The first lines ran before any command as `porter`:

```
uptime: up 0 minutes
who has logged in as porter: 0
linger: State=lingering Linger=yes
rootful units: inactive inactive / masked masked
br_netfilter loaded: 1  port_start: 80
porter     rootlesskit --state-dir=/run/user/999/dockerd-rootless ...
porter     dockerd
0.0.0.0:80 users:(("rootlesskit",pid=858,fd=16))
0.0.0.0:443 users:(("rootlesskit",pid=858,fd=18))
proxy | Up 6 seconds | 0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp, 443/udp, 2019/tcp
whoami | Up 6 seconds | 80/tcp
```

The client got the same `308`, `200`, and client addresses after the reboot.

Second run:

```console
$ curl -fsSL $URL | sudo sh
==> Docker packages already installed
==> Subordinate IDs already assigned: porter:165536:65536

Self-check
PASS  daemon reachable as porter at /run/user/999/docker.sock
PASS  docker info reports rootless
PASS  porter has no access to a rootful socket
PASS  port 80 is already published by the rootless daemon
PASS  port 443 is already published by the rootless daemon

RESULT: PASS. Rootless Docker is ready for porter.
exit status: 0
wall clock: 0.6 s
```

Other ways to run it, and a package reinstall:

```console
$ sudo -i sh -c "curl -fsSL $URL | sh" | tail -n 1
RESULT: PASS. Rootless Docker is ready for porter.
$ curl -fsSL $URL | sudo bash | tail -n 1
RESULT: PASS. Rootless Docker is ready for porter.
$ sudo apt-get install -y -q --reinstall docker-ce
Setting up docker-ce (5:29.8.2-1~ubuntu.24.04~noble) ...
Failed to preset unit, unit /etc/systemd/system/docker.service is masked.
Failed to preset unit, unit /etc/systemd/system/docker.socket is masked.
docker.service is a disabled or a static unit not running, not starting it.
$ systemctl is-active docker.service docker.socket; systemctl is-enabled docker.service docker.socket
inactive inactive
masked masked
```

#### Scenario 2: existing rootful Docker

Preparation, before the installer:

```console
$ curl -fsSL https://get.docker.com | sudo sh
$ sudo usermod -aG docker ubuntu
$ sudo docker run -d --name web --restart unless-stopped -p 8080:80 traefik/whoami
$ dpkg-query -W uidmap
dpkg-query: no packages found matching uidmap
```

The rootful daemon before and after the installer. The two blocks are identical:

```
rootful dockerd: pid 2340 since Sun 2026-10-04 07:29:16 UTC
units: active active / enabled enabled
web: id=b440db01596f StartedAt=2026-10-04T07:29:20.786674399Z RestartCount=0 Status=running
-A DOCKER ! -i docker0 -p tcp -m tcp --dport 8080 -j DNAT --to-destination 172.17.0.2:80
iptables rule count: filter 19, nat 9
checksum of iptables-save: 95892ad8f2a91ed7
```

The installer:

```console
$ curl -fsSL $URL | sudo sh
==> Installing: uidmap
==> Creating system user porter
==> Assigning subordinate IDs 165536-231071
==> Allowing unprivileged processes to bind ports from 80
==> Writing /home/porter/.config/docker/daemon.json
==> Running dockerd-rootless-setuptool.sh as porter

Self-check
PASS  daemon reachable as porter at /run/user/999/docker.sock
PASS  docker info reports rootless
PASS  porter has no access to a rootful socket
PASS  a container can publish port 80

RESULT: PASS. Rootless Docker is ready for porter.
exit status: 0
wall clock: 10.0 s
```

```console
$ id porter
uid=999(porter) gid=987(porter) groups=987(porter)
$ ls -l /var/run/docker.sock
srw-rw---- 1 root docker 0 Oct  4 07:29 /var/run/docker.sock
$ sudo -u porter docker -H unix:///var/run/docker.sock ps
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
$ ps -eo user,pid,lstart,args | grep -E 'rootlesskit --|dockerd'
root    2340 Sun Oct  4 07:29:16 2026 /usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock
porter  3620 Sun Oct  4 07:33:06 2026 rootlesskit --state-dir=/run/user/999/dockerd-rootless ...
porter  3666 Sun Oct  4 07:33:06 2026 dockerd
```

With the Proxy and a second rootless container (`pub`, `-p 8081:80`) running, and ufw active:

```console
$ sudo ufw default deny incoming; sudo ufw default allow outgoing; sudo ufw allow 22/tcp; sudo ufw --force enable
$ sudo ss -ltnp | grep -E 'docker|rootlesskit'
0.0.0.0:8081 users:(("rootlesskit",pid=3620,fd=25))
0.0.0.0:8080 users:(("docker-proxy",pid=2841,fd=8))
0.0.0.0:80 users:(("rootlesskit",pid=3620,fd=17))
0.0.0.0:443 users:(("rootlesskit",pid=3620,fd=19))

# client, ufw default deny
proxy 80: 000
proxy 443: 000
port 8080: 200
port 8081: 000

$ sudo ufw allow 80/tcp; sudo ufw allow 443/tcp

# client
proxy 80: 308 -> https://app.test/
X-Forwarded-For: 10.77.2.20
proxy 443: 200
X-Forwarded-For: fd77:2::20
port 8080: 200
port 8081: 000
```

Interference checks, both daemons active, ufw on:

```
host iptables checksum, non-ufw rules: 95892ad8f2a91ed7
host nat DOCKER chain:
  -A DOCKER ! -i docker0 -p tcp -m tcp --dport 8080 -j DNAT --to-destination 172.17.0.2:80
host bridges: docker0
rootful networks:  bridge 172.17.0.0/16
rootless networks: bridge 172.17.0.0/16, alfredo-proxy 172.18.0.0/16
outbound from a rootful container:  ok
outbound from a rootless container: ok
rootless container -> rootful published port (10.77.2.10:8080): Hostname: b440db01596f
rootful container -> rootless published port (10.77.2.10:80):   HTTP/1.1 308 Permanent Redirect
host loopback: rootful 8080 -> 200, rootless 80 -> 308, rootless 8081 -> 200
rootful web: StartedAt=2026-10-04T07:29:20.786674399Z RestartCount=0

rootless network namespace:
  tap0 10.0.2.100/24
  docker0 172.17.0.1/16
  br-b1c83a2ab2a5 172.18.0.1/16
  -A DOCKER -d 127.0.0.1/32 -p tcp -m tcp --dport 80 -j DNAT --to-destination 172.18.0.2:80
  -A DOCKER -d 127.0.0.1/32 -p tcp -m tcp --dport 443 -j DNAT --to-destination 172.18.0.2:443
  -A DOCKER -d 127.0.0.1/32 -p tcp -m tcp --dport 8081 -j DNAT --to-destination 172.17.0.2:80
```

Second run, with ufw active. Exit status 0 in 0.3 s. The rootful daemon's process ID and the container's `StartedAt` were unchanged afterward:

```
PASS  port 80 is already published by the rootless daemon
PASS  port 443 is already published by the rootless daemon

RESULT: PASS. Rootless Docker is ready for porter.
NOTE: ufw is active. Rootless published ports obey it. To open the Proxy: ufw allow 80/tcp; ufw allow 443/tcp
```

After a reboot, before any command as `porter`:

```
who has logged in as porter: 0
rootful units: active active / enabled enabled
root       /usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock
porter     rootlesskit --state-dir=/run/user/999/dockerd-rootless ...
porter     dockerd
0.0.0.0:8080 users:(("docker-proxy",pid=1460,fd=8))
0.0.0.0:8081 users:(("rootlesskit",pid=929,fd=16))
0.0.0.0:443 users:(("rootlesskit",pid=929,fd=19))
0.0.0.0:80 users:(("rootlesskit",pid=929,fd=17))
--- rootless daemon (porter)
pub | Up 6 seconds | 0.0.0.0:8081->80/tcp
proxy | Up 6 seconds | 0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp, 443/udp, 2019/tcp
whoami | Up 6 seconds | 80/tcp
--- rootful daemon (root)
web | Up 6 seconds | 0.0.0.0:8080->80/tcp, [::]:8080->80/tcp
ufw: Status: active

# client
proxy 80: 308 -> https://app.test/
X-Forwarded-For: 10.77.2.20
proxy 443: 200
port 8080: 200
port 8081: 000
```

#### Scenario 3: rootful Docker holds port 80

Preparation as in scenario 2, with `-p 80:80`. The installer's steps printed the same lines as in scenario 2. The self-check:

```
PASS  daemon reachable as porter at /run/user/999/docker.sock
PASS  docker info reports rootless
PASS  porter has no access to a rootful socket
FAIL  port 80 is taken by another process, so the Proxy can't publish it: users:(("docker-proxy",pid=2842,fd=8))

RESULT: FAIL. Fix the lines marked FAIL, then run this script again.
exit status: 1
wall clock: 7.2 s
```

The rootful daemon's process ID, the container's `StartedAt`, and the iptables checksum were unchanged. The Proxy as `porter`:

```console
$ asporter docker compose -f compose.yml up -d
 Container whoami Started
Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint proxy (48710cb3...): error while calling RootlessKit PortManager.AddPort(): listen tcp4 0.0.0.0:80: bind: address already in use
$ sudo ss -ltnp | grep -E ':80\s'
0.0.0.0:80 users:(("docker-proxy",pid=2842,fd=8))

# client: the rootful container still answers
port 80: 200
port 443: 000

# after a reboot
proxy | Created |
whoami | Up 7 seconds | 80/tcp
web | Up 7 seconds | 0.0.0.0:80->80/tcp, [::]:80->80/tcp
```

Variant, set by the tester: the rootful daemon with its own `userland-proxy: false`.

```console
$ echo '{"userland-proxy": false}' | sudo tee /etc/docker/daemon.json; sudo systemctl restart docker
$ sudo ss -ltnp | grep -E ':80\s'
0.0.0.0:80 users:(("dockerd",pid=2058,fd=24))
$ curl -fsSL $URL | sudo sh
FAIL  port 80 is taken by another process, so the Proxy can't publish it: users:(("dockerd",pid=2058,fd=24))
```

The Admin frees the port:

```console
$ sudo docker stop web
$ asporter docker compose -f compose.yml up -d
 Container proxy Started
$ asporter docker ps -a --format '{{.Names}} | {{.Status}} | {{.Ports}}'
proxy | Up 3 seconds |
whoami | Up 7 seconds | 80/tcp
$ asporter docker inspect proxy --format '{{json .NetworkSettings.Ports}} {{json .NetworkSettings.Networks}}'
{} {}
$ curl -fsSL $URL | sudo sh
PASS  a container can publish port 80
RESULT: PASS. Rootless Docker is ready for porter.

# client: nothing listens
proxy 80: 000

$ asporter docker compose -f compose.yml up -d --force-recreate
$ asporter docker ps -a --format '{{.Names}} | {{.Status}} | {{.Ports}}'
proxy | Up 3 seconds | 0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp, 443/udp, 2019/tcp

# client
proxy 80: 308 -> https://app.test/
X-Forwarded-For: 10.77.3.20
proxy 443: 200
```

#### Stress tests

apt locks. A Python process held an `fcntl` lock for 25 seconds while the installer needed `uidmap`.

First version of the script, package-list lock:

```
==> Installing: uidmap
E: Could not get lock /var/lib/apt/lists/lock. It is held by process 3952 (python3)
E: Unable to lock directory /var/lib/apt/lists/
installer exit status: 100, took 1 s
```

Final script:

```
=== lock held for 25 s: /var/lib/dpkg/lock-frontend
==> Installing: uidmap
RESULT: PASS. Rootless Docker is ready for porter.
installer exit status: 0, took 25 s
=== lock held for 25 s: /var/lib/apt/lists/lock
==> Installing: uidmap
==> apt-get update failed; trying again in 10 seconds      (3 times)
RESULT: PASS. Rootless Docker is ready for porter.
installer exit status: 0, took 34 s
```

Interrupted runs. The SSH client was killed during the run.

First version, connection dropped after 9 seconds:

```
rootful units: active active / enabled enabled
packages: docker-ce=install ok installed; docker-ce-rootless-extras=install ok installed; uidmap=install ok installed;
porter: id: 'porter': no such user
```

Final script, connection dropped after 9 seconds, no terminal:

```
==> Masking the rootful docker.service and docker.socket; nothing on this host uses them
==> Adding Docker's apt repository
--- 40 s later
installer processes still running: (none)
rootful units: inactive inactive / masked masked
packages: no packages found matching docker-ce
porter: id: 'porter': no such user
```

The next run on that host completed with `RESULT: PASS` in under 19 seconds.

Final script, `ssh -tt`, connection dropped after 11 seconds:

```
==> Installing: docker-ce docker-ce-cli containerd.io docker-ce-rootless-extras docker-buildx-plugin docker-compose-plugin uidmap
--- 3 s later
installer processes still running: (none)
rootful units: inactive inactive / masked masked
dpkg audit: (clean)
packages: docker-ce=install ok installed; docker-ce-rootless-extras=install ok installed; uidmap=install ok installed;
porter: id: 'porter': no such user

$ curl -fsSL $URL | sudo sh
==> Docker packages already installed
==> Creating system user porter
...
RESULT: PASS. Rootless Docker is ready for porter.
exit status: 0
wall clock: 7.5 s
```

Second version of the script, which masked the rootful units but didn't load `nf_tables`:

```
==> Running dockerd-rootless-setuptool.sh as porter
[ERROR] Missing system requirements. Run the following commands to
[ERROR] install the requirements and run this tool again.
[ERROR] Alternatively iptables checks can be disabled with --skip-iptables .
########## BEGIN ##########
sudo sh -eux <<EOF
# Load nf_tables module
modprobe nf_tables
EOF
########## END ##########
exit status: 1
```
