import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { getProgressDotColor } from "@/components/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";

interface DaySummary {
  date: string;
  progress: number;
  total: number;
  completed: number;
}

function getMonthData(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  return { startDow, daysInMonth, firstDay, lastDay };
}

function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "short",
  });
}

function MonthGrid({
  year,
  month,
  progressMap,
  onDayClick,
  boxSize,
  gap,
}: {
  year: number;
  month: number;
  progressMap: Map<string, number>;
  onDayClick: (date: string) => void;
  boxSize: number;
  gap: number;
}) {
  const { startDow, daysInMonth } = getMonthData(year, month);
  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <div>
      <div
        className="text-xs font-medium text-muted-foreground mb-1 text-center"
        style={{ fontSize: Math.max(9, boxSize * 0.7) }}
      >
        {formatMonthLabel(year, month)}
      </div>
      {boxSize >= 10 && (
        <div className="flex" style={{ gap }}>
          {dayNames.map((d, i) => (
            <div
              key={i}
              className="text-center text-muted-foreground/50"
              style={{
                width: boxSize,
                height: boxSize,
                fontSize: Math.max(7, boxSize * 0.55),
                lineHeight: `${boxSize}px`,
              }}
            >
              {d}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col" style={{ gap }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex" style={{ gap }}>
            {week.map((day, di) => {
              if (day === null) {
                return (
                  <div
                    key={di}
                    style={{ width: boxSize, height: boxSize }}
                  />
                );
              }

              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const progress = progressMap.get(dateStr);

              return (
                <div
                  key={di}
                  className={cn(
                    "rounded-sm cursor-pointer transition-transform hover:scale-125",
                    progress !== undefined
                      ? getProgressDotColor(progress)
                      : "bg-gray-100 dark:bg-gray-800/50",
                  )}
                  style={{ width: boxSize, height: boxSize }}
                  title={`${dateStr}: ${progress !== undefined ? `${progress}%` : "No data"}`}
                  onClick={() => onDayClick(dateStr)}
                  data-testid={`history-day-${dateStr}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function YearGrid({
  year,
  progressMap,
  onDayClick,
  boxSize,
  gap,
}: {
  year: number;
  progressMap: Map<string, number>;
  onDayClick: (date: string) => void;
  boxSize: number;
  gap: number;
}) {
  const months: number[][] = [];
  for (let row = 0; row < 4; row++) {
    const rowMonths: number[] = [];
    for (let col = 0; col < 3; col++) {
      rowMonths.push(row * 3 + col);
    }
    months.push(rowMonths);
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-center">{year}</h3>
      <div className="flex flex-col gap-3">
        {months.map((row, ri) => (
          <div key={ri} className="flex gap-4 justify-center flex-wrap">
            {row.map((month) => (
              <MonthGrid
                key={month}
                year={year}
                month={month}
                progressMap={progressMap}
                onDayClick={onDayClick}
                boxSize={boxSize}
                gap={gap}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [, navigate] = useLocation();

  const { data: allSummary, isLoading } = useQuery<DaySummary[]>({
    queryKey: ["/api/days/all-summary"],
  });

  const progressMap = new Map<string, number>();
  allSummary?.forEach((s) => progressMap.set(s.date, s.progress));

  const years = new Set<number>();
  allSummary?.forEach((s) => years.add(new Date(s.date).getFullYear()));

  const currentYear = new Date().getFullYear();
  if (years.size === 0) years.add(currentYear);

  const sortedYears = Array.from(years).sort((a, b) => b - a);

  const yearCount = sortedYears.length;
  let boxSize = 14;
  let gap = 2;
  if (yearCount > 5) {
    boxSize = 10;
    gap = 1;
  }
  if (yearCount > 10) {
    boxSize = 7;
    gap = 1;
  }

  const handleDayClick = (date: string) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    if (date === todayStr) {
      navigate("/");
    } else {
      navigate(`/day/${date}`);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold tracking-tight mb-1" data-testid="text-history-title">
        History
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Your complete progress history, color-coded by daily completion
      </p>

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-800/50" />
          <div className="w-3 h-3 rounded-sm bg-red-500 dark:bg-red-400" />
          <div className="w-3 h-3 rounded-sm bg-orange-500 dark:bg-orange-400" />
          <div className="w-3 h-3 rounded-sm bg-amber-500 dark:bg-amber-400" />
          <div className="w-3 h-3 rounded-sm bg-lime-500 dark:bg-lime-400" />
          <div className="w-3 h-3 rounded-sm bg-emerald-500 dark:bg-emerald-400" />
          <span>More</span>
        </div>
      </div>

      <div className="space-y-8">
        {sortedYears.map((year) => (
          <YearGrid
            key={year}
            year={year}
            progressMap={progressMap}
            onDayClick={handleDayClick}
            boxSize={boxSize}
            gap={gap}
          />
        ))}
      </div>
    </div>
  );
}
