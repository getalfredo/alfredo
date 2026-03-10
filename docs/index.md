# Alfredo

Alfredo is a web application built with [Bun](https://bun.sh/) and React.

## Quick start

```bash
# Install dependencies
bun install

# Run in development (with hot reload)
bun run dev

# Run in production mode
bun run start
```

## Project structure

```
app/
├── src/
│   ├── index.tsx        # Server entry point (Bun.serve)
│   ├── index.html       # HTML entry point
│   ├── frontend.tsx     # React app bootstrap
│   ├── App.tsx          # Main React component
│   ├── index.css        # Global styles (Tailwind)
│   ├── components/      # UI components
│   └── lib/             # Utilities
├── scripts/
│   ├── deploy.sh        # Deploy to production server
│   ├── build.ts         # Build script
│   └── compile.ts       # Compile to standalone binary
├── docs/                # Documentation
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

## Documentation

- [Installation and deployment](install.md)
