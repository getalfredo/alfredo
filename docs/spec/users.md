# Users and collaboration

Status: draft for final review of [Users & collaboration model](https://github.com/getalfredo/alfredo/issues/4).

## Scope

Alfredo v1 is a fresh, self-hosted installation with installation-wide Admins and collaborators invited to individual projects. There are no existing users to migrate and no backward-compatibility requirements. Existing authentication code is a starting point for implementation, not a compatibility contract.

## Roles and project access

Admin is an installation-wide role. Admins manage Porters, projects, trays, configuration, credentials, and project membership. Admin access is granted through the CLI, including creation of the first Admin; the web UI does not grant it.

Collaborators have a Viewer or Operator role assigned separately in each project. Someone can be an Operator on one project and a Viewer on another. They have no access to projects they have not joined or to those projects' trays.

| Capability within a project | Viewer | Operator | Admin |
| --- | --- | --- | --- |
| Read dashboards, status, and service logs | Yes | Yes | Yes |
| Deploy configured sources | No | Yes | Yes |
| Roll back to a previous deployment | No | Yes | Yes |
| Start, stop, or restart services | No | Yes | Yes |
| Change environment variables, tray configuration, or deployment sources/configuration | No | No | Yes |
| Access or manage credentials | No | No | Yes |
| Manage project membership and invitations | No | No | Yes |
| Manage Porters, projects, and trays | No | No | Yes |

Operator permissions apply to already configured services. They do not confer general infrastructure administration. Reading service logs is an explicit permission for both project roles; applications may write sensitive information to those logs. Admin-only credential access does not imply that application log output is guaranteed to contain no secrets.

## Invitations and account creation

An Admin selects a project, invited email address, and Viewer or Operator role. Alfredo generates a single-use invitation link that expires after seven days. The Admin copies and sends the link; v1 does not require outgoing email for invitations.

An Invitation is for an email address that has no account. When the email address already has an account, the Admin adds the project membership directly, with no invitation and no acceptance step.

New invitees create an account with a password through the invitation. If the invited email address gains an account before the link is used, the account holder signs in with that email address to accept it. Public signup remains disabled. An invitation grants only its specified project role and cannot grant Admin access.

Admins can cancel pending invitations in the UI. Canceled, expired, or already consumed invitations cannot grant access.

## Authentication and account administration

Authentication uses email and password. Two-factor authentication remains optional for every role, with a setup reminder. No role requires 2FA enrollment.

The CLI is the recovery and account-administration path: creating an Admin, granting Admin access, disabling an entire account, resetting passwords, and removing 2FA. Project membership administration remains available to Admins in the web UI.

## Membership changes and enforcement

Admins can change collaborators' project roles and remove project access through the UI. A role reduction or removal takes effect immediately for active sessions: subsequent requests must use current permissions, and live project streams that are no longer authorized disconnect. Removing access to one project preserves access to the collaborator's other projects.

Project authorization applies to project data and actions, including associated trays and live streams; being signed in alone does not grant access. UI visibility must reflect the same permissions as the underlying operations.

## Related decisions

The [collaboration UI spec](collaboration-ui.md) specifies the invitation and membership screens using this model. Tray and deployment decisions will specify their concrete operations within these permission boundaries. This document does not define a storage schema or implement authentication changes.
