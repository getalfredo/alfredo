import { useState, useEffect, useCallback, type FormEvent } from "react";
import { authClient } from "../lib/auth-client";
import { TwoFactorNudge } from "../components/TwoFactorNudge";
import { TwoFactorSetup } from "./TwoFactorSetup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ProjectSummary {
  name: string;
  path: string;
  containers: number;
  running: number;
}

const DEFAULT_COMPOSE_CONTENT = `services:
  app:
    image: alpine:latest
    command: ["sh", "-c", "sleep infinity"]
`;

export function Dashboard() {
  const { data: session } = authClient.useSession();
  const [showSetup2FA, setShowSetup2FA] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stackName, setStackName] = useState("");
  const [composeContent, setComposeContent] = useState(DEFAULT_COMPOSE_CONTENT);
  const [creatingStack, setCreatingStack] = useState(false);
  const [createStackMessage, setCreateStackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const twoFactorEnabled = (session?.user as any)?.twoFactorEnabled;

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      setProjects(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    const interval = setInterval(fetchProjects, 10000);
    return () => clearInterval(interval);
  }, [fetchProjects]);

  async function handleRefresh() {
    await fetch("/api/projects/refresh", { method: "POST" });
    fetchProjects();
  }

  async function handleSignOut() {
    await authClient.signOut();
    window.location.href = "/login";
  }

  async function handleCreateStack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateStackMessage(null);
    setCreatingStack(true);

    try {
      const res = await fetch("/api/stacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: stackName, content: composeContent }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to create stack.");
      }

      setCreateStackMessage({ type: "success", text: `Stack "${stackName}" created.` });
      setStackName("");
      await fetchProjects();
    } catch (e: any) {
      setCreateStackMessage({ type: "error", text: e.message || "Failed to create stack." });
    } finally {
      setCreatingStack(false);
    }
  }

  if (showSetup2FA) {
    return (
      <div className="container mx-auto p-8 max-w-lg">
        <TwoFactorSetup
          onComplete={() => {
            setShowSetup2FA(false);
            window.location.reload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 max-w-4xl space-y-6">
      {!twoFactorEnabled && (
        <TwoFactorNudge onSetup={() => setShowSetup2FA(true)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Create Stack</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleCreateStack}>
            <div className="space-y-2">
              <p className="text-sm font-medium">Stack name</p>
              <Input
                value={stackName}
                onChange={(e) => setStackName(e.target.value)}
                placeholder="my-stack"
                required
                pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                title="Use letters, numbers, dot, underscore or hyphen."
                disabled={creatingStack}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">docker-compose.yml</p>
              <Textarea
                className="font-mono text-xs min-h-[220px]"
                value={composeContent}
                onChange={(e) => setComposeContent(e.target.value)}
                spellCheck={false}
                disabled={creatingStack}
              />
            </div>
            {createStackMessage && (
              <p className={`text-sm ${createStackMessage.type === "success" ? "text-green-600" : "text-destructive"}`}>
                {createStackMessage.text}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={creatingStack || !stackName.trim()}>
                {creatingStack ? "Creating..." : "Create stack"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Projects</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-muted-foreground">Loading projects...</p>}
          {error && <p className="text-destructive">{error}</p>}
          {!loading && projects.length === 0 && (
            <p className="text-muted-foreground">
              No projects found. Add directories to scan in <code className="text-xs bg-muted px-1 py-0.5 rounded">config.yaml</code> or create a stack in <code className="text-xs bg-muted px-1 py-0.5 rounded">../stacks</code>.
            </p>
          )}
          {projects.length > 0 && (
            <div className="grid gap-3">
              {projects.map((p) => (
                <a
                  key={p.name}
                  href={`/project/${encodeURIComponent(p.name)}`}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.path}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full ${
                        p.running === p.containers && p.containers > 0
                          ? "bg-green-500"
                          : p.running > 0
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      }`}
                    />
                    <span className="text-sm text-muted-foreground">
                      {p.running}/{p.containers}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Signed in as {session?.user?.email}
      </p>
    </div>
  );
}
