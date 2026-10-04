# Install and upgrade

Status: agreed in [Install & upgrade flow for HQ and Porter](https://github.com/getalfredo/alfredo/issues/17). The design is deliberately simple: one installer script, and upgrading means running the script again.

## The installer

One script, `install.sh`, installs both HQ and Porter. It has two modes:

- **HQ mode** installs HQ and the HQ Porter on the same host.
- **Porter mode** installs a Porter only.

The Admin runs the installer with root privileges, through `sudo` or as root. Everything that the installer sets up runs as a non-root service user afterward.

The installer supports Ubuntu 24.04 on x64. On any other host, it stops with a clear message and changes nothing. Development hosts run the binaries directly and don't use the installer.

The installer doesn't prompt. Its inputs are arguments.

## Before installing: secure the host

The Admin secures the host by hand before running the installer. The install guide lists the Baseline from the [machine ops spec](machine-ops.md) as the checklist. The installer doesn't check the Baseline and doesn't change the host's SSH or firewall configuration. After the install, the Porter's Machine checks show what's still open.

## What a Porter install sets up

Porter mode does the following, in one unattended run:

- Creates Porter's service user and data directory.
- Sets up rootless Docker with Compose under the service user, including the right to bind ports 80 and 443 and the client IP address setting that the [reverse proxy spec](reverse-proxy.md) needs. Docker's built-in BuildKit provides BuildKit.
- Installs Railpack.
- Adds the read-only sudoers file for Machine checks, as the [Porter spec](porter.md#privileges) describes.
- Installs the Porter binary, writes the HQ address and API key to Porter's configuration, and registers Porter as a systemd service that starts on boot.

Every Porter gets the build dependencies. A project's Porter is fixed at creation, so every Porter has to be able to build.

The installer never stops, turns off, or reconfigures a Docker daemon that it didn't set up. One installer flag selects rootful Docker instead. Without the flag, the installer always sets up rootless Docker, including next to an existing rootful daemon. The installer doesn't detect an existing daemon and doesn't ask.

When the installer finishes, it prints the `ufw` commands that allow ports 80 and 443. It doesn't run them.

## Installing HQ

HQ mode does the following:

1. Creates HQ's service user and a `0700` data directory, as the [security spec](security.md) requires. HQ and Porter run as different users.
2. Installs Git, which HQ needs to fetch project sources.
3. Installs the HQ binary and registers HQ as a systemd service that starts on boot.
4. Runs the Porter install on the same host and enrolls the HQ Porter. The installer has HQ create a dedicated API key and writes it to the HQ Porter's configuration. The Admin never sees this key.

The installer then prints the next steps:

- The command that creates the first Admin, `alfredo user:create`. Admin accounts come from the CLI, as the [users spec](users.md) states.
- HQ's address, `http://<ip>:<port>`. The Admin works there until they set the **HQ hostname**.
- The `ufw` commands for ports 80 and 443, and a reminder to close HQ's own port after the HQ hostname is set.

## Adding a Porter

1. The Admin creates an API key in HQ, or picks **Add Porter**, which creates one.
2. HQ shows one copyable install command with the HQ address and the API key filled in. HQ shows the command once, because it shows the key once.
3. The Admin secures the new host, then runs the command on it.
4. The Porter connects and appears in HQ's Porter list.

An Admin who reuses an existing key builds the same command by hand. The install guide documents the arguments.

## Upgrades

HQ and Porter are released together under one version number.

To upgrade, the Admin runs the same install command again. On a host that's already installed, the installer replaces the binary and restarts the service. It keeps the data directory, the configuration, the API key, and the Docker setup. Running Stacks keep running.

The order is HQ first, then the Porters:

1. The Admin runs the HQ install command on the HQ host. This upgrades HQ and the HQ Porter in the same run.
2. The Admin runs the Porter install command on each other Porter host. On an upgrade, the command needs no HQ address or API key.

HQ shows its own version and each Porter's version. A Porter whose version differs from HQ's is marked as behind, with the copyable upgrade command next to it. The [Porter spec](porter.md#removal-and-upgrades) defines what an incompatible version blocks.

HQ doesn't check for new releases. The Admin learns about a release from the project's release page.

## Not in v1

- Uninstalling through the installer.
- arm64 hosts and distributions other than Ubuntu 24.04.
- A built-in upgrade command, automatic upgrades, and an **Update available** notice.
- A Baseline check or any host hardening by the installer.

## Handoff boundaries

Implementation owns the service user names, file and directory locations, the systemd unit contents, the installer's argument names, how the installer downloads and verifies release binaries, how HQ mode creates the HQ Porter's key, and the version comparison rule. The [rootless Docker prototype script](https://github.com/getalfredo/alfredo/blob/research/docker-modes-test/docs/research/docker-modes-test/install-rootless-porter.sh) is the starting point for the Docker setup. Its [test report](https://github.com/getalfredo/alfredo/blob/research/docker-modes-test/docs/research/docker-modes-test.md) lists what it didn't cover: hosts with the `docker.io` package or the Docker snap, a real package upgrade, and a service user that already exists.
