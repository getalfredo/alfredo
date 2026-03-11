import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { authClient } from "../lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "password" | "scan" | "verify" | "backup" | "done";

export function TwoFactorSetup({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [totpURI, setTotpURI] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const secret = totpURI ? new URL(totpURI).searchParams.get("secret") : null;

  async function handleEnable() {
    setError("");
    setLoading(true);

    try {
      const res = await authClient.twoFactor.enable({
        password,
      });

      if (res.error) {
        setError(res.error.message || "Failed to enable 2FA.");
        setLoading(false);
        return;
      }

      setTotpURI(res.data.totpURI);
      setBackupCodes(res.data.backupCodes);
      setStep("scan");
    } catch {
      setError("An unexpected error occurred.");
    }
    setLoading(false);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await authClient.twoFactor.verifyTOTP({
        code: verifyCode,
      });

      if (res.error) {
        setError(res.error.message || "Invalid code.");
        setLoading(false);
        return;
      }

      setStep("backup");
    } catch {
      setError("An unexpected error occurred.");
    }
    setLoading(false);
  }

  if (step === "password") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Enable Two-Factor Authentication</CardTitle>
          <CardDescription>
            Enter your password to begin setting up 2FA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="2fa-password">Password</Label>
            <Input
              id="2fa-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              onKeyDown={(e) => e.key === "Enter" && handleEnable()}
            />
          </div>
          <Button onClick={handleEnable} disabled={loading || !password} className="w-full">
            {loading ? "Setting up..." : "Continue"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "scan") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Scan QR Code</CardTitle>
          <CardDescription>
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center p-4 bg-white rounded-lg">
            <QRCodeSVG value={totpURI} size={200} />
          </div>
          {secret && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Can't scan? Enter this secret manually:
              </p>
              <code className="block text-sm bg-muted p-2 rounded text-center select-all font-mono">
                {secret}
              </code>
            </div>
          )}
          <Button onClick={() => setStep("verify")} className="w-full">
            I've scanned the code
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "verify") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Verify Setup</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app to confirm setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-4">
            {error && <div className="text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <Label htmlFor="verify-code">Verification code</Label>
              <Input
                id="verify-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                autoFocus
                autoComplete="one-time-code"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || verifyCode.length !== 6}>
              {loading ? "Verifying..." : "Verify and Enable"}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setStep("scan")}
            >
              Back to QR code
            </button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (step === "backup") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Recovery Codes</CardTitle>
          <CardDescription>
            Save these codes in a safe place. You can use them to sign in if you lose access to your authenticator app. Each code can only be used once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 bg-muted p-4 rounded-lg">
            {backupCodes.map((code, i) => (
              <code key={i} className="text-sm font-mono text-center py-1">
                {code}
              </code>
            ))}
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              navigator.clipboard.writeText(backupCodes.join("\n"));
            }}
          >
            Copy codes
          </Button>
          <Button
            className="w-full"
            onClick={() => {
              setStep("done");
              onComplete();
            }}
          >
            I've saved my codes
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}
