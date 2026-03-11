import { auth } from "./lib/auth";
import { dockerRoutes } from "./routes/docker";

export async function withAuth(req: Request): Promise<{ user: any; session: any } | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return null;
  return session;
}

export const apiRoutes = {
  "/api/auth/*": (req: Request) => auth.handler(req),
  ...dockerRoutes,
} as const;
