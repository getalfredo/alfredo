# Collaboration UI

Status: agreed in [Collaboration UI: invitations and project membership](https://github.com/getalfredo/alfredo/issues/15), after review of a throwaway prototype on the `prototype/collaboration-ui` branch. This document specifies the screens for the [users and collaboration model](users.md), which owns the roles and policies.

## Screens

Membership has two Admin-only screens that show the same data from two directions:

- The **Members** tab on each project page shows one project's members and invitations.
- The **People** page shows every person in the installation and their projects.

Collaborators see neither screen, so they never see each other's email addresses. An access matrix of people against projects was prototyped and dropped.

## Adding a person

Both screens use the same form: email address, project, and Viewer or Operator role. The **Members** tab fixes the project. On the **People** page, **Invite** opens the form in a dialog with a project list, and each role shows a one-line description of what it allows.

What happens on submit depends on the email address:

- **The email has an account**: HQ adds the project membership at once and says so. There's no invitation and no link. The person gets no notification and sees the project on their next page load.
- **The email has no account**: HQ creates an Invitation and shows a **Copy link** button. The form doesn't display the URL.

HQ rejects the form, with a message, when the email belongs to an Admin or to a current member of the project. For a current member, the message tells the Admin to change the role instead.

An Invitation covers exactly one project. Inviting a new person to three projects creates three links.

## Invitation links

HQ stores only a hash of the invitation token, as the [security spec](security.md) requires. The link can therefore be copied only right after the Invitation is created:

- **Copy link** appears with the confirmation of the new Invitation. The confirmation states that Alfredo doesn't send email, that the link can't be copied again later, and that the link works once and expires in seven days.
- **New link** on a listed Invitation replaces it: the old link stops working, the seven days restart, and **Copy link** appears for the new link.
- Creating an Invitation for an email and project that already have a pending Invitation replaces the pending one in the same way.

## The Members tab

The **Members** tab sits next to the other tabs of a project page. It has two sections.

**Members** lists the project's members:

- Each collaborator row shows the email address, a role control, and **Remove**.
- A role change applies when the Admin picks the new role. There's no separate save step.
- **Remove** asks for confirmation that names the project, then removes the membership.
- Admins appear in the list, labeled **Admin**, without controls. A note states that Admins have access to every project.

**Invitations** holds the form and the project's open Invitations:

- Each row shows the email address, the role, and either **Pending** with the days left or **Expired**.
- **New link** is available on pending and expired Invitations.
- **Cancel** asks for confirmation, then removes a pending or expired Invitation from the list.
- Accepted and canceled Invitations aren't listed.

## The People page

The **People** page is a list of people with a detail panel for the selected person.

The list shows every account and every email address with an open Invitation. Each entry has a summary line: **Admin**, the number of projects, **No project access**, or **Invited, no account yet**.

The detail panel for a collaborator has two sections:

- **Project access**: one row per project with the role control and **Remove**, which behave as they do on the **Members** tab.
- **Invitations**: the person's open Invitations with **New link** and **Cancel**.

**Add to project** opens the form with the email address filled in and locked.

The detail panel for an Admin has no controls. It states that Admins have access to every project and that the CLI grants and removes Admin access. Disabling an account, resetting a password, and removing 2FA also stay in the CLI, as the users spec says.

## Opening an invitation link

Opening a valid link never shows a confirmation step. What the person sees depends on who opens it:

| Who opens a valid link | Screen |
| --- | --- |
| Signed out, the invited email has no account | **Create your account**: project and role with the role's one-line description, the email address locked, password, and password confirmation. Submitting creates the account, accepts the Invitation, signs the person in, and opens the project. |
| Signed out, the invited email has an account | **Sign in**: project and role, the email address locked, and password, followed by the 2FA code if the account uses 2FA. Signing in accepts the Invitation and opens the project. |
| Signed in as the invited email | No screen. HQ accepts the Invitation at once and opens the project. |
| Signed in as a different email | A message that the invitation is for a different account, without the invited email address. **Sign out and continue** signs the person out and returns to this link. The Invitation stays valid. |

After acceptance, the project page shows a notice with the project and the role. New accounts then see the optional 2FA reminder like every other account.

A link that can't grant access shows why, with one message per case, and tells the person to ask the Admin who invited them for a new link:

- **Expired**: the invitation expired, and links work for seven days.
- **Canceled**: the invitation was canceled.
- **Used**: the link was already used. A signed-out person also gets a **Sign in** button. A person who is signed in as the invited email and is a member goes to the project instead of seeing the message.

A replaced link shows the canceled message.

## When access changes

Changes apply to active sessions at once, as the users spec requires. A collaborator who has the project page open sees the change without reloading.

**Role reduced to Viewer**: the project page stays open. A notice states the new role and that deploying and controlling services is no longer possible. Deploy, rollback, and service controls disappear. Log streams stay connected, because Viewers can read logs.

**Role raised to Operator**: the Operator controls appear. There's no notice.

**Access removed**: live streams stop, and HQ opens the dashboard with a notice that names the project the person lost. Other projects stay listed. If it was the person's last project, the dashboard states that they have no access to any project, that the account stays active, and that an Admin can add them to a project.

A request to a project that the person can no longer access gets the same response as a request to a project that doesn't exist.

## Handoff boundaries

Implementation owns the visual design, where the **People** page sits in the navigation, the exact wording of messages, the mechanism that pushes access changes to open pages, and list ordering and search.

Other decisions cover the adjacent contracts:

- [Users and collaboration model](users.md): roles, capabilities, invitation lifetime, and CLI account administration.
- [Unified dashboard](https://github.com/getalfredo/alfredo/issues/20): the dashboard that collaborators land on, including its empty state.
