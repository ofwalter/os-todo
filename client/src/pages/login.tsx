import { useState } from "react";
import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/logo";
import { useAuth } from "@/hooks/use-auth";

export default function LoginPage() {
  const { login, isLoggingIn, loginError } = useAuth();
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password) login(password);
  };

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-20%] left-1/2 h-[36rem] w-[56rem] -translate-x-1/2 rounded-full bg-brand/20 blur-[120px] dark:bg-brand/25" />
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="size-16" />
          <h1 className="mt-5 text-2xl font-semibold" data-testid="text-app-name">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to OS Todo</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl bg-card/80 p-6 shadow-xl ring-1 ring-border backdrop-blur-xl"
        >
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!loginError || undefined}
              className="h-9"
              data-testid="input-password"
            />
            {loginError && (
              <p className="text-xs text-destructive" data-testid="text-login-error">
                {loginError.message.startsWith("401") ? "Wrong password" : `Login failed: ${loginError.message}`}
              </p>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!password || isLoggingIn}
            data-testid="button-login"
          >
            {isLoggingIn ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
            {isLoggingIn ? "Unlocking…" : "Unlock"}
          </Button>
        </form>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" /> Private, single-user workspace
        </p>
      </div>
    </main>
  );
}
