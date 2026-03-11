import { useState } from "react";
import { authClient } from "../lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await authClient.signIn.email({
        email,
        password,
        rememberMe: false,
      });

      if (res.error) {
        setError(res.error.message || "Login failed.");
        setLoading(false);
        return;
      }

      if (res.data?.twoFactorRedirect) {
        setNeeds2FA(true);
        setLoading(false);
        return;
      }

      window.location.href = "/";
    } catch {
      setError("An unexpected error occurred.");
      setLoading(false);
    }
  }

  async function handleTOTP(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let res;
      if (useBackupCode) {
        res = await authClient.twoFactor.verifyBackupCode({
          code: totpCode,
        });
      } else {
        res = await authClient.twoFactor.verifyTOTP({
          code: totpCode,
        });
      }

      if (res.error) {
        setError(res.error.message || "Invalid code.");
        setLoading(false);
        return;
      }

      window.location.href = "/";
    } catch {
      setError("An unexpected error occurred.");
      setLoading(false);
    }
  }

  if (needs2FA) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl text-center">
              {useBackupCode ? "Recovery Code" : "Two-Factor Authentication"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTOTP} className="space-y-4">
              {error && (
                <div className="text-sm text-destructive text-center">{error}</div>
              )}
              <div className="space-y-2">
                <Label htmlFor="totp">
                  {useBackupCode ? "Enter a recovery code" : "Enter the 6-digit code from your authenticator app"}
                </Label>
                <Input
                  id="totp"
                  type="text"
                  inputMode={useBackupCode ? "text" : "numeric"}
                  pattern={useBackupCode ? undefined : "[0-9]*"}
                  maxLength={useBackupCode ? 20 : 6}
                  placeholder={useBackupCode ? "Recovery code" : "000000"}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  autoFocus
                  autoComplete="one-time-code"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !totpCode}>
                {loading ? "Verifying..." : "Verify"}
              </Button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  setUseBackupCode(!useBackupCode);
                  setTotpCode("");
                  setError("");
                }}
              >
                {useBackupCode ? "Use authenticator app instead" : "Use a recovery code"}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl text-center">Sign In</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="text-sm text-destructive text-center">{error}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
