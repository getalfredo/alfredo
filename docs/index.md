# Alfredo

## Install

Alfredo installs on Ubuntu 24.04 x64. The full flow is in the [install and upgrade spec](./spec/install.md).

For local development without a VPS, see [Local VPS (containers)](./local-vps.md).

### Step 1. Secure the host

Before you install anything, secure the host by hand. Use the Baseline in the [machine ops spec](./spec/machine-ops.md#check-catalog) as the checklist. The installer doesn't change your SSH or firewall configuration.

### Step 2. Install HQ

Run the installer in HQ mode with root privileges. The installer sets up HQ and the HQ Porter as services, with rootless Docker and Railpack.

### Step 3. Create the first Admin

Run the `user:create` command that the installer prints, then open the HQ address that the installer prints.

### Step 4. Open the firewall

To serve public hostnames, allow ports 80 and 443 with the `ufw` commands that the installer prints. After you set the **HQ hostname**, close HQ's own port.

### Add a Porter

In HQ, select **Add Porter**, copy the install command, secure the new host, and run the command on it.

### Upgrade

To upgrade, run the same install command again, on the HQ host first and then on each Porter host.

## CLI commands

User management is done via CLI. In development use `bun src/index.tsx <command>`, in production use `./alfredo <command>`.

| Command | Description |
|---------|-------------|
| `serve` | Start the server (default) |
| `user:create` | Create a new user (interactive) |
| `user:list` | List all users |
| `user:reset-pw` | Reset a user's password |
| `user:2fa-remove` | Remove 2FA from a user |
