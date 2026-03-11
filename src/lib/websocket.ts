import type { ServerWebSocket } from "bun";
import { findProject } from "./config";
import { spawnLogs } from "./docker";
import { auth } from "./auth";
import { getComposeJob, subscribeComposeJob } from "./jobs";

export interface LogsWebSocketData {
  kind: "logs";
  projectName: string;
  userId: string;
  process?: ReturnType<typeof Bun.spawn>;
}

export interface JobWebSocketData {
  kind: "job";
  jobId: string;
  userId: string;
  unsubscribe?: () => void;
}

export type WebSocketData = LogsWebSocketData | JobWebSocketData;

export async function handleUpgrade(req: Request, server: any): Promise<Response | undefined> {
  const url = new URL(req.url);

  // Authenticate via cookies
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });

  // /ws/logs/:name
  const logsMatch = url.pathname.match(/^\/ws\/logs\/(.+)$/);
  if (logsMatch) {
    const projectName = decodeURIComponent(logsMatch[1]);

    // Validate project
    const project = findProject(projectName);
    if (!project) return new Response("Project not found", { status: 404 });

    const upgraded = server.upgrade(req, {
      data: {
        kind: "logs",
        projectName,
        userId: session.user.id,
      } satisfies LogsWebSocketData,
    });

    if (!upgraded) {
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    return undefined;
  }

  // /ws/jobs/:id
  const jobsMatch = url.pathname.match(/^\/ws\/jobs\/(.+)$/);
  if (jobsMatch) {
    const jobId = decodeURIComponent(jobsMatch[1]);
    const job = await getComposeJob(jobId);
    if (!job) return new Response("Job not found", { status: 404 });

    const upgraded = server.upgrade(req, {
      data: {
        kind: "job",
        jobId,
        userId: session.user.id,
      } satisfies JobWebSocketData,
    });

    if (!upgraded) {
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    return undefined;
  }

  return new Response("Not found", { status: 404 });
}

export const websocketHandler = {
  async open(ws: ServerWebSocket<WebSocketData>) {
    if (ws.data.kind === "job") {
      const unsubscribe = await subscribeComposeJob(ws.data.jobId, (event) => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify(event));
        }
      });

      if (!unsubscribe) {
        ws.send(JSON.stringify({ type: "error", message: "Job not found" }));
        ws.close();
        return;
      }

      ws.data.unsubscribe = unsubscribe;
      return;
    }

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
    if (ws.data.kind === "job") {
      if (ws.data.unsubscribe) {
        ws.data.unsubscribe();
        ws.data.unsubscribe = undefined;
      }
      return;
    }

    if (ws.data.process) {
      ws.data.process.kill();
      ws.data.process = undefined;
    }
  },
};
