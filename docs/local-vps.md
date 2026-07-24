# Local VPS (containers)

Run Alfredo locally as if it were deployed to real servers, without a VPS. The compose file in `dev/vps/` defines **two fake VPSes**, fully isolated from each other and from your machine's Docker:

| VPS | URL | Services |
|-----|-----|----------|
| windsor | http://localhost:3000 | `windsor` + `windsor-dind` |
| dover | http://localhost:3001 | `dover` + `dover-dind` |

Each VPS is a pair of containers:

- **`<name>-dind`** — a `docker:dind` daemon, playing the role of that VPS's Docker engine, with its own image/container storage.
- **`<name>`** — an Ubuntu 24.04 container running the compiled Alfredo binary as a non-root `alfredo` user (mirroring the systemd service), with `DOCKER_HOST` pointed at its dind.

The binary is compiled on the host for your architecture (`linux-arm64` on Apple Silicon, `linux-x64` on Intel) and bind-mounted into both containers from `dist/`.

## Usage

```bash
# Compile + build + start both VPSes (first time and after compose/Dockerfile changes)
bun run vps:up

# Create the default dev users on both VPSes in one go
# (windsor@windsor.com and dover@dover.com, password: "password";
#  re-running resets their passwords back to the default)
bun run vps:default-users

# Open the apps
open http://localhost:3000   # windsor
open http://localhost:3001   # dover

# After changing app code: recompile + restart both
bun run vps:restart

# Logs from both
bun run vps:logs

# Wipe everything back to two fresh "VPSes"
bun run vps:reset
```

Stacks created through the UI live in each VPS's `stacks` volume, mounted at `/home/alfredo/stacks` in both members of the pair so bind mounts inside managed compose projects resolve correctly.

## Notes

- Override ports with `WINDSOR_HTTP_PORT` / `DOVER_HTTP_PORT`, e.g. `DOVER_HTTP_PORT=3101 bun run vps:up`.
- Ports published by managed stacks open inside that VPS's dind container, not on your machine — same as on a real VPS, where only Alfredo (and whatever you proxy) is reachable.
- To reach a managed stack's port from your machine, add a mapping to the corresponding `*-dind` service in `dev/vps/compose.yaml` (e.g. `"8080:8080"`).
- To operate on a single VPS, target its services directly: `docker compose -f dev/vps/compose.yaml restart dover`.
- To stop without wiping data, or to create a user interactively, use docker compose directly: `docker compose -f dev/vps/compose.yaml stop` / `docker compose -f dev/vps/compose.yaml exec dover alfredo user:create`.
- This setup skips the SSH/systemd deploy path (`bun run deploy`); it tests the application itself, not the installer.
