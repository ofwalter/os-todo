import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MobileHeader, MobileTabBar, Sidebar } from "@/components/app-shell";
import { LogoMark } from "@/components/logo";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import TodayPage from "@/pages/today";
import HistoryPage from "@/pages/history";
import TemplatesPage from "@/pages/templates";
import SettingsPage from "@/pages/settings";
import CustomStreaksPage from "@/pages/custom-streaks";
import DeadlinesPage from "@/pages/deadlines";
import { VersionBadge } from "@/components/version-badge";

function Router() {
  return (
    <Switch>
      <Route path="/" component={TodayPage} />
      <Route path="/day/:date" component={TodayPage} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/streaks" component={CustomStreaksPage} />
      <Route path="/deadlines" component={DeadlinesPage} />
      <Route path="/templates" component={TemplatesPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  return (
    <div className="flex min-h-dvh flex-1">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <MobileHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-9 lg:pb-14">
          <Router />
        </main>
      </div>
      <MobileTabBar />
      <VersionBadge className="bottom-[calc(4.375rem+env(safe-area-inset-bottom))] lg:bottom-1.5" />
    </div>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center" aria-busy aria-label="Loading">
        <LogoMark className="size-12 animate-pulse text-muted-foreground/40" />
      </main>
    );
  }

  if (!user) {
    return (
      <>
        <LoginPage />
        <VersionBadge />
      </>
    );
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <AppContent />
        <Toaster position="top-center" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
