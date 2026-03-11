import type { ProjectConfig } from "./config";
import { basename } from "node:path";

export interface ContainerInfo {
  name: string;
  service: string;
  state: string;
  status: string;
  ports: string;
}

function mapContainer(raw: any): ContainerInfo {
  return {
    name: String(raw?.Name ?? raw?.Names ?? raw?.ID ?? ""),
    service: String(raw?.Service ?? raw?.Project ?? ""),
    state: String(raw?.State ?? ""),
    status: String(raw?.Status ?? ""),
    ports: String(raw?.Ports ?? ""),
  };
}

function parseComposePsOutput(output: string): ContainerInfo[] {
  const trimmed = output.trim();
  if (!trimmed) return [];

  const parsedContainers: ContainerInfo[] = [];

  // Newer compose versions can output a JSON array.
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      for (const item of parsed) parsedContainers.push(mapContainer(item));
      return parsedContainers.filter((c) => c.name || c.service || c.state || c.status || c.ports);
    }
    if (parsed && typeof parsed === "object") {
      parsedContainers.push(mapContainer(parsed));
      return parsedContainers.filter((c) => c.name || c.service || c.state || c.status || c.ports);
    }
  } catch {
    // Fallback to line-by-line parsing below.
  }

  // Older compose versions output one JSON object per line.
  for (const line of trimmed.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (Array.isArray(parsed)) {
        for (const item of parsed) parsedContainers.push(mapContainer(item));
      } else if (parsed && typeof parsed === "object") {
        parsedContainers.push(mapContainer(parsed));
      }
    } catch {
      // Skip malformed lines.
    }
  }

  return parsedContainers.filter((c) => c.name || c.service || c.state || c.status || c.ports);
}

function parseLabelString(labels: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!labels) return parsed;

  for (const part of labels.split(",")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) parsed[key] = value;
  }

  return parsed;
}

function deriveStateFromStatus(status: string): string {
  const normalized = status.toLowerCase().trim();
  if (!normalized) return "";
  if (normalized.startsWith("up")) return "running";
  if (normalized.startsWith("exited")) return "exited";
  if (normalized.startsWith("created")) return "created";
  if (normalized.startsWith("restarting")) return "restarting";
  if (normalized.includes("paused")) return "paused";
  return normalized.split(" ")[0] || normalized;
}

function parseDockerPsOutput(output: string, projectNameCandidates: Set<string>): ContainerInfo[] {
  const trimmed = output.trim();
  if (!trimmed) return [];

  const containers: ContainerInfo[] = [];
  for (const line of trimmed.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const labels = parseLabelString(String(parsed?.Labels ?? ""));
      const composeProject = labels["com.docker.compose.project"];

      if (!composeProject || !projectNameCandidates.has(composeProject)) continue;

      const status = String(parsed?.Status ?? "");
      const state = String(parsed?.State ?? deriveStateFromStatus(status));
      const name = String(parsed?.Names ?? parsed?.Name ?? parsed?.ID ?? "");
      const service = String(labels["com.docker.compose.service"] ?? name);
      const ports = String(parsed?.Ports ?? "");

      containers.push({
        name,
        service,
        state,
        status,
        ports,
      });
    } catch {
      // Skip malformed lines.
    }
  }

  return containers;
}

async function runCommand(
  args: string[],
  cwd: string,
  timeoutMs?: number
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  const proc = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  if (timeoutMs && timeoutMs > 0) {
    timeout = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeoutMs);
  }

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  if (timeout) clearTimeout(timeout);

  return { exitCode, stdout, stderr, timedOut };
}

async function getContainerStatusViaCompose(project: ProjectConfig): Promise<ContainerInfo[] | null> {
  const result = await runCommand(
    ["docker", "compose", "-f", project.composeFile, "ps", "--format", "json", "-a"],
    project.path,
    2000
  );

  if (!result.timedOut && result.exitCode === 0) {
    return parseComposePsOutput(result.stdout);
  }

  if (!result.timedOut && result.exitCode !== 0) {
    const message = (result.stderr || result.stdout).trim();
    if (message) {
      console.warn(`compose ps failed for ${project.name}: ${message}`);
    }
  }

  return null;
}

async function getContainerStatusViaDockerPs(project: ProjectConfig): Promise<ContainerInfo[] | null> {
  const result = await runCommand(["docker", "ps", "-a", "--format", "json"], project.path, 3000);
  if (result.exitCode !== 0) {
    const message = (result.stderr || result.stdout).trim();
    if (message) {
      console.warn(`docker ps failed for ${project.name}: ${message}`);
    }
    return null;
  }

  const candidates = new Set<string>([
    project.name,
    project.name.toLowerCase(),
    basename(project.path),
    basename(project.path).toLowerCase(),
  ]);
  return parseDockerPsOutput(result.stdout, candidates);
}

export async function getContainerStatus(project: ProjectConfig): Promise<ContainerInfo[]> {
  try {
    const composeStatus = await getContainerStatusViaCompose(project);
    if (composeStatus) return composeStatus;

    const dockerStatus = await getContainerStatusViaDockerPs(project);
    if (dockerStatus) return dockerStatus;

    return [];
  } catch {
    return [];
  }
}

async function runCompose(project: ProjectConfig, args: string[]): Promise<{ ok: boolean; output: string }> {
  const proc = spawnCompose(project, args);

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  const output = (stdout + "\n" + stderr).trim();

  return { ok: exitCode === 0, output };
}

export function spawnCompose(project: ProjectConfig, args: string[]): ReturnType<typeof Bun.spawn> {
  return Bun.spawn(
    ["docker", "compose", "-f", project.composeFile, ...args],
    { cwd: project.path, stdout: "pipe", stderr: "pipe" }
  );
}

export async function composeUp(project: ProjectConfig) {
  return runCompose(project, ["up", "-d"]);
}

export async function composeDown(project: ProjectConfig) {
  return runCompose(project, ["down"]);
}

export async function composeRestart(project: ProjectConfig) {
  return runCompose(project, ["restart"]);
}

export function spawnLogs(project: ProjectConfig): ReturnType<typeof Bun.spawn> {
  return Bun.spawn(
    ["docker", "compose", "-f", project.composeFile, "logs", "-f", "--tail", "100"],
    { cwd: project.path, stdout: "pipe", stderr: "pipe" }
  );
}

export async function readComposeFile(project: ProjectConfig): Promise<string> {
  return Bun.file(project.composeFile).text();
}

export async function writeComposeFile(project: ProjectConfig, content: string): Promise<void> {
  await Bun.write(project.composeFile, content);
}
