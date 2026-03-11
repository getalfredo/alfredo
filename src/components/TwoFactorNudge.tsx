import { Button } from "@/components/ui/button";

export function TwoFactorNudge({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Two-factor authentication is not enabled
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
          Protect your account by enabling 2FA with an authenticator app.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onSetup} className="shrink-0">
        Enable 2FA
      </Button>
    </div>
  );
}
