import type { ServerWebSocket } from "bun";
import { findProject } from "./config";
import { spawnLogs } from "./docker";
import { auth } from "./auth";

export interface WebSocketData {
  projectName: string;
  userId: string;
  process?: ReturnType<typeof Bun.spawn>;
}

export async function handleUpgrade(req: Request, server: any): Promise<Response | undefined> {
  const url = new URL(req.url);

  // Only handle /ws/logs/:name
  const match = url.pathname.match(/^\/ws\/logs\/(.+)$/);
  if (!match) return new Response("Not found", { status: 404 });

  const projectName = decodeURIComponent(match[1]);

  // Authenticate via cookies
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });

  // Validate project
  const project = findProject(projectName);
  if (!project) return new Response("Project not found", { status: 404 });

  const upgraded = server.upgrade(req, {
    data: {
      projectName,
      userId: session.user.id,
    } satisfies WebSocketData,
  });

  if (!upgraded) {
    return new Response("WebSocket upgrade failed", { status: 500 });
  }

  // Return undefined signals successful upgrade
  return undefined;
}

export const websocketHandler = {
  async open(ws: ServerWebSocket<WebSocketData>) {
    const project = findProject(ws.data.projectName);
    if (!project) {
      ws.send(JSON.stringify({ error: "Project not found" }));
      ws.close();
      return;
    }

    const proc = spawnLogs(project);
    ws.data.process = proc;

    // Stream stdout
    (async () => {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (ws.readyState === 1) {
            ws.send(decoder.decode(value));
          } else {
            break;
          }
        }
      } catch {
        // Connection closed
      } finally {
        proc.kill();
      }
    })();

    // Also stream stderr
    (async () => {
      const reader = proc.stderr.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (ws.readyState === 1) {
            ws.send(decoder.decode(value));
          } else {
            break;
          }
        }
      } catch {
        // Connection closed
      }
    })();
  },

  message(_ws: ServerWebSocket<WebSocketData>, _message: string | Buffer) {
    // No client messages expected for now
  },

  close(ws: ServerWebSocket<WebSocketData>) {
    if (ws.data.process) {
      ws.data.process.kill();
      ws.data.process = undefined;
    }
  },
};
