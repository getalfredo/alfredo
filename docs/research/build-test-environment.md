# Build test environment for unattended agents

How does an unattended agent on the development machine verify HQ and Porter end to end, with no human? This document answers [Research: test environment that unattended agents can verify against](https://github.com/getalfredo/alfredo/issues/42) and feeds [Build foundations: repository layout, message format, and test levels](https://github.com/getalfredo/alfredo/issues/43).

Citation convention: every claim links to the document, source, or repository that owns it. Claims that are logical consequences are marked *(inferred)*. Claims that no primary source confirmed are marked **unverified**. Facts about the development machine were read from the machine on 2026-10-04. Web sources were fetched on 2026-10-04.

No virtual machine was started for this document and nothing was installed. The script outline in the recommendation is assembled from documented options and from what the earlier test recorded. It hasn't been run. See [What wasn't verified](#what-wasnt-verified).

## Summary

- Use four test levels. Three of them need no virtual machine and run both on the development machine and in GitHub Actions.
- For the fourth level, use plain QEMU with KVM, the official Ubuntu 24.04 cloud image, and a cloud-init seed ISO. This is what the [Docker modes test](docker-modes-test.md) already used on this machine. Everything it needs is installed, and it needs no root.
- Don't add Lima, Incus, Vagrant, or Multipass. Each one is a new install, and three of the four need root or a root-equivalent daemon on Arch.
- In GitHub Actions, the `ubuntu-24.04` runner is itself an Ubuntu 24.04 x64 virtual machine with systemd and passwordless `sudo`. The installer can run on it directly. It covers the "existing rootful Docker" case, but not a clean host and not a reboot.
- Automatic HTTPS, DNS status, and the real release download need a public server and a domain. The owner provides those separately.

## What exists today

**Unit tests.** `bun test` runs the files in `tests/`. The [tests workflow](../../.github/workflows/tests.yml) runs the same command on `ubuntu-latest` with Bun 1.3.0. There is no Go code and no Go job yet.

**Container fake VPS.** [`dev/vps/compose.yaml`](../../dev/vps/compose.yaml) starts two pairs of containers. Each pair is one privileged `docker:28-dind` daemon and one Ubuntu 24.04 container that runs the compiled `alfredo` binary with `DOCKER_HOST` pointed at the dind daemon. The `vps:*` scripts in `package.json` drive it. This setup has no systemd, no service users created by an installer, and a rootful daemon in a privileged container. It can't test `install.sh`, the systemd units, lingering, the port 80 sysctl, or rootless Docker. *(inferred from the files)*

**The earlier virtual machine test.** The [Docker modes test](docker-modes-test.md#method) records its tooling:

- QEMU 11.1.1 with KVM on the Arch workstation, with no `sudo` and no libvirt networks.
- The official `noble-server-cloudimg-amd64.img`, with its checksum verified against `SHA256SUMS`.
- One qcow2 overlay for each virtual machine on the shared base image, so that each run starts clean. 4 vCPUs and 4 to 6 GB of memory each.
- A `cidata` seed ISO built with `genisoimage`, with a throwaway SSH key.
- QEMU user-mode networking for SSH and internet access, and a second `-netdev dgram` link between a server and a client virtual machine for tests that need real client addresses.
- All commands ran over SSH as `ubuntu` with `sudo`, with no terminal attached.

How well it worked: the test ran at least seven virtual machines this way, including reboots, repeated clean-host installs on new overlays, and installer runs with the SSH connection killed halfway. It reports two tooling problems:

1. **Subnet clash.** RootlessKit uses `10.0.2.0/24` inside the guest, which is also QEMU's default user-mode subnet. Image builds in rootless containers failed on DNS. Moving the QEMU network to `10.0.9.0/24` fixed it. Every virtual machine for Alfredo must set `net=10.0.9.0/24`. See [Network](docker-modes-test.md#network).
2. **Source addresses.** QEMU's `hostfwd` rewrites the source address, so tests of real client IP addresses can't go through a forwarded port. They need the second link and a client virtual machine. See [Network](docker-modes-test.md#network).

One session was also stopped by an automated safety check before the container escape tests. That concerns the test content, not the virtual machine tooling.

The earlier test didn't commit its QEMU command lines, its seed files, or its boot times. Only the installer prototype, [`install-rootless-porter.sh`](docker-modes-test/install-rootless-porter.sh), is in the repository. The base image is no longer on the machine: a search of the home directory found no `noble-server-cloudimg` file.

## The development machine

Read from the machine on 2026-10-04:

| Item | State |
| --- | --- |
| QEMU | `qemu-system-x86_64` and `qemu-img` 11.1.1 (`qemu-full`) |
| KVM | `/dev/kvm` exists, mode `0666`, and the user is in the `kvm` group |
| Seed ISO tools | `genisoimage`, `mkisofs`, and `xorriso` are installed. `cloud-localds` isn't. |
| libvirt | `virsh` and `virt-install` are installed, `libvirtd` is active, and the user is in the `libvirt` group |
| UEFI firmware | `/usr/share/edk2/x64/OVMF.4m.fd` is present |
| Lima, Incus, Vagrant, Multipass | Not installed |
| Go, Docker, Bun | Go 1.27.1, Docker 29.8.2 (rootful, user in the `docker` group), Bun 1.4.2 |
| Capacity | 32 CPU threads, 91 GB of memory |

## Test levels

| Level | What it proves | Needs | Dev machine | GitHub Actions |
| --- | --- | --- | --- | --- |
| 1. Unit | Logic in HQ and in Porter | Bun, Go | Yes | Yes |
| 2. Porter with Docker | Porter's operations against a real Docker daemon | Level 1 plus a Docker daemon | Yes | Yes |
| 3. HQ with Porter | Enrollment, heartbeats, and operations over the real connection | Level 2 plus both binaries | Yes | Yes |
| 4. Virtual machine | `install.sh`, systemd services, rootless Docker, reboots, upgrades | QEMU with KVM | Yes | Partly, see [GitHub Actions](#github-actions) |
| Public server | Automatic HTTPS, DNS status, the release download | A server and a domain | No | No |

### Level 1: unit tests

`bun test` for HQ and `go test ./...` for Porter. No Docker, no network, no root. This is the check that an agent runs after every change.

### Level 2: Porter against the local Docker daemon

The [Porter spec](../spec/porter.md#docker-mode) says that Porter uses whatever Docker socket it's configured with, so it also works with a rootful daemon and on development hosts. The [install spec](../spec/install.md#the-installer) says that development hosts run the binaries directly and don't use the installer. So Porter's Go tests can talk to the daemon that's already on the development machine.

Rules that keep these tests safe on a machine that runs other containers:

- Put them behind a Go build tag, such as `integration`, so that `go test ./...` stays at level 1.
- Give Porter a temporary data directory for each test.
- Use a unique compose project name for each test, and remove what the test created when it ends. The [Porter spec](../spec/porter.md#operation-catalog) already limits Porter to the Docker resources that it labelled.
- Never bind ports 80 or 443 on the development machine. Use high ports, or no published ports.

This level runs against a rootful daemon. It doesn't prove anything that differs under rootless Docker. Level 4 covers that.

### Level 3: HQ and Porter together

Start both programs as plain processes on the development machine: HQ on a free port with a temporary data directory, and the Porter binary pointed at `ws://127.0.0.1:<port>` with an API key. The test then drives HQ and checks the result in Docker. This is the level that proves the message format between the two programs.

The container setup in `dev/vps` isn't needed for this. It adds a privileged dind daemon and an image build, and it proves nothing that two local processes don't. Keep it only if a human still wants two side-by-side instances to look at. *(inferred)*

### Level 4: Ubuntu 24.04 virtual machines

Everything that the installer sets up needs a real Ubuntu 24.04 host with systemd: service users, rootless Docker with lingering, the port 80 sysctl, kernel modules, the sudoers file, the systemd units, and the behavior after a reboot. See [What a Porter install sets up](../spec/install.md#what-a-porter-install-sets-up). Run these in disposable virtual machines.

Scenarios that this level should cover, all taken from the specs and from the earlier test:

- A clean host: HQ mode, then a reboot, with no login as a service user.
- A second virtual machine in Porter mode that enrolls with the first.
- A host with rootful Docker already installed.
- An upgrade: run the installer again and check that Stacks keep running.
- An unsupported host: the installer stops and changes nothing. A second cloud image, such as Ubuntu 22.04, covers this.

Routes in these tests use **HTTP only**, because Let's Encrypt can't reach a virtual machine. See [What needs a public server](#what-needs-a-public-server).

## Tools for disposable Ubuntu 24.04 virtual machines

| | Plain QEMU with cloud image | libvirt (`virt-install`) | Lima | Incus | Vagrant | Multipass |
| --- | --- | --- | --- | --- | --- | --- |
| **Installed on this machine** | Yes | Yes | No | No | No | No |
| **In Arch's repositories** | Yes | Yes | No | Yes, `extra` | No | No |
| **Root needed** | No | No for a session connection *(inferred)* | No | Yes: a root daemon, and group access equals root | Depends on the provider | Yes: snap and a root daemon *(inferred)* |
| **Runs without prompts** | Yes | Yes | Yes, with `--tty=false` | Yes | Yes | Yes |
| **Reset** | Delete the overlay, create a new one | Same, plus `virsh undefine` | `limactl delete`, then start again | Snapshots and restore | `vagrant destroy` and `up` | `multipass delete --purge` |
| **Ubuntu 24.04 image** | Official cloud image | Official cloud image | `ubuntu-24.04` template | `images:ubuntu/24.04` *(inferred from the documented syntax)* | No official box | Official |
| **Maintenance** | QEMU 11.1.1 in Arch | libvirt 12.8.0 in Arch | Active, v2.2.1 on 2026-10-03 | Active, 7.5.1 on 2026-09-25 | BUSL licensed, last tag v2.4.9 | Active, v1.16.4 on 2026-09-08 |
| **Proven in this project** | Yes | No | No | No | No | No |

Boot time isn't in the table. No primary source gives a comparable figure, and the earlier test didn't record one. On Linux, Lima, libvirt, Incus, and Multipass all start the same kind of QEMU/KVM guest, so boot time isn't likely to decide between them. *(inferred)*

### Plain QEMU with a cloud image and cloud-init

- Canonical publishes `noble-server-cloudimg-amd64.img` as a "QCow2 UEFI/GPT Bootable disk image", with `SHA256SUMS` and `SHA256SUMS.gpg` next to it ([cloud-images.ubuntu.com](https://cloud-images.ubuntu.com/noble/current/)).
- cloud-init's NoCloud datasource reads `user-data` and `meta-data` from a vfat or iso9660 filesystem with the volume label `CIDATA` ([NoCloud](https://docs.cloud-init.io/en/latest/reference/datasources/nocloud.html)).
- cloud-init's own guide uses exactly this recipe: download the Noble cloud image, build the seed with `genisoimage -output seed.img -volid cidata -rational-rock -joliet`, and boot it with `qemu-system-x86_64` and two `-drive` options ([Launch with QEMU](https://docs.cloud-init.io/en/latest/howto/launch_qemu.html)). That guide boots the image with QEMU's default firmware.
- `hostfwd` forwards a host port to a guest port in user-mode networking, `net=` moves the guest subnet away from the default `10.0.2.0/24`, `-daemonize` detaches QEMU once its devices are ready, and `-pidfile` writes the process ID "if you launch QEMU from a script" ([QEMU invocation](https://www.qemu.org/docs/master/system/invocation.html), and the `qemu-system-x86_64` manual page on this machine).
- A qcow2 overlay with a backing file keeps the base image unchanged. Deleting the overlay is the reset. (`backing_file` in the `qemu-img` manual page on this machine, also at [qemu-img](https://www.qemu.org/docs/master/tools/qemu-img.html). The earlier test used overlays this way.)
- No daemon and no root: QEMU runs as the user, and user-mode networking needs no bridge or tap device. The earlier test ran with "no `sudo`, no libvirt networks".

Cost: the project owns a wrapper script of about 100 lines. Snapshots are manual, as overlays on overlays or with `qemu-img snapshot`.

### libvirt with `virt-install`

libvirt is installed and running here. `virt-install --cloud-init` generates the NoCloud ISO and attaches it for the first boot (the `virt-install` manual page on this machine). It adds named domains, `virsh` lifecycle commands, and snapshots. It also adds a second layer with its own XML, storage pools, and network setup, and the earlier test chose to avoid libvirt networks. For one or two throwaway machines, it doesn't remove enough script to pay for the layer. *(inferred)*

### Lima

- `limactl start --tty=false` runs without the interactive prompt ([Usage](https://lima-vm.io/docs/usage/)). The template list includes `ubuntu-24.04` ([Templates](https://lima-vm.io/docs/templates/)).
- On Linux hosts the default driver is QEMU, and QEMU is a required dependency for it ([QEMU driver](https://lima-vm.io/docs/config/vmtype/qemu/), [Installation](https://lima-vm.io/docs/installation/)). So on this machine Lima is a wrapper around the tool that's already here.
- `limactl snapshot` has `create`, `apply`, `delete`, and `list` ([limactl snapshot](https://lima-vm.io/docs/reference/limactl_snapshot/)). How mature it is for the QEMU driver is **unverified**.
- The default template mounts the host home directory read-only and installs containerd in the guest ([default.yaml](https://github.com/lima-vm/lima/blob/master/templates/default.yaml)). A test of a clean host would have to turn both off. The `ubuntu-24.04` template's own defaults weren't read, so whether it inherits them is **unverified**.
- Not in Arch's repositories (`pacman -Si lima` finds nothing). The documented installs are Homebrew, Nix, or a binary download ([Installation](https://lima-vm.io/docs/installation/)).
- Actively maintained: v2.2.1 on 2026-10-03, Apache-2.0 ([releases](https://github.com/lima-vm/lima/releases)).

Lima is the best of the alternatives. It would replace the wrapper script with a YAML file. It would also add an install step, a guest agent, and defaults that make the guest less like a real server.

### Incus virtual machines

- `incus launch <image> <name> --vm` creates a virtual machine, and `cloud-init.user-data` seeds it ([Create instances](https://linuxcontainers.org/incus/docs/main/howto/instances_create/), [Instance options](https://linuxcontainers.org/incus/docs/main/reference/instance_options/)).
- Incus is in Arch's `extra` repository, version 7.5.1 ([Installing](https://linuxcontainers.org/incus/docs/main/installing/), `pacman -Si incus`).
- It needs a daemon that runs as root. The documentation says that local access through the Unix socket "always grants full access to Incus" and that you "should only give such access to users who you'd trust with root access to your system" ([Installing](https://linuxcontainers.org/incus/docs/main/installing/)).
- Snapshots and restore are built in. This is its real advantage.

Installing and initializing it needs root once, and it gives unattended agents a second root-equivalent socket next to Docker's. That's too much for this job.

### Vagrant

- Canonical "will no longer publish Vagrant images directly starting with Ubuntu 24.04 LTS", because HashiCorp adopted the Business Source License ([Ubuntu public images: Vagrant](https://ubuntu.com/docs/public-images/public-images-explanation/vagrant/)). So there is no official Ubuntu 24.04 box.
- Vagrant 2.4.3 and later is under the Business Source License 1.1 ([LICENSE](https://github.com/hashicorp/vagrant/blob/main/LICENSE)).
- The default provider is VirtualBox ([Default provider](https://developer.hashicorp.com/vagrant/docs/providers/default)). KVM needs the third-party `vagrant-libvirt` plugin, whose last release is 0.12.2 from June 2023 ([releases](https://github.com/vagrant-libvirt/vagrant-libvirt/releases)).
- Not in Arch's repositories (`pacman -Si vagrant` finds nothing).

Rejected.

### Multipass

- "Multipass for Linux is published as a snap package", and the install guide names no other Linux install path ([Install Multipass](https://canonical.com/multipass/docs/latest/how-to-guides/install-multipass/)). Arch has no `multipass` package (`pacman -Si multipass` finds nothing), and snapd isn't part of Arch. *(inferred)*
- Actively maintained: v1.16.4 on 2026-09-08, GPL-3.0 ([releases](https://github.com/canonical/multipass/releases)).

Rejected for this host: it needs snapd first, and then a root daemon.

## GitHub Actions

- GitHub-hosted Linux runners are virtual machines with passwordless `sudo`. Standard runners have 4 CPUs and 16 GB of memory for public repositories, and 2 CPUs and 8 GB for private ones ([GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)).
- `ubuntu-latest` currently maps to Ubuntu 24.04, and `ubuntu-26.04` already has its own label ([runner-images](https://github.com/actions/runner-images)). The label will move, so installer jobs must pin `ubuntu-24.04`.
- The Ubuntu 24.04 runner image has Ubuntu 24.04.5, systemd 255, Docker 28.0.4 (rootful) with Compose 2.38.2, and Go 1.24 to 1.26 cached. Bun isn't in the image, and QEMU isn't listed ([Ubuntu2404-Readme](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)). The existing workflow installs Bun with `oven-sh/setup-bun`.
- KVM is available on GitHub-hosted Linux runners, including the 2-vCPU ones, after a udev rule that opens `/dev/kvm` ([changelog, 2024-04-02](https://github.blog/changelog/2024-04-02-github-actions-hardware-accelerated-android-virtualization-now-available/)).

What follows:

| Level | In GitHub Actions |
| --- | --- |
| 1. Unit | Yes. Add `actions/setup-go` and `go test ./...` next to `bun test`. |
| 2. Porter with Docker | Yes. The runner's Docker daemon plays the role of the development machine's daemon. |
| 3. HQ with Porter | Yes. Same two processes as on the development machine. |
| 4. Installer on the runner itself | Yes, as a smoke test. `sudo ./install.sh` on a pinned `ubuntu-24.04` runner is a real Ubuntu 24.04 x64 host with systemd. It matches the "existing rootful Docker" scenario of the [earlier test](docker-modes-test.md#results-1). **Unverified**: nobody has run the installer on a runner yet. |
| 4. Clean host, reboot, upgrade, two hosts | Local only for now. The runner isn't a clean host, it can't reboot in the middle of a job, and it's one machine. The QEMU script could run in a job, since KVM is available, but QEMU would need an `apt-get install` and the base image a download on every run. Add that only if the local runs prove not to be enough. *(inferred)* |

## What needs a public server

The owner provides a public server and a domain separately. These checks can't run anywhere else:

- **Automatic HTTPS.** The [reverse proxy spec](../spec/reverse-proxy.md) uses Let's Encrypt with HTTP-01 challenges. Let's Encrypt fetches `http://<domain>/.well-known/acme-challenge/<token>` on port 80, "potentially multiple times from multiple vantage points" ([Challenge types](https://letsencrypt.org/docs/challenge-types/)). A virtual machine behind QEMU's user-mode network has no public name and no public port 80.
- **Certificate status and renewal state** that HQ shows for a Route.
- **DNS status** for a hostname that points, or doesn't point, at the Porter.
- **The real install command**, fetched from the release URL over the internet.
- **ufw with real outside traffic**, and real client IP addresses over the internet. The earlier test covered both between two virtual machines, so this is a confirmation and not a first test.

When those tests run, point Caddy at Let's Encrypt's staging environment, `https://acme-staging-v02.api.letsencrypt.org/directory`. Caddy's documentation says to "change the ACME endpoint to a staging or development URL, otherwise you are likely to hit rate limits" ([Automatic HTTPS](https://caddyserver.com/docs/automatic-https)). Staging has much higher limits, and its certificates aren't trusted by browsers ([Staging environment](https://letsencrypt.org/docs/staging-environment/)). Porter would need a test-only setting for the ACME endpoint. That's an implementation choice for the build.

Everything else about Routes can be tested at levels 3 and 4 with **HTTP only** Routes: the Proxy container, the configuration that HQ renders, reloads, and attaching services to the proxy network.

## Recommendation

**Use four test levels, each behind one command. For the virtual machine level, use plain QEMU with KVM, the Ubuntu 24.04 cloud image, and a cloud-init seed ISO, driven by one script in the repository.** It's the setup that the earlier test proved on this machine. It needs nothing installed and no root, and the reset is deleting a file.

### Commands

The build should add these, so that an agent never has to work out how to verify:

| Command | Level | Runs |
| --- | --- | --- |
| `bun test` and `go test ./...` | 1 | After every change |
| `go test -tags integration ./...` | 2 | After a change to Porter's Docker code |
| `bun run test:e2e` | 3 | After a change to the message format, to HQ's Porter handling, or to Porter |
| `bun run test:vm` | 4 | After a change to `install.sh`, a systemd unit, or anything that depends on rootless Docker, and before a release |

The names are suggestions. [Build foundations](https://github.com/getalfredo/alfredo/issues/43) owns the layout.

A level passes when its command exits with status 0. Each command must print enough on failure for an agent to act on: the failing step, and for level 4 the tail of the installer log and of the `journalctl` output for the failed unit.

### The virtual machine script

Add `dev/vm/vm.sh` with four subcommands: `up <name> <n>`, `ssh <name> [command]`, `down <name>`, and `reset <name> <n>`. `<n>` is a small number that picks the host ports, so that two machines can run at once. State lives outside the repository in `~/.cache/alfredo-vm/`.

Outline. It hasn't been run. The first agent that implements it should expect to fix details.

```sh
#!/usr/bin/env bash
# dev/vm/vm.sh: disposable Ubuntu 24.04 virtual machines for level 4 tests.
set -euo pipefail

CACHE="${ALFREDO_VM_CACHE:-$HOME/.cache/alfredo-vm}"
BASE_URL="https://cloud-images.ubuntu.com/noble/current"
IMG="noble-server-cloudimg-amd64.img"
KEY="$CACHE/id_ed25519"
SSH_OPTS=(-i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no
          -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=5)

base() {                                   # download once, verify the checksum
  mkdir -p "$CACHE"
  [ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N '' -f "$KEY"
  [ -f "$CACHE/$IMG" ] && return
  curl -fsSL -o "$CACHE/$IMG.part" "$BASE_URL/$IMG"
  curl -fsSL -o "$CACHE/SHA256SUMS" "$BASE_URL/SHA256SUMS"
  (cd "$CACHE" && mv "$IMG.part" "$IMG" && grep " \*\?$IMG\$" SHA256SUMS | sha256sum -c -)
}

up() {                                     # up <name> <n>
  local name="$1" n="$2" dir="$CACHE/$1"
  base; mkdir -p "$dir"
  qemu-img create -q -f qcow2 -F qcow2 -b "$CACHE/$IMG" "$dir/disk.qcow2" 20G
  printf 'instance-id: %s\nlocal-hostname: %s\n' "$name" "$name" > "$dir/meta-data"
  printf '#cloud-config\nssh_authorized_keys:\n  - %s\n' "$(cat "$KEY.pub")" > "$dir/user-data"
  (cd "$dir" && genisoimage -quiet -output seed.iso -volid cidata -rational-rock -joliet user-data meta-data)
  echo "$((2220 + n))" > "$dir/ssh-port"
  qemu-system-x86_64 \
    -enable-kvm -cpu host -smp 4 -m 4096 \
    -drive "file=$dir/disk.qcow2,if=virtio,format=qcow2" \
    -drive "file=$dir/seed.iso,if=virtio,format=raw,readonly=on" \
    -netdev "user,id=mgmt0,net=10.0.9.0/24,hostfwd=tcp:127.0.0.1:$((2220 + n))-:22,hostfwd=tcp:127.0.0.1:$((8080 + n))-:80,hostfwd=tcp:127.0.0.1:$((3100 + n))-:3000" \
    -device virtio-net-pci,netdev=mgmt0 \
    -display none -serial "file:$dir/console.log" \
    -daemonize -pidfile "$dir/qemu.pid"
  wait_ssh "$name"
  vm_ssh "$name" 'cloud-init status --wait >/dev/null'
}

vm_ssh() {                                 # ssh <name> [command]
  local name="$1"; shift
  ssh "${SSH_OPTS[@]}" -p "$(cat "$CACHE/$name/ssh-port")" ubuntu@127.0.0.1 "$@"
}

wait_ssh() {                               # fail after 3 minutes, show the console
  local i
  for i in $(seq 1 90); do vm_ssh "$1" true 2>/dev/null && return; sleep 2; done
  tail -n 40 "$CACHE/$1/console.log" >&2; return 1
}

down() {                                   # down <name>: stop and delete everything
  local dir="$CACHE/$1"
  [ -f "$dir/qemu.pid" ] && kill "$(cat "$dir/qemu.pid")" 2>/dev/null || true
  rm -rf "$dir"
}

case "${1:-}" in
  up)    up "$2" "$3" ;;
  ssh)   shift; vm_ssh "$@" ;;
  down)  down "$2" ;;
  reset) down "$2"; up "$2" "$3" ;;
  *)     echo "usage: vm.sh up|ssh|down|reset <name> [n]" >&2; exit 2 ;;
esac
```

Notes for the implementer:

- **`net=10.0.9.0/24` is required.** Without it, DNS in rootless containers breaks. See [What exists today](#what-exists-today).
- **Firmware.** cloud-init's guide boots this image with QEMU's default firmware. If the image doesn't boot, add `-bios /usr/share/edk2/x64/OVMF.4m.fd`. The earlier test didn't record which it used.
- **Host port 3000 in the guest** is HQ's port in today's code. Change the forward when the build fixes HQ's port.
- **The base image changes.** `current/` is a daily build, so the checksum is only valid for the pair that was downloaded together. The script downloads both once and keeps them. Delete `~/.cache/alfredo-vm/` to refresh.
- **Faster resets, later.** If first boot proves slow, boot one machine, wait for cloud-init, shut it down, and use its disk as the backing file for test overlays. Don't build this before it's needed.

### How a level 4 test uses it

1. Build both binaries for `linux-x64`.
2. Serve the build output and `install.sh` from the development machine: `python3 -m http.server 8765 --bind 127.0.0.1` in the output directory. Inside the guest, the development machine is `10.0.9.2`. The earlier test installed this way: `curl -fsSL http://10.0.9.2:8765/install-rootless-porter.sh | sudo sh`. The installer needs a test-only way to take its binaries from that address and not from the release URL.
3. `dev/vm/vm.sh up hq 1`, then run the installer in HQ mode over `vm.sh ssh hq`, with no terminal attached.
4. Assert over SSH: both systemd units are active and enabled, the service users exist, `docker info` as Porter's user reports rootless, and HQ answers on `http://127.0.0.1:3101` from the development machine.
5. Reboot with `vm.sh ssh hq sudo systemctl reboot`, wait for SSH again, and repeat the assertions before any command runs as a service user.
6. For a second Porter host: `vm.sh up porter 2`, and give the installer the HQ address `ws://10.0.9.2:3101`. That reaches the first machine through the development machine's forwarded port.
7. Always finish with `vm.sh down <name>`, also on failure.

Tests that need real client IP addresses can't use forwarded ports. They need the `-netdev dgram` link and a client machine from the [earlier test](docker-modes-test.md#network). Leave that out of the first version of the script. The earlier test already answered the client address question for the Proxy.

### GitHub Actions

1. Add a Go job to the tests workflow: `actions/setup-go`, then `go test ./...`.
2. Add a job for levels 2 and 3 on the runner's Docker daemon.
3. Add an installer smoke job that pins `runs-on: ubuntu-24.04` and runs `sudo ./install.sh` in HQ mode on the runner, followed by the same assertions as step 4 above.
4. Keep the QEMU runs local until there's a reason to move them.

### What an agent must not do

- Don't run `install.sh` on the development machine. It's for Ubuntu 24.04 only, and it changes the host.
- Don't use `sudo` on the development machine. No level needs it.
- Don't leave virtual machines running. Each one holds 4 GB of memory.

## What wasn't verified

- **The script outline.** It wasn't run. The task for this document didn't allow starting virtual machines.
- **Boot time.** The earlier test recorded none, and no primary source gives a comparable figure for the tools above.
- **The earlier test's exact QEMU command lines.** They weren't committed. The outline rebuilds them from the [method section](docker-modes-test.md#method) and from cloud-init's guide.
- **BIOS or UEFI boot** of the current cloud image under QEMU 11.1.1.
- **The installer on a GitHub Actions runner.** The runner image's contents come from its published readme. Whether rootless Docker starts there next to the runner's own daemon hasn't been tried. The earlier test showed that it does in a virtual machine with rootful Docker installed.
- **KVM on today's standard runners.** The source is GitHub's changelog entry from April 2024. The runner documentation page doesn't mention KVM.
- **Lima's snapshot maturity** and the defaults of its `ubuntu-24.04` template.
- **Incus's Ubuntu 24.04 virtual machine image name.** It follows the documented `images:<distribution>/<release>` syntax and wasn't checked against the image server.
- **Multipass and snapd on Arch.** Canonical's guide names only the snap. No source for an Arch install path was checked.
