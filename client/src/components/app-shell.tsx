import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  Flame,
  History,
  LayoutTemplate,
  LogOut,
  MoreHorizontal,
  Settings,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { CustomStreak, CustomStreakEntry, Deadline } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Logo, LogoMark } from "@/components/logo";
import { CountBadge, ThemeToggle } from "@/components/app-ui";
import { ProgressBar, getProgressDotColor } from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { computeStreakCount, formatDayLabel, offsetDateStr, todayStr } from "@/lib/dates";
import { cn } from "@/lib/utils";

type DaySummary = { date: string; progress: number; total: number; completed: number };

interface NavItem {
  title: string;
  short: string;
  href: string;
  icon: LucideIcon;
  testId: string;
  active: boolean;
  badge?: number;
}

function useNav() {
  const [location] = useLocation();
  const today = todayStr();
  const tomorrow = offsetDateStr(1);

  const { data: deadlines } = useQuery<Deadline[]>({ queryKey: ["/api/deadlines"] });
  const overdue = (deadlines ?? []).filter((d) => !d.isDone && d.dueDate < today).length;

  const isToday = location === "/" || location === `/day/${today}`;
  const isTomorrow = location === `/day/${tomorrow}`;
  // Any other day is reached from History or the recent-days list.
  const isOtherDay = location.startsWith("/day/") && !isToday && !isTomorrow;

  const menu: NavItem[] = [
    { title: "Today", short: "Today", href: "/", icon: CalendarCheck, testId: "nav-today", active: isToday },
    { title: "Tomorrow", short: "Tomorrow", href: `/day/${tomorrow}`, icon: CalendarPlus, testId: "nav-tomorrow", active: isTomorrow },
    { title: "History", short: "History", href: "/history", icon: History, testId: "nav-history", active: location.startsWith("/history") || isOtherDay },
    { title: "Streaks", short: "Streaks", href: "/streaks", icon: Zap, testId: "nav-streaks", active: location.startsWith("/streaks") },
    { title: "Deadlines", short: "Deadlines", href: "/deadlines", icon: CalendarClock, testId: "nav-deadlines", active: location.startsWith("/deadlines"), badge: overdue },
  ];
  const manage: NavItem[] = [
    { title: "Templates", short: "Templates", href: "/templates", icon: LayoutTemplate, testId: "nav-templates", active: location.startsWith("/templates") },
    { title: "Settings", short: "Settings", href: "/settings", icon: Settings, testId: "nav-settings", active: location.startsWith("/settings") },
  ];
  return { menu, manage, location, today };
}

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      data-testid={item.testId}
      className={cn(
        "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
        item.active && "bg-sidebar-accent text-foreground",
      )}
    >
      <Icon
        className={cn("size-[1.05rem]", item.active ? "text-brand" : "text-muted-foreground group-hover:text-foreground")}
        strokeWidth={item.active ? 2.25 : 2}
      />
      <span className="flex-1 truncate">{item.title}</span>
      {item.badge ? <CountBadge count={item.badge} /> : null}
    </Link>
  );
}

