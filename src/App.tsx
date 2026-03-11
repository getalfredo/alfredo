import { useState } from "react";
import { authClient } from "./lib/auth-client";
import { Login } from "./pages/Login";
import { TwoFactorSetup } from "./pages/TwoFactorSetup";
import { TwoFactorNudge } from "./components/TwoFactorNudge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import "./index.css";

function Dashboard() {
  const { data: session } = authClient.useSession();
  const [showSetup2FA, setShowSetup2FA] = useState(false);

  const twoFactorEnabled = (session?.user as any)?.twoFactorEnabled;

  async function handleSignOut() {
    await authClient.signOut();
    window.location.href = "/login";
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
    <div className="container mx-auto p-8 max-w-2xl space-y-6">
      {!twoFactorEnabled && (
        <TwoFactorNudge onSetup={() => setShowSetup2FA(true)} />
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Dashboard</CardTitle>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{session?.user?.email}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function App() {
  const { data: session, isPending } = authClient.useSession();
  const path = window.location.pathname;

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

  return <Dashboard />;
}

export default App;
