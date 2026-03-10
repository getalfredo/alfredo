# Installation and deployment

## Prerequisites

- A Linux server (Ubuntu/Debian) with SSH access
- Bun installed locally for compilation

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `DEPLOY_USER` | SSH user to connect to the server | (required) |
| `DEPLOY_HOST` | Server hostname or IP | (required) |
| `DEPLOY_PORT` | SSH port | `22` |
| `APP_USER` | System user that owns and runs the app | `alfredo` |
| `APP_USER_CREATE` | Create the user if it doesn't exist (`true`/`false`) | `false` |

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

## What gets installed on the server

```
/home/<APP_USER>/
└── app/
    └── alfredo          # The compiled binary

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
