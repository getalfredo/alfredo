# Alfredo

Alfredo is a web application built with [Bun](https://bun.sh/) and React, with authentication powered by [BetterAuth](https://better-auth.com/).

## Quick start

```bash
# Install dependencies
bun install

# Create your first user
bun src/index.tsx user:create

# Run in development (with hot reload)
bun run dev
```

Open `http://localhost:3000` and sign in.

## Project structure

```
app/
├── src/
│   ├── index.tsx        # Server entry point + CLI routing
│   ├── index.html       # HTML entry point
│   ├── frontend.tsx     # React app bootstrap
│   ├── App.tsx          # Main React component (auth guard + dashboard)
│   ├── routes.ts        # API route definitions
│   ├── index.css        # Global styles (Tailwind)
│   ├── pages/           # Page components
│   │   ├── Login.tsx    # Login page (email + password + 2FA)
│   │   └── TwoFactorSetup.tsx  # 2FA setup flow
│   ├── components/      # UI components
│   │   └── TwoFactorNudge.tsx  # 2FA enable reminder
│   ├── cli/             # CLI commands (user management)
│   └── lib/
│       ├── auth.ts      # BetterAuth server config
│       ├── auth-client.ts # BetterAuth React client
│       ├── init-env.ts  # Auto-generate .env on first run
│       └── utils.ts     # Utilities
├── tests/               # Tests
├── scripts/
│   ├── deploy.sh        # Deploy to production server
│   ├── build.ts         # Build script
│   └── compile.ts       # Compile to standalone binary
├── data/                # SQLite database (gitignored)
├── .env.example         # Environment variables template
└── package.json
```

## Available scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server with hot reload |
| `bun run start` | Start in production mode |
| `bun run build` | Build the application |
| `bun run compile` | Compile to standalone binary (current platform) |
| `bun run compile:linux` | Compile to standalone binary (linux-x64) |
| `bun run deploy` | Compile and deploy to production server |
| `bun test` | Run tests |

## CLI commands

User management is done via CLI. In development use `bun src/index.tsx <command>`, in production use `./alfredo <command>`.

| Command | Description |
|---------|-------------|
| `serve` | Start the server (default) |
| `user:create` | Create a new user (interactive) |
| `user:list` | List all users |
| `user:reset-pw` | Reset a user's password |
| `user:2fa-remove` | Remove 2FA from a user |

## Documentation

- [Installation and deployment](install.md)
- [Authentication](auth.md)
