# Docker Compose Project Manager - Implementation Plan

## Overview
Build a Docker Compose project management feature to list projects, edit files in the UI, and execute commands with real-time output streaming.

## Requirements Summary
- **Discovery**: Scan configured directories for `alfredo.yml` files + manual project addition
- **Commands**: Full Docker Compose command set (up, down, restart, logs, ps, pull, build, exec, custom)
- **File Editing**: All project files with syntax highlighting (Monaco Editor)
- **Real-time Output**: SSE streaming for command output

---

## Phase 1: Database & Core Infrastructure

### 1.1 Create Migration
```bash
php artisan make:migration create_projects_table
```

Schema:
- `id`, `user_id` (FK), `name`, `path` (unique), `config` (json nullable)
- `status` (enum: unknown/running/stopped/partial), `is_manual` (bool)
- `last_synced_at`, timestamps

### 1.2 Create Model & Factory
```bash
php artisan make:model Project --factory
```

### 1.3 Create Config File
`config/alfredo.php`:
- `scan_directories` - comma-separated paths to scan
- `command_timeout` - default 300s
- `max_log_lines` - default 1000

### 1.4 Create Enum
`app/Enums/ProjectStatus.php` - unknown, running, stopped, partial

**Files to create:**
- `database/migrations/xxxx_create_projects_table.php`
- `app/Models/Project.php`
- `database/factories/ProjectFactory.php`
- `config/alfredo.php`
- `app/Enums/ProjectStatus.php`

---

## Phase 2: Backend Services

### 2.1 ProjectDiscoveryService
`app/Services/Projects/ProjectDiscoveryService.php`
- `discover()` - scan directories for `alfredo.yml` files
- `parseConfig()` - parse YAML config
- `syncProject()` - update project status from Docker

### 2.2 DockerComposeService
`app/Services/Projects/DockerComposeService.php`
- `execute()` - run docker compose commands (generator for streaming)
- `getStatus()` - get project status via `docker compose ps`
- `getServices()` - list services with their status
- Command validation (whitelist: up, down, restart, logs, ps, pull, build, exec, stop, start)

### 2.3 ProjectFileService
`app/Services/Projects/ProjectFileService.php`
- `getEditableFiles()` - list files matching patterns
- `getFileContent()` - read file content
- `updateFile()` - write file with path traversal protection
- `detectLanguage()` - map extension to Monaco language

**Files to create:**
- `app/Services/Projects/ProjectDiscoveryService.php`
- `app/Services/Projects/DockerComposeService.php`
- `app/Services/Projects/ProjectFileService.php`

---

## Phase 3: Controllers & Routes

### 3.1 Controllers
```bash
php artisan make:controller Projects/ProjectController
php artisan make:controller Projects/ProjectCommandController
php artisan make:controller Projects/ProjectFileController
php artisan make:controller Projects/ProjectDiscoveryController
```

**ProjectController:**
- `index()` - list user's projects
- `show()` - project dashboard with services
- `store()` - add manual project
- `destroy()` - remove project

**ProjectCommandController:**
- `execute()` - SSE streaming endpoint for docker compose commands

**ProjectFileController:**
- `index()` - list editable files
- `show()` - get file content
- `update()` - save file

**ProjectDiscoveryController:**
- `discover()` - trigger directory scan
- `sync()` - refresh single project status

### 3.2 Form Requests
```bash
php artisan make:request Projects/StoreProjectRequest
php artisan make:request Projects/ExecuteCommandRequest
php artisan make:request Projects/UpdateFileRequest
```

### 3.3 Policy
```bash
php artisan make:policy ProjectPolicy --model=Project
```

### 3.4 Routes
Create `routes/projects.php`:
```php
Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('projects', ProjectController::class)->only(['index', 'show', 'store', 'destroy']);
    Route::post('projects/discover', [ProjectDiscoveryController::class, 'discover']);
    Route::post('projects/{project}/sync', [ProjectDiscoveryController::class, 'sync']);
    Route::post('projects/{project}/commands/{command}', [ProjectCommandController::class, 'execute']);
    Route::get('projects/{project}/files', [ProjectFileController::class, 'index']);
    Route::get('projects/{project}/files/{file}', [ProjectFileController::class, 'show'])->where('file', '.*');
    Route::put('projects/{project}/files/{file}', [ProjectFileController::class, 'update'])->where('file', '.*');
});
```

Add to `routes/web.php`:
```php
require __DIR__.'/projects.php';
```

**Files to create:**
- `app/Http/Controllers/Projects/ProjectController.php`
- `app/Http/Controllers/Projects/ProjectCommandController.php`
- `app/Http/Controllers/Projects/ProjectFileController.php`
- `app/Http/Controllers/Projects/ProjectDiscoveryController.php`
- `app/Http/Requests/Projects/StoreProjectRequest.php`
- `app/Http/Requests/Projects/ExecuteCommandRequest.php`
- `app/Http/Requests/Projects/UpdateFileRequest.php`
- `app/Policies/ProjectPolicy.php`
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
- `Project`, `ProjectStatus`, `AlfredoConfig`
- `DockerService`, `ProjectFile`, `CustomCommand`

