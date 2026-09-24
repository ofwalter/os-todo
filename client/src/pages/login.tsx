import { useState } from "react";
import { CalendarDays, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

export default function LoginPage() {
  const { login, isLoggingIn, loginError } = useAuth();
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password) login(password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-primary mx-auto flex items-center justify-center">
            <CalendarDays className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-app-name">
            DailyDo
          </h1>
        </div>

        <div className="space-y-2">
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="input-password"
          />
          {loginError && (
            <p className="text-xs text-destructive" data-testid="text-login-error">
              Wrong password
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={!password || isLoggingIn}
          data-testid="button-login"
        >
          <Lock className="w-4 h-4 mr-2" />
          {isLoggingIn ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
    </div>
  );
}
