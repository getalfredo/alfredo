import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ContainerInfo {
  name: string;
  service: string;
  state: string;
  status: string;
  ports: string;
}

interface ProjectStatus {
  name: string;
  path: string;
  containers: ContainerInfo[];
}

type ComposeAction = "up" | "down" | "restart";
type JobStatus = "queued" | "running" | "completed" | "failed";

interface ComposeJob {
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

type ComposeJobSocketEvent =
  | { type: "snapshot"; job: ComposeJob }
  | { type: "status"; status: JobStatus }
  | { type: "chunk"; chunk: string }
  | { type: "done"; ok: boolean; exitCode: number; job: ComposeJob }
  | { type: "error"; message: string };

type Tab = "status" | "logs" | "compose";

export function ProjectDetail({ name }: { name: string }) {
  const [tab, setTab] = useState<Tab>("status");

  return (
    <div className="container mx-auto p-8 max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <a href="/" className="text-muted-foreground hover:text-foreground text-sm">&larr; Back</a>
        <h1 className="text-xl font-semibold">{name}</h1>
      </div>

      <div className="flex gap-1 border-b">
        {(["status", "logs", "compose"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "status" ? "Status" : t === "logs" ? "Logs" : "Compose"}
          </button>
        ))}
      </div>

      {tab === "status" && <StatusTab name={name} />}
      {tab === "logs" && <LogsTab name={name} />}
      {tab === "compose" && <ComposeTab name={name} />}
    </div>
  );
}