### 4.3 Pages
Create in `resources/js/pages/projects/`:

**index.tsx** - Project list with cards, discover button, add project dialog
**show.tsx** - Project dashboard with:
  - Status badge
  - Quick action buttons (up, down, restart, pull)
  - Tabs: Services | Logs | Files
  - Terminal output area
**files.tsx** - File browser tree
**file-edit.tsx** - Monaco editor for single file

### 4.4 Components
Create in `resources/js/components/projects/`:

- `project-card.tsx` - Card for list view
- `project-status-badge.tsx` - Status indicator (running/stopped/etc)
- `service-list.tsx` - Docker services grid
- `service-card.tsx` - Individual service with status
- `command-button.tsx` - Action button that triggers SSE command
- `command-output.tsx` - Terminal-style SSE output display
- `file-tree.tsx` - Recursive file browser
- `code-editor.tsx` - Monaco wrapper component
- `add-project-dialog.tsx` - Modal for manual project addition

### 4.5 Add Navigation
Modify `resources/js/components/app-sidebar.tsx`:
```tsx
import { Container } from 'lucide-react';
// Add to mainNavItems:
{
    title: 'Projects',
    href: projects.index(),
    icon: Container,
},
```

**Files to create:**
- `resources/js/types/projects.d.ts`
- `resources/js/pages/projects/index.tsx`
- `resources/js/pages/projects/show.tsx`
- `resources/js/pages/projects/files.tsx`
- `resources/js/pages/projects/file-edit.tsx`
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
- `resources/js/components/app-sidebar.tsx` - add Projects nav item

---

## Phase 5: Real-time Streaming (SSE)

### Implementation
The `ProjectCommandController::execute()` returns a `StreamedResponse`:

```php
return response()->stream(function () use ($project, $command, $args) {
    foreach ($this->dockerCompose->execute($project, $command, $args) as $output) {
        echo "data: " . json_encode(['output' => $output]) . "\n\n";
        ob_flush();
        flush();
    }
    echo "data: " . json_encode(['done' => true]) . "\n\n";
}, 200, [
    'Content-Type' => 'text/event-stream',
    'Cache-Control' => 'no-cache',
    'X-Accel-Buffering' => 'no',
]);
```

Frontend uses native `EventSource`:
```tsx
const eventSource = new EventSource(url);
eventSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.done) { eventSource.close(); return; }
    appendLine(data.output);
};
```

---

## Phase 6: Security

### Command Validation
- Whitelist allowed commands: up, down, restart, logs, ps, pull, build, exec, stop, start
- Block dangerous args: `--volumes`, `-v` in down command
- Sanitize args: reject shell metacharacters (`;`, `|`, `&`, `` ` ``, `$`)

### File Access
- Path traversal protection: validate `realpath()` starts with project path
- Pattern-based file access from `alfredo.yml` config or defaults

### Authorization
- All endpoints protected by `ProjectPolicy`
- Users can only access their own projects

---

## Phase 7: Testing

Create Pest tests in `tests/Feature/Projects/`:

- `ProjectManagementTest.php` - CRUD operations, authorization
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
  # files: [docker-compose.yml, docker-compose.override.yml]

services:  # Optional: highlight specific services
  - name: app
    displayName: "Application"

commands:  # Optional: custom commands
  - name: migrate
    description: "Run migrations"
    command: "docker compose exec app php artisan migrate"

editable_files:  # Optional: glob patterns
  - "docker-compose*.yml"
  - ".env"
  - "Dockerfile*"
```

---

## Implementation Order

1. Database migration, model, factory, enum, config
2. Backend services (Discovery, DockerCompose, File)
3. Controllers, routes, form requests, policy
4. Frontend types and basic pages (index, show)
5. SSE streaming and command output component
6. Monaco editor and file editing
7. Add project dialog and discovery
8. Tests

---

## Key Files Summary

**Create:**
- `database/migrations/xxxx_create_projects_table.php`
- `app/Models/Project.php`
- `app/Enums/ProjectStatus.php`
- `config/alfredo.php`
- `app/Services/Projects/*.php` (3 files)
- `app/Http/Controllers/Projects/*.php` (4 files)
- `app/Http/Requests/Projects/*.php` (3 files)
- `app/Policies/ProjectPolicy.php`
- `routes/projects.php`
- `resources/js/types/projects.d.ts`
- `resources/js/pages/projects/*.tsx` (4 files)
- `resources/js/components/projects/*.tsx` (9 files)
- `tests/Feature/Projects/*.php` (3 files)

**Modify:**
- `routes/web.php` - require projects.php
- `resources/js/components/app-sidebar.tsx` - add Projects nav item
