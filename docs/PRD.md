# Alfredo - Product Requirements Document

## Vision

Alfredo is a web-based Docker Compose project manager that gives developers a single UI to discover, monitor, and control all their containerized applications.

## What Exists Today

The MVP is complete with 27 tests passing. It covers:

- **Project Discovery** - Scan configured directories for `alfredo.yml` files; add projects manually by path
- **Service Management** - View container status (Running/Stopped/Partial/Unknown), start/stop/restart services
- **Command Execution** - Run Docker Compose commands (`up`, `down`, `restart`, `pull`, `build`, `stop`, `start`, `logs`, `ps`, `exec`) with real-time SSE streaming output
- **File Editing** - Edit project files (docker-compose.yml, .env, Dockerfile, etc.) with Monaco Editor and syntax highlighting
- **Security** - Path traversal protection, command whitelisting, shell metacharacter blocking
- **Authentication** - Full user auth via Laravel Fortify (login, registration, 2FA, email verification)

### Tech Stack
- Backend: PHP 8.4, Laravel 12, Inertia.js v2
- Frontend: React 19, TypeScript, Tailwind CSS v4
- Editor: Monaco Editor
- Testing: Pest v4

---

## Open Questions

The following questions need answers before further development. They are grouped by area.

---

### Q1: Product Identity & Scope

- **Q1.1**: Is Alfredo a **single-user local dev tool**, or should it support **multi-user teams** with role-based access?
- **Q1.2**: Should Alfredo manage **only Docker Compose projects**, or should it expand to plain Docker containers, Docker Swarm, or Kubernetes?
- **Q1.3**: What is the deployment model? Local machine only, or also self-hosted on a server for team use?
- **Q1.4**: Should Alfredo support **remote Docker hosts** (connecting to Docker daemons on other machines via SSH or TCP)?

---

### Q2: Dashboard & Home Page

The current dashboard (`/dashboard`) is a placeholder with no meaningful content.

- **Q2.1**: What should the dashboard show? Options include:
  - Aggregate overview (total projects, running/stopped counts)
  - Recently accessed projects
  - Projects with issues (stopped unexpectedly, unhealthy containers)
  - Quick actions (start all, stop all)
  - System health (Docker daemon status, disk usage)
- **Q2.2**: Should `/dashboard` redirect to `/projects` instead?

---

### Q3: Custom Commands

The `alfredo.yml` format supports custom commands and the UI renders them (disabled). Backend execution is not implemented.

