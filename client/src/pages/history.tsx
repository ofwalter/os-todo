import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Kpi, PageHeader, SectionHeader } from "@/components/app-ui";
import { PROGRESS_LEGEND, getProgressDotColor } from "@/components/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { todayStr } from "@/lib/dates";

interface DaySummary {
  date: string;
  progress: number;
  total: number;
  completed: number;
}

const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

function MonthGrid({
  year,
  month,
  progressMap,
  today,
  onDayClick,
}: {
  year: number;
  month: number;
  progressMap: Map<string, number>;
  today: string;
  onDayClick: (date: string) => void;
}) {
  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const label = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long" });

  return (
    <div className="min-w-0">
      <p className="eyebrow mb-2">{label}</p>
      <div className="grid grid-cols-7 gap-[3px]">
        {DAY_NAMES.map((d, i) => (
          <span key={i} className="pb-0.5 text-center text-[0.5625rem] font-medium text-muted-foreground/60">
            {d}
          </span>
        ))}
        {Array.from({ length: startDow }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const progress = progressMap.get(dateStr);
          const isFuture = dateStr > today;
          return (
            <button
              key={dateStr}
              type="button"
              className={cn(
                "aspect-square rounded-[3px] transition-[box-shadow,opacity] outline-none hover:ring-2 hover:ring-foreground/25 focus-visible:ring-2 focus-visible:ring-ring",
                getProgressDotColor(progress),
                isFuture && progress === undefined && "opacity-40",
                dateStr === today && "ring-1 ring-foreground/60",
              )}
              title={`${dateStr}: ${progress !== undefined ? `${progress}%` : "No data"}`}
              aria-label={`${dateStr}, ${progress !== undefined ? `${progress}% done` : "no data"}`}
              onClick={() => onDayClick(dateStr)}
              data-testid={`history-day-${dateStr}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export default function HistoryPage() {
  const [, navigate] = useLocation();
  const today = todayStr();

  const { data: allSummary, isLoading } = useQuery<DaySummary[]>({
    queryKey: ["/api/days/all-summary"],
  });
  const { data: streaks } = useQuery<{ streak100: number; streak75: number; streak50: number }>({
    queryKey: ["/api/streaks", `?today=${today}`],
  });

  const { progressMap, years, tracked, stats } = useMemo(() => {
    // Only count days that had something to do; future days aren't history yet.
    const tracked = (allSummary ?? []).filter((s) => s.total > 0 && s.date <= today);
    const progressMap = new Map((allSummary ?? []).map((s) => [s.date, s.progress]));
    const yearSet = new Set((allSummary ?? []).map((s) => Number(s.date.slice(0, 4))));
    yearSet.add(new Date().getFullYear());
    return {
      progressMap,
      tracked,
      years: Array.from(yearSet).sort((a, b) => b - a),
      stats: {
        average: average(tracked.map((s) => s.progress)),
        strongDays: tracked.filter((s) => s.progress >= 90).length,
      },
    };
  }, [allSummary, today]);

  const handleDayClick = (date: string) => navigate(date === today ? "/" : `/day/${date}`);

  if (isLoading) {
    return (
      <div aria-busy aria-label="Loading">
        <div className="mb-8 space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-[32rem] rounded-2xl" />
      </div>
    );
  }

  const bigNum = "num text-[1.75rem] leading-none font-semibold sm:text-3xl";

  return (
    <div>
      <PageHeader
        title="History"
        titleTestId="text-history-title"
        description="Every day you've tracked, shaded by how much got done. Tap a day to open it."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label="Days tracked">
          <p className={bigNum}>{tracked.length.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">with at least one task</p>
        </Kpi>
        <Kpi label="Average completion">
          <p className={bigNum}>
            {stats.average ?? "—"}
            {stats.average !== null && <span className="text-[0.6em] text-muted-foreground">%</span>}
          </p>
          <p className="text-xs text-muted-foreground">across tracked days</p>
        </Kpi>
        <Kpi label="90%+ days">
          <p className={bigNum}>{stats.strongDays.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">
            {tracked.length ? `${Math.round((stats.strongDays / tracked.length) * 100)}% of tracked days` : "none yet"}
          </p>
        </Kpi>
        <Kpi label="Current streak">
          <p className={bigNum}>
            {streaks?.streak100 ?? "—"}
            <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">days</span>
          </p>
          <p className="text-xs text-muted-foreground">in a row at 90%+</p>
        </Kpi>
      </div>

      <div className="mt-4 space-y-4 sm:mt-6 sm:space-y-6">
        {years.map((year) => {
          const yearDays = tracked.filter((s) => s.date.startsWith(`${year}-`));
          const yearAvg = average(yearDays.map((s) => s.progress));
          return (
            <section key={year} className="surface p-5 sm:p-6">
              <SectionHeader
                title={<span className="num">{year}</span>}
                description={
                  yearDays.length
                    ? `${yearDays.length} tracked days · ${yearAvg}% average`
                    : "No tracked days"
                }
                actions={
                  year === years[0] && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {PROGRESS_LEGEND.map((l) => (
                      <span key={l.label} className="inline-flex items-center gap-1.5">
                        <span aria-hidden className={cn("size-2.5 rounded-[3px]", l.className)} />
                        {l.label}
                      </span>
                    ))}
                  </div>
                }
              />
              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {Array.from({ length: 12 }, (_, month) => (
                  <MonthGrid
                    key={month}
                    year={year}
                    month={month}
                    progressMap={progressMap}
                    today={today}
                    onDayClick={handleDayClick}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
