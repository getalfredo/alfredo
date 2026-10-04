import { authClient } from "./lib/auth-client";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { ProjectDetail } from "./pages/ProjectDetail";
import { CollaborationPrototype } from "./prototype/collaboration";
import "./index.css";

export function App() {
  const { data: session, isPending } = authClient.useSession();
  const path = window.location.pathname;

  // PROTOTYPE - throwaway route, no sign-in needed. Never merge into main.
  if (path === "/prototype/collaboration" && process.env.NODE_ENV !== "production") {
    return <CollaborationPrototype />;
  }

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (path === "/login") {
    if (session) {
      window.location.href = "/";
      return null;
    }
    return <Login />;
  }

  if (!session) {
    window.location.href = "/login";
    return null;
  }

  const projectMatch = path.match(/^\/project\/(.+)$/);
  if (projectMatch) {
    return <ProjectDetail name={decodeURIComponent(projectMatch[1])} />;
  }

  return <Dashboard />;
}

export default App;
