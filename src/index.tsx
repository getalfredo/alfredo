import "./lib/init-env";
import { serve } from "bun";
import { runCLI } from "./cli";
import { apiRoutes } from "./routes";
import { handleUpgrade, websocketHandler } from "./lib/websocket";
import index from "./index.html";

const command = process.argv[2];

if (command && command !== "serve") {
  await runCLI(command);
  process.exit(0);
}

const server = serve({
  routes: {
    ...apiRoutes,
    "/ws/*": (req, server) => handleUpgrade(req, server),
    "/*": index,
  },

  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/ws/")) {
      return handleUpgrade(req, server) as Promise<Response>;
    }
    return new Response("Not found", { status: 404 });
  },

  websocket: websocketHandler,

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
