# Docker Compose Project Manager - Implementation Plan

## Status: COMPLETE

All features have been implemented and tested (27 tests passing).

## Overview
Docker Compose project management feature to list projects, edit files in the UI, and execute commands with real-time output streaming.

**Architecture: Filesystem-based project discovery (no database tables)**

## Requirements Summary
- **Discovery**: Scan configured directories for `alfredo.yml` files + manual project paths stored in JSON file
- **Commands**: Full Docker Compose command set (up, down, restart, logs, ps, pull, build, exec, custom)
- **File Editing**: All project files with syntax highlighting (Monaco Editor)
- **Real-time Output**: SSE streaming for command output

---

## Phase 1: Core Infrastructure

### 1.1 Create Config File
`config/alfredo.php`:
- `scan_directories` - array of paths to scan for projects
- `command_timeout` - default 300s
- `max_log_lines` - default 1000

### 1.2 Create Enum
`app/Enums/ProjectStatus.php` - unknown, running, stopped, partial

### 1.3 Create DTO
`app/Data/Project.php` - Value object representing a discovered project:
- `path` (string) - absolute path to project directory
- `name` (string) - from alfredo.yml or directory name
- `description` (?string)
- `status` (ProjectStatus)
- `config` (array) - parsed alfredo.yml content
- `isManual` (bool) - true if manually added (no alfredo.yml)

### 1.4 Manual Projects Storage
Manually-added project paths stored in `storage/app/projects.json`:
```json
{
  "projects": [
    {
      "path": "/path/to/project",
      "name": "Custom Name"
    }
  ]
}
```

**Files to create:**
- `config/alfredo.php`
- `app/Enums/ProjectStatus.php`
- `app/Data/Project.php`

---

## Phase 2: Backend Services

### 2.1 ProjectDiscoveryService
`app/Services/Projects/ProjectDiscoveryService.php`
- `discover(): Collection<Project>` - scan configured directories for `alfredo.yml` + load manual projects
- `findByPath(string $path): ?Project` - find a single project by its path
- `parseConfig(string $path): array` - parse YAML config file
- `getProjectStatus(string $path): ProjectStatus` - query docker compose for status
- `addManualProject(string $path, ?string $name): Project` - add project to JSON file
- `removeManualProject(string $path): void` - remove project from JSON file

### 2.2 DockerComposeService
`app/Services/Projects/DockerComposeService.php`
- `execute(Project $project, string $command, array $args): Generator` - run docker compose commands (generator for streaming)
- `getStatus(string $path): ProjectStatus` - get project status via `docker compose ps`
- `getServices(string $path): array` - list services with their status
- Command validation (whitelist: up, down, restart, logs, ps, pull, build, exec, stop, start)

### 2.3 ProjectFileService
`app/Services/Projects/ProjectFileService.php`
- `getEditableFiles(Project $project): array` - list files matching patterns
- `getFileContent(Project $project, string $relativePath): string` - read file content
- `updateFile(Project $project, string $relativePath, string $content): void` - write file with path traversal protection
- `detectLanguage(string $filename): string` - map extension to Monaco language

**Files to create:**
- `app/Services/Projects/ProjectDiscoveryService.php`
- `app/Services/Projects/DockerComposeService.php`
- `app/Services/Projects/ProjectFileService.php`

---

## Phase 3: Controllers & Routes

### 3.1 Controllers
**ProjectController:**
- `index()` - discover and list all projects from filesystem
- `show(string $path)` - project dashboard with services (path is base64 encoded in URL)
- `store()` - add a manual project (path + optional name)
- `destroy(string $path)` - remove a manual project from the JSON file

**ProjectCommandController:**
- `execute(string $path, string $command)` - SSE streaming endpoint for docker compose commands

**ProjectFileController:**
- `index(string $path)` - list editable files
- `show(string $path, string $file)` - get file content
- `update(string $path, string $file)` - save file

### 3.2 Form Requests
- `StoreProjectRequest` - validate path exists and has docker-compose.yml
- `ExecuteCommandRequest` - validate command whitelist and args
- `UpdateFileRequest` - validate file content

### 3.3 Routes
`routes/projects.php`:
```php
Route::middleware(['auth', 'verified'])->prefix('projects')->group(function () {
    Route::get('/', [ProjectController::class, 'index'])->name('projects.index');
    Route::post('/', [ProjectController::class, 'store'])->name('projects.store');
    Route::get('/{path}', [ProjectController::class, 'show'])->name('projects.show');
    Route::delete('/{path}', [ProjectController::class, 'destroy'])->name('projects.destroy');

    Route::post('/{path}/commands/{command}', [ProjectCommandController::class, 'execute'])
        ->name('projects.commands.execute');

    Route::get('/{path}/files', [ProjectFileController::class, 'index'])->name('projects.files.index');
    Route::get('/{path}/files/{file}', [ProjectFileController::class, 'show'])
        ->where('file', '.*')->name('projects.files.show');
    Route::put('/{path}/files/{file}', [ProjectFileController::class, 'update'])
        ->where('file', '.*')->name('projects.files.update');
});
```

**Files to create:**
- `app/Http/Controllers/Projects/ProjectController.php`
- `app/Http/Controllers/Projects/ProjectCommandController.php`
- `app/Http/Controllers/Projects/ProjectFileController.php`
- `app/Http/Requests/Projects/StoreProjectRequest.php`
- `app/Http/Requests/Projects/ExecuteCommandRequest.php`
- `app/Http/Requests/Projects/UpdateFileRequest.php`
- `routes/projects.php`

