# Docker modes test on Ubuntu 24.04

This document records a hands-on test of three Docker modes for Porter hosts. It answers [Test Docker modes on an Ubuntu 24.04 virtual machine](https://github.com/getalfredo/alfredo/issues/29) and feeds [Porter privilege & blast-radius model](https://github.com/getalfredo/alfredo/issues/14).

The three modes:

1. **Rootful**: standard Docker, service user in the `docker` group.
2. **Remap**: rootful Docker with `userns-remap`.
3. **Rootless**: rootless Docker under a dedicated service user.

Everything in the results table and the evidence appendix was observed in the virtual machines described below, unless a line is marked *(inferred)* or *(not tested)*. The earlier document, [Rootless Docker fit for Porter](rootless-docker.md) on the `research/rootless-docker` branch, was documentation-only. The section [Differences from the earlier research](#differences-from-the-earlier-research) lists where the observations disagree with it.

**The escape area wasn't tested.** The session was stopped by an automated safety check before those commands ran. See [What stayed untested](#what-stayed-untested). The decision in issue 14 depends most on that area, so it needs a separate run.

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
