#!/bin/sh
# install-rootless-porter.sh
#
# PROTOTYPE from the Docker modes test (docs/research/docker-modes-test.md,
# section "One-command rootless install"). It proves that one unattended
# command can set up rootless Docker for a dedicated `porter` service user on
# Ubuntu 24.04. It is not production code.
#
# Usage, as root, with no input:
#   curl -fsSL <url>/install-rootless-porter.sh | sudo sh
#
# The script is idempotent. It never stops, disables, or reconfigures a
# rootful Docker daemon that was on the host before it ran, and it never adds
# `porter` to the `docker` group.
set -eu

PORTER=porter
PACKAGES="docker-ce docker-ce-cli containerd.io docker-ce-rootless-extras docker-buildx-plugin docker-compose-plugin uidmap"
MODULES="br_netfilter nf_tables"
CHECK_IMAGE=caddy:2
LOG=/var/log/install-rootless-porter.log

log() { printf '==> %s\n' "$*"; }
die() {
	printf 'ERROR: %s\nLast lines of %s:\n' "$*" "$LOG" >&2
	tail -n 15 "$LOG" >&2
	exit 1
}
# Keep the output of noisy tools out of the terminal. It goes to the log file.
quiet() { "$@" >>"$LOG" 2>&1; }

main() {
	[ "$(id -u)" -eq 0 ] || { echo "ERROR: run this script as root" >&2; exit 1; }
	. /etc/os-release
	[ "${ID:-}" = ubuntu ] || { echo "ERROR: this prototype supports Ubuntu only" >&2; exit 1; }
	export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
	export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
	cd /
	echo "--- run at $(date -u +%FT%TZ)" >>"$LOG"

	install_packages
	create_user
	assign_subids
	grant_low_ports
	load_modules
	start_user_manager
	write_daemon_json
	setup_rootless
	self_check
}

# Run a command as the service user, with the environment that a login
# session would provide. `porter` has a nologin shell, so nothing sets it.
as_porter() {
	runuser -u "$PORTER" -- env HOME="$PORTER_HOME" XDG_RUNTIME_DIR="$RUNTIME" \
		DBUS_SESSION_BUS_ADDRESS="unix:path=$RUNTIME/bus" PATH="$PATH" "$@"
}
porter_docker() { as_porter docker -H "unix://$RUNTIME/docker.sock" "$@"; }

is_installed() { dpkg-query -W -f '${Status}' "$1" 2>/dev/null | grep -q 'ok installed'; }

# Another apt process, such as the daily update timer, can hold a lock. The
# option waits for the dpkg lock. The loop covers the package-list lock, which
# the option doesn't.
apt_get() {
	n=0
	until quiet apt-get -q -y -o DPkg::Lock::Timeout=300 "$@"; do
		n=$((n + 1))
		[ "$n" -lt 18 ] || die "apt-get $1 still fails after 3 minutes"
		log "apt-get $1 failed; trying again in 10 seconds"
		sleep 10
	done
}

install_packages() {
	missing=""
	for p in $PACKAGES; do
		is_installed "$p" || missing="$missing $p"
	done
	[ -n "$missing" ] || { log "Docker packages already installed"; return 0; }

	# docker-ce conflicts with Ubuntu's docker.io. Installing it would remove
	# a running daemon, so stop instead.
	if is_installed docker.io || [ -e /snap/bin/docker ]; then
		die "found docker.io or the Docker snap; this prototype doesn't handle them"
	fi

	# The docker-ce package starts a rootful daemon. On a host that has none,
	# nothing needs it, so mask its units before the package arrives. The mask
	# also holds if this run is interrupted and started again. A host that
	# already has docker-ce keeps its daemon as it is.
	if ! is_installed docker-ce; then
		log "Masking the rootful docker.service and docker.socket; nothing on this host uses them"
		quiet systemctl mask docker.service docker.socket
	fi

	if ! [ -s /etc/apt/sources.list.d/docker.list ] && ! [ -s /etc/apt/sources.list.d/docker.sources ]; then
		log "Adding Docker's apt repository"
		apt_get update
		apt_get install ca-certificates curl
		install -m 0755 -d /etc/apt/keyrings
		curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
		chmod a+r /etc/apt/keyrings/docker.asc
		echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
			>/etc/apt/sources.list.d/docker.list
	fi
	log "Installing:$missing"
	apt_get update
	# Install only what is missing, so an existing rootful daemon isn't upgraded
	# and restarted.
	# shellcheck disable=SC2086
	apt_get install $missing
}

create_user() {
	if ! id "$PORTER" >/dev/null 2>&1; then
		log "Creating system user $PORTER"
		useradd --system --create-home --home-dir "/home/$PORTER" --shell /usr/sbin/nologin "$PORTER"
	fi
	PORTER_UID=$(id -u "$PORTER")
	PORTER_HOME=$(getent passwd "$PORTER" | cut -d: -f6)
	RUNTIME=/run/user/$PORTER_UID
}

# `useradd --system` assigns no subordinate IDs. Take the first 65536 IDs
# above every range that /etc/subuid and /etc/subgid already hold.
assign_subids() {
	if grep -q "^$PORTER:" /etc/subuid && grep -q "^$PORTER:" /etc/subgid; then
		log "Subordinate IDs already assigned: $(grep "^$PORTER:" /etc/subuid)"
		return 0
	fi
	start=$(awk -F: 'BEGIN { m = 100000 } { e = $2 + $3; if (e > m) m = e } END { print m }' /etc/subuid /etc/subgid)
	end=$((start + 65535))
	log "Assigning subordinate IDs $start-$end"
	grep -q "^$PORTER:" /etc/subuid || usermod --add-subuids "$start-$end" "$PORTER"
	grep -q "^$PORTER:" /etc/subgid || usermod --add-subgids "$start-$end" "$PORTER"
}

