# Authentication

Alfredo uses [BetterAuth](https://better-auth.com/) with SQLite for authentication.

## Overview

- **Login**: Email + password at `/login`
- **Registration**: Disabled. Users are created via CLI only
- **Sessions**: Cookie-based, expire when browser closes (24h server-side max)
- **2FA**: TOTP (authenticator app), optional but nudged on dashboard
- **Protected routes**: All `/api/*` routes require authentication (except `/api/auth/*`)

## User management (CLI)

All user management is done via CLI commands.

### Create a user

```bash
# Development
bun src/index.tsx user:create

# Production (compiled binary)
./alfredo user:create
```

Prompts for email and password interactively. Password must be at least 8 characters.

### List users

```bash
bun src/index.tsx user:list
```

### Reset password

```bash
bun src/index.tsx user:reset-pw
```

Prompts for email and new password.

### Remove 2FA

If a user loses access to their authenticator app and has no recovery codes:

```bash
bun src/index.tsx user:2fa-remove
```

The user can then log in and set up 2FA again.

## Two-factor authentication (2FA)

### Setup flow

1. User logs in and sees a nudge banner on the dashboard
2. Clicks "Enable 2FA" and enters their password
3. Scans QR code with authenticator app (Google Authenticator, Authy, etc.)
4. Enters verification code to confirm
5. Receives 10 recovery codes (one-time use, shown only once)

### Login with 2FA

1. User enters email and password
2. If 2FA is enabled, prompted for 6-digit TOTP code
3. Can use a recovery code instead if they lost their authenticator

## Protecting API routes

All API routes should use the `withAuth` middleware from `src/routes.ts`:

```typescript
import { withAuth } from "./routes";

// In your route handler:
async GET(req: Request) {
  const session = await withAuth(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // session.user.email, session.user.id, etc.
  return Response.json({ user: session.user.email });
}
```

## Cookie security

| Environment | `SECURE_COOKIES` | Cookies |
|---|---|---|
| Development (HTTP) | `false` | `SameSite=Lax`, no `Secure` flag |
| Production (HTTPS) | `true` | `SameSite=Lax`, `Secure` flag set |

Set `SECURE_COOKIES=true` in `.env` when the app is behind an HTTPS reverse proxy.

## Testing

```bash
bun test
```

Tests cover:

- **Auth API** (12 tests): login, signup blocked, sessions, sign-out
- **CLI logic** (9 tests): user CRUD, password reset, 2FA removal