function StatusTab({ name }: { name: string }) {
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [actionOutput, setActionOutput] = useState("");
  const actionWsRef = useRef<WebSocket | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}/status`);
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, [name]);

  function actionLabel(action: ComposeAction): string {
    if (action === "up") return "start";
    if (action === "down") return "stop";
    return "restart";
  }

  function appendActionOutput(chunk: string) {
    if (!chunk) return;
    setActionOutput((prev) => {
      const next = prev + chunk;
      if (next.length > 500_000) return next.slice(-400_000);
      return next;
    });
  }

  function applyJobSnapshot(job: ComposeJob) {
    setActionOutput(job.output || "");

    if (job.status === "queued") {
      setActionMessage({ type: "info", text: `${actionLabel(job.action)} queued...` });
      return;
    }

    if (job.status === "running") {
      setActionMessage({ type: "info", text: `${actionLabel(job.action)} in progress...` });
      return;
    }

    if (job.status === "completed") {
      setActionLoading(null);
      setActionMessage({ type: "success", text: `${actionLabel(job.action)} completed.` });
      void fetchStatus();
      return;
    }

    setActionLoading(null);
    setActionMessage({ type: "error", text: `Failed to ${actionLabel(job.action)} project.` });
    void fetchStatus();
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    return () => {
      actionWsRef.current?.close();
      actionWsRef.current = null;
    };
  }, []);

  async function handleAction(action: ComposeAction) {
    setActionLoading(action);
    setActionMessage(null);
    setActionOutput("");

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}/${action}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setActionMessage({ type: "error", text: `Failed to ${actionLabel(action)} project.` });
        setActionOutput(data?.error || "");
        setActionLoading(null);
        return;
      }

      const job = data?.job as ComposeJob | undefined;
      if (!job?.id) {
        setActionMessage({ type: "error", text: "Invalid job response." });
        setActionLoading(null);
        return;
      }

      applyJobSnapshot(job);

      actionWsRef.current?.close();
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/jobs/${encodeURIComponent(job.id)}`);
      actionWsRef.current = ws;

      ws.onmessage = (event) => {
        let parsed: ComposeJobSocketEvent | undefined;
        try {
          parsed = JSON.parse(event.data) as ComposeJobSocketEvent;
        } catch {
          return;
        }

        if (!parsed) return;

        if (parsed.type === "snapshot") {
          applyJobSnapshot(parsed.job);
          return;
        }

        if (parsed.type === "status") {
          if (parsed.status === "queued") {
            setActionMessage({ type: "info", text: `${actionLabel(action)} queued...` });
          } else if (parsed.status === "running") {
            setActionMessage({ type: "info", text: `${actionLabel(action)} in progress...` });
          }
          return;
        }

        if (parsed.type === "chunk") {
          appendActionOutput(parsed.chunk);
          return;
        }

        if (parsed.type === "done") {
          setActionOutput(parsed.job.output || "");
          setActionLoading(null);
          setActionMessage(
            parsed.ok
              ? { type: "success", text: `${actionLabel(parsed.job.action)} completed.` }
              : { type: "error", text: `Failed to ${actionLabel(parsed.job.action)} project.` }
          );
          void fetchStatus();
          ws.close();
          return;
        }

        if (parsed.type === "error") {
          setActionMessage({ type: "error", text: parsed.message || "Live updates failed." });
          setActionLoading(null);
        }
      };

      ws.onclose = () => {
        if (actionWsRef.current === ws) {
          actionWsRef.current = null;
        }
      };

      ws.onerror = () => {
        setActionMessage({ type: "error", text: "Live updates disconnected." });
        setActionLoading(null);
      };
    } catch {
      setActionMessage({ type: "error", text: `Failed to ${actionLabel(action)} project.` });
      setActionLoading(null);
    }
  }

  const actionMessageClassName = actionMessage
    ? actionMessage.type === "success"
      ? "text-green-600"
      : actionMessage.type === "info"
        ? "text-muted-foreground"
        : "text-destructive"
    : "";

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (!status) return <p className="text-destructive">Failed to load project status.</p>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Containers</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{status.path}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => handleAction("up")} disabled={!!actionLoading}>
            {actionLoading === "up" ? "Starting..." : "Up"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleAction("restart")} disabled={!!actionLoading}>
            {actionLoading === "restart" ? "Restarting..." : "Restart"}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleAction("down")} disabled={!!actionLoading}>
            {actionLoading === "down" ? "Stopping..." : "Down"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {actionMessage && (
          <div className="space-y-2 mb-4">
            <p className={`text-sm ${actionMessageClassName}`}>
              {actionMessage.text}
            </p>
            {actionOutput && (
              <pre className="bg-muted rounded-md p-3 text-xs font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto">
                {actionOutput}
              </pre>
            )}
          </div>
        )}
        {status.containers.length === 0 ? (
          <p className="text-muted-foreground">No containers found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Service</th>
                  <th className="pb-2 font-medium">State</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Ports</th>
                </tr>
              </thead>
              <tbody>
                {status.containers.map((c) => (
                  <tr key={c.name} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{c.service || c.name}</td>
                    <td className="py-2">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                          c.state === "running"
                            ? "bg-green-500/10 text-green-600"
                            : c.state === "exited"
                              ? "bg-red-500/10 text-red-600"
                              : "bg-yellow-500/10 text-yellow-600"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            c.state === "running"
                              ? "bg-green-500"
                              : c.state === "exited"
                                ? "bg-red-500"
                                : "bg-yellow-500"
                          }`}
                        />
                        {c.state}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{c.status}</td>
                    <td className="py-2 text-xs font-mono text-muted-foreground">{c.ports || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogsTab({ name }: { name: string }) {
  const [logs, setLogs] = useState("");
  const [connected, setConnected] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const autoScroll = useRef(true);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs/${encodeURIComponent(name)}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      setLogs((prev) => {
        const next = prev + e.data;
        // Keep last ~500KB to prevent memory issues
        if (next.length > 500_000) return next.slice(-400_000);
        return next;
      });
    };

    return () => {
      ws.close();
    };
  }, [name]);

  useEffect(() => {
    if (autoScroll.current) {
      logsEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [logs]);

  function handleScroll(e: React.UIEvent<HTMLPreElement>) {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    autoScroll.current = atBottom;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle>Logs</CardTitle>
          <span
            className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setLogs("")}>
          Clear
        </Button>
      </CardHeader>
      <CardContent>
        <pre
          className="bg-black text-green-400 text-xs font-mono p-4 rounded-lg overflow-auto max-h-[600px] min-h-[300px] whitespace-pre-wrap break-all"
          onScroll={handleScroll}
        >
          {logs || (connected ? "Waiting for logs..." : "Connecting...")}
          <div ref={logsEndRef} />
        </pre>
      </CardContent>
    </Card>
  );
}

function ComposeTab({ name }: { name: string }) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [filePath, setFilePath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(name)}/compose`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setContent(data.content);
        setOriginalContent(data.content);
        setFilePath(data.path);
      } catch {
        setMessage({ type: "error", text: "Failed to load compose file." });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [name]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}/compose`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Save failed");
      setOriginalContent(content);
      setMessage({ type: "success", text: "Saved successfully." });
    } catch {
      setMessage({ type: "error", text: "Failed to save compose file." });
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = content !== originalContent;

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Compose File</CardTitle>
          <p className="text-xs text-muted-foreground mt-1 font-mono">{filePath}</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {message && (
          <p className={`text-sm ${message.type === "success" ? "text-green-600" : "text-destructive"}`}>
            {message.text}
          </p>
        )}
        <Textarea
          className="font-mono text-xs min-h-[400px]"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
        />
      </CardContent>
    </Card>
  );
}
