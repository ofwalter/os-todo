/** Local YYYY-MM-DD for a Date. */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

/** Today shifted by `days` (negative = past). */
export function offsetDateStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function parseDateStr(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

/** Whole days from today to `dateStr` (positive = future). */
export function daysFromToday(dateStr: string): number {
  const today = parseDateStr(todayStr());
  return Math.round((parseDateStr(dateStr).getTime() - today.getTime()) / 86_400_000);
}

/** "Today", "Yesterday", "Tomorrow", else "Mon, Sep 21". */
export function formatDayLabel(dateStr: string): string {
  const diff = daysFromToday(dateStr);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return parseDateStr(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Consecutive check-in days ending today (or yesterday, if today isn't checked
 * in yet). With `skipWeekends`, weekends and holidays neither count nor break it.
 */
export function computeStreakCount(
  entries: { date: string }[],
  skipWeekends: boolean,
  holidays?: Set<string>,
): number {
  if (entries.length === 0) return 0;
  const dateSet = new Set(entries.map((e) => e.date));
  const isSkippable = (d: Date, s: string) =>
    skipWeekends && (d.getDay() === 0 || d.getDay() === 6 || !!holidays?.has(s));

  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const today = toDateStr(d);
  let count = 0;

  if (dateSet.has(today)) {
    count++;
    d.setDate(d.getDate() - 1);
  } else if (!isSkippable(d, today)) {
    d.setDate(d.getDate() - 1);
  }

  while (true) {
    const s = toDateStr(d);
    if (dateSet.has(s)) count++;
    else if (!isSkippable(d, s)) break;
    d.setDate(d.getDate() - 1);
  }
  return count;
}
