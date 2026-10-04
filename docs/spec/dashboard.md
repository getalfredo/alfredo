# Dashboard

Status: agreed in [Unified dashboard](https://github.com/getalfredo/alfredo/issues/20). The dashboard shows data that the other specs already produce. The one addition is metric history.

## The page

The dashboard is one page, and it's the landing page after sign-in. It has no filter controls. To see less, a person opens a project.

The page has three sections, in this order.

### Needs attention

A list of current problems, each linking to the page where the person can act on it:

- Deploys whose last run failed, with the failed phase, as the [projects spec](projects.md) defines them.
- Workspaces whose health is degraded or down, with the reason.
- Stacks that show drift, as the [compose spec](compose.md) defines it.
- Routes with a certificate or DNS problem, as the [reverse proxy spec](reverse-proxy.md) defines them.

Admins also see:

- Porters that are disconnected, behind HQ's version, or incompatible.
- Failing Baseline checks, per Porter.
- Tray warnings, such as low account credit, and Trays with a rejected credential.

The section is hidden when it's empty. The dashboard is the only place where problems surface. V1 sends no notifications.

### Projects

One card per project. A card shows:

- The state of each service in the project's Stack.
- The last deploy, with its phase and result.
- The status card of each Workspace, as the [trays spec](trays.md#ui) defines it.
- A small chart of the Stack's total CPU and memory usage over the last 24 hours.

A card links to the project page.

### Infrastructure

For Admins only.

- One row per Porter: connection status, version, badges, current CPU, memory, and disk usage, and a small chart of CPU and memory usage over the last 24 hours.
- One row per Tray: health and Tray-level metrics, with a small chart for each recorded metric.

## Roles

Admins see every project and the **Infrastructure** section.

Viewers and Operators see only their projects, with the same card content as Admins, and nothing about Porters or Trays. The dashboard offers no actions. Deploying, restarting, and rolling back stay on the project page.

## Empty states

- On a new installation, the dashboard shows the Admin the next step, which is to create a project.
- A collaborator with no projects sees the notice that the [collaboration UI spec](collaboration-ui.md) describes.

## History

HQ records three kinds of values over time:

- **Porter metrics**: CPU, memory, and disk usage of the host, from each heartbeat.
- **Service metrics**: CPU and memory usage of each service in a Stack. Porter reports them with each heartbeat, as the [Porter spec](porter.md#connection-health) states. This covers project Stacks and the Stacks of self-hosted Workspaces.
- **Recorded Tray metrics**: the numeric metrics that a Tray type marks as recorded in its manifest. V1 records a small set, to prove that the provider APIs work: Purelymail's account credit per Tray and mailbox count per Workspace. Other Tray metrics stay current values only.

### Resolution and retention

HQ stores averaged points at three resolutions:

| Resolution | Kept for | Used by |
|---|---|---|
| One point per minute | 30 days | The 1 hour and 24 hour ranges |
| One point per hour | 30 days | The 30 day range |
| One point per day | 1 year | The 1 year range |

HQ deletes older points. The resolutions, retention periods, and ranges are fixed, with no setting.

A gap in the data, such as a disconnected Porter or a stopped HQ, shows as a gap in the chart.

### Storage

History lives in a SQLite file in the HQ data directory. It's the one exception to HQ's files-first state, and it's deliberate: history is disposable telemetry, not state. Deleting the file loses the charts and nothing else.

### Where charts appear

- **Dashboard**: the small charts that the preceding sections describe, fixed to the last 24 hours.
- **Porter page**, for Admins: host CPU, memory, and disk charts.
- **Project page**, for everyone with access to the project, including Viewers: CPU and memory charts per service.
- **Tray and Workspace pages**: a chart for each recorded metric. Workspace pages are open to the project's members, and Tray pages to Admins.

Full charts offer four ranges: 1 hour, 24 hours, 30 days, and 1 year.

## Not in v1

- Notifications and alerting of any kind.
- Filters, custom dashboards, and custom time ranges.
- Log history, request metrics, and per-Route traffic.

## Handoff boundaries

Implementation owns the chart library, the page layout and card design, how the page refreshes, the SQLite schema, how and when HQ averages and deletes points, how Porter measures service usage, and the manifest field that marks a Tray metric as recorded.
