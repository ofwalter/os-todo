import { CalendarDays, CheckCircle2, BarChart3, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiGoogle } from "react-icons/si";

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-primary mx-auto flex items-center justify-center">
            <CalendarDays className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-app-name">
            DailyDo
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            Build consistent habits with a beautiful daily task tracker.
            Templates, progress tracking, and streaks.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-start gap-2 p-3 rounded-md bg-card">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium">Hierarchical Tasks</p>
              <p className="text-xs text-muted-foreground">Nested subtasks with auto-complete</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-md bg-card">
            <BarChart3 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium">Track Progress</p>
              <p className="text-xs text-muted-foreground">Streaks and history view</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-md bg-card">
            <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium">Celebrations</p>
              <p className="text-xs text-muted-foreground">Confetti and sound effects</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-md bg-card">
            <CalendarDays className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium">Templates</p>
              <p className="text-xs text-muted-foreground">Weekday & weekend routines</p>
            </div>
          </div>
        </div>

        <Button
          onClick={onLogin}
          className="w-full"
          size="lg"
          data-testid="button-login"
        >
          <SiGoogle className="w-4 h-4 mr-2" />
          Sign in with Google
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Your data syncs across all your devices
        </p>
      </div>
    </div>
  );
}
