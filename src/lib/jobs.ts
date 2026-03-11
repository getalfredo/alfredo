import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Queue, Worker, type Job } from "bunqueue/client";
import type { ProjectConfig } from "./config";
import { findProject, refreshProjects } from "./config";
import { spawnCompose } from "./docker";

export type ComposeAction = "up" | "down" | "restart";
export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface ComposeJobSnapshot {
  id: string;
  projectName: string;
  action: ComposeAction;
  status: JobStatus;
  output: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
}

export type ComposeJobEvent =
  | { type: "snapshot"; job: ComposeJobSnapshot }
  | { type: "status"; status: JobStatus }
  | { type: "chunk"; chunk: string }
  | { type: "done"; ok: boolean; exitCode: number; job: ComposeJobSnapshot };

interface ComposeJobData {
  projectName: string;
  action: ComposeAction;
}

interface ComposeJobResult {
  ok: boolean;
  output: string;
  exitCode: number;
}

interface ComposeFailurePayload {
  message: string;
  output?: string;
  exitCode?: number;
}

interface RuntimeJob {
  id: string;
  projectName: string;
  action: ComposeAction;
  status: JobStatus;
  output: string;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  exitCode?: number;
  listeners: Set<(event: ComposeJobEvent) => void>;
}

const QUEUE_NAME = "alfredo-compose";
const QUEUE_DB_PATH = resolve("data", "bunqueue.sqlite");
const MAX_OUTPUT_CHARS = 400_000;
const MAX_RUNTIME_JOBS = 300;

const ACTION_ARGS: Record<ComposeAction, string[]> = {
  up: ["up", "-d"],
  down: ["down"],
  restart: ["restart"],
};

const runtimeJobs = new Map<string, RuntimeJob>();

let queue: Queue<ComposeJobData> | null = null;
let worker: Worker<ComposeJobData, ComposeJobResult> | null = null;
let initPromise: Promise<void> | null = null;

function ensureAction(action: string): ComposeAction {
  if (action === "up" || action === "down" || action === "restart") return action;
  return "restart";
}

function mapState(state: string): JobStatus {
  if (state === "active") return "running";
  if (state === "completed") return "completed";
  if (state === "failed") return "failed";
  return "queued";
}

function parseFailurePayload(failedReason: string | undefined): ComposeFailurePayload | null {
  if (!failedReason) return null;
  try {
    const parsed = JSON.parse(failedReason);
    if (parsed && typeof parsed === "object" && typeof parsed.message === "string") {
      return {
        message: parsed.message,
        output: typeof parsed.output === "string" ? parsed.output : undefined,
        exitCode: typeof parsed.exitCode === "number" ? parsed.exitCode : undefined,
      };
    }
  } catch {
    // Ignore JSON parse errors and fallback below.
  }
  return { message: failedReason };
}

function toSnapshot(job: RuntimeJob): ComposeJobSnapshot {
  return {
    id: job.id,
    projectName: job.projectName,
    action: job.action,
    status: job.status,
    output: job.output,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    finishedAt: job.finishedAt?.toISOString(),
    exitCode: job.exitCode,
  };
}

function emit(job: RuntimeJob, event: ComposeJobEvent) {
  for (const listener of job.listeners) listener(event);
}

function appendOutput(job: RuntimeJob, chunk: string) {
  if (!chunk) return;
  job.output += chunk;
  if (job.output.length > MAX_OUTPUT_CHARS) {
    job.output = job.output.slice(-MAX_OUTPUT_CHARS);
  }
}

function pruneRuntimeJobs() {
  if (runtimeJobs.size <= MAX_RUNTIME_JOBS) return;

  const done = Array.from(runtimeJobs.values())
    .filter((job) => (job.status === "completed" || job.status === "failed") && job.listeners.size === 0)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  while (runtimeJobs.size > MAX_RUNTIME_JOBS && done.length > 0) {
    const oldest = done.shift();
    if (!oldest) break;
    runtimeJobs.delete(oldest.id);
  }
}

function upsertRuntimeFromQueueJob(job: Job<ComposeJobData>, state: JobStatus): RuntimeJob {
  let runtime = runtimeJobs.get(job.id);
  if (!runtime) {
    runtime = {
      id: job.id,
      projectName: job.data?.projectName || "",
      action: ensureAction(job.data?.action || job.name),
      status: state,
      output: "",
      createdAt: new Date(job.timestamp || Date.now()),
      startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
      listeners: new Set(),
    };
    runtimeJobs.set(runtime.id, runtime);
  }

  runtime.projectName = job.data?.projectName || runtime.projectName;
  runtime.action = ensureAction(job.data?.action || job.name || runtime.action);
  runtime.status = state;
  runtime.createdAt = new Date(job.timestamp || runtime.createdAt.getTime());
  runtime.startedAt = job.processedOn ? new Date(job.processedOn) : runtime.startedAt;
  runtime.finishedAt = job.finishedOn ? new Date(job.finishedOn) : runtime.finishedAt;
  return runtime;
}

function setTerminalState(job: RuntimeJob, ok: boolean, exitCode: number) {
  job.status = ok ? "completed" : "failed";
  job.exitCode = exitCode;
  job.finishedAt = new Date();

  emit(job, {
    type: "done",
    ok,
    exitCode,
    job: toSnapshot(job),
  });

  pruneRuntimeJobs();
}

async function pipeStream(stream: ReadableStream<Uint8Array>, job: RuntimeJob) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      appendOutput(job, chunk);
      emit(job, { type: "chunk", chunk });
    }
  } catch {
    // Stream closed while process exits.
  } finally {
    reader.releaseLock();
  }
}

