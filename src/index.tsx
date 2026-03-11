import { serve } from "bun";
import { auth, migrate } from "./lib/auth";
import { runCLI } from "./cli";
import index from "./index.html";

await migrate();

const command = process.argv[2];

if (command && command !== "serve") {
  await runCLI(command);
  process.exit(0);
}

async function withAuth(req: Request): Promise<{ user: any; session: any } | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return null;
  return session;
}

const server = serve({
  routes: {
    "/api/auth/*": (req) => auth.handler(req),

    "/api/hello": {
      async GET(req) {
        const session = await withAuth(req);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
        return Response.json({
          message: "Hello, world!",
          user: session.user.email,
        });
      },
    },

    "/api/hello/:name": async (req) => {
      const session = await withAuth(req);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
      return Response.json({
        message: `Hello, ${req.params.name}!`,
      });
    },

    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
