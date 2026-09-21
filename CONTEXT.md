# Alfredo

Alfredo organizes projects and their services for an administrator and invited collaborators.

## Language

**Admin**:
An installation-wide role responsible for infrastructure and project membership.
_Avoid_: Operator (for installation-wide administration)

**Collaborator**:
A user invited to specific projects, with access limited to those projects and their trays. A collaborator has a separately assigned Viewer or Operator role in each project.

**Viewer**:
A project role with read-only access to dashboards, status, and project service logs.

**Operator**:
A project role with permission to deploy configured sources, roll back deployments, and start, stop, or restart project services. Configuration and credentials remain under Admin control.
_Avoid_: Admin (for project-scoped operation)

**Project membership**:
A collaborator's access to one project, carrying either the Viewer or Operator role independently of their roles in other projects.

**Invitation**:
An Admin-issued offer of project membership bound to an email address and project role. Its single-use acceptance link expires after seven days and can be canceled by an Admin.
