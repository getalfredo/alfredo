import "./lib/init-env";
import { serve } from "bun";
import { runCLI } from "./cli";
import { apiRoutes } from "./routes";
import index from "./index.html";

const command = process.argv[2];

if (command && command !== "serve") {
  await runCLI(command);
  process.exit(0);
}

const server = serve({
  routes: {
    ...apiRoutes,
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
