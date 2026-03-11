# Docker monitoring

Alfredo monitors Docker Compose projects and provides a dashboard to view status, stream logs, and edit compose files.

## Configuration

Projects are configured via `config.yaml` (auto-generated on first run, next to the binary).

```yaml
# Directories to scan for subdirectories containing docker-compose.yml / compose.yml
scan:
  - ../stacks

# Explicit project paths (override scanned ones)
projects:
  - name: My Redis
    path: /opt/apps/redis
  - path: /opt/apps/postgres    # name defaults to directory name
```

### Scan directories

Each entry in `scan` is a parent directory. Alfredo scans its immediate subdirectories for compose files (`docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, `compose.yaml`).

The default config scans `../stacks` (from `/home/<user>/app` this resolves to `/home/<user>/stacks`). Place your Docker Compose project directories inside `../stacks/` and they'll be discovered automatically.

### Explicit projects

Use `projects` to add individual project paths. The `name` field is optional and defaults to the directory name. Explicit projects override scanned ones if they share the same path.

### Refreshing

The project list is cached in memory. Use the **Refresh** button on the dashboard or call `POST /api/projects/refresh` to rescan.

### Action queue

Project actions (**Up**, **Down**, **Restart**) run through an embedded `bunqueue` queue persisted in SQLite (`data/bunqueue.sqlite`).  
The UI subscribes to live job output over WebSocket.

### Creating stacks from UI

From the dashboard, use **Create Stack** to create a new stack directory under `../stacks` with a `docker-compose.yml` file.

## Dashboard

The dashboard (`/`) shows all discovered projects with:

- Project name and path
- Container count and how many are running
- Status indicator: green (all running), yellow (partial), red (none running)

The list auto-refreshes every 10 seconds.

## Project detail

Click a project to open its detail page (`/project/:name`) with three tabs:

### Status

Shows a table of containers with service name, state, status, and ports. Auto-refreshes every 5 seconds.

Action buttons:
- **Up** — `docker compose up -d`
- **Restart** — `docker compose restart`
- **Down** — `docker compose down`

### Logs

Streams real-time logs via WebSocket (`docker compose logs -f --tail 100`). Features:

- Auto-scroll to bottom (pauses when you scroll up)
- Connection status indicator (green/red dot)
- Clear button to reset the log view
- Memory-safe: keeps only the last ~500KB of logs

### Compose

Displays the compose file in an editable text area. Click **Save** to write changes to disk. The save button is only enabled when the content has been modified.

## API endpoints

All endpoints require authentication (cookie-based session).

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/stacks` | Create a stack directory and `docker-compose.yml` |
| GET | `/api/projects` | List all projects with container counts |
| POST | `/api/projects/refresh` | Rescan config and refresh project list |
| GET | `/api/projects/:name/status` | Get detailed container status |
| POST | `/api/projects/:name/up` | Enqueue `docker compose up -d` job |
| POST | `/api/projects/:name/down` | Enqueue `docker compose down` job |
| POST | `/api/projects/:name/restart` | Enqueue `docker compose restart` job |
| GET | `/api/projects/:name/compose` | Read compose file content |
| PUT | `/api/projects/:name/compose` | Write compose file content |
| GET | `/api/jobs/:id` | Get compose job snapshot/status |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://host/ws/logs/:name` | Stream real-time Docker Compose logs |
| `ws://host/ws/jobs/:id` | Stream real-time compose job events/output |

The WebSocket connection authenticates via session cookies. It streams both stdout and stderr from `docker compose logs -f --tail 100`. The log process is automatically killed when the connection closes.

## Requirements

The server running Alfredo must have Docker and Docker Compose installed and accessible to the user running the Alfredo process.

```bash
# Verify Docker is accessible
docker compose version
```

If running as a dedicated user (e.g. `alfredo`), add it to the `docker` group:

```bash
sudo usermod -aG docker alfredo
```