# Ports 80 and 443. A sysctl file survives package upgrades; setcap doesn't.
grant_low_ports() {
	if [ "$(sysctl -n net.ipv4.ip_unprivileged_port_start)" -gt 80 ]; then
		log "Allowing unprivileged processes to bind ports from 80"
		echo 'net.ipv4.ip_unprivileged_port_start=80' >/etc/sysctl.d/90-alfredo-porter.conf
		sysctl -q -p /etc/sysctl.d/90-alfredo-porter.conf
	fi
}

# br_netfilter: `userland-proxy: false` gives real client IPs, and the daemon
# refuses to start with that setting unless the module is loaded.
# nf_tables: the setup tool refuses to run without it. A rootful daemon loads
# it as a side effect, but a host with the rootful units masked never does.
load_modules() {
	printf '%s\n' $MODULES >/etc/modules-load.d/alfredo-porter.conf
	for m in $MODULES; do modprobe "$m"; done
}

# Lingering starts the user's systemd manager at boot, with no login. The
# setup tool reports "systemd not detected" if it runs before the manager is up.
start_user_manager() {
	loginctl enable-linger "$PORTER"
	i=0
	until [ -S "$RUNTIME/bus" ] && as_porter systemctl --user show-environment >/dev/null 2>&1; do
		i=$((i + 1))
		[ "$i" -le 60 ] || die "the systemd user manager for $PORTER didn't start within 60 seconds"
		sleep 1
	done
}

write_daemon_json() {
	f=$PORTER_HOME/.config/docker/daemon.json
	if [ -e "$f" ]; then
		grep -q '"userland-proxy": *false' "$f" || log "WARNING: $f exists without userland-proxy false; left unchanged"
		return 0
	fi
	log "Writing $f"
	as_porter mkdir -p "$PORTER_HOME/.config/docker"
	echo '{"userland-proxy": false}' | as_porter tee "$f" >/dev/null
}

setup_rootless() {
	if ! [ -e "$PORTER_HOME/.config/systemd/user/docker.service" ]; then
		log "Running dockerd-rootless-setuptool.sh as $PORTER"
		quiet as_porter dockerd-rootless-setuptool.sh install || die "the rootless setup tool failed"
	fi
	quiet as_porter systemctl --user enable --now docker.service || die "the rootless docker.service didn't start"
	i=0
	until porter_docker info >/dev/null 2>&1; do
		i=$((i + 1))
		[ "$i" -le 30 ] || break
		sleep 1
	done
}

FAILED=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; FAILED=1; }

self_check() {
	echo
	echo "Self-check"
	if porter_docker info >/dev/null 2>&1; then
		pass "daemon reachable as $PORTER at $RUNTIME/docker.sock"
	else
		fail "daemon not reachable as $PORTER (see: journalctl _UID=$PORTER_UID)"
	fi

	if porter_docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -q rootless; then
		pass "docker info reports rootless"
	else
		fail "docker info doesn't report rootless"
	fi

	if as_porter test -w /var/run/docker.sock || id -nG "$PORTER" | grep -qw docker; then
		fail "$PORTER can reach the rootful socket or is in the docker group"
	else
		pass "$PORTER has no access to a rootful socket"
	fi

	check_ports

	echo
	if [ "$FAILED" -eq 0 ]; then
		echo "RESULT: PASS. Rootless Docker is ready for $PORTER."
	else
		echo "RESULT: FAIL. Fix the lines marked FAIL, then run this script again."
	fi
	if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
		echo "NOTE: ufw is active. Rootless published ports obey it. To open the Proxy: ufw allow 80/tcp; ufw allow 443/tcp"
	fi
	return "$FAILED"
}

# The Proxy needs ports 80 and 443. If the rootless daemon already publishes
# them, a second run must not fight its own Proxy for the port.
check_ports() {
	busy=0
	for port in 80 443; do
		holder=$(ss -H -ltnp "sport = :$port" | grep -o 'users:.*' | head -n 1)
		case $holder in
		*rootlesskit*) pass "port $port is already published by the rootless daemon"; busy=1 ;;
		?*) fail "port $port is taken by another process, so the Proxy can't publish it: $holder"; busy=1 ;;
		esac
	done
	[ "$busy" -eq 0 ] || return 0
	porter_docker rm -f porter-selfcheck >/dev/null 2>&1 || true
	if ! out=$(porter_docker run -d --rm --name porter-selfcheck -p 80:80 "$CHECK_IMAGE" 2>&1); then
		fail "a container can't publish port 80: $(echo "$out" | tail -n 1)"
		return 0
	fi
	i=0
	until curl -fsS -o /dev/null http://127.0.0.1:80/ 2>/dev/null; do
		i=$((i + 1))
		[ "$i" -le 15 ] || break
		sleep 1
	done
	if [ "$i" -le 15 ]; then
		pass "a container can publish port 80"
	else
		fail "a container published port 80 but didn't answer on it"
	fi
	porter_docker rm -f porter-selfcheck >/dev/null 2>&1 || true
}

# Everything runs from main, called on the last line. A script piped into
# `sh` is read as it runs, so a partial download can't run half a command.
main "$@" </dev/null