- **Q3.1**: Should custom commands support **arbitrary shell commands**, or be restricted to `docker compose exec` only?
- **Q3.2**: How to handle security? Custom commands in `alfredo.yml` could execute anything on the host. Options:
  - Trust the config file (user controls what's in alfredo.yml)
  - Require an approval step in the UI before first execution
  - Restrict to a subset of safe patterns
- **Q3.3**: Should custom commands accept **parameters** from the UI? (e.g., a migration command that takes `--seed` flag)
- **Q3.4**: Should custom command output stream via SSE like built-in commands?

---

### Q4: Logs

`logs` is an allowed command but there's no dedicated logs UI.

- **Q4.1**: Should there be a **dedicated logs viewer** page/tab, or is the existing command output terminal sufficient?
- **Q4.2**: Should logs support **per-service filtering**? (e.g., show only the `app` service logs)
- **Q4.3**: Should logs support **real-time tailing** (follow mode), or only fetch-on-demand?
- **Q4.4**: Should logs be **searchable/filterable** in the UI?
- **Q4.5**: Should there be a **download logs** option?

---

### Q5: Container Monitoring & Health

Currently, services only show Running/Stopped status.

- **Q5.1**: Should Alfredo display **resource usage** (CPU, memory, network I/O) via `docker stats`?
- **Q5.2**: Should there be **health check status** display for containers with health checks defined?
- **Q5.3**: Should Alfredo show **container restart counts** and uptime?
- **Q5.4**: Should there be **alerts/notifications** when a container stops unexpectedly or becomes unhealthy?

---

### Q6: Volume & Network Visibility

No volume or network information is displayed.

- **Q6.1**: Should the project dashboard show **volumes** (named volumes, bind mounts)?
- **Q6.2**: Should the project dashboard show **networks** and which services are connected?
- **Q6.3**: Should Alfredo allow **volume management** (inspect, remove unused)?
- **Q6.4**: Should Alfredo allow **network management** (inspect, remove)?

---

### Q7: Image Management

`pull` and `build` commands exist but there's no image overview.

- **Q7.1**: Should the project dashboard show **images** used by the project with sizes and tags?
- **Q7.2**: Should Alfredo support **image pruning** (removing dangling/unused images)?
- **Q7.3**: Should Alfredo show when **newer images are available** (for non-pinned tags)?

---

### Q8: Interactive Shell / Exec

`exec` is whitelisted but there's no interactive terminal UI.

- **Q8.1**: Should Alfredo provide a **web-based terminal** for `docker exec` into running containers?
- **Q8.2**: If yes, should it use **WebSockets** (xterm.js) for true interactive sessions, or just one-off command execution?
- **Q8.3**: Which services/containers should allow exec? All, or configurable in `alfredo.yml`?

---

### Q9: Multi-Compose File Support

Only a single compose file per project is supported.

- **Q9.1**: Should Alfredo support **multiple compose files** (`-f file1.yml -f file2.yml`)?
- **Q9.2**: Should Alfredo detect and use **override files** (`docker-compose.override.yml`) automatically?
- **Q9.3**: Should Alfredo support **environment-specific profiles** (e.g., dev vs. prod compose files)?
- **Q9.4**: Should Alfredo support **Docker Compose profiles** (`--profile`)?

---

### Q10: Settings & Configuration UI

Configuration is done via `.env` file only.

- **Q10.1**: Should there be a **settings page** in the UI to manage scan directories?
- **Q10.2**: Should settings be configurable **per-user** (if multi-user) or global?
- **Q10.3**: Should there be a **first-run setup wizard** for initial configuration?

---

### Q11: Notifications & Webhooks

No notification system exists.

- **Q11.1**: Should Alfredo send **notifications** on events (container crash, build failure)?
- **Q11.2**: If yes, which channels? (In-app, email, Slack, Discord, webhooks)
- **Q11.3**: Should Alfredo expose **webhooks** for external automation?

---

### Q12: Permissions & Access Control

Authentication exists but no authorization beyond "logged in or not".

- **Q12.1**: Should there be **per-project permissions** (who can start/stop/edit)?
- **Q12.2**: Should there be **read-only users** who can view but not execute commands?
- **Q12.3**: Should there be an **audit log** for destructive operations (down, file edits)?

---

### Q13: alfredo.yml Enhancements

- **Q13.1**: Should `services.displayName` in alfredo.yml actually affect the UI? Currently it does not appear to be used.
- **Q13.2**: Should alfredo.yml support **environment variable definitions** (like `.env` but managed in the config)?
- **Q13.3**: Should alfredo.yml support **service dependencies/groups** for selective start/stop?
- **Q13.4**: Should there be a **UI to create/edit alfredo.yml** instead of editing it manually?

---

### Q14: UX & Design

- **Q14.1**: Should the project list support **sorting/filtering** (by status, name, recently used)?
- **Q14.2**: Should there be a **search** for projects?
- **Q14.3**: Should projects support **tags/categories/groups**?
- **Q14.4**: Should there be **keyboard shortcuts** for common actions?
- **Q14.5**: Should there be a **compact/list view** in addition to the card grid?

---

### Q15: Testing & Quality

- **Q15.1**: Should **browser (E2E) tests** be added using Pest v4's browser testing? Which critical flows?
- **Q15.2**: What is the target **test coverage** percentage?
- **Q15.3**: Should there be **smoke tests** that hit all pages?

---

### Q16: Performance & Scaling

- **Q16.1**: What is the expected **maximum number of projects**? (10? 100? 1000?)
- **Q16.2**: Should project discovery results be **cached**, and if so, for how long?
- **Q16.3**: Should service status be **polled on an interval** or only fetched on page load?

---

## Priority Matrix

Once the above questions are answered, features should be prioritized. Suggested framework:

| Priority | Feature Area | Reasoning |
|----------|-------------|-----------|
| **P0** | Custom Commands execution | UI exists but disabled; most visible gap |
| **P0** | Dashboard content | First page users see; currently empty |
| **P1** | Dedicated Logs viewer | Essential for debugging; infrastructure exists |
| **P1** | Settings UI for scan directories | Current .env-only config is poor UX |
| **P1** | Project search/filter/sort | Basic discoverability as project count grows |
| **P2** | Resource monitoring | Valuable but not blocking core usage |
| **P2** | Interactive shell (exec) | Power-user feature |
| **P2** | Multi-compose file support | Edge case for most users |
| **P3** | Notifications/webhooks | Nice-to-have automation |
| **P3** | Permissions/RBAC | Only needed for multi-user scenarios |
| **P3** | Volume/network management | Rarely needed from UI |

---

## Next Steps

1. Answer the open questions above (product owner / stakeholder input needed)
2. Update this PRD with decisions
3. Create implementation plans for prioritized features
4. Build iteratively, maintaining test coverage
