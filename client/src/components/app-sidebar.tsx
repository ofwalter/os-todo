import { useLocation, Link } from "wouter";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarPlus,
  CalendarClock,
  History,
  LayoutTemplate,
  Settings,
  Trophy,
  Flame,
  Target,
  Zap,
  Moon,
  Sun,
  LogOut,
} from "lucide-react";
import type { CustomStreak, CustomStreakEntry } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { ProgressBar, getProgressDotColor } from "@/components/progress-bar";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";

  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getRecentDates(count: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    dates.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
    d.setDate(d.getDate() - 1);
  }
  return dates;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeSidebarStreak(entries: CustomStreakEntry[], skipWeekends: boolean, holidays?: Set<string>): number {
  if (entries.length === 0) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDate(today);
  const dateSet = new Set(entries.map((e) => e.date));
  let count = 0;
  const d = new Date(today);
  if (!dateSet.has(todayStr)) {
    const day = d.getDay();
    const isSkippable = skipWeekends && (day === 0 || day === 6 || holidays?.has(todayStr));
    if (!isSkippable) {
      d.setDate(d.getDate() - 1);
    }
  } else {
    count++;
    d.setDate(d.getDate() - 1);
  }
  while (true) {
    const dateStr = formatDate(d);
    const day = d.getDay();
    const isSkippable = skipWeekends && (day === 0 || day === 6 || holidays?.has(dateStr));
    if (dateSet.has(dateStr)) {
      count++;
      d.setDate(d.getDate() - 1);
    } else if (isSkippable) {
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return count;
}

export function AppSidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const today = getTodayStr();
  const recentDates = getRecentDates(7);

  const { data: summary } = useQuery<
    { date: string; progress: number; total: number; completed: number }[]
  >({
    queryKey: ["/api/days/summary", `?start=${recentDates[recentDates.length - 1]}&end=${recentDates[0]}`],
  });

  const { data: streaks } = useQuery<{
    streak100: number;
    streak75: number;
    streak50: number;
  }>({
    queryKey: ["/api/streaks", `?today=${today}`],
  });

  const { data: customStreakData } = useQuery<
    { streak: CustomStreak; entries: CustomStreakEntry[] }[]
  >({
    queryKey: ["/api/custom-streaks"],
  });

  const { data: holidayList } = useQuery<{ id: number; userId: number; date: string }[]>({
    queryKey: ["/api/holidays"],
  });

  const holidaySet = useMemo(() => {
    if (!holidayList) return new Set<string>();
    return new Set(holidayList.map((h) => h.date));
  }, [holidayList]);

  const progressMap = new Map<string, number>();
  summary?.forEach((s) => progressMap.set(s.date, s.progress));

  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const navItems = [
    {
      title: "Today",
      url: "/",
      icon: CalendarDays,
      active: location === "/" || location === `/day/${today}`,
    },
    {
      title: "Tomorrow",
      url: `/day/${tomorrow}`,
      icon: CalendarPlus,
      active: location === `/day/${tomorrow}`,
    },
    {
      title: "History",
      url: "/history",
      icon: History,
      active: location === "/history",
    },
    {
      title: "Custom Streaks",
      url: "/streaks",
      icon: Zap,
      active: location === "/streaks",
    },
    {
      title: "Deadlines",
      url: "/deadlines",
      icon: CalendarClock,
      active: location === "/deadlines",
    },
    {
      title: "Templates",
      url: "/templates",
      icon: LayoutTemplate,
      active: location === "/templates",
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings,
      active: location === "/settings",
    },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <CalendarDays className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">DailyDo</h1>
            <p className="text-xs text-muted-foreground">Daily routine tracker</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={item.active}
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase()}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Recent Days</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="space-y-1 px-2">
              {recentDates.map((date) => {
                const progress = progressMap.get(date);
                const isActive =
                  location === `/day/${date}` ||
                  (date === today && location === "/");
                return (
                  <Link
                    key={date}
                    href={date === today ? "/" : `/day/${date}`}
                    data-testid={`day-link-${date}`}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors hover-elevate cursor-pointer",
                        isActive && "bg-accent",
                      )}
                    >
                      <div
                        className={cn(
                          "w-2.5 h-2.5 rounded-full flex-shrink-0",
                          progress !== undefined
                            ? getProgressDotColor(progress)
                            : "bg-gray-200 dark:bg-gray-700",
                        )}
                      />
                      <span className="flex-1 truncate text-xs">
                        {formatDateLabel(date)}
                      </span>
                      {progress !== undefined && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {progress}%
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        {streaks && (
          <SidebarGroup>
            <SidebarGroupLabel>Streaks</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="space-y-2 px-2">
                <div className="flex items-center gap-2 px-2 py-1 text-sm">
                  <Trophy className="w-4 h-4 text-emerald-500" />
                  <span className="flex-1 text-xs">90%+</span>
                  <span className="text-xs font-semibold tabular-nums">
                    {streaks.streak100} day{streaks.streak100 !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-2 py-1 text-sm">
                  <Flame className="w-4 h-4 text-amber-500" />
                  <span className="flex-1 text-xs">75%+</span>
                  <span className="text-xs font-semibold tabular-nums">
                    {streaks.streak75} day{streaks.streak75 !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-2 py-1 text-sm">
                  <Target className="w-4 h-4 text-orange-500" />
                  <span className="flex-1 text-xs">50%+</span>
                  <span className="text-xs font-semibold tabular-nums">
                    {streaks.streak50} day{streaks.streak50 !== 1 ? "s" : ""}
                  </span>
                </div>
                {customStreakData && customStreakData.length > 0 && (
                  <>
                    <div className="border-t border-border/50 my-1" />
                    {customStreakData.map((sd) => {
                      const count = computeSidebarStreak(sd.entries, sd.streak.skipWeekends, holidaySet);
                      return (
                        <div
                          key={sd.streak.id}
                          className="flex items-center gap-2 px-2 py-1 text-sm"
                          data-testid={`sidebar-streak-${sd.streak.id}`}
                        >
                          <span className="w-4 h-4 flex items-center justify-center text-sm leading-none">
                            {sd.streak.emoji}
                          </span>
                          <span className="flex-1 text-xs truncate">{sd.streak.name}</span>
                          <span className="text-xs font-semibold tabular-nums">
                            {count} day{count !== 1 ? "s" : ""}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Stay consistent, build habits
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md hover:bg-muted transition-colors"
              data-testid="button-theme-toggle"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Moon className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            <button
              onClick={logout}
              className="p-1.5 rounded-md hover:bg-muted transition-colors"
              data-testid="button-logout"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
