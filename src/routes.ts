import { auth } from "./lib/auth";

export async function withAuth(req: Request): Promise<{ user: any; session: any } | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return null;
  return session;
}

export const apiRoutes = {
  "/api/auth/*": (req: Request) => auth.handler(req),

  "/api/hello": {
    async GET(req: Request) {
      const session = await withAuth(req);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
      return Response.json({
        message: "Hello, world!",
        user: session.user.email,
      });
    },
  },

  "/api/hello/:name": async (req: Request & { params: { name: string } }) => {
    const session = await withAuth(req);
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({
      message: `Hello, ${req.params.name}!`,
    });
  },
} as const;
