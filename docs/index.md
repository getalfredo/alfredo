# Alfredo

## Install

Install should be from GH releases

Example: Install the published Linux x64 binary from GitHub Releases:
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/getalfredo/alfredo/main/scripts/install.sh)
```

If running as root, the binary gets placed in ~/alfredo
Else, it gets placed in ~/alfredoapp/alfredo

## First Run Workflow

The `./alfredo first-run`, is the first step to prepare/ensure the VPS is ready for installing Alfredo service.

### Step 1. Secure and prepare the VPS

Goal: reach a minimum security baseline before any Alfredo service, database, or secret is installed on the server.

This step should cover:

- Start from a fresh supported VPS image - Ubuntu 24.04
- Update the operating system and security packages.
- Pick an existing user (or create one) which: is a non-root admin user with `sudo` and Docker capabilities without having to sudo
- Ensure SSH key access is set for that user.
- Disable direct root login over SSH.
- Disable SSH password authentication after key-based access is confirmed.
- Enable a host firewall with only the required ports open.
- Install basic intrusion protection such as `fail2ban` or an equivalent provider-level control.
- Enable automatic security updates.
- Confirm time sync, hostname, and basic system logging are working.

This step should explicitly happen before:

- creating the Alfredo admin account
- generating or copying application secrets
- installing the Alfredo service
- exposing Alfredo to a public domain

Exit criteria for Step 1:

- the VPS is reachable only through approved access paths
- root SSH access is blocked
- password-based SSH access is blocked
- only required inbound ports are open
- the machine can receive security updates automatically
- we can log in with a non-root admin user and perform privileged actions safely


Only after this baseline is complete should we run:

```bash
./alfredo first-run
```




## CLI commands

User management is done via CLI. In development use `bun src/index.tsx <command>`, in production use `./alfredo <command>`.

| Command | Description |
|---------|-------------|
| `serve` | Start the server (default) |
| `user:create` | Create a new user (interactive) |
| `user:list` | List all users |
| `user:reset-pw` | Reset a user's password |
| `user:2fa-remove` | Remove 2FA from a user |
