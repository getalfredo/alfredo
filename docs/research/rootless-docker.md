# Rootless Docker fit for Porter

Can Porter hosts run rootless Docker in v1, and what would the existing specs have to change to allow it? This document answers [Research: rootless Docker fit for Porter](https://github.com/getalfredo/alfredo/issues/28) and feeds [Porter privilege & blast-radius model](https://github.com/getalfredo/alfredo/issues/14). It follows [Agent privilege models in comparable tools](agent-privilege-models.md), which established that a rootful Docker socket is root-equivalent and left rootless mode unresearched. That document lives on the `research/agent-privilege-models` branch until it merges.

Sources are official docs, install scripts, and source trees, fetched 2026-10-04. Links to `../spec/compose.md`, `../spec/reverse-proxy.md`, `../spec/machine-ops.md`, `../spec/projects.md`, and `../spec/security.md` point at specs that live on the `docs/security` branch until it merges.

Citation convention: every claim links to the doc page or source file that owns it. Four markers qualify a claim:

- *(source-inferred)*: read from source code or a script rather than stated in doc prose.
- *(tested)*: observed in an `ubuntu:24.04` container (Ubuntu 24.04.5) with Docker's apt repository added and these packages installed: `docker-ce` and `docker-ce-rootless-extras` 5:29.8.2-1~ubuntu.24.04~noble, RootlessKit 3.1.0, Compose v5.6.0, buildx v0.37.1, `uidmap` 1:4.13+dfsg1-4ubuntu3.2, `apparmor` 4.0.1really4.0.1-0ubuntu0.24.04.8, systemd 255.4-1ubuntu8.17. The container shows package contents, dependencies, file modes, and what `useradd` and the setup tool's prerequisite check do. It has no running systemd, no loaded AppArmor policy, and can't create nested user namespaces, so **no rootless daemon was started and no container was run under rootless mode**. Nothing about runtime behavior is tested.
- *(analysis)*: a conclusion drawn from cited facts, not a sourced claim.
- **unverified**: not confirmed from a primary source or a test.

The version matters. Rootless networking changed in Docker Engine 29.5, whose rootless networking change merged in April 2026, and several widely repeated facts about rootless mode are no longer true. This document describes Engine 29.8, which is what Docker's apt repository installs on Ubuntu 24.04 today *(tested)*.

---

## 1. Setup on Ubuntu 24.04

### What rootless mode is

- "Rootless mode executes the Docker daemon and containers inside a user namespace." With `userns-remap`, "the daemon itself is running with root privileges, whereas in rootless mode, both the daemon and the container are running without root privileges" ([Docker: rootless mode](https://docs.docker.com/engine/security/rootless/)).
- "Rootless mode does not use binaries with `SETUID` bits or file capabilities, except `newuidmap` and `newgidmap`" (same page). Both are mode `4755 root:root` in the `uidmap` package *(tested)*.
- Container UID 0 maps to the host UID of the user that runs the daemon. Container UID `n` for `n >= 1` maps to `subuid + (n - 1)` ([Docker: UID/GID mapping](https://docs.docker.com/engine/security/rootless/uid-gid-mapping/)).

### Packages

- `docker-ce-rootless-extras` ships three files: `dockerd-rootless.sh`, `dockerd-rootless-setuptool.sh`, and `rootlesskit`, all in `/usr/bin`. It depends on `dbus-user-session`. `docker-ce` lists it under `Recommends`, and apt installs recommended packages by default (`APT::Install-Recommends "1"`) *(tested)*.
- `uidmap` isn't a dependency of either package. The setup tool's check asks for `apt-get install -y uidmap` when `newuidmap` is missing ([dockerd-rootless-setuptool.sh](https://raw.githubusercontent.com/moby/moby/master/contrib/dockerd-rootless-setuptool.sh)) *(source-inferred)*.
- `slirp4netns` and `passt` aren't installed. Version 29.8.2 of `docker-ce-rootless-extras` has no `Recommends` line, where earlier versions recommended `slirp4netns` *(tested)*. The 29.5.0 release notes explain it: "`gvisor-tap-vsock` is now the new default rootless network driver and should be preferred over `slirp4netns` which is no longer installed via Docker packaging" ([Docker Engine 29 release notes](https://docs.docker.com/engine/release-notes/29/)).
- Installing `docker-ce` also installs and enables the rootful `docker.service`, `docker.socket`, and `containerd.service` units *(tested for the unit files; enablement not tested without systemd)*. Docker's docs say to turn the rootful daemon off: `sudo systemctl disable --now docker.service docker.socket` and `sudo rm /var/run/docker.sock`, and warn "until you shutdown and disable you're still running rootful Docker" ([Docker: rootless mode](https://docs.docker.com/engine/security/rootless/)). The setup tool aborts when `/var/run/docker.sock` is writable by the calling user unless `--force` is given ([dockerd-rootless-setuptool.sh](https://raw.githubusercontent.com/moby/moby/master/contrib/dockerd-rootless-setuptool.sh)) *(source-inferred)*.

### `subuid` and `subgid`

- The user needs "at least 65,536 subordinate UIDs/GIDs" in `/etc/subuid` and `/etc/subgid` ([Docker: rootless mode](https://docs.docker.com/engine/security/rootless/)).
- `useradd` adds a range automatically for a regular user and **doesn't for a system user**. `useradd --create-home regular` produced `regular:165536:65536` in both files. `useradd --system --create-home porter` produced no entry *(tested)*. `useradd` has a flag for this case: `-F, --add-subids-for-system` *(tested, from `useradd --help`)*.
- For a system user without a range, the setup tool's check fails and prints the fix `echo "porter:100000:65536" >> /etc/subuid`. That range is the one the image's existing `ubuntu` user already holds (`ubuntu:100000:65536`), so following the tool's advice verbatim creates overlapping ranges *(tested)*. Docker's `userns-remap` page says of these ranges: "It is very important that the ranges do not overlap, so that a process cannot gain access in a different namespace" ([Docker: userns-remap](https://docs.docker.com/engine/security/userns-remap/)). Whether a provider's Ubuntu 24.04 cloud image has a user at `100000` is **unverified**; the first regular user created on any image gets that range.
- `usermod --add-subuids 231072-296607 --add-subgids 231072-296607 porter` added a non-overlapping range, and the setup tool's check then reported "Requirements are satisfied" *(tested)*.

### The AppArmor restriction on unprivileged user namespaces

- "Ubuntu 24.04 and later enables restricted unprivileged user namespaces by default, which prevents unprivileged processes in creating user namespaces unless an AppArmor profile is configured to allow programs to use unprivileged user namespaces" ([Docker: rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/)).
- The restriction is the sysctl `kernel.apparmor_restrict_unprivileged_userns = 1`, set in `/usr/lib/sysctl.d/10-apparmor.conf`, which the `apparmor` package ships *(tested)*. The Ubuntu 24.04 release notes say: "In combination with the `apparmor` package, the Ubuntu kernel now restricts the use of unprivileged user namespaces" ([Ubuntu 24.04 release notes](https://discourse.ubuntu.com/t/ubuntu-24-04-lts-noble-numbat-release-notes/39890)).
- With the deb packages, no manual step is needed. Docker's docs: "the AppArmor profile for `rootlesskit` is already bundled with the `apparmor` deb package" (same troubleshooting page). The `apparmor` package ships `/etc/apparmor.d/rootlesskit`, which is `profile rootlesskit /usr/bin/rootlesskit flags=(unconfined) { userns, ... }`. The path matches where `docker-ce-rootless-extras` installs the binary *(tested for file contents and paths; not tested against a loaded kernel policy)*.
- The profile is keyed on the binary's path. Installing with the `get.docker.com/rootless` script puts `rootlesskit` in `~/bin`, and then "you must add an AppArmor profile for `rootlesskit` manually" as root (same troubleshooting page). The apt route avoids this.
- The setup tool runs `rootlesskit true` as a smoke test for exactly this constraint and fails the install if it doesn't work ([dockerd-rootless-setuptool.sh](https://raw.githubusercontent.com/moby/moby/master/contrib/dockerd-rootless-setuptool.sh)) *(source-inferred)*.

### systemd, lingering, and a login-less service user

- The supported way to run the daemon is a systemd **user** unit, `~/.config/systemd/user/docker.service`, which the setup tool writes. "Starting Rootless Docker as a systemd-wide service (`/etc/systemd/system/docker.service`) is not supported, even with the `User=` directive" ([Docker: rootless tips](https://docs.docker.com/engine/security/rootless/tips/)).
- To start at boot without a login: `sudo loginctl enable-linger <user>` (same page). With lingering, "a user manager is spawned for the user at boot and kept around after logouts" ([loginctl(1), Ubuntu 24.04](https://manpages.ubuntu.com/manpages/noble/en/man1/loginctl.1.html)).
- The socket is `$XDG_RUNTIME_DIR/docker.sock`, typically `/run/user/$UID/docker.sock`. Data is in `~/.local/share/docker`, and daemon configuration in `~/.config/docker` ([Docker: rootless tips](https://docs.docker.com/engine/security/rootless/tips/)).
- A user that never logs in can't just `sudo -u` into the setup tool. `sudo -iu` gives "Failed to connect to bus: No such file or directory", and the docs say: "For users which cannot be logged-in, you must use the `machinectl` command which is part of the `systemd-container` package", as `sudo machinectl shell myuser@` ([Docker: rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/)). `systemd-container` isn't installed by the Docker packages *(tested)*.
- The setup tool's own error text names a second route that needs no extra package: run `loginctl enable-linger <user>` as root first, then "export XDG_RUNTIME_DIR to the value of RuntimePath as shown by 'loginctl show-user <user>'" ([dockerd-rootless-setuptool.sh](https://raw.githubusercontent.com/moby/moby/master/contrib/dockerd-rootless-setuptool.sh)) *(source-inferred)*.
- The tool requires a writable `$HOME` and refuses to run as root (same file) *(source-inferred)*. So the service user needs a home directory, which `useradd --system` creates only with `--create-home` *(tested)*.

**Finding:** a dedicated service user without a login session can run rootless Docker under systemd, as a lingering user manager, not as a system unit. This is the documented path, and the pieces were checked individually. The end-to-end sequence on a booted Ubuntu 24.04 host, with a `nologin` shell, is **unverified** and is the first thing an implementation spike should confirm.

### Root steps at install time

Collected from the sections above and from section 2. All are one-time, and all need root:

| Step | Needed for |
| --- | --- |
| `apt-get install docker-ce docker-ce-rootless-extras uidmap` | Binaries and the bundled AppArmor profile. |
| `systemctl disable --now docker.service docker.socket` | Turning the rootful daemon off. |
| `useradd --system --create-home -F porter`, or `usermod --add-subuids` | A user with a non-overlapping subordinate ID range. |
| `loginctl enable-linger porter` | Starting the daemon at boot. |
| `setcap cap_net_bind_service=ep /usr/bin/rootlesskit`, or a sysctl | Ports 80 and 443. See section 2. |
| Optional: `br_netfilter` in `/etc/modules-load.d/` | Client IP addresses. See section 2. |
| Optional: `/etc/systemd/system/user@.service.d/delegate.conf` | `cpuset` and `io` limits. See section 3. |

The rest runs as the service user: `dockerd-rootless-setuptool.sh install` and writing `~/.config/docker/daemon.json`.

---

## 2. Proxy fit

The [reverse proxy spec](../spec/reverse-proxy.md) puts a Caddy container on every Porter with Public routes on, serving ports 80 and 443, obtaining certificates with HTTP-01, and dialing `<container>:<port>` on a shared Docker network.

### How published ports work

- The daemon's networks live in a network namespace that RootlessKit creates. Since Engine 29.5 the daemon itself runs in the host network namespace: "`dockerd-rootless.sh` launches RootlessKit with `--detach-netns` so as to run the daemon in the host network namespace. The libnetwork namespaces are allocated inside the 'detached' netns ... as the rootless daemon has no `CAP_NET_ADMIN` for the host network namespace" ([moby/moby#47103](https://github.com/moby/moby/pull/47103)).
- A published port is a listener that RootlessKit's port driver opens on the host and forwards into that namespace. The default is the `builtin` port driver, or `implicit` when the network driver is `pasta` ([dockerd-rootless.sh](https://raw.githubusercontent.com/moby/moby/master/contrib/dockerd-rootless.sh)) *(source-inferred)*.
- Container-to-container traffic on a user-defined bridge stays inside the namespace, so Caddy dialing `<container>:<port>` on `alfredo-proxy` should work as it does in rootful mode *(analysis; **unverified** by test)*. Overlay networks aren't supported in rootless mode ([Docker: rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/)); the spec uses a bridge network, so that limit doesn't apply.

### Ports 80 and 443

Without configuration, publishing port 80 fails with "cannot expose privileged port 80, you might need to add "net.ipv4.ip_unprivileged_port_start=0" (currently 1024) to /etc/sysctl.conf, or set CAP_NET_BIND_SERVICE on rootlesskit binary, or choose a larger port number (>= 1024)" ([Docker: rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/)).

The two documented fixes ([Docker: rootless tips](https://docs.docker.com/engine/security/rootless/tips/)):

| Fix | Scope | Notes |
| --- | --- | --- |
| `sudo setcap cap_net_bind_service=ep $(which rootlesskit)` | The `rootlesskit` binary only. | Works with the `builtin` port driver ([RootlessKit: port drivers](https://github.com/rootless-containers/rootlesskit/blob/v3.0.0/docs/port.md)). A package upgrade replaces the binary; whether the capability survives an `apt` upgrade of `docker-ce-rootless-extras` is **unverified** and it likely doesn't, so the installer or a Machine check would need to reapply or detect it. |
| `net.ipv4.ip_unprivileged_port_start=0` in `/etc/sysctl.d/` | Every unprivileged process on the host. | The kernel describes it as "the first unprivileged port in the network namespace" with default 1024 ([kernel: ip-sysctl](https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html)). Survives upgrades. Lets any local user bind any low port. |

A third route is to publish high ports, such as 8080 and 8443, and have root redirect 80 and 443 to them. Caddy's docs allow for this: "If Caddy cannot listen on port 80, packets from port `80` must be forwarded to Caddy's HTTP port" ([Caddy: automatic HTTPS](https://caddyserver.com/docs/automatic-https)). It adds a root-managed firewall rule and no surveyed source recommends it for Docker.

Inside the container nothing changes. The official Caddy image sets `cap_net_bind_service=+ep` on the `caddy` binary ([caddy-docker Dockerfile template](https://raw.githubusercontent.com/caddyserver/caddy-docker/master/Dockerfile.tmpl)), and Caddy binds 80 and 443 in its own network namespace. The host-side listener is the only part that needs privilege *(analysis)*.

HTTP-01 "requires port `80` to be externally accessible" ([Caddy: automatic HTTPS](https://caddyserver.com/docs/automatic-https)). Once one of the fixes above is in place, nothing else about certificate issuance differs *(analysis)*.

### Client IP addresses

Caddy uses "the remote IP address of the direct incoming connection" as the client IP unless `trusted_proxies` is configured ([Caddy: global options](https://caddyserver.com/docs/caddyfile/options)). So it depends on whether the port driver preserves the source address.

Docker's table for the supported combinations ([Docker: rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/)):

| Network driver | Port driver | Port throughput | Source IP | Note |
| --- | --- | --- | --- | --- |
| `gvisor-tap-vsock` | `builtin` | Fast | Yes, with a condition | Default when slirp4netns isn't installed, which is the Ubuntu 24.04 apt case *(tested)*. |
| `slirp4netns` | `builtin` | Fast | Yes, with a condition | Default when slirp4netns is installed. |
| `slirp4netns` | `slirp4netns` | Slow | Yes | |
| `pasta` | `implicit` | Fast | Yes | "Experimental". |
| `gvisor-tap-vsock` | `gvisor-tap-vsock` | Slow | No | "Not recommended." |

The condition on the `builtin` driver: "Applicable since RootlessKit v3.0. Also requires `userland-proxy` to be disabled" (same page). The documented steps are:

- `{"userland-proxy": false}` in `~/.config/docker/daemon.json`, then restart the daemon. No root needed.
- "You may also need to load `br_netfilter` kernel module", by writing `/etc/modules-load.d/docker.conf` as root (same page). When it's needed is **unverified**.

By default, "Port forwarding with `docker run -p` does not propagate source IP addresses" (same page). So out of the box, Caddy's access logs and the `X-Forwarded-For` header it sends to applications would carry an internal address, not the visitor's. Which address it is, and whether IPv6 source addresses propagate the same way, are **unverified**.

The `pasta` alternative has an Ubuntu 24.04 problem: RootlessKit's docs say it "doesn't work with some Ubuntu versions of the passt package", naming `passt-0.0~git20240220.1e6f92b-1 (Ubuntu 24.04)`, "due to a missing `usr.bin.pasta` AppArmor profile" ([RootlessKit: network drivers](https://github.com/rootless-containers/rootlesskit/blob/v3.0.0/docs/network.md)). That version is still the candidate in Ubuntu 24.04's archive *(tested)*. Docker 29.8's default, `gvisor-tap-vsock` with `builtin`, avoids it.

### Throughput

RootlessKit publishes iperf3 benchmarks from GitHub Actions, dated April 10, 2026. They're one environment's numbers and are evidence of relative cost, not of what a VPS would see.

Inbound through a published port, which is the Proxy's path ([RootlessKit: port drivers](https://github.com/rootless-containers/rootlesskit/blob/v3.0.0/docs/port.md)):

| Port driver | Throughput |
| --- | --- |
| `builtin` | 29.9 Gbps |
| `implicit` (pasta) | 37.6 Gbps |
| `slirp4netns` | 8.03 Gbps |
| `gvisor-tap-vsock` | 3.83 Gbps |

Outbound from a container to the outside, which is the path for image pulls inside builds, ACME requests, and applications calling external services ([RootlessKit: network drivers](https://github.com/rootless-containers/rootlesskit/blob/v3.0.0/docs/network.md)):

| Network driver | MTU 1500 | MTU 65520 |
| --- | --- | --- |
| `gvisor-tap-vsock` | 1.55 Gbps | 5.40 Gbps |
| `slirp4netns` | 0.84 Gbps | 6.17 Gbps |
| `pasta` | 0.87 Gbps | 6.48 Gbps |
| `lxc-user-nic` (needs a SUID helper) | 29.3 Gbps | 30.4 Gbps |
| rootful veth, for comparison | 35.0 Gbps | 36.2 Gbps |

Docker's script sets the MTU to 65520 for the three user-mode drivers ([dockerd-rootless.sh](https://raw.githubusercontent.com/moby/moby/master/contrib/dockerd-rootless.sh)) *(source-inferred)*.

**Finding:** the inbound path with the default `builtin` driver is close to rootful. The cost sits on outbound connections from containers, at roughly one sixth of rootful in that benchmark. Both are well above a typical VPS uplink. CPU cost per request, latency, and connection-rate limits weren't found in a primary source and are **unverified**. Docker's docs put it generally: "The TCP/IP stack in user mode is generally slower than the one in kernel mode" ([Docker: rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/)). The daemon's own pulls and pushes run in the host network namespace since 29.5 and skip the user-mode stack ([moby/moby#47103](https://github.com/moby/moby/pull/47103)).

### IPv6

The reverse proxy spec has Routes with AAAA records. RootlessKit's `gvisor-tap-vsock` network driver "Does not support IPv6 routing (`--ipv6`)", which concerns outbound traffic from containers. The `builtin` port driver does listen on IPv6: "Specifying `0.0.0.0:8080:80/tcp` may cause listening on IPv6 as well as on IPv4" ([RootlessKit: network drivers](https://github.com/rootless-containers/rootlesskit/blob/v3.0.0/docs/network.md), [port drivers](https://github.com/rootless-containers/rootlesskit/blob/v3.0.0/docs/port.md)). Whether an inbound IPv6 request reaches Caddy correctly end to end is **unverified**.

### The HQ route

This is the one place where the reverse proxy spec doesn't fit rootless mode without a decision.

The HQ Porter's Proxy serves "a built-in **HQ route** from that hostname to HQ's local port". HQ is a host process, so the Caddy container has to reach the host.

- Rootless mode blocks that by default. `dockerd-rootless.sh` passes `--disable-host-loopback`, described as "prohibit connections to 127.0.0.1 on the host", defaulting to true ([dockerd-rootless.sh](https://raw.githubusercontent.com/moby/moby/master/contrib/dockerd-rootless.sh)) *(source-inferred)*.
- `host-gateway` doesn't resolve to the host. The open issue ["Incorrect" host-gateway in case with Rootless Docker](https://github.com/moby/moby/issues/47684) reports `host.docker.internal` resolving to the bridge gateway, which isn't the host in rootless mode. A Docker maintainer's answer in that thread: "currently we don't set this value automatically", with `host-gateway-ip` in `daemon.json` as the manual fix.
- "`IPAddress` shown in `docker inspect` is namespaced inside RootlessKit's network namespace. This means the IP address is not reachable from the host without `nsenter`-ing into the network namespace" ([Docker: rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/)). So the reverse direction, a host process dialing a container address, is also closed.

The options, none tested:

| Option | Cost |
| --- | --- |
| Set `DOCKERD_ROOTLESS_ROOTLESSKIT_DISABLE_HOST_LOOPBACK=false` and `host-gateway-ip` | Every container on the host can then reach every service listening on the host's `127.0.0.1`, not only HQ. |
| HQ listens on a non-loopback address and Caddy dials the host's own IP | HQ's port is then reachable from outside unless ufw blocks it. Under rootless mode ufw does apply; see section 6. Whether a container can dial the host's own public IP through the user-mode stack is **unverified**. |
| Run the Proxy with `network_mode: host` | Supported in rootless mode since 29.5. Caddy then binds host ports directly, so it needs the sysctl fix rather than `setcap` on `rootlesskit` *(analysis)*. It can't use container names on `alfredo-proxy`, and container IPs aren't reachable from the host, so this breaks "The Proxy dials `<container>:<port>`". |
| HQ runs as a container on the HQ host | Changes the [security spec](../spec/security.md)'s "dedicated non-root service user" model and the installer. |

---

## 3. Compose and build fit

### Documented limitations

From Docker's known-limitations list ([Docker: rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/)):

- "Only the following storage drivers are supported": `overlay2` "only if running with kernel 5.11 or later", plus `fuse-overlayfs`, `btrfs`, and `vfs`. Ubuntu 24.04 ships kernel 6.8 ([Ubuntu 24.04 release notes](https://discourse.ubuntu.com/t/ubuntu-24-04-lts-noble-numbat-release-notes/39890)), so `overlay2` applies.
- "Following features are not supported: AppArmor, Checkpoint, Overlay network, Exposing SCTP ports".
- "NFS mounts as the docker "data-root" is not supported."
- "Capabilities added with `--cap-add` apply only to resources governed by the container's user namespace. They don't grant privileges over host or other global resources. As a result, operations that require capabilities in the initial user namespace can still fail."

"AppArmor: not supported" means containers don't get the `docker-default` AppArmor profile that rootful Docker applies. That's one layer of defense fewer inside the user namespace *(analysis)*.

### Compose features

| Feature | Under rootless mode | Source |
| --- | --- | --- |
| `privileged: true` | Accepted. Grants capabilities inside the user namespace only. Things that need real root fail: loading kernel modules, raw disk access, changing host sysctls. | The `--cap-add` limitation above. That `--privileged` still does something is shown by Docker's own rootless-in-Docker image, where "`--privileged` is required for disabling seccomp, AppArmor, and mount masks" ([Docker: rootless tips](https://docs.docker.com/engine/security/rootless/tips/)). Exact behavior per workload is **unverified**. |
| `cap_add` | Same limit as `privileged`. | Same. |
| `network_mode: host` | Works since Engine 29.5 and is the real host network namespace. Before 29.5 it "was namespaced inside RootlessKit". | [Docker: rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/), [moby/moby#47103](https://github.com/moby/moby/pull/47103) |
| `ports:` below 1024 | Fail unless the host has one of the fixes from section 2. | Same troubleshooting page. |
| `ports:` 1024 and above | Work. | Same. |
| Bind mounts | Work for paths the service user can read. Ownership shifts: "files owned by your host user appear as owned by `root` inside the container". A container process running as a non-root UID writes files owned by a subordinate UID on the host. | [Docker: UID/GID mapping](https://docs.docker.com/engine/security/rootless/uid-gid-mapping/) |
| Named volumes | Stored under `~/.local/share/docker`. No documented limitation. | [Docker: rootless tips](https://docs.docker.com/engine/security/rootless/tips/) |
| `devices:` | Limited to devices the service user can open. | *(analysis)*; **unverified**. |
| Resource limits | See below. | |
| `healthcheck:` | No limitation documented. | Absence in the known-limitations list; **unverified** by test. |
| `extra_hosts: host-gateway` | Resolves to an address that isn't the host. | [moby/moby#47684](https://github.com/moby/moby/issues/47684) |
| `ping` from a container | Depends on `net.ipv4.ping_group_range`. | [Docker: rootless tips](https://docs.docker.com/engine/security/rootless/tips/) |

Bind-mount ownership affects two compose spec operations *(analysis)*:

- **Drift** and **remove** work on the Stack directory. If a container running as a non-root UID writes into a bind-mounted subdirectory, those files belong to a subordinate UID that the service user can't modify or delete directly. Docker's uninstall instructions show the tool for it: `rootlesskit rm -rf ~/.local/share/docker` ([Docker: rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/)). Under rootful mode the same files are owned by real root or another real UID, which an unprivileged Porter can't remove at all. Rootless mode is the easier case here.
- Images that expect a specific non-root UID to own a bind-mounted directory need the directory prepared for the mapped subordinate UID. Named volumes avoid it, and the [projects spec](../spec/projects.md) already backs Railpack volumes with named volumes.

### Resource limits and cgroup v2 delegation

- "Limiting resources with cgroup-related `docker run` flags such as `--cpus`, `--memory`, `--pids-limit` is supported only when running with cgroup v2 and systemd." When `docker info` shows `none` as the cgroup driver, "rootless mode ignores the cgroup-related `docker run` flags" ([Docker: rootless tips](https://docs.docker.com/engine/security/rootless/tips/)).
- Which controllers a user gets depends on systemd. Docker's page says "typically, only `memory` and `pids` controllers are delegated to non-root users by default". systemd 255, which Ubuntu 24.04 ships, has `Delegate=pids memory cpu` in `user@.service` ([systemd v255: user@.service.in](https://raw.githubusercontent.com/systemd/systemd/v255/units/user@.service.in)) *(source-inferred)*. So memory, PID, and CPU limits should work without configuration, and `cpuset` and `io` need the root-written drop-in `Delegate=cpu cpuset io memory pids`. Whether Ubuntu's build changes that unit is **unverified**.
- The projects spec says "V1 has no replicas, resource limits, or extra ports" for Railpack sources, so this affects compose sources only.

### Builds: `docker compose build`, BuildKit, and Railpack

- Nothing in Docker's rootless documentation lists image builds as a limitation. The rootless script's own comments say detached-netns mode "accelerates `docker (pull|push|build)`" ([dockerd-rootless.sh](https://raw.githubusercontent.com/moby/moby/master/contrib/dockerd-rootless.sh)) *(source-inferred)*. Docker's built-in BuildKit runs inside the rootless daemon, so `docker compose build` and `docker buildx build` with the default builder go through it *(analysis; **unverified** by test)*.
- Railpack's recommended production path works with that built-in BuildKit: "You can build with Docker by specifying a custom syntax. BuildKit **must** be enabled", as `docker buildx build --build-arg BUILDKIT_SYNTAX="ghcr.io/railwayapp/railpack-frontend" -f /path/to/railpack-plan.json ...` after `railpack prepare` ([Railpack: running in production](https://github.com/railwayapp/railpack/blob/main/docs/src/content/docs/platforms/running-railpack-in-production.mdx)). Railpack says of the alternative: "It is highly recommended to use the frontend in production", because the CLI "simply creates a BuildKit client and pipes the result into `docker load`". Build secrets pass through `--secret`, the same mechanism the projects spec relies on.
- Railpack's CLI path, `railpack build`, needs a separate BuildKit instance: "`docker run --rm --privileged -d --name buildkit moby/buildkit`" with `BUILDKIT_HOST='docker-container://buildkit'` ([Railpack: getting started](https://github.com/railwayapp/railpack/blob/main/docs/src/content/docs/getting-started.mdx)). Whether a `--privileged moby/buildkit` container works under a rootless daemon is **unverified**. BuildKit's own rootless image, `moby/buildkit:rootless`, is documented for this ([BuildKit: rootless mode](https://github.com/moby/buildkit/blob/master/docs/rootless.md)).
- BuildKit's rootless page says, for Ubuntu 24.04 or later: "Add `kernel.apparmor_restrict_unprivileged_userns=0`" (same page). That instruction is for a standalone `buildkitd` started through RootlessKit or in a container. It turns the Ubuntu restriction off for the whole host. The frontend path through Docker's built-in BuildKit shouldn't need it, because that BuildKit already runs inside the daemon's user namespace *(analysis; **unverified**)*.
- The compose spec's "Docker's built-in BuildKit can provide BuildKit" is therefore the right choice under rootless mode, and the choice between Railpack's frontend and its CLI stops being an implementation detail.

Build steps that download packages run through the user-mode network stack, so the outbound throughput numbers in section 2 apply to them. The daemon's own image pulls don't.

### The release command and health phase

The projects spec runs the release command "in a one-off container of the new image" and waits for services to be "healthy if it defines a health check". Both are ordinary container runs and health checks. No rootless limitation was found that applies to either *(analysis; **unverified** by test)*. A release command that calls an external API goes through the user-mode network stack.

---

## 4. What an escape gets

"Escape" covers two cases with the same result: a hostile compose file that asks for host access, and a compromise that leaves the daemon's user namespace. In both, the attacker ends up with the service user's privileges on the host, not root *(analysis, from the sources in this section)*.

### What the requests reach

| The compose file asks for | Rootful Docker | Rootless Docker |
| --- | --- | --- |
| `privileged: true` | Root on the host. | Capabilities inside the user namespace. "They don't grant privileges over host or other global resources" ([Docker: rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/)). |
| A bind mount of `/` | Every file on the host, read and write. | The host filesystem as the service user sees it. Container root is the service user ([Docker: UID/GID mapping](https://docs.docker.com/engine/security/rootless/uid-gid-mapping/)), so world-readable files are readable, the service user's files are writable, and files such as `/etc/shadow`, `/etc/sudoers`, and other users' `0700` directories aren't reachable. |
| The Docker socket | Root on the host ([Docker: post-install](https://docs.docker.com/engine/install/linux-postinstall/)). | Control of the rootless daemon, which is `$XDG_RUNTIME_DIR/docker.sock`. That's every container, image, and volume on the Porter, and nothing beyond the service user. |
| `network_mode: host` | The host's network namespace as root. | The host's network namespace as an unprivileged user, since Engine 29.5. It can reach services on the host's `127.0.0.1` and bind unprivileged ports. |
| `pid: host` | Every host process, with root's rights over them. | **unverified**. The expected result is visibility of host processes and control over the service user's own. |

### What stays exposed

Everything the service user owns. With Porter and the daemon running as the same user, that's *(analysis)*:

- **Every Stack's `.env`.** The compose spec stores each under `~/.alfredo-porter/stacks/<stack-id>/` with `0600` permissions. Mode `0600` protects them from other users, not from the owner. One hostile Stack can bind-mount the parent directory and read every other Stack's environment.
- **Every other Stack.** Their volumes under `~/.local/share/docker`, their containers through the socket, and their networks.
- **Porter itself.** Its credential for HQ, its data directory, the Proxy's certificates and private keys, and Porter's binary and unit file if the service user owns them. Writing `~/.config/systemd/user/` gives persistence as the service user.
- **The network position.** Outbound connections from the host's address, and with `network_mode: host`, host-loopback services.

So rootless mode doesn't isolate Stacks from each other or from Porter. It isolates the Porter host's root, and other users on the host, from all of them.

A split would narrow this: Porter under one user, the rootless daemon under a second, with Porter holding access to the second user's socket. The `.env` files are read by the compose client, which runs as Porter, so they could stay unreadable to the daemon's user. No surveyed source describes this arrangement, and whether it works is **unverified**.

### What still reaches root

- **Kernel vulnerabilities.** Containers share the host kernel in both modes. User namespaces widen what an unprivileged process can reach in the kernel, which is Ubuntu's stated reason for the restriction: "Exposing more kernel interfaces than necessary to a process introduces additional security risks", citing a Google report in which "44% of the exploits they saw required unprivileged user namespaces as part of their exploit chain" ([Ubuntu blog: restricted unprivileged user namespaces](https://ubuntu.com/blog/ubuntu-23-10-restricted-unprivileged-user-namespaces)). The bundled `rootlesskit` AppArmor profile is `flags=(unconfined)` with `userns` *(tested)*, so everything under the rootless daemon is on the allowed side of that restriction.
- **`newuidmap` and `newgidmap`**, the two setuid binaries the mode depends on.
- **Whatever root granted for convenience.** `ip_unprivileged_port_start=0` applies to every user. `kernel.apparmor_restrict_unprivileged_userns=0`, which BuildKit's docs suggest, removes the Ubuntu restriction host-wide. A `sudoers` entry for the service user, such as the narrow list in option C of the [earlier research](agent-privilege-models.md), is reachable by any Stack that can run code as the service user.
- **A rootful daemon left running.** If `docker.service` is still active and the service user is in the `docker` group, nothing has changed.

Docker states the purpose narrowly: rootless mode exists "to mitigate potential vulnerabilities in the daemon and the container runtime" ([Docker: rootless mode](https://docs.docker.com/engine/security/rootless/)).

---

## 5. The HQ host

The [security spec](../spec/security.md) says "HQ runs as a dedicated non-root service user. Its data directory has `0700` permissions", and that directory holds every secret in the installation. The HQ Porter runs on the same host and can host Stacks.

- With a **rootful** daemon, a hostile Stack on the HQ Porter bind-mounts HQ's data directory and reads it. The `0700` mode doesn't apply to root.
- With a **rootless** daemon under a separate Porter user, container root maps to the Porter user and every other container UID maps into the Porter user's subordinate range ([Docker: UID/GID mapping](https://docs.docker.com/engine/security/rootless/uid-gid-mapping/)). None of those is the HQ user. Ordinary file permissions then deny access to a `0700` directory owned by the HQ user *(analysis; **unverified** by test)*.

Conditions for that to hold *(analysis)*:

- The Porter user and the HQ user are different users, and neither is in the other's group.
- The Porter user's subordinate ID range doesn't overlap the HQ user's UID or another user's range. The setup tool's suggested range can overlap an existing one *(tested; see section 1)*.
- HQ's files are never group- or world-readable. Rootless mode makes the `0700` and `0600` modes load-bearing where they were previously decoration against root.
- HQ's local port stays protected. A Stack with `network_mode: host` can connect to it on `127.0.0.1` since Engine 29.5. HQ's own authentication is then the only barrier, which is already true for anyone who can reach the port.
- The HQ route doesn't force host loopback open for every container; see section 2.
- No kernel escalation.

**Finding:** rootless mode is the only surveyed configuration in which a hostile Stack on the HQ host doesn't directly reach HQ's secrets. It turns the HQ Porter from "a Stack here owns the installation" into "a Stack here owns this Porter". The reverse direction is unchanged: a compromised HQ still controls every Porter's Stacks through normal operations.

---

## 6. Firewall interaction

- Rootful Docker bypasses ufw because of where it writes rules: "Docker routes container traffic in the `nat` table, which means that packets are diverted before it reaches the `INPUT` and `OUTPUT` chains that ufw uses" ([Docker: packet filtering and firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/)).
- A rootless daemon can't write host firewall rules: "the rootless daemon has no `CAP_NET_ADMIN` for the host network namespace" ([moby/moby#47103](https://github.com/moby/moby/pull/47103)). Its iptables or nftables rules exist only inside RootlessKit's namespace, where "creating iptables rules" is possible ([RootlessKit: network drivers](https://github.com/rootless-containers/rootlesskit/blob/v3.0.0/docs/network.md)).
- A published port is an ordinary listening socket held by the port driver in the host network namespace (section 2).

It follows that packets to a rootless published port arrive through the host's `INPUT` chain like packets to any other local process, and **ufw applies to them** *(analysis; **unverified** by test, and no primary source states it in these words)*. The same holds for a `network_mode: host` container's listeners.

Consequences for Alfredo *(analysis)*:

- The Admin must run `ufw allow 80/tcp` and `ufw allow 443/tcp` on a Porter with Public routes on. Under rootful mode those ports were reachable without it.
- A Stack that publishes a port no longer opens it to the internet on a host with default-deny ufw. The gap that the [machine ops spec](../spec/machine-ops.md) documents goes away.
- The **Host firewall active** check becomes meaningful for container ports, which it isn't under rootful mode.

---

## 7. Practice in comparable tools

None of the six tools documents rootless Docker as supported. None recommends it.

| Tool | Rootless Docker | Podman | Evidence |
| --- | --- | --- | --- |
| **Coolify** | Not documented. | Not documented. | The non-root-user page covers only a non-root SSH account with passwordless `sudo` and doesn't mention rootless Docker ([docs: non-root user](https://coolify.io/docs/knowledge-base/server/non-root-user)). The request [Full rootless Docker support](https://github.com/coollabsio/coolify/issues/2387) is closed as completed, but its comments discuss running container processes as non-root, not a rootless daemon. Whether anything shipped is **unverified**. |
| **Dokploy** | Not documented. Structurally excluded. | Declined. | Dokploy runs on Docker Swarm, and overlay networks aren't supported in rootless mode ([Docker: rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/)). The maintainer declined Podman because "It does not support docker swarm which is essential for multi-node container management" ([issue 134](https://github.com/Dokploy/dokploy/issues/134)). The install script's only reference is `apt-mark hold ... docker-ce-rootless-extras` ([install.sh](https://dokploy.com/install.sh)) *(source-inferred)*. |
| **Komodo** | Works by pointing Periphery at the rootless socket. Community-documented, not in the official docs. | Partial, community-driven. | Periphery honors `DOCKER_HOST` since v1.15.10. A user reports needing `Environment="DOCKER_HOST=unix:///run/user/1000/docker.sock"` in `periphery.service` and adds "I had to piece this together from other issues and posts" ([issue 87](https://github.com/moghtech/komodo/issues/87)). The setup docs mention neither rootless Docker nor Podman ([docs: connect servers](https://komo.do/docs/setup/connect-servers)). Podman issues are open ([504](https://github.com/moghtech/komodo/issues/504), [513](https://github.com/moghtech/komodo/issues/513)). |
| **Kamal** | Not documented. | Not supported in core. A community gem exists. | On Podman, DHH: "Happy to see someone explore it. Don't personally have an interest in doing the work". A contributor names the same obstacle this document found: rootless mode limits "to only binding to ports >1023 (i.e. no port 80 or 443)" ([issue 61](https://github.com/basecamp/kamal/issues/61), [discussion 1256](https://github.com/basecamp/kamal/discussions/1256)). |
| **CapRover** | Not documented. Structurally excluded. | Not documented. | CapRover is built on Swarm; see Dokploy. The getting-started page doesn't mention rootless mode ([docs: getting started](https://caprover.com/docs/get-started.html)). |
| **Dokku** | Not documented. | Request closed. | The installation page lists no rootless option ([docs: installation](https://dokku.com/docs/getting-started/installation/)). The maintainer closed [rootless containers](https://github.com/dokku/dokku/issues/6611) as "pretty big and vague"; that request was about non-root container processes. Podman: [issue 5515](https://github.com/dokku/dokku/issues/5515), closed. |

The "not documented" entries come from reading each tool's install and server pages and searching each issue tracker for "rootless". They're absences, so treat them as **unverified**.

**Finding:** requiring rootless Docker would put Alfredo ahead of every comparable tool, with no precedent to copy for the installer or the proxy. The tools built on Swarm can't follow. The two obstacles that others report are the ones in sections 2 and 3: privileged ports and bind-mount ownership.

---

## 8. `userns-remap` as a lighter alternative

`userns-remap` keeps the rootful daemon and maps container UIDs into a subordinate range.

What it does:

- Container root becomes an unprivileged host UID: "the process is running as an unprivileged high-number UID on the host, which does not even map to a real user. This means the process has no privileges on the host system at all" ([Docker: userns-remap](https://docs.docker.com/engine/security/userns-remap/)).
- It's one line in `/etc/docker/daemon.json`, `"userns-remap": "default"`, and Docker creates the `dockremap` user (same page).
- Networking is untouched. Ports 80 and 443, client IP addresses, and kernel-speed networking work as in plain rootful mode, and published ports still bypass ufw *(analysis)*.
- A bind mount of `/` is read as the remapped UID, so root-only files aren't readable *(analysis)*.

What it doesn't do:

- "With `userns-remap`, the Docker daemon still runs as root" (same page). The socket stays root-equivalent.
- Any client can opt a container out: "To disable user namespaces for a specific container, add the `--userns=host` flag" (same page). Compose exposes that as `userns_mode` ([Compose file reference: services](https://docs.docker.com/reference/compose-file/services/)). A compose file with `userns_mode: host` and `privileged: true` is back to root on the host.
- These features are incompatible with it: "Sharing PID or NET namespaces with the host (`--pid=host` or `--network=host`)", external volume drivers unaware of the mapping, and "Using the `--privileged` mode flag on `docker run` without also specifying `--userns=host`" (same page).
- "Enabling `userns-remap` effectively masks existing image and container layers", so it suits new installs (same page).
- All containers share one mapping, so it doesn't separate Stacks from each other *(analysis)*.

So `userns-remap` protects only if something refuses the opt-out. Porter could validate each compose file and reject `userns_mode`, alongside other host-reaching keys. The boundary is then Porter's validation code, which works against a hostile compose file and a compromised HQ as long as Porter's fixed operation set holds, and fails against anything that reaches the socket another way *(analysis)*. With rootless mode the boundary is the kernel's user namespace and needs no list.

---

## Verified, tested, and unverified

**Stated by a primary source:**

- Rootless daemon and containers run without root; container root is the service user.
- The daemon must be a systemd user unit with lingering; a system unit with `User=` isn't supported.
- Ubuntu 24.04 restricts unprivileged user namespaces; the deb install path needs no manual AppArmor step.
- Ports below 1024 need `setcap` on `rootlesskit` or a sysctl.
- Source IP isn't propagated by default; with RootlessKit 3.0 or later and `userland-proxy` off, the `builtin` driver propagates it.
- RootlessKit's benchmark numbers.
- Host loopback is disabled by default; `host-gateway` is wrong in rootless mode.
- `network_mode: host` is the real host network namespace since Engine 29.5.
- cgroup limits need cgroup v2 and systemd; `--cap-add` doesn't reach host resources; AppArmor profiles and overlay networks aren't supported.
- `userns-remap` leaves the daemon as root and can be disabled per container.
- Railpack builds through `docker buildx build` with its frontend.

**Tested in an `ubuntu:24.04` container:**

- Package versions, contents, and dependencies, including that slirp4netns isn't installed.
- `/etc/apparmor.d/rootlesskit` exists in the `apparmor` package and targets `/usr/bin/rootlesskit`; `10-apparmor.conf` sets the restriction.
- `useradd --system` adds no subordinate ID range; `-F` and `usermod --add-subuids` do.
- The setup tool's suggested range collides with the `ubuntu` user's.
- `newuidmap` and `newgidmap` are setuid root.

**Unverified, and worth a spike on a real Ubuntu 24.04 VM:**

- The full install for a `nologin` system user, from `enable-linger` to a running daemon after reboot.
- Caddy on 80 and 443 with `setcap`, and whether the capability survives a package upgrade.
- Real client IPs in Caddy with `userland-proxy: false`, for IPv4 and IPv6, and whether `br_netfilter` is needed.
- That ufw filters rootless published ports.
- A path from the Proxy container to HQ's port on the host.
- `docker compose build` and the Railpack frontend under the rootless daemon.
- That a hostile Stack can't read a `0700` directory of another user, and what `pid: host` exposes.
- CPU cost and latency of the user-mode network stack on a small VPS.
- Whether systemd's `Delegate=pids memory cpu` holds on Ubuntu's build.

---

## What would change per spec

### Compose spec

- **Layout on Porter.** "Storing Stacks doesn't require root" stays true. Add that the Docker data root is `~/.local/share/docker` under the service user, and that Stack files written by containers can be owned by subordinate UIDs, which **remove** and **Restore** must handle.
- **Operations.** The **deploy** validation step would gain rootless-specific failures: `ports:` below 1024, and features that are accepted but don't do what the author expects, such as `privileged`. The spec would need to say whether Porter rejects, warns, or passes them through.
- **Builds and images.** "Docker's built-in BuildKit can provide BuildKit" becomes the required option, and Railpack builds would go through `railpack prepare` plus `docker buildx build` with the frontend, not `railpack build` with a separate privileged BuildKit container.
- **A new statement on isolation.** Stacks on one Porter aren't isolated from each other's `.env` files or from Porter's credential. That's also true under rootful mode, but rootless mode makes it the remaining gap worth stating.
- **Handoff.** The install decision would own the service user, lingering, the subordinate ID range, and turning off the rootful daemon.

### Reverse proxy spec

- **Ports 80 and 443.** The Proxy needs a root-granted privilege on each Porter with Public routes on. "The Proxy needs only Docker access, not root" would become "needs Docker access and one install-time grant", and the spec or installer would choose between `setcap` and the sysctl.
- **Client IP.** Porter would write `userland-proxy: false` to the daemon configuration. Without it, Route access logs and forwarded headers don't carry the visitor's address.
- **The HQ route.** "The HQ Porter's Proxy then serves a built-in HQ route from that hostname to HQ's local port" needs a mechanism that rootless mode doesn't provide by default. This is the largest open item.
- **Reaching services.** "Routed services need no `ports:` entry, so routing doesn't create published ports that bypass ufw" stays correct, and its rationale changes: published ports don't bypass ufw under rootless mode. The 80 and 443 validation stays.
- **Firewall guidance.** The install guide's handoff would add opening 80 and 443 in ufw, which wasn't needed before.
- **TLS.** No change beyond the port grant. Certificates under Porter's data directory are owned by the service user, which Porter can read; under rootful mode they'd be root-owned.

### Machine ops spec

- **The published-port paragraph.** "Docker writes its own iptables rules, so ports that a Stack publishes bypass ufw" would no longer describe a rootless Porter. The **Listening ports** diagnostic would still mark Docker-published ports, now as ordinary listeners owned by the service user's `rootlesskit` process, which Porter can see because it's the same user.
- **Privileges.** The [earlier research](agent-privilege-models.md) noted that a Porter with a rootful socket could read root-only facts through a container. That route closes. Checks that need root report **Unknown (needs root)** unless a narrow sudoers file or helper is added, and any such grant is reachable by a hostile Stack if Porter and the daemon share a user.
- **New candidates for the catalog.** Whether the daemon is rootless, whether the rootful daemon is disabled, whether the port grant is present, and whether the restriction sysctl is still on. Each is readable without root, from `docker info`, `systemctl is-enabled`, and `/proc/sys` *(analysis; not tested)*.
- **Supported hosts.** No change. The rootless facts here are specific to Ubuntu 24.04, which is already the only host the checks support.

### Projects spec

- **Compose sources.** A compose file from the project's repository can still ask for `privileged`, host mounts, and the socket. The spec would state what those reach under rootless mode: the Porter's service user, not root.
- **Railpack sources.** "V1 has no replicas, resource limits, or extra ports" stays. Named volumes avoid the bind-mount ownership problem. The **Port** setting is a container port, so the privileged-port limit doesn't apply.
- **Build-time variables.** BuildKit secrets work the same way through the frontend path. No change.
- **Release command and Health phase.** No change found.
- **Resource limits.** Compose sources that set `cpuset` or `io` limits would need the delegation drop-in. Whether such a limit fails or is ignored without it is **unverified**.

### Security spec

Not in the ticket's list, but affected. "A Porter host holds only the environments of the Stacks it runs" could be extended with what a hostile Stack reaches on that host, and the HQ host statement, "Whoever controls the HQ host, as root or as the HQ service user, has every secret in the installation", would hold with a narrower set of ways to get there.

---

## The options

The table summarizes the sections above. Cells about rootful mode's HQ route and about `userns-remap` under Porter validation are *(analysis)* and weren't tested.

| | Require rootless | Support both | Rootful only | Rootful with `userns-remap` |
| --- | --- | --- | --- | --- |
| Hostile compose file or compromised HQ reaches | The Porter's service user. | Depends on the host. | Root. | Root, unless Porter rejects `userns_mode: host` and related keys. |
| A Stack on the HQ host reaches HQ's secrets | No, under the conditions in section 5. | Depends on the host. | Yes. | No, with the same validation caveat. |
| Stacks isolated from each other | No. | No. | No. | No. |
| Published ports bypass ufw | No. | Depends on the host. | Yes. | Yes. |
| Install steps needing root | Five, plus two optional, in section 1. | Both sets. | Docker install and group membership. | Docker install plus one `daemon.json` line. |
| Ports 80 and 443 | Need a grant. | Both paths. | Work. | Work. |
| Client IP in the Proxy | Needs daemon configuration. | Both paths. | Works. | Works. |
| HQ route | Needs a new mechanism. | Both paths. | Works through the bridge gateway. | Works through the bridge gateway. |
| Compose compatibility | Reduced: low ports, `privileged`, `host-gateway`, bind-mount ownership. | Varies per Porter. | Full. | Reduced: no `privileged`, `pid: host`, or `network_mode: host`. |
| Network throughput | Inbound near rootful; outbound from containers lower. | Varies. | Full. | Full. |
| Precedent among comparable tools | None. | Komodo, informally. | All six. | None found. |
| Spec changes | Compose, reverse proxy, machine ops, projects, security. | The same, each with two branches. | None. | Compose validation and projects. |

Notes on each *(analysis)*:

- **Require rootless.** The security gain is the one the ticket asks about, and it's largest on the HQ host. The cost is concentrated in the installer and the reverse proxy spec. Every item on the unverified list is on the critical path, so this option depends on the spike. It also ties Alfredo's support surface to a part of Docker that changed its default network driver in the 29.5 release this year.
- **Support both.** It lets an Admin choose, and it doubles what the specs, validation, Machine checks, and tests must cover: two socket paths, two proxy setups, two firewall stories, two sets of compose behavior. The blast-radius statement in the docs becomes conditional on a per-Porter setting, and HQ would need to know and show which mode each Porter runs.
- **Rootful only.** No spec changes and full compatibility. The blast radius is what the earlier research described: HQ compromise or a hostile compose file is root on every Porter, and on the HQ host that includes every secret. The honest version of this option is to state that plainly in the docs.
- **`userns-remap`.** It keeps the proxy, firewall, and networking sections of the specs as written and removes the trivial paths to root, provided Porter validates compose files. It moves the security boundary into Porter's validation code and leaves the socket root-equivalent. It's the cheapest way to stop a hostile compose file and the weakest against a compromised Porter.

### Open questions for the decision

- Is the threat a hostile compose file, a compromised HQ, or both? `userns-remap` with validation addresses the first. Only rootless mode addresses a Porter process that's itself compromised.
- Should Porter validate compose files for host-reaching keys in every option? It's required for `userns-remap`, useful for clear errors under rootless mode, and absent from the compose spec today.
- How does the HQ Porter's Proxy reach HQ under rootless mode? The answer may be simpler if only the HQ host has a constraint, or it may argue for treating the HQ Porter differently from other Porters.
- Would a spike on one Ubuntu 24.04 VM, covering the unverified list, be cheap enough to run before deciding? Most of the cost estimate for "require rootless" rests on it.