function RecentDays({ location, today }: { location: string; today: string }) {
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => offsetDateStr(-i)), []);
  const { data: summary } = useQuery<DaySummary[]>({
    queryKey: ["/api/days/summary", `?start=${dates[dates.length - 1]}&end=${dates[0]}`],
  });
  const progressMap = new Map(summary?.map((s) => [s.date, s.progress]));

  return (
    <div>
      <p className="eyebrow mb-1.5 px-3">Recent days</p>
      <ul className="space-y-px">
        {dates.map((date) => {
          const progress = progressMap.get(date);
          const active = location === `/day/${date}` || (date === today && location === "/");
          return (
            <li key={date}>
              <Link
                href={date === today ? "/" : `/day/${date}`}
                data-testid={`day-link-${date}`}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                  active && "bg-sidebar-accent text-foreground",
                )}
              >
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", getProgressDotColor(progress))} />
                <span className="flex-1 truncate font-medium">{formatDayLabel(date)}</span>
                <span className="tabular-nums">{progress !== undefined ? `${progress}%` : "—"}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StreakSummary() {
  const today = todayStr();
  const { data: streaks } = useQuery<{ streak100: number; streak75: number; streak50: number }>({
    queryKey: ["/api/streaks", `?today=${today}`],
  });
  const { data: custom } = useQuery<{ streak: CustomStreak; entries: CustomStreakEntry[] }[]>({
    queryKey: ["/api/custom-streaks"],
  });
  const { data: holidayList } = useQuery<{ id: number; date: string }[]>({ queryKey: ["/api/holidays"] });
  const holidays = useMemo(() => new Set(holidayList?.map((h) => h.date)), [holidayList]);

  if (!streaks) return null;

  const rows: { key: string; icon: React.ReactNode; label: string; count: number; testId?: string }[] = [
    { key: "90", icon: <Flame className="size-3.5 text-positive" />, label: "90%+ days", count: streaks.streak100 },
    { key: "75", icon: <Flame className="size-3.5 text-warning" />, label: "75%+ days", count: streaks.streak75 },
    { key: "50", icon: <Flame className="size-3.5 text-muted-foreground" />, label: "50%+ days", count: streaks.streak50 },
    ...(custom ?? []).map((sd) => ({
      key: `c${sd.streak.id}`,
      icon: <span className="text-[0.8rem] leading-none">{sd.streak.emoji}</span>,
      label: sd.streak.name,
      count: computeStreakCount(sd.entries, sd.streak.skipWeekends, holidays),
      testId: `sidebar-streak-${sd.streak.id}`,
    })),
  ];

  return (
    <div>
      <p className="eyebrow mb-1.5 px-3">Streaks</p>
      <ul className="space-y-px">
        {rows.map((r) => (
          <li key={r.key} className="flex h-8 items-center gap-2.5 px-3 text-xs" data-testid={r.testId}>
            <span className="flex size-4 items-center justify-center">{r.icon}</span>
            <span className="flex-1 truncate text-muted-foreground">{r.label}</span>
            <span className="num font-semibold">
              {r.count}
              <span className="ml-0.5 font-sans font-normal text-muted-foreground">d</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TodayStatus() {
  const today = todayStr();
  const { data } = useQuery<DaySummary[]>({
    queryKey: ["/api/days/summary", `?start=${today}&end=${today}`],
  });
  const day = data?.find((d) => d.date === today);
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", day && day.progress >= 100 ? "bg-positive" : day ? "bg-brand" : "bg-muted-foreground/40")}
          />
          Today
        </span>
        <span className="num font-semibold">{day ? `${day.completed}/${day.total}` : "—"}</span>
      </div>
      <ProgressBar progress={day?.progress ?? 0} size="sm" />
    </div>
  );
}

export function Sidebar() {
  const { menu, manage, location, today } = useNav();
  const { logout } = useAuth();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
      <Link href="/" className="mx-4 mt-5 mb-7 px-2" aria-label="OS Todo home">
        <Logo />
      </Link>

      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4 scrollbar-none">
        <div>
          <p className="eyebrow mb-1.5 px-3">Menu</p>
          <div className="space-y-0.5">
            {menu.map((item) => (
              <SidebarLink key={item.href} item={item} />
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow mb-1.5 px-3">Manage</p>
          <div className="space-y-0.5">
            {manage.map((item) => (
              <SidebarLink key={item.href} item={item} />
            ))}
          </div>
        </div>
        <RecentDays location={location} today={today} />
        <StreakSummary />
      </nav>

      <div className="space-y-3 border-t px-4 py-4">
        <TodayStatus />
        <div className="flex items-center justify-between">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={logout} data-testid="button-logout">
            <LogOut />
            Log out
          </Button>
        </div>
      </div>
    </aside>
  );
}

export function MobileHeader() {
  const { manage } = useNav();
  const { logout } = useAuth();
  const [, navigate] = useLocation();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center gap-2 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="OS Todo home">
          <LogoMark className="size-7" />
          <span className="font-heading text-[0.9375rem] font-semibold tracking-tight">OS Todo</span>
        </Link>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More" data-testid="button-mobile-more">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 p-2">
              <div className="px-1 pb-2">
                <TodayStatus />
              </div>
              <DropdownMenuLabel>Manage</DropdownMenuLabel>
              {manage.map((item) => (
                <DropdownMenuItem key={item.href} onSelect={() => navigate(item.href)} data-testid={`mobile-${item.testId}`}>
                  <item.icon className={cn(item.active && "text-brand")} />
                  {item.title}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-sm">Theme</span>
                <ThemeToggle />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={logout} data-testid="button-mobile-logout">
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

export function MobileTabBar() {
  const { menu } = useNav();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 backdrop-blur-xl lg:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {menu.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                data-testid={`tab-${item.testId}`}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-muted-foreground transition-colors",
                  item.active && "text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className={cn("size-5", item.active && "text-brand")} strokeWidth={item.active ? 2.25 : 1.9} />
                  {item.badge ? <CountBadge count={item.badge} className="absolute -top-1.5 -right-2.5" /> : null}
                </span>
                {item.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