async function processComposeJob(job: Job<ComposeJobData>): Promise<ComposeJobResult> {
  const runtime = upsertRuntimeFromQueueJob(job, "running");
  if (!runtime.startedAt) runtime.startedAt = new Date();
  emit(runtime, { type: "status", status: "running" });

  let project = findProject(job.data.projectName);
  if (!project) {
    refreshProjects();
    project = findProject(job.data.projectName);
  }
  if (!project) {
    throw new Error(
      JSON.stringify({
        message: "Project not found",
        exitCode: 1,
        output: runtime.output,
      } satisfies ComposeFailurePayload)
    );
  }

  const proc = spawnCompose(project, ACTION_ARGS[runtime.action]);
  await Promise.all([pipeStream(proc.stdout, runtime), pipeStream(proc.stderr, runtime)]);

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(
      JSON.stringify({
        message: `Compose ${runtime.action} failed`,
        output: runtime.output,
        exitCode,
      } satisfies ComposeFailurePayload)
    );
  }

  return {
    ok: true,
    output: runtime.output,
    exitCode: 0,
  };
}

async function initQueueRuntime(): Promise<void> {
  if (queue && worker) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    mkdirSync("data", { recursive: true });
    if (!process.env.DATA_PATH && !process.env.SQLITE_PATH) {
      process.env.DATA_PATH = QUEUE_DB_PATH;
    }

    queue = new Queue<ComposeJobData>(QUEUE_NAME, { embedded: true });
    worker = new Worker<ComposeJobData, ComposeJobResult>(QUEUE_NAME, processComposeJob, {
      embedded: true,
      concurrency: 1,
    });

    worker.on("active", (job) => {
      const runtime = upsertRuntimeFromQueueJob(job, "running");
      if (!runtime.startedAt) runtime.startedAt = new Date();
      emit(runtime, { type: "status", status: "running" });
    });

    worker.on("completed", (job, result) => {
      const runtime = upsertRuntimeFromQueueJob(job, "completed");
      if (result?.output && runtime.output !== result.output) {
        runtime.output = result.output;
      }
      setTerminalState(runtime, true, result?.exitCode ?? 0);
    });

    worker.on("failed", (job, error) => {
      const runtime = upsertRuntimeFromQueueJob(job, "failed");
      const failure = parseFailurePayload(error?.message);
      if (failure?.output && runtime.output !== failure.output) {
        runtime.output = failure.output;
      }
      setTerminalState(runtime, false, failure?.exitCode ?? 1);
    });

    worker.on("error", (error) => {
      console.error(`Compose queue worker error: ${error.message}`);
    });
  })();

  await initPromise;
}

export async function startComposeJobWorker(): Promise<void> {
  await initQueueRuntime();
}

async function snapshotFromQueueJob(id: string): Promise<ComposeJobSnapshot | undefined> {
  await initQueueRuntime();
  if (!queue) return undefined;

  const job = await queue.getJob(id);
  if (!job) return undefined;
  const state = mapState(await queue.getJobState(id));

  const runtime = upsertRuntimeFromQueueJob(job, state);

  if (state === "completed" && job.returnvalue && typeof job.returnvalue === "object") {
    const result = job.returnvalue as Partial<ComposeJobResult>;
    if (typeof result.output === "string") runtime.output = result.output;
    if (typeof result.exitCode === "number") runtime.exitCode = result.exitCode;
  }

  if (state === "failed") {
    const failure = parseFailurePayload(job.failedReason);
    if (failure?.output) runtime.output = failure.output;
    runtime.exitCode = failure?.exitCode ?? runtime.exitCode ?? 1;
  }

  return toSnapshot(runtime);
}

export async function enqueueComposeJob(project: ProjectConfig, action: ComposeAction): Promise<ComposeJobSnapshot> {
  await initQueueRuntime();
  if (!queue) throw new Error("Queue is not initialized");

  const job = await queue.add(action, { projectName: project.name, action }, {
    durable: true,
    removeOnComplete: false,
    removeOnFail: false,
  });

  const runtime: RuntimeJob = {
    id: job.id,
    projectName: project.name,
    action,
    status: "queued",
    output: "",
    createdAt: new Date(job.timestamp || Date.now()),
    listeners: new Set(),
  };
  runtimeJobs.set(runtime.id, runtime);
  pruneRuntimeJobs();

  return toSnapshot(runtime);
}

export async function getComposeJob(id: string): Promise<ComposeJobSnapshot | undefined> {
  await initQueueRuntime();

  const runtime = runtimeJobs.get(id);
  if (runtime) return toSnapshot(runtime);

  return snapshotFromQueueJob(id);
}

export async function subscribeComposeJob(
  id: string,
  listener: (event: ComposeJobEvent) => void
): Promise<(() => void) | undefined> {
  const snapshot = await getComposeJob(id);
  if (!snapshot) return undefined;

  let runtime = runtimeJobs.get(id);
  if (!runtime) {
    runtime = {
      id: snapshot.id,
      projectName: snapshot.projectName,
      action: snapshot.action,
      status: snapshot.status,
      output: snapshot.output,
      createdAt: new Date(snapshot.createdAt),
      startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : undefined,
      finishedAt: snapshot.finishedAt ? new Date(snapshot.finishedAt) : undefined,
      exitCode: snapshot.exitCode,
      listeners: new Set(),
    };
    runtimeJobs.set(id, runtime);
    pruneRuntimeJobs();
  }

  runtime.listeners.add(listener);
  listener({ type: "snapshot", job: toSnapshot(runtime) });

  if (runtime.status === "completed" || runtime.status === "failed") {
    listener({
      type: "done",
      ok: runtime.status === "completed",
      exitCode: runtime.exitCode ?? (runtime.status === "completed" ? 0 : 1),
      job: toSnapshot(runtime),
    });
  }

  return () => {
    runtime?.listeners.delete(listener);
  };
}
