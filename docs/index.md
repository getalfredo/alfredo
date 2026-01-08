# Alfredo Documentation

Alfredo is a Docker Compose project manager that provides a web UI for managing your containerized applications.

## Features

- **Project Discovery**: Automatically scan directories for Docker Compose projects
- **Manual Project Addition**: Add projects manually by path
- **Service Management**: View container status, start/stop services
- **Command Execution**: Run Docker Compose commands with real-time output streaming
- **File Editing**: Edit configuration files with syntax highlighting (Monaco Editor)

## Installation

Alfredo is a Laravel application. After cloning the repository:

```bash
composer setup
```

## Configuration

### Environment Variables

Add these to your `.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| `ALFREDO_SCAN_DIRECTORIES` | Comma-separated paths to scan for projects | (empty) |
| `ALFREDO_COMMAND_TIMEOUT` | Max seconds for command execution | 300 |
| `ALFREDO_MAX_LOG_LINES` | Max log lines to retrieve | 1000 |

Example:

```env
ALFREDO_SCAN_DIRECTORIES=/home/user/projects,/var/docker
ALFREDO_COMMAND_TIMEOUT=300
ALFREDO_MAX_LOG_LINES=1000
```

## Project Discovery

Alfredo discovers projects in two ways:

### 1. Automatic Discovery

Projects are automatically discovered by scanning configured directories for `alfredo.yml` files. The scan is recursive, so nested projects are found.

### 2. Manual Addition

Projects without `alfredo.yml` can be added manually through the UI. They only need a `docker-compose.yml` file. Manual projects are stored in `storage/app/projects.json`.

## alfredo.yml Configuration

Create an `alfredo.yml` file in your project root for enhanced features:

```yaml
version: "1"
name: "My Application"
description: "Production web application"

# Specify compose file (defaults to docker-compose.yml)
compose:
  file: docker-compose.yml

# Highlight specific services (optional)
services:
  - name: app
    displayName: "Application Server"
  - name: db
    displayName: "Database"

# Define custom commands (optional)
commands:
  - name: migrate
    description: "Run database migrations"
    command: "docker compose exec app php artisan migrate"
  - name: seed
    description: "Seed the database"
    command: "docker compose exec app php artisan db:seed"

# Specify editable files (optional, defaults shown below)
editable_files:
  - "docker-compose*.yml"
  - "docker-compose*.yaml"
  - ".env*"
  - "Dockerfile*"
```

## Using the Web Interface

### Projects List

Navigate to `/projects` to see all discovered and manually-added projects. Each project card shows:

- Project name
- Status (Running, Stopped, Partial, Unknown)
- Path location
- Whether it was manually added

Click "Add Project" to manually add a project by path.

### Project Dashboard

Click on a project to open its dashboard:

**Quick Actions**
- Start (`docker compose up -d`)
- Stop (`docker compose stop`)
- Restart (`docker compose restart`)
- Down (`docker compose down`)
- Pull (`docker compose pull`)
- Build (`docker compose build`)

**Services Panel**
Shows all containers with their current status, image, and exposed ports.

**Command Output**
Real-time streaming output from executed commands.

### File Editor

Click "Files" to open the file editor:

- Left panel: List of editable files
- Right panel: Monaco Editor with syntax highlighting
- Supports YAML, JSON, Dockerfile, shell scripts, and more

## Security

### Path Validation
- Projects must exist in configured scan directories or be manually added
- Path traversal attacks are blocked

### Command Validation
- Only whitelisted commands are allowed: `up`, `down`, `restart`, `logs`, `ps`, `pull`, `build`, `exec`, `stop`, `start`
- Shell metacharacters are rejected in arguments

### File Access
- Only files matching configured patterns can be edited
- Path traversal protection on all file operations

## API Reference

All endpoints require authentication.

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List all projects |
| POST | `/projects` | Add manual project |
| GET | `/projects/{path}` | View project details |
| DELETE | `/projects/{path}` | Remove manual project |

### Commands

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{path}/commands/{command}` | Execute command (SSE) |

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{path}/files` | List editable files |
| GET | `/projects/{path}/files/{file}` | Get file content |
| PUT | `/projects/{path}/files/{file}` | Update file content |

Note: `{path}` is base64-encoded.

## Architecture

### Backend Services

- **ProjectDiscoveryService**: Scans directories, manages manual projects
- **DockerComposeService**: Executes Docker Compose commands with streaming
- **ProjectFileService**: Handles file reading/writing with security

### Frontend Components

- **ProjectCard**: Displays project in list view
- **ProjectStatusBadge**: Shows status with color coding
- **ServiceList/ServiceCard**: Displays Docker services
- **CommandButton**: Triggers SSE command execution
- **CommandOutput**: Terminal-style output display
- **CodeEditor**: Monaco Editor wrapper
- **AddProjectDialog**: Modal for adding projects

### Data Flow

1. User requests project list
2. `ProjectDiscoveryService` scans directories and loads manual projects
3. `DockerComposeService` queries container status
4. Projects are returned as DTOs to the frontend
5. Commands are executed via SSE for real-time output

## Troubleshooting

### Projects Not Appearing

1. Check `ALFREDO_SCAN_DIRECTORIES` is set correctly
2. Ensure directories are readable by the web server
3. Verify `alfredo.yml` or `docker-compose.yml` exists

### Commands Failing

1. Ensure Docker is running
2. Check the web server user has Docker permissions
3. Verify the project path is accessible

### File Editing Issues

1. Check file permissions
2. Ensure the file matches editable patterns
3. Verify the project path is valid

## Development

### Running Tests

```bash
php artisan test tests/Feature/Projects/
```

### Code Style

```bash
vendor/bin/pint
```

### Building Assets

```bash
npm run dev   # Development with hot reload
npm run build # Production build
```
