import { withAuth } from "../routes";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureDefaultStacksDirectory, getProjects, findProject, refreshProjects } from "../lib/config";
import {
  getContainerStatus,
  composeUp,
  composeDown,
  composeRestart,
  readComposeFile,
  writeComposeFile,
} from "../lib/docker";

const STACK_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DEFAULT_COMPOSE_CONTENT = `services:
  app:
    image: alpine:latest
    command: ["sh", "-c", "sleep infinity"]
`;

export const dockerRoutes = {
  "/api/stacks": {
    async POST(req: Request) {
      const session = await withAuth(req);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      let body: any;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const content = typeof body?.content === "string" ? body.content : DEFAULT_COMPOSE_CONTENT;

      if (!name) {
        return Response.json({ error: "Missing stack name" }, { status: 400 });
      }

      if (!STACK_NAME_PATTERN.test(name)) {
        return Response.json(
          { error: "Invalid stack name. Use letters, numbers, dot, underscore or hyphen." },
          { status: 400 }
        );
      }

      const stacksDir = ensureDefaultStacksDirectory();
      const stackPath = resolve(stacksDir, name);
      const composeFile = resolve(stackPath, "docker-compose.yml");

      if (existsSync(stackPath)) {
        return Response.json({ error: "Stack already exists" }, { status: 409 });
      }

      try {
        mkdirSync(stackPath, { recursive: false });
        writeFileSync(composeFile, content.trim() ? content : DEFAULT_COMPOSE_CONTENT);
      } catch (e: any) {
        return Response.json({ error: `Failed to create stack: ${e.message}` }, { status: 500 });
      }

      refreshProjects();
      return Response.json({ ok: true, name, path: stackPath, composeFile }, { status: 201 });
    },
  },

  "/api/projects": {
    async GET(req: Request) {
      const session = await withAuth(req);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const projects = getProjects();
      const results = await Promise.all(
        projects.map(async (p) => {
          const containers = await getContainerStatus(p);
          return {
            name: p.name,
            path: p.path,
            containers: containers.length,
            running: containers.filter((c) => c.state === "running").length,
          };
        })
      );

      return Response.json(results);
    },
  },

  "/api/projects/refresh": {
    async POST(req: Request) {
      const session = await withAuth(req);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const projects = refreshProjects();
      return Response.json({ count: projects.length });
    },
  },

  "/api/projects/:name/status": {
    async GET(req: Request & { params: { name: string } }) {
      const session = await withAuth(req);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const project = findProject(req.params.name);
      if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

      const containers = await getContainerStatus(project);
      return Response.json({ name: project.name, path: project.path, containers });
    },
  },

  "/api/projects/:name/up": {
    async POST(req: Request & { params: { name: string } }) {
      const session = await withAuth(req);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const project = findProject(req.params.name);
      if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

      const result = await composeUp(project);
      return Response.json(result, { status: result.ok ? 200 : 500 });
    },
  },

  "/api/projects/:name/down": {
    async POST(req: Request & { params: { name: string } }) {
      const session = await withAuth(req);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const project = findProject(req.params.name);
      if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

      const result = await composeDown(project);
      return Response.json(result, { status: result.ok ? 200 : 500 });
    },
  },

  "/api/projects/:name/restart": {
    async POST(req: Request & { params: { name: string } }) {
      const session = await withAuth(req);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const project = findProject(req.params.name);
      if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

      const result = await composeRestart(project);
      return Response.json(result, { status: result.ok ? 200 : 500 });
    },
  },

  "/api/projects/:name/compose": {
    async GET(req: Request & { params: { name: string } }) {
      const session = await withAuth(req);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const project = findProject(req.params.name);
      if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

      const content = await readComposeFile(project);
      return Response.json({ content, path: project.composeFile });
    },

    async PUT(req: Request & { params: { name: string } }) {
      const session = await withAuth(req);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const project = findProject(req.params.name);
      if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

      const body = await req.json();
      if (!body.content || typeof body.content !== "string") {
        return Response.json({ error: "Missing content" }, { status: 400 });
      }

      await writeComposeFile(project, body.content);
      return Response.json({ ok: true });
    },
  },
} as const;
