# Installation and deployment

## Prerequisites

- A Linux server (Ubuntu/Debian) with SSH access
- Bun installed locally for compilation

## Install from GitHub Releases

If you only want the standalone binary, use the installer script:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/getalfredo/alfredo/main/scripts/install.sh)
```

This downloads the latest published `alfredo-linux-x64` release asset and installs it as `alfredo`.

Optional environment variables:

```bash
ALFREDO_VERSION=v0.1.0 bash <(curl -fsSL https://raw.githubusercontent.com/getalfredo/alfredo/main/scripts/install.sh)
ALFREDO_INSTALL_DIR="$HOME/.local/bin" bash <(curl -fsSL https://raw.githubusercontent.com/getalfredo/alfredo/main/scripts/install.sh)
```

Notes:

- The installer currently publishes and installs the Linux x64 binary only.
- If `/usr/local/bin` is writable, the binary is installed there.
- Otherwise the installer falls back to `$HOME/.local/bin`.
- The script only downloads the binary and marks it executable. It does not create users, services, or config files.

## Configuration

### Local development

On first run, a `.env` file is generated automatically with a random `BETTER_AUTH_SECRET`. You can also create it manually:

```bash
cp .env.example .env
```

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BETTER_AUTH_SECRET` | Secret key for signing sessions (auto-generated) | (required) |
| `BETTER_AUTH_URL` | Base URL of the application | `http://localhost:3000` |
| `SECURE_COOKIES` | Set to `true` when behind HTTPS reverse proxy | `false` |
| `DEPLOY_USER` | SSH user to connect to the server | (required for deploy) |
| `DEPLOY_HOST` | Server hostname or IP | (required for deploy) |
| `DEPLOY_PORT` | SSH port | `22` |
| `APP_USER` | System user that owns and runs the app | `alfredo` |
| `APP_USER_CREATE` | Create the user if it doesn't exist | `false` |

### HTTPS / Reverse proxy

The app runs on HTTP by default. When you set up a reverse proxy (nginx, Caddy, etc.) with HTTPS:

1. Set `SECURE_COOKIES=true` in `.env`
2. Set `BETTER_AUTH_URL` to your HTTPS URL (e.g. `https://app.example.com`)
3. Restart the app

Without `SECURE_COOKIES=true` behind HTTPS, authentication cookies will not work correctly.

### App user

The application runs as a dedicated non-root user for security. You have two options:

**Option A: Create a new user automatically**

Set `APP_USER_CREATE=true` in `.env`. The deploy script will create the user with a home directory if it doesn't exist.

```env
APP_USER=alfredo
APP_USER_CREATE=true
```

**Option B: Use an existing user**

If you already have a user on the server, just set `APP_USER` to that username. The deploy script will fail if the user doesn't exist and `APP_USER_CREATE` is not `true`.

```env
APP_USER=webapps
APP_USER_CREATE=false
```

## Deploy

```bash
bun run deploy
```

This will:

1. Compile the app into a standalone binary for linux-x64
2. Create the system user on the server (if `APP_USER_CREATE=true`)
3. Upload the binary to the server
4. Configure and start a systemd service

## Release workflow

GitHub Actions builds the linux-x64 binary on every push to `main`, every pull request, and manual runs.

When you push a tag that matches `v*`, the workflow also publishes:

- `alfredo-linux-x64`
- `alfredo-linux-x64.sha256`

to the corresponding GitHub Release. The installer script downloads from that release endpoint.

## First run on the server

After deploy, the binary auto-initializes on first run:

1. Creates `data/` directory for the SQLite database
2. Generates `.env` with a random `BETTER_AUTH_SECRET`
3. Creates the database tables
4. Generates `config.yaml` with default settings
5. Creates `/home/<APP_USER>/stacks/` directory for Docker Compose projects

Create your first user:

```bash
cd /home/<APP_USER>/app
./alfredo user:create
```

Then restart the service:

```bash
sudo systemctl restart alfredo
```

## What gets installed on the server

```
/home/<APP_USER>/
├── app/
│   ├── alfredo          # The compiled binary
│   ├── .env             # Auto-generated on first run
│   ├── config.yaml      # Docker project configuration (auto-generated)
│   └── data/
│       └── auth.db      # SQLite database
└── stacks/              # Default directory for Docker Compose projects

/etc/systemd/system/
└── alfredo.service      # systemd service file
```

The binary is self-contained -- it includes the Bun runtime, the application code, and all dependencies. No need to install Bun or Node.js on the server.

## systemd service

The app runs as a systemd service called `alfredo`, under the configured `APP_USER`.

### Useful commands

```bash
# Check status
sudo systemctl status alfredo

# View logs (follow)
journalctl -u alfredo -f

# View last 100 lines of logs
journalctl -u alfredo -n 100

# Restart
sudo systemctl restart alfredo

# Stop
sudo systemctl stop alfredo
```

### Service configuration

The service is configured to:

- Restart automatically on failure (after 5 seconds)
- Start on boot (`WantedBy=multi-user.target`)
- Listen on port 3000 (`PORT=3000`)
- Run in production mode (`NODE_ENV=production`)

## Uninstall

To completely remove Alfredo from the server:

```bash
# Stop and disable the service
sudo systemctl stop alfredo
sudo systemctl disable alfredo

# Remove the service file
sudo rm /etc/systemd/system/alfredo.service
sudo systemctl daemon-reload

# Remove the application
sudo rm -rf /home/<APP_USER>/app

# (Optional) Remove the user if it was created for Alfredo
sudo userdel -r <APP_USER>
```
