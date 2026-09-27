# Alfredo

Alfredo organizes projects and their services for an administrator and invited collaborators.

## Language

**Project**:
One application that Alfredo deploys, with its Stack, Workspaces, variables, Routes, and members. A project has exactly one Stack, on a Porter fixed at creation.
_Avoid_: App, environment

**Source**:
The Git repository, branch, and build settings a project's Stack is built from, either a compose file or a Railpack app.
_Avoid_: Repo (for the whole configuration), build pack

**Deploy**:
Running the source branch's latest commit with the project's current environment as a new Stack revision.
_Avoid_: Release (reserved for the release command), rollout

**Release command**:
An optional command a project runs once per deploy, after the build and before services start, such as a migration or `convex deploy`.
_Avoid_: Hook, pre-deploy script

**Deploy webhook**:
A project's secret URL that starts a deploy when a Git host or CI system calls it.
_Avoid_: Auto-deploy

**Rollback**:
Deploying an earlier Stack revision's commit and compose file with the current environment, recorded as a new revision.
_Avoid_: Restore (reserved for correcting drift), revert

**Tray type**:
A service integration built into HQ, such as Purelymail or self-hosted Convex, that is either self-hosted or connected to an external provider. Shown in the UI by its service name.
_Avoid_: Tray (for the built-in integration), plugin

**Tray**:
One Admin-configured instance of a Tray type, shared across projects, such as a Purelymail account or a Convex host on a Porter.
_Avoid_: Service (conflicts with compose services), integration

**Workspace**:
One project's isolated share of a Tray, such as a mail domain or a Convex deployment. It belongs to exactly one project and one Tray.
_Avoid_: Tenant, binding

**HQ**:
The Alfredo control center through which Admins and collaborators manage their installation's projects and services.

**Porter**:
The Alfredo agent responsible for a managed machine. A Porter belongs to one HQ installation at a time.

**HQ Porter**:
The Porter on the HQ host. Every installation has one, and its Proxy serves HQ's own hostname.

**Route**:
A public hostname that points at one service of a Stack. It belongs to the Stack's owner and is served by the Stack's Porter.
_Avoid_: Domain (reserved for mail domains in a Workspace), ingress

**Proxy**:
The component on a Porter that serves that Porter's Routes to the public. It is not a Stack.
_Avoid_: Load balancer, gateway

**Stack**:
One compose project running on one Porter, owned by either a project or a self-hosted Workspace.
_Avoid_: Project (for a compose project), app

**Stack revision**:
The commit, compose file, and resolved environment that one deploy of a Stack runs. HQ stores every deployed revision.
_Avoid_: Version, release

**Machine check**:
One audited fact about the host a Porter runs on, such as whether SSH password authentication is disabled. Machine checks report; they never change the host.
_Avoid_: Hardening (for the check itself), health check (reserved for services)

**Baseline**:
The set of Machine checks that must pass for a Porter's host to count as secured. Checks outside the Baseline are informational only.
_Avoid_: Profile, policy

**Admin**:
An installation-wide role responsible for infrastructure and project membership.
_Avoid_: Operator (for installation-wide administration)

**Collaborator**:
A user invited to specific projects, with access limited to those projects and their Workspaces. A collaborator has a separately assigned Viewer or Operator role in each project.

**Viewer**:
A project role with read-only access to dashboards, status, and project service logs.

**Operator**:
A project role with permission to deploy configured sources, roll back deployments, and start, stop, or restart project services. Configuration and credentials remain under Admin control.
_Avoid_: Admin (for project-scoped operation)

**Project membership**:
A collaborator's access to one project, carrying either the Viewer or Operator role independently of their roles in other projects.

**Invitation**:
An Admin-issued offer of project membership bound to an email address and project role. Its single-use acceptance link expires after seven days and can be canceled by an Admin.