**Files to modify:**
- `routes/web.php` - add require for projects.php

---

## Phase 4: Frontend Pages

### 4.1 Install Monaco Editor
```bash
npm install @monaco-editor/react
```

### 4.2 TypeScript Types
`resources/js/types/projects.d.ts`:
- `Project` - matches PHP DTO
- `ProjectStatus` - enum values
- `DockerService`, `ProjectFile`, `CustomCommand`

### 4.3 Pages
`resources/js/pages/projects/`:

**index.tsx** - Project list with cards, "Add Project" button for manual additions
**show.tsx** - Project dashboard with:
  - Status badge
  - Quick action buttons (up, down, restart, pull)
  - Tabs: Services | Logs | Files
  - Terminal output area
  - Remove button for manual projects

### 4.4 Components
`resources/js/components/projects/`:

- `project-card.tsx` - Card for list view
- `project-status-badge.tsx` - Status indicator
- `service-list.tsx` - Docker services grid
- `service-card.tsx` - Individual service with status
- `command-button.tsx` - Action button that triggers SSE command
- `command-output.tsx` - Terminal-style SSE output display
- `file-tree.tsx` - Recursive file browser
- `code-editor.tsx` - Monaco wrapper component
- `add-project-dialog.tsx` - Modal for manual project addition (path + name)

### 4.5 Add Navigation
Modify `resources/js/components/app-sidebar.tsx` - add Projects nav item

**Files to create:**
- `resources/js/types/projects.d.ts`
- `resources/js/pages/projects/index.tsx`
- `resources/js/pages/projects/show.tsx`
- `resources/js/components/projects/project-card.tsx`
- `resources/js/components/projects/project-status-badge.tsx`
- `resources/js/components/projects/service-list.tsx`
- `resources/js/components/projects/service-card.tsx`
- `resources/js/components/projects/command-button.tsx`
- `resources/js/components/projects/command-output.tsx`
- `resources/js/components/projects/file-tree.tsx`
- `resources/js/components/projects/code-editor.tsx`
- `resources/js/components/projects/add-project-dialog.tsx`

**Files to modify:**
- `resources/js/components/app-sidebar.tsx`

---

## Phase 5: Real-time Streaming (SSE)

### Implementation
`ProjectCommandController::execute()` returns a `StreamedResponse`:
- Generator yields output lines from docker compose process
- Frontend uses native `EventSource` API
- Terminal-style display with ANSI color support

---

## Phase 6: Security

### Path Validation
- Validate project paths exist in configured `scan_directories`
- Block access to paths outside allowed directories

### Command Validation
- Whitelist: up, down, restart, logs, ps, pull, build, exec, stop, start
- Block dangerous args: `--volumes`, `-v` in down command
- Sanitize args: reject shell metacharacters

### File Access
- Path traversal protection: validate `realpath()` starts with project path
- Pattern-based file access from `alfredo.yml` config or defaults

---

## Phase 7: Testing

`tests/Feature/Projects/`:
- `ProjectDiscoveryTest.php` - Filesystem scanning, project listing
- `ProjectCommandTest.php` - Command execution, SSE streaming
- `ProjectFileTest.php` - File listing, reading, writing, security

---

## alfredo.yml Config Format

```yaml
version: "1"
name: "My Project"
description: "Optional description"

compose:
  file: docker-compose.yml

services:  # Optional: highlight specific services
  - name: app
    displayName: "Application"

commands:  # Optional: custom commands
  - name: migrate
    description: "Run migrations"
    command: "docker compose exec app php artisan migrate"

editable_files:  # Optional: glob patterns (defaults if not specified)
  - "docker-compose*.yml"
  - ".env"
  - "Dockerfile*"
```

---

## Implementation Order

1. Config file, enum, DTO
2. Backend services (Discovery, DockerCompose, File)
3. Controllers, routes, form requests
4. Frontend types and pages (index, show)
5. SSE streaming and command output component
6. Monaco editor and file editing
7. Tests

---

## Key Files Summary

**Create:**
- `config/alfredo.php`
- `app/Enums/ProjectStatus.php`
- `app/Data/Project.php`
- `app/Services/Projects/*.php` (3 files)
- `app/Http/Controllers/Projects/*.php` (3 files)
- `app/Http/Requests/Projects/*.php` (3 files)
- `routes/projects.php`
- `resources/js/types/projects.d.ts`
- `resources/js/pages/projects/*.tsx` (2 files)
- `resources/js/components/projects/*.tsx` (9 files)
- `tests/Feature/Projects/*.php` (3 files)

**Modify:**
- `routes/web.php` - require projects.php
- `resources/js/components/app-sidebar.tsx` - add Projects nav item

---

## Getting Started

### Configuration

Add scan directories to your `.env` file:

```env
ALFREDO_SCAN_DIRECTORIES=/path/to/projects,/another/path
ALFREDO_COMMAND_TIMEOUT=300
ALFREDO_MAX_LOG_LINES=1000
```

### Usage

1. **Auto-discovery**: Projects with `alfredo.yml` files in configured directories are automatically discovered
2. **Manual addition**: Click "Add Project" to add any directory containing a `docker-compose.yml`
3. **Project dashboard**: View services, run commands (up, down, restart, etc.), see real-time output
4. **File editing**: Edit docker-compose.yml, .env, and Dockerfile with Monaco Editor

### Running Tests

```bash
php artisan test tests/Feature/Projects/
```
