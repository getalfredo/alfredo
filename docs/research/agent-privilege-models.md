# Agent privilege models in comparable tools

What does the host agent run as in comparable tools, and how do those tools get the privileges they need for host-level work? This document answers [Research: agent privilege models in comparable tools](https://github.com/getalfredo/alfredo/issues/27) and feeds [Porter privilege & blast-radius model](https://github.com/getalfredo/alfredo/issues/14), which has to decide what Porter runs as. It builds on [Worker-agent patterns in comparable tools](worker-agent-patterns.md) and doesn't repeat that document's findings on enrollment, transport, or streaming.

Sources are official docs, install scripts, unit files, and source trees, fetched 2026-10-04. Links to `../spec/compose.md` and `../spec/machine-ops.md` point at specs that live on the `docs/security` branch until it merges.

Citation convention: every claim links to the doc page or source file that owns it. Three markers qualify a claim:

- *(source-inferred)*: read from source code rather than stated in doc prose.
- *(tested)*: observed in an `ubuntu:24.04` container with the stock Ubuntu packages installed (`openssh-server` 1:9.6p1-3ubuntu13.19, `ufw` 0.36.2-6, `fail2ban`, `unattended-upgrades` 2.9.1, `sudo` 1.9.15p5). The container has package-default file modes but no running systemd and no cloud-init, so it's evidence for file modes and for commands that refuse to run without root, and not for anything that depends on a booted cloud image.
- **unverified**: not confirmed from a primary source.

---

## 1. Run-as user per tool

| Tool | What executes on the managed host | Runs as | How the installer sets it up |
| --- | --- | --- | --- |
| **Coolify** | Shell commands over SSH from the control plane. Optional Sentinel metrics container. | `root` by default. A non-root SSH user is "experimental" and needs passwordless `sudo` for everything. | Install script refuses to run unless `EUID` is 0, then appends its key to the running user's `authorized_keys`. |
| **Dokploy** | Shell commands over SSH from the control plane. | `root`, or a non-root user with passwordless `sudo`. | Install script exits unless `id -u` is 0. Remote-server setup script detects root or `sudo -n true`, and otherwise fails. |
| **Komodo Periphery** | Resident Rust agent. | `root` as a system systemd service by default. Alternatives: a systemd `--user` service for the calling user, or a container with the Docker socket. | Python setup script writes a unit file with no `User=` line into `/etc/systemd/system`, or into `~/.config/systemd/user` with `--user`. |
| **Portainer Agent** | Resident agent container proxying the Docker API. | A container with the Docker socket mounted. The image sets no `USER`. | `docker run` or a Swarm stack with `/var/run/docker.sock` and `/var/lib/docker/volumes` mounted. |
| **Kamal** | Shell commands over SSH from the operator's machine. | `root` by default. A non-root user works when it's in the `docker` group. | No installer. `kamal server bootstrap` installs Docker only when it has superuser access. |
| **CapRover** | Control-plane container talking to the local Docker socket. Worker nodes are plain Swarm nodes. | A container with the Docker socket mounted. Container user is **unverified**. | `docker run ... -v /var/run/docker.sock:/var/run/docker.sock -v /captain:/captain caprover/caprover`. |
| **Dokku** | The `dokku` CLI on the host, reached over SSH or `git push`. | A dedicated `dokku` system user in the `docker` group, plus narrow sudoers files. A few commands must run as root. | The Debian package's `postinst` creates the user with `sshcommand` and runs `usermod -aG docker dokku`. Plugins write their own `/etc/sudoers.d/` files. |

### Coolify

- The install script starts with `if [ $EUID != 0 ]; then echo "Please run this script as root or with sudo"` ([scripts/install.sh](https://raw.githubusercontent.com/coollabsio/coolify/main/scripts/install.sh)). It also runs `sshd -T` to read `PermitRootLogin` and warns when root login is disabled (same file).
- Non-root is supported but not privilege-reducing: "Coolify can connect to a server using an account other than `root`. This feature is experimental and still requires the account to run commands with passwordless `sudo`." The documented sudoers line is `cooluser ALL=(ALL) NOPASSWD: ALL` ([docs: non-root user](https://coolify.io/docs/knowledge-base/server/non-root-user)).
- For a non-root server, the control plane rewrites each command line to add `sudo`, including after unquoted pipes ([bootstrap/helpers/sudo.php](https://raw.githubusercontent.com/coollabsio/coolify/main/bootstrap/helpers/sudo.php), [bootstrap/helpers/remoteProcess.php](https://raw.githubusercontent.com/coollabsio/coolify/main/bootstrap/helpers/remoteProcess.php)) *(source-inferred)*. The rewriting is generic, which is why a narrow sudoers list can't work.
- Sentinel runs as a container with `-v /var/run/docker.sock:/var/run/docker.sock` and `--pid host` ([StartSentinel.php](https://raw.githubusercontent.com/coollabsio/coolify/main/app/Actions/Server/StartSentinel.php)). Its Dockerfile's final stage sets no `USER` ([sentinel Dockerfile](https://raw.githubusercontent.com/coollabsio/sentinel/main/Dockerfile)) *(source-inferred)*.

### Dokploy

- The install script exits with "This script must be run as root" unless `id -u` is 0, and creates the control plane as a Swarm service with the Docker socket bind-mounted ([install.sh](https://dokploy.com/install.sh)).
- The remote-server setup script auto-detects privilege. As root it uses no prefix. Otherwise it requires `sudo -n true` to succeed and fails with "Non-root user requires passwordless sudo access", suggesting `$CURRENT_USER ALL=(ALL) NOPASSWD:ALL` ([server-setup.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/setup/server-setup.ts)) *(source-inferred)*.
- Server validation reports a `privilegeMode` of `root` or `sudo`, and whether the user is in the `docker` group ([server-validate.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/setup/server-validate.ts)) *(source-inferred)*.

### Komodo Periphery

- Two documented systemd installs: the default system service, and "Periphery can also be installed to run as a **systemd user service** (for the calling user)" with `--user`, which needs `sudo loginctl enable-linger $USER` to survive logout ([docs: connect servers](https://komo.do/docs/setup/connect-servers)).
- The generated unit file has only `Environment`, `ExecStart`, `Restart`, and `TimeoutStartSec` in `[Service]`. There's no `User=`, so the system install runs as root. Paths are `/usr/local/bin`, `/etc/komodo`, and `/etc/systemd/system` for the system install, and `~/.local/bin`, `~/.config/komodo`, and `~/.config/systemd/user` for the user install ([scripts/setup-periphery.py](https://raw.githubusercontent.com/moghtech/komodo/main/scripts/setup-periphery.py)) *(source-inferred)*.
- For a non-root Periphery the docs require: "Ensure that the user which periphery is run as has access to the **docker group without sudo**" ([docs: connect servers](https://komo.do/docs/setup/connect-servers)).
- The container install mounts `/var/run/docker.sock`, `/proc`, and the Periphery root directory at the same path inside and outside the container, "or docker will get confused" ([compose/periphery.compose.yaml](https://raw.githubusercontent.com/moghtech/komodo/main/compose/periphery.compose.yaml)).
- Periphery offers remote shell terminals, on by default, with `disable_terminals` as the switch ([config/periphery.config.toml](https://raw.githubusercontent.com/moghtech/komodo/main/config/periphery.config.toml)). A terminal therefore runs with whatever Periphery runs as, which is root in the default install *(source-inferred)*.

### Portainer Agent

- The official Swarm stack mounts `/var/run/docker.sock` and `/var/lib/docker/volumes` into the agent ([portainer-agent-stack.yml](https://downloads.portainer.io/ce-lts/portainer-agent-stack.yml)). The agent's Dockerfile sets no `USER` ([build/linux/Dockerfile](https://raw.githubusercontent.com/portainer/agent/develop/build/linux/Dockerfile)) *(source-inferred)*.
- Host access beyond Docker is opt-in through a mount: "If you want to use the host management features of the Portainer Agent, you should add the necessary volume mount to the command that Portainer provides: `-v /:/host`" ([docs: add Docker agent](https://docs.portainer.io/admin/environments/add/docker/agent)).

### Kamal

- The SSH user "Defaults to `root`". For a non-root user, "you may need to bootstrap your servers manually", and the documented Ubuntu bootstrap ends with `sudo usermod -a -G docker app` ([docs: SSH configuration](https://kamal-deploy.org/docs/configuration/ssh/)).
- `kamal server bootstrap` installs Docker only when `[ "${EUID:-$(id -u)}" -eq 0 ] || sudo -nl usermod` succeeds, then runs `sudo -n usermod -aG docker "$USER"` for a non-root user. After that, Kamal uses Docker without `sudo` ([lib/kamal/commands/docker.rb](https://raw.githubusercontent.com/basecamp/kamal/main/lib/kamal/commands/docker.rb), [lib/kamal/cli/server.rb](https://raw.githubusercontent.com/basecamp/kamal/main/lib/kamal/cli/server.rb)) *(source-inferred)*.
- Kamal is the only surveyed deploy tool whose steady state is "non-root user in the `docker` group, no sudo".

### CapRover

- Installed with `docker run -p 80:80 -p 443:443 -p 3000:3000 -e ACCEPTED_TERMS=true -v /var/run/docker.sock:/var/run/docker.sock -v /captain:/captain caprover/caprover` ([docs: getting started](https://caprover.com/docs/get-started.html)).
- The user inside the container is **unverified**; the release Dockerfile wasn't found at the expected path.

### Dokku

- "The SSH (Git) user is _always_ `dokku`, as this is the system user that the `dokku` binary uses to perform all its actions" ([docs: user management](https://dokku.com/docs/deployment/user-management/)).
- `postinst` creates the user with `sshcommand create dokku /usr/bin/dokku` and adds it to the `docker` group with `usermod -aG docker dokku` ([debian/postinst](https://raw.githubusercontent.com/dokku/dokku/master/debian/postinst)) *(source-inferred)*.
- The `dokku` script re-executes itself as that user: any other caller goes through `sudo -u dokku ... "$0" "${args[@]}"`. A small set of commands, `plugin:*` other than help and list, `ssh-keys:add`, `ssh-keys:remove`, `scheduler-k3s:initialize`, and `scheduler-k3s:uninstall`, fails with "This command must be run as root" ([dokku](https://raw.githubusercontent.com/dokku/dokku/master/dokku)) *(source-inferred)*.
- Privileged host actions go through narrow sudoers files. The nginx plugin writes `/etc/sudoers.d/dokku-nginx` at mode `0440` with a fixed list: `%dokku ALL=(ALL) NOPASSWD:` followed by `systemctl enable|disable|reload|start|stop nginx`, `systemctl is-active --quiet nginx`, `nginx -t`, and `nginx -t -c *` ([plugins/nginx-vhosts/install](https://raw.githubusercontent.com/dokku/dokku/master/plugins/nginx-vhosts/install)) *(source-inferred)*.
- SSH keys for the `dokku` user carry `no-agent-forwarding`, `no-user-rc`, `no-X11-forwarding`, and `no-port-forwarding`, and a forced command ([docs: user management](https://dokku.com/docs/deployment/user-management/)).
- Dokku is the only surveyed deploy tool that uses option C from the ticket: a dedicated user plus narrow sudoers.

---

## 2. Host-level changes

| Tool | Firewall | SSH configuration | Other host changes | Mechanism |
| --- | --- | --- | --- | --- |
| **Coolify** | Not managed. Docs tell the user to use the provider firewall or `ufw-docker`. | Not managed. Install script only reads `PermitRootLogin` and starts sshd. | Installs Docker. **Server Patching** installs OS package updates from the dashboard. | SSH as root, or passwordless `sudo`. |
| **Dokploy** | Read-only audit. | Read-only audit. | Installs Docker, Swarm, Traefik, build tools, rclone. | SSH as root, or passwordless `sudo`. |
| **Komodo** | Not managed. | Not managed. | No dedicated feature. A root terminal can do anything. | Root agent. |
| **Portainer Agent** | Not managed. | Not managed. | Opt-in host filesystem browsing and device listing. | `-v /:/host` mount. |
| **Kamal** | Not managed. | Not managed. | Installs Docker at bootstrap. | SSH as root, or `sudo -n` once at bootstrap. |
| **CapRover** | Not managed. Docs give `ufw allow` commands to run by hand. | Not managed. | None found. | None. |
| **Dokku** | Not managed (**unverified** as an absence). | Manages only the `dokku` user's `authorized_keys`. | Reloads nginx, edits Docker's `daemon.json` at install. | Narrow sudoers for nginx. Root-only CLI commands for keys and plugins. |

- **Coolify** doesn't configure the firewall. The docs recommend the provider's firewall "because it blocks unwanted traffic before the traffic reaches your server" ([docs: firewall](https://coolify.io/docs/knowledge-base/server/firewall)). It does change host packages: "Server Patching lets you check for operating-system package updates and install them from the Coolify dashboard" ([docs: patching](https://coolify.io/docs/knowledge-base/server/patching)).
- **Dokploy** audits ufw, sshd, and fail2ban, and only reports: "Dokploy automatically validates these security configurations and provides recommendations" ([docs: security](https://docs.dokploy.com/docs/core/remote-servers/security)). The audit script is the closest analogue to Alfredo's Machine checks, and section 5 uses it as evidence ([server-audit.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/setup/server-audit.ts)).
- **Portainer** host management "allows you to see the available devices and storage on the physical node as well as browse the node's filesystem", and "For security, these features are disabled by default" ([docs: host setup](https://docs.portainer.io/user/docker/host/setup)).
- **CapRover** lists the commands `ufw allow 80/tcp`, `ufw allow 443/tcp`, `ufw allow 443/udp`, `ufw allow 3000/tcp` for the user to run ([docs: firewall](https://caprover.com/docs/firewall.html)).
- **Dokku** `postinst` enables Docker live-restore by rewriting `/etc/docker/daemon.json` and reloading Docker ([debian/postinst](https://raw.githubusercontent.com/dokku/dokku/master/debian/postinst)) *(source-inferred)*.

**Finding:** none of the seven deploy tools changes firewall rules or sshd configuration. The only host-changing features among them are package installation at setup and Coolify's Server Patching, and every one of those runs as root or through unrestricted `sudo`. No surveyed deploy tool changes the host through a narrow privilege path.

---

## 3. Tools built for host management

| Tool | Runs as | Escalation mechanism | Changes firewall, SSH, or hardening |
| --- | --- | --- | --- |
| **Ansible** | The SSH connection user. | `become`, default `sudo` to `root`. Must be unrestricted. | Yes, through modules. |
| **Salt minion** | `root` by default. | None needed. Optional `sudo_user` for a non-root minion. | Yes, through states. |
| **Cockpit** | `cockpit-ws` as an unprivileged user; `cockpit-bridge` as the logged-in user. | A second, root bridge started through `sudo` or polkit, per session and on request. | Yes, with administrative access. |
| **Webmin** | `root`. | None needed. | Yes. |
| **Laravel Forge** | SSH as `root`. Whether it also installs a resident agent is **unverified**. | None needed. | Yes: UFW, password auth off, automatic security updates. |
| **Ploi** | Installer runs as root. Ongoing connection user **unverified**. | **unverified** | Yes: root login and password auth off, fail2ban installed. |
| **RunCloud** | Resident agent installed as root. Run-as user of the agent process **unverified**. | **unverified** | "applies essential security settings automatically"; specifics **unverified**. |

### Ansible

- "Ansible uses existing privilege escalation systems to execute tasks with root privileges or with another user's permissions." The default `become_method` is `sudo` and the default `become_user` is `root` ([docs: privilege escalation](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_privilege_escalation.html)).
- Narrow sudoers doesn't work with Ansible: "You cannot limit privilege escalation permissions to certain commands. Ansible does not always use a specific command to do something but runs modules (code) from a temporary file name which changes every time" (same page).

This is the same constraint Coolify and Dokploy hit. A tool that sends generated shell or code to the host can't be confined by a command allowlist. Only a tool with a fixed, named operation set can.

### Salt minion

- The minion's `user` setting defaults to `root` ([docs: minion configuration](https://docs.saltproject.io/en/latest/ref/configuration/minion.html)). "The salt-minion daemon runs as `root` by default because most of the minion's work (`pkg`, `service`, `user`, `file` on system paths) needs root" ([docs: running as non-root](https://docs.saltproject.io/en/latest/ref/configuration/nonroot.html)).
- `sudo_user` lets a non-root minion run remote execution commands through `sudo`: "The user to run salt remote execution commands as via sudo" ([docs: minion configuration](https://docs.saltproject.io/en/latest/ref/configuration/minion.html)).
- The agent itself can refuse operations: `disable_modules` covers the case where "the administrator desires that a minion should not be able to execute a certain module", and the hardening guide gives the example "disable the `cmd` module if it makes sense in your environment" ([docs: minion configuration](https://docs.saltproject.io/en/latest/ref/configuration/minion.html), [docs: hardening Salt](https://docs.saltproject.io/en/latest/topics/hardening.html)).

### Cockpit

Cockpit is the clearest privilege-separation design in the survey.

- "The `cockpit-ws` binary runs as an unprivileged unix `cockpit-ws` user, with a restrictive SELinux `cockpit_ws_t` policy" ([Is Cockpit secure?](https://cockpit-project.org/blog/is-cockpit-secure.html)).
- "The `cockpit-bridge` is the part of Cockpit that runs in the login session. It is similar to a login shell, in that it runs with the privileges and security context of the logged in user" (same page).
- "Cockpit itself has no special privileges. The credentials of the logged in user start a login session, and Cockpit can perform exactly the tasks that the logged in user has access to" (same page).
- "Cockpit supports escalating privileges via sudo and/or polkit. If, and only if, the logged in user has permission to use sudo or polkit to escalate privileges" (same page).
- Where `sudo` isn't available, Cockpit 355 added a polkit path: "It starts the root bridge through systemd's `StartTransientUnit()` API. This is inspired by systemd's run0, and uses the exact same underlying mechanism" ([Cockpit 355](https://cockpit-project.org/blog/cockpit-355.html)).

The shape is an unprivileged network-facing process, an unprivileged session process, and a separate root process started only when needed. Cockpit's escalation borrows a human's `sudo` rights. Porter has no logged-in human, so it would need a standing rule instead.

### Webmin

- "Because Webmin still runs with full _root_ privileges even when used by a restricted user, it still has access to all the configuration files and commands that it needs" ([docs: Webmin users](https://webmin.com/docs/modules/webmin-users/)). Access control is enforced by the application, not by the operating system.

### Server panels

- **Laravel Forge**: "During the initial provisioning of your server, Laravel Forge connects as the `root` user over SSH." Afterwards, "Laravel Forge continues to use root access so that it can manage your server's software, services, and configuration", including firewalls, scheduled tasks, and website isolation ([docs: root access / security](https://laravel.com/forge/docs/servers/security)). Forge hardens the host itself: "Password based server SSH connections are disabled during provisioning", "All ports are blocked by default with UFW", and "Automated security updates are installed using Ubuntu's automated security release program" (same page).
- **Ploi**: for a custom server, "ensure the created server has a root user and log in as root user", then run the given command "as root user" ([docs: custom server](https://ploi.io/documentation/server/how-do-i-install-a-custom-server)). Afterwards, "By default root login is disabled so you always have to login through the ploi user because of safety precautions", and `sudo su` needs "the sudo password which you received in the e-mail" ([docs: login as root](https://ploi.io/documentation/ssh/how-do-i-login-as-root-user)). Which user Ploi itself connects as after provisioning is **unverified**.
- **RunCloud**: "The RunCloud agent needs to be installed with root privileges. Make sure that you are logged in as the root user". The agent listens on `34210/TCP` ([docs: connect any server](https://runcloud.io/docs/connect-any-cloud-provider-on-premise-server)). The run-as user of the agent process and the exact hardening changes are **unverified**.

**Finding:** every surveyed tool that changes firewall, SSH, or hardening settings does it as root, either directly or through unrestricted `sudo`. Cockpit is the only one that keeps root out of the long-running, network-facing process.

---

## 4. Privilege separation patterns

### The Docker socket is root-equivalent

- "The `docker` group grants root-level privileges to the user" ([Docker: post-installation steps](https://docs.docker.com/engine/install/linux-postinstall/)).
- "This daemon requires `root` privileges unless you opt-in to Rootless mode", and "only trusted users should be allowed to control your Docker daemon" ([Docker: security](https://docs.docker.com/engine/security/)).
- On remote access to the daemon: "anyone with the keys can give any instructions to your Docker daemon, giving them root access to the machine hosting the daemon" ([Docker: protect access](https://docs.docker.com/engine/security/protect-access/)).

For Porter this has a specific consequence. The [compose spec](../spec/compose.md) lets an Operator deploy a Stack revision whose compose file HQ supplies, and a compose file can bind-mount `/` or request a privileged container. So anyone who controls HQ, or who can author a deployed compose file, can get root on the Porter host in every privilege model below, as long as Porter talks to a rootful Docker daemon. *(Analysis, not a sourced claim.)*

### Which patterns stay meaningful with the Docker socket

| Pattern | Example | What it limits | Still meaningful when the daemon holds the Docker socket? |
| --- | --- | --- | --- |
| **Root daemon** | Komodo default, Salt minion, Webmin | Nothing. | Not applicable. |
| **Dedicated user in the `docker` group** | Kamal non-root, Komodo `--user` | Direct file and process access by the daemon. | Partly. It doesn't stop a deliberate attacker, who can go through Docker. It does contain bugs that don't go through Docker, such as a path-handling mistake that writes or deletes files, because those run as the unprivileged user. |
| **Narrow sudoers** | Dokku | Root actions to a fixed, auditable list. | Same as above. The list documents which root actions the product performs, and the file is reviewable by the Admin. It isn't a security boundary against a daemon that can reach Docker. |
| **Passwordless `sudo` for everything** | Coolify and Dokploy non-root | Nothing. Coolify's docs say "The account still has root-level access". | No. |
| **Unprivileged daemon plus privileged helper** | Cockpit root bridge, Datadog `system-probe` | Root code to a small separate process with a defined interface. | Same as narrow sudoers. The helper's interface is the root surface. |
| **polkit** | Cockpit, systemd | Specific D-Bus actions, such as `org.freedesktop.systemd1.manage-units`. | Same. It only helps for operations that already have a D-Bus API. |
| **Linux capabilities** | None found among surveyed tools. | Root split into separate privileges. | Weak fit; see below. |
| **Agent as a container** | Portainer Agent, Komodo container, Coolify Sentinel | Filesystem view of the agent. | No. The socket mount gives it the host. Host audits need extra mounts such as `-v /:/host` or `--pid host`. |
| **Rootless Docker** | None found among surveyed tools. | The Docker daemon itself. | Yes. It's the only option that removes the root equivalence. |

Notes on individual patterns:

- **Unprivileged daemon plus privileged helper.** Datadog documents the split: "By default, the Agent runs as the `dd-agent` user on Linux", while "The `system-probe` runs as `root` on Linux" and "The `security-agent` runs as `root` on Linux" ([Datadog: Agent data security](https://docs.datadoghq.com/data_security/agent/)). Cockpit's root bridge is the on-demand variant.
- **polkit.** systemd's D-Bus API grants reads to everyone, "Read access is generally granted to all clients", and gates changes behind actions such as `org.freedesktop.systemd1.manage-units` and `org.freedesktop.systemd1.manage-unit-files` ([org.freedesktop.systemd1(5)](https://man7.org/linux/man-pages/man5/org.freedesktop.systemd1.5.html)). A polkit rule could let a `porter` user restart named units without `sudo`. ufw, sshd configuration, and fail2ban have no D-Bus API, so polkit doesn't cover them. *(The last sentence is **unverified** as an absence.)*
- **Linux capabilities.** Whether a capability set could cover Porter's future work is **unverified**. The relevant tools check for uid 0 rather than a capability: `ufw` exits with "You need to be root to run this script" when `os.getuid() != 0` (`/usr/lib/python3/dist-packages/ufw/backend.py` in the Ubuntu 24.04 package) *(tested)*, and `fail2ban-client` reports "Permission denied to socket ... (you must be root)" *(tested)*. Capabilities on the Porter binary wouldn't satisfy those checks.
- **Rootless Docker.** "Rootless mode lets you run the Docker daemon and containers as a non-root user to mitigate potential vulnerabilities in the daemon and the container runtime" ([Docker: rootless mode](https://docs.docker.com/engine/security/rootless/)). Its limitations for Alfredo's use, such as binding ports 80 and 443 for the reverse proxy, weren't researched here and are **unverified**.

---

## 5. Unprivileged audit on Ubuntu 24.04

This section covers the facts behind the Baseline checks in the [machine ops spec](../spec/machine-ops.md). "Unprivileged" means a user that is in no special group for the purpose of the check. Membership of the `docker` group doesn't help with any of these reads directly.

### Summary

| Baseline check | Unprivileged? | Needs root for |
| --- | --- | --- |
| **SSH root login disabled** | Conditionally. | Any configuration file that isn't world-readable, which includes the drop-in cloud-init writes. `sshd -T` always needs root. |
| **SSH password authentication disabled** | Conditionally, same as above. This is the setting cloud-init is most likely to write. | Same as above. |
| **Non-root admin user** | Partly. `sudo` group membership is readable. | Other users' `authorized_keys`, and `/etc/sudoers` and its drop-ins. |
| **Host firewall active** | Configured state only. | `ufw status`, and the loaded kernel rules. |
| **Intrusion protection active** | Service state and configured jails. | The live jail list from `fail2ban-client status`. |
| **Automatic security updates** | Yes. | Nothing. |
| **Time sync** | Yes, per the D-Bus documentation. Not tested live. | Nothing. |

Three of the seven checks lose fidelity without root, the two SSH checks depend on how the host was provisioned, and two are fully readable.

### Effective sshd configuration

- `sshd -T` fails for an unprivileged user with `sshd: no hostkeys available -- exiting.` The host private keys are mode `600 root:root` *(tested)*.
- `sshd -G` works unprivileged. On a stock install it printed `permitrootlogin without-password` and `passwordauthentication yes`, and it picked up a world-readable drop-in *(tested)*. The man page describes `-G` as "Parse and print configuration file. Check the validity of the configuration file, output the effective configuration to stdout and then exit", and says `-T` "is similar to the `-G` flag, but it includes the additional testing performed by the `-t` flag", which checks the "sanity of the keys" ([sshd(8), Ubuntu 24.04](https://manpages.ubuntu.com/manpages/noble/en/man8/sshd.8.html)).
- `/etc/ssh/sshd_config` is mode `644`, `/etc/ssh/sshd_config.d` is `755`, and the stock file has `Include /etc/ssh/sshd_config.d/*.conf` *(tested)*.
- cloud-init creates its drop-in root-only. Its source says `# Ensure root read-only:` followed by `util.ensure_file(fname, 0o600)` for `/etc/ssh/sshd_config.d/50-cloud-init.conf` ([cloudinit/ssh_util.py](https://raw.githubusercontent.com/canonical/cloud-init/main/cloudinit/ssh_util.py)) *(source-inferred)*.
- With a `600` drop-in present, unprivileged `sshd -G` fails with `/etc/ssh/sshd_config.d/50-cloud-init.conf: Permission denied` and prints nothing. Root saw `passwordauthentication no` from that file *(tested, with a hand-made file of that name and mode)*.
- Whether a given provider's Ubuntu 24.04 image has that drop-in is **unverified** and likely varies. cloud-init writes it when it changes SSH settings, and `PasswordAuthentication` is the setting it manages.

So an unprivileged Porter can read the effective sshd configuration on some hosts and not on others, and it can tell which case it's in: `sshd -G` either succeeds or names the unreadable file. That maps onto the spec's **Unknown (needs root)** result.

Both comparable tools that read sshd configuration do it with root: Coolify's install script runs `sshd -T` as root, and Dokploy's audit runs `sudo sshd -T` and `sudo grep` on the config file ([Coolify install.sh](https://raw.githubusercontent.com/coollabsio/coolify/main/scripts/install.sh), [Dokploy server-audit.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/setup/server-audit.ts)).

### ufw state and default policy

- `ufw status verbose` fails unprivileged with `ERROR: You need to be root to run this script` *(tested)*.
- The configured state is readable: `/etc/ufw/ufw.conf` is `644` and holds `ENABLED=no` or `ENABLED=yes`; `/etc/default/ufw` is `644` and holds `DEFAULT_INPUT_POLICY="DROP"` *(tested)*. `ufw enable` and `ufw disable` toggle `ENABLED` in `ufw.conf` (`frontend.py` in the Ubuntu package: "Toggles ENABLED state in <config_dir>/ufw/ufw.conf") *(tested, source-inferred)*.
- The rule files `user.rules`, `user6.rules`, `before.rules`, and `after.rules` are `640 root:root` and unreadable *(tested)*. The spec's firewall check doesn't judge rules, so this doesn't affect the Baseline.
- The loaded kernel rules are unreadable: `iptables -S` and `nft list ruleset` both fail with "you must be root" *(tested)*.

An unprivileged check therefore reports what ufw is configured to do at boot, not what the kernel is enforcing now. The two differ if someone flushed rules by hand or if ufw failed to start. Dokploy's audit uses `sudo ufw status` for this ([server-audit.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/setup/server-audit.ts)).

### fail2ban jail state

- The control socket is root-only: `/var/run/fail2ban/fail2ban.sock` is `700 root:root`, and `fail2ban-client status` fails with `Permission denied to socket ... (you must be root)` *(tested)*.
- The configuration is readable: `/etc/fail2ban/jail.conf` and `/etc/fail2ban/jail.d/defaults-debian.conf` are `644`, and the Ubuntu default enables the jail with `[sshd]` and `enabled = true` *(tested)*.
- `fail2ban-client -d` dumps the parsed configuration without the socket and showed `['add', 'sshd', 'systemd']` and `['start', 'sshd']` unprivileged *(tested)*. A root-only `jail.local` would break this the same way the cloud-init drop-in breaks `sshd -G`; an Admin-created `jail.local`'s mode is **unverified**.
- Whether `fail2ban.service` is active is a systemd read, which is open to all clients ([org.freedesktop.systemd1(5)](https://man7.org/linux/man-pages/man5/org.freedesktop.systemd1.5.html)). Dokploy's audit calls `systemctl is-active` without `sudo` while using `sudo` for ufw and sshd ([server-audit.ts](https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/setup/server-audit.ts)). Not tested live here.

An unprivileged check can say "the service is running and the sshd jail is configured as enabled". It can't confirm the jail actually started.

### unattended-upgrades

- Fully readable. `dpkg-query -W -f='${Status}' unattended-upgrades` returned `install ok installed`, and `apt-config dump APT::Periodic` returned `APT::Periodic::Unattended-Upgrade "1"` and `APT::Periodic::Update-Package-Lists "1"`, both unprivileged. `/etc/apt/apt.conf.d/20auto-upgrades` is `644` *(tested)*.
- Timer and service state are systemd reads, as above. Not tested live.

### Time sync

- `timedatectl show` gives "the same information as **status**, but in machine readable form" ([timedatectl(1), Ubuntu 24.04](https://manpages.ubuntu.com/manpages/noble/en/man1/timedatectl.1.html)).
- The underlying D-Bus properties are `NTP`, which "shows whether a time synchronization service is enabled", and `NTPSynchronized`, which "shows whether the kernel reports the time as synchronized". The interface lists polkit actions only for the setters ([org.freedesktop.timedate1(5)](https://man7.org/linux/man-pages/man5/org.freedesktop.timedate1.5.html)).
- That reads need no privilege follows from the documentation but wasn't tested on a booted system, so treat it as **unverified** until an implementation spike confirms it.

### Non-root admin user

- `getent group sudo` works unprivileged and lists the members; `/etc/group` and `/etc/passwd` are `644` *(tested)*.
- `/etc/sudoers` is `440 root:root` and unreadable. `/etc/sudoers.d` is listable, but the stock file in it is `440`. `sudo -l -U <user>` demands a password *(tested)*. So sudo rights granted by a drop-in instead of the `sudo` group can't be confirmed. Whether Ubuntu cloud images grant sudo through such a drop-in, and that file's mode, are **unverified**.
- Other users' keys are unreadable. New home directories are `750`, from `HOME_MODE 0750` in `/etc/login.defs`, and `cat /home/admin/.ssh/authorized_keys` fails with "Permission denied" *(tested)*.

The "at least one authorized SSH key" half of this check needs root.

### Diagnostics

- **Pending updates**: `/usr/lib/update-notifier/apt-check` ran unprivileged without error *(tested)*.
- **Listening ports**: unprivileged `ss -tlnp` lists the sockets but omits the owning process for sockets owned by other users. Root saw `users:(("sshd",pid=...))` on the same sockets *(tested)*. Docker-published ports can be identified from the Docker API instead.
- **Reboot required**: the mode of `/var/run/reboot-required` is **unverified**; the file didn't exist in the test container.

### A third way to read root-only facts

A Porter with the Docker socket can read any root-only file by starting a container that bind-mounts it read-only. That would close every gap above without `sudo`. No surveyed tool reads host configuration this way, though Coolify Sentinel's `--pid host` and Portainer's `-v /:/host` are the same idea applied to metrics and file browsing. It's a consequence of the socket being root-equivalent and is listed here for completeness, not as a recommendation. *(Analysis, not a sourced claim.)*

---

## 6. Documented risk statements

How each tool describes, in its own documentation, what its access amounts to:

| Tool | Statement | Source |
| --- | --- | --- |
| **Docker** | "The `docker` group grants root-level privileges to the user." | [post-installation steps](https://docs.docker.com/engine/install/linux-postinstall/) |
| **Docker** | "anyone with the keys can give any instructions to your Docker daemon, giving them root access to the machine hosting the daemon" | [protect access](https://docs.docker.com/engine/security/protect-access/) |
| **Coolify** | "The account still has root-level access", with the advice "Use a dedicated account and SSH key only for Coolify." | [non-root user](https://coolify.io/docs/knowledge-base/server/non-root-user) |
| **Laravel Forge** | "Laravel Forge continues to use root access so that it can manage your server's software, services, and configuration." | [root access / security](https://laravel.com/forge/docs/servers/security) |
| **Webmin** | "an RPC client can access all of the features of Webmin, edit arbitrary files and execute commands as root - regardless of any access control settings." | [Webmin users](https://webmin.com/docs/modules/webmin-users/) |
| **Cockpit** | "Cockpit itself has no special privileges... Cockpit can perform exactly the tasks that the logged in user has access to." | [Is Cockpit secure?](https://cockpit-project.org/blog/is-cockpit-secure.html) |
| **Salt** | "Restrict who can directly log into your Salt master system", behind "a hardened bastion server or a VPN". | [hardening Salt](https://docs.saltproject.io/en/latest/topics/hardening.html) |
| **Ansible** | "If any of the parameters passed to the module are sensitive in nature, and you do not trust the remote machines, then this is a potential security risk." | [privilege escalation](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_privilege_escalation.html) |
| **Dokku** | "For non-core plugins, please inspect those plugins before running the following command as `root` user." | [plugin management](https://dokku.com/docs/advanced-usage/plugin-management/) |
| **Portainer** | Host management: "For security, these features are disabled by default. Be sure that you understand their impact before enabling them." | [host setup](https://docs.portainer.io/user/docker/host/setup) |

Absences:

- **Komodo**: no statement found on what a compromise of Core gives an attacker, on the two pages checked ([connect servers](https://komo.do/docs/setup/connect-servers), [terminals](https://komo.do/docs/terminals)). A Core that can open a terminal on a root Periphery has a root shell on that host *(source-inferred)*.
- **Portainer**: the [security page](https://docs.portainer.io/advanced/security) gives general hardening advice and no statement on what a compromised server can do through the agent.
- **Dokploy, Kamal, CapRover, Ploi, RunCloud**: no control-plane compromise statement was found; the search wasn't exhaustive, so these absences are **unverified**.

**Finding:** only Docker, Coolify, Forge, and Webmin state plainly that their access is root access. No surveyed deploy tool documents a blast-radius model for a compromised control plane. An explicit statement in Alfredo's docs would be more than the comparable tools offer.

---

## Cross-tool patterns

**Root is the norm.** Of the seven deploy tools, four run their host-side work as root by default (Coolify, Dokploy, Komodo, Kamal), two run as containers holding the Docker socket (Portainer Agent, CapRover), and one uses a dedicated user (Dokku). Every host-management tool except Cockpit runs as root.

**"Non-root" usually isn't a privilege reduction.** Coolify and Dokploy both offer a non-root SSH user and both require `NOPASSWD: ALL`. The reason is structural: they send generated shell, and Ansible's docs spell out why that can't be allowlisted. Kamal and Komodo `--user` are the genuine cases, and both rest on `docker` group membership, which Docker's own docs call root-level.

**A narrow sudoers file needs a fixed command set.** Dokku can use one because its privileged actions are a short, fixed list of exact commands. Porter is in the same position: the [compose spec](../spec/compose.md) says "Porter exposes a fixed set of compose operations. There's no generic 'run compose with these arguments' operation", and Machine checks are a fixed catalog.

**No deploy tool manages the firewall or sshd.** The tools that do, Forge, Ploi, RunCloud, Webmin, Cockpit, Ansible, and Salt, all use root. There's no precedent in the survey for changing firewall or SSH settings through a narrow privilege path, so Alfredo would be designing that path itself.

**Auditing security settings takes root in practice.** Dokploy, the one deploy tool with a comparable audit, uses `sudo` for ufw and sshd. The Ubuntu 24.04 tests agree for ufw's live state, fail2ban's live jails, and other users' SSH keys. The exception is `sshd -G`, which Dokploy doesn't use and which works unprivileged when every included file is world-readable.

**Privilege separation with the Docker socket is about accidents and auditability.** No model that leaves a rootful Docker socket with the agent stops an attacker who controls the control plane. The separation still decides what a Porter bug can damage and whether the product's root actions are an explicit list.

---

## Shortlist for Porter

Constraints recap: Porter is a single Go binary; v1 needs the Docker socket and read-only Machine checks on Ubuntu 24.04; Stacks live under `~/.alfredo-porter/stacks/` and "Storing Stacks doesn't require root"; Porter upgrades are manual in v1; later versions may change firewall rules, SSH configuration, and hardening.

In every model below, a compromised HQ can reach root on the host through a deployed compose file. The models differ in what a Porter bug can do, how complete the Machine checks are, and how host-changing operations get added.

### A. Root system service

Porter runs as root under systemd. Precedent: Komodo's default install, the Salt minion, RunCloud's agent, Webmin.

- **Machine checks**: full fidelity. `sshd -T`, `ufw status`, `fail2ban-client status sshd`, and every user's `authorized_keys` are readable. No check reports Unknown.
- **Blast radius**: any Porter bug runs as root. Nothing separates Porter's code from the host.
- **Install**: simplest. One unit file, no user, no group, no sudoers.
- **Spec fit**: conflicts with the `~/.alfredo-porter` default, which would become `/root/.alfredo-porter`, and with the machine ops spec's "Machine checks alone aren't a reason to run Porter as root."
- **Extending to host changes**: nothing to add. Every future operation already has the privilege it needs, and nothing forces those operations to be enumerated.

### B. Dedicated user in the `docker` group, no sudo

A `porter` system user, a systemd unit with `User=porter`, and `docker` group membership. Precedent: Kamal with a non-root user, Komodo `--user`.

- **Machine checks**: reduced. Automatic security updates and time sync are complete. ufw and fail2ban report configured state, not live state. SSH checks work through `sshd -G` unless a root-only drop-in exists, in which case they report Unknown. The non-root admin check can't confirm an authorized key.
- **Blast radius**: a Porter bug outside Docker runs as an unprivileged user. Through Docker, Porter is still root-equivalent.
- **Install**: needs root once to create the user, add the group, and install the unit.
- **Spec fit**: matches both specs as written, including the Unknown (needs root) result.
- **Extending to host changes**: B alone can't change the host. It extends by adding C or D later, which needs one root step on each host at upgrade time. Upgrades are already manual in v1, so that step has a natural place. The risk is that the step gets skipped and hosts end up in mixed states, so HQ would need to see which Porters have the privileged part installed.

### C. Dedicated user plus a narrow sudoers file

B, plus an installer-written `/etc/sudoers.d/alfredo-porter` listing exact commands with `NOPASSWD`. Precedent: Dokku's `/etc/sudoers.d/dokku-nginx`.

- **Machine checks**: full fidelity for a short list, for example `sshd -T`, `ufw status verbose`, and `fail2ban-client status sshd`. Reading other users' `authorized_keys` doesn't reduce to a safe fixed command and may stay Unknown or need the helper in D.
- **Blast radius**: as B, plus the listed commands. Read-only commands with no arguments add little. Each entry must be an exact command line, because a wildcard argument on a tool such as `ufw` or `systemctl` is a general root grant.
- **Install**: as B, plus one sudoers file that the Admin can read to see exactly what Porter may do as root.
- **Spec fit**: needs the machine ops spec's "don't require root" wording revised to "require root only through the listed commands".
- **Extending to host changes**: add entries. This works for commands with fixed arguments, such as `ufw --force enable` or `systemctl reload ssh`. It fits badly for parameterized changes, such as "allow port N" or "write this sshd drop-in", because sudoers can't validate arguments beyond pattern matching. Each new entry also needs a root step at upgrade time, as in B.

### D. Unprivileged daemon plus a privileged helper

B, plus a small root-owned helper that exposes named, validated operations. Porter calls it through a single sudoers entry for the helper binary, or over a root-owned Unix socket served by a second systemd unit. Precedent: Cockpit's root bridge, Datadog's `system-probe`. No surveyed deploy tool does this.

- **Machine checks**: full fidelity, including reads that don't reduce to one command, such as collecting every user's `authorized_keys` count.
- **Blast radius**: as B, plus whatever the helper's verbs allow. The helper validates arguments in code, so parameterized operations can be safe in a way sudoers patterns can't make them.
- **Install**: the most moving parts: user, group, unit, helper binary, and a sudoers line or a second unit. The helper can be the same Go binary invoked in a different mode, which keeps "single binary" true.
- **Spec fit**: same wording change as C.
- **Extending to host changes**: add verbs to the helper. This is the only model in which firewall and SSH changes become typed operations with validation, matching how compose operations are already defined. The sudoers line or socket doesn't change when verbs are added, so a Porter upgrade that replaces the binary is enough, with no extra root step per feature. The cost is that the helper is security-critical code to write and review, and it's unneeded for v1's read-only scope.

### E. Porter as a container with the Docker socket

Precedent: Portainer Agent, Komodo's container install, CapRover.

- **Machine checks**: poor without extra mounts. Reading host sshd, ufw, and fail2ban state from inside a container needs `-v /:/host` or host PID and network namespaces, which is root on the host by another route.
- **Blast radius**: root-equivalent through the socket.
- **Install**: easiest for the Admin, one `docker run`.
- **Spec fit**: conflicts with "Porter is a single Go binary" and with the Stack directory layout. Komodo documents that the agent's root directory must be mounted at the same path inside and outside the container.
- **Extending to host changes**: needs a privileged container with the host's namespaces. No surveyed tool changes firewall or SSH settings from a container.

### F. Not recommended: dedicated user with passwordless `sudo` for everything

Precedent: Coolify's and Dokploy's non-root modes. It has the install cost of B and the blast radius of A. Coolify's own docs say "The account still has root-level access."

### How the options relate

- **B, C, and D are one path, not three choices.** C is B plus a file. D is C with the command list replaced by one helper. Moving along the path is additive and never requires moving Porter's data or changing its user. Moving from A to any of them does: files under `/root` change owner and location.
- **A and the B-to-D path differ on what v1 ships, not on what's possible later.** A gives complete Machine checks on day one and defers the question of which root actions Porter performs. B gives partial checks on day one and forces that question to be answered when the first host-changing feature arrives.
- **The v1 choice that blocks nothing is B with a reserved seat for the privileged part.** Concretely: a dedicated user now, and an install layout and HQ capability report that can later say "this Porter has the privileged helper" or "doesn't". Whether v1 also ships C's read-only sudoers entries is a fidelity decision: it's the difference between up to five checks reporting reduced or Unknown results and all seven being complete.
- **If the root equivalence of the Docker socket is itself the concern**, none of A to F addresses it. Only rootless Docker does, and its fit with Alfredo's reverse proxy is unresearched.

### Open questions for the decision

- Is partial fidelity acceptable for the firewall and fail2ban checks in v1, or should a configured-but-not-confirmed result report Unknown?
- Does a provider's stock Ubuntu 24.04 image ship the root-only `50-cloud-init.conf`? If most do, the two SSH checks report Unknown on most real hosts under B, which weakens the Baseline badge.
- Should Alfredo's docs state the blast radius of a compromised HQ plainly? Only Coolify, Forge, and Webmin do among the tools surveyed.
