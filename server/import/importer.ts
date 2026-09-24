import { db } from "../db.js";
import {
  taskTemplates,
  dailyTasks,
  holidays,
  customStreaks,
  customStreakEntries,
  userSettings,
} from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { groupByDepth, chunk } from "./depth.js";

// Postgres caps prepared-statement parameters at 65535. Daily tasks have ~14
// columns, so 1000 rows = ~14000 params — well under the cap with headroom.
const ROW_CHUNK = 1000;

export interface ImportPayload {
  version: string;
  templates?: ImportedTemplate[];
  dailyTasks?: ImportedDailyTask[];
  holidays?: { date: string }[];
  customStreaks?: ImportedStreak[];
  customStreakEntries?: { streakId: number; date: string }[];
  settings?: { spreadsheetId?: string | null } | null;
}

export interface ImportedTemplate {
  id: number;
  parentId: number | null;
  templateType: string;
  title: string;
  position: number;
}

export interface ImportedDailyTask {
  id: number;
  parentId: number | null;
  date: string;
  title: string;
  status?: string;
  position: number;
  isExempt?: boolean;
  isCollapsed?: boolean;
  deadlineName?: string | null;
  deadlineRepetition?: string | null;
  deadlineOriginalDate?: string | null;
  deadlinePutOffDays?: number | null;
  deadlineBucket?: string | null;
}

export interface ImportedStreak {
  id: number;
  name: string;
  emoji: string;
  position?: number;
  skipWeekends?: boolean;
  entries?: { date: string }[]; // legacy nested format
}

export interface ImportProgress {
  phase:
    | "starting"
    | "clearing"
    | "templates"
    | "dailyTasks"
    | "holidays"
    | "streaks"
    | "streakEntries"
    | "settings"
    | "done";
  done: number;
  total: number;
  message?: string;
}

export type ProgressCallback = (p: ImportProgress) => void;

export interface ImportResult {
  templates: number;
  dailyTasks: number;
  holidays: number;
  customStreaks: number;
  customStreakEntries: number;
}

/**
 * Bulk import a user's exported data.
 *
 * Why this exists: the previous per-row implementation made one INSERT
 * round-trip per task, which timed out Vercel's 60s function limit on real
 * exports (5000+ tasks). This rewrites the path to:
 *   1. Wipe the user's data inside a transaction.
 *   2. Group templates and tasks by parent depth so each level can be
 *      bulk-inserted with a single statement using `.returning()` to learn
 *      the new IDs.
 *   3. Remap parent IDs from the old (export) ID space to the new (DB) ID
 *      space depth-by-depth, then bulk insert children.
 *   4. Bulk insert holidays / streaks / streak entries.
 *   5. Upsert settings.
 *
 * The whole thing runs in a single Drizzle transaction so a failure leaves
 * the user with their original data intact.
 *
 * Pass an `onProgress` callback to stream progress updates (used by the SSE
 * endpoint to drive the client progress bar).
 */
export async function importUserData(
  userId: number,
  payload: ImportPayload,
  onProgress: ProgressCallback = () => {},
): Promise<ImportResult> {
  if (!payload || payload.version !== "1") {
    throw new Error("Invalid export file format");
  }

  const templates = Array.isArray(payload.templates) ? payload.templates : [];
  const tasksIn = Array.isArray(payload.dailyTasks) ? payload.dailyTasks : [];
  const holidaysIn = Array.isArray(payload.holidays) ? payload.holidays : [];
  const streaksIn = Array.isArray(payload.customStreaks) ? payload.customStreaks : [];
  // Streak entries can come from either a flat array or nested under each streak.
  const flatEntries = Array.isArray(payload.customStreakEntries)
    ? payload.customStreakEntries
    : [];
  const nestedEntries: { streakId: number; date: string }[] = [];
  for (const s of streaksIn) {
    if (Array.isArray(s.entries)) {
      for (const e of s.entries) {
        nestedEntries.push({ streakId: s.id, date: e.date });
      }
    }
  }
  const allEntries = [...flatEntries, ...nestedEntries];

  const totalSteps =
    templates.length +
    tasksIn.length +
    holidaysIn.length +
    streaksIn.length +
    allEntries.length +
    1; // settings

  let done = 0;
  const tick = (phase: ImportProgress["phase"], delta: number, message?: string) => {
    done += delta;
    onProgress({ phase, done, total: totalSteps, message });
  };

  onProgress({ phase: "starting", done: 0, total: totalSteps });

  const result: ImportResult = {
    templates: 0,
    dailyTasks: 0,
    holidays: 0,
    customStreaks: 0,
    customStreakEntries: 0,
  };

  await db.transaction(async (tx) => {
    onProgress({ phase: "clearing", done, total: totalSteps, message: "Clearing existing data" });
    await tx.delete(taskTemplates).where(eq(taskTemplates.userId, userId));
    await tx.delete(dailyTasks).where(eq(dailyTasks.userId, userId));
    await tx.delete(holidays).where(eq(holidays.userId, userId));
    // customStreakEntries cascade-delete via FK on customStreaks
    await tx.delete(customStreaks).where(eq(customStreaks.userId, userId));

    // ---- Templates: bulk insert depth-by-depth, remapping parent IDs ----
    const templateIdMap = new Map<number, number>();
    const templateLevels = groupByDepth(templates);
    for (const level of templateLevels) {
      const rows = level.map((t) => ({
        userId,
        templateType: t.templateType,
        parentId: t.parentId ? templateIdMap.get(t.parentId) ?? null : null,
        title: t.title,
        position: t.position,
      }));
      for (const part of chunk(rows, ROW_CHUNK)) {
        const inserted = await tx
          .insert(taskTemplates)
          .values(part)
          .returning({ id: taskTemplates.id });
        // Map old export IDs (level[i]) to new DB IDs (inserted[i]).
        // Slice the level to align with the chunk.
        const offset = rows.indexOf(part[0]);
        for (let i = 0; i < inserted.length; i++) {
          templateIdMap.set(level[offset + i].id, inserted[i].id);
        }
        result.templates += inserted.length;
        tick("templates", inserted.length);
      }
    }

    // ---- Daily tasks: same depth pattern ----
    const taskIdMap = new Map<number, number>();
    const taskLevels = groupByDepth(tasksIn);
    for (const level of taskLevels) {
      const rows = level.map((t) => ({
        userId,
        date: t.date,
        parentId: t.parentId ? taskIdMap.get(t.parentId) ?? null : null,
        title: t.title,
        status: t.status || "incomplete",
        position: t.position,
        isExempt: !!t.isExempt,
        isCollapsed: !!t.isCollapsed,
        templateTaskId: null as number | null,
        deadlineName: t.deadlineName ?? null,
        deadlineRepetition: t.deadlineRepetition ?? null,
        deadlineOriginalDate: t.deadlineOriginalDate ?? null,
        deadlinePutOffDays: t.deadlinePutOffDays ?? null,
        deadlineBucket: t.deadlineBucket ?? null,
      }));
      for (const part of chunk(rows, ROW_CHUNK)) {
        const inserted = await tx
          .insert(dailyTasks)
          .values(part)
          .returning({ id: dailyTasks.id });
        const offset = rows.indexOf(part[0]);
        for (let i = 0; i < inserted.length; i++) {
          taskIdMap.set(level[offset + i].id, inserted[i].id);
        }
        result.dailyTasks += inserted.length;
        tick("dailyTasks", inserted.length);
      }
    }

    // ---- Holidays ----
    const holidayRows = holidaysIn
      .filter((h) => h?.date && /^\d{4}-\d{2}-\d{2}$/.test(h.date))
      .map((h) => ({ userId, date: h.date }));
    for (const part of chunk(holidayRows, ROW_CHUNK)) {
      await tx.insert(holidays).values(part);
      result.holidays += part.length;
      tick("holidays", part.length);
    }

    // ---- Custom streaks ----
    const streakIdMap = new Map<number, number>();
    if (streaksIn.length) {
      const rows = streaksIn.map((s) => ({
        userId,
        name: s.name,
        emoji: s.emoji,
        position: s.position ?? 0,
        skipWeekends: !!s.skipWeekends,
      }));
      for (const part of chunk(rows, ROW_CHUNK)) {
        const inserted = await tx
          .insert(customStreaks)
          .values(part)
          .returning({ id: customStreaks.id });
        const offset = rows.indexOf(part[0]);
        for (let i = 0; i < inserted.length; i++) {
          streakIdMap.set(streaksIn[offset + i].id, inserted[i].id);
        }
        result.customStreaks += inserted.length;
        tick("streaks", inserted.length);
      }
    }

    // ---- Streak entries ----
    const entryRows = allEntries
      .filter((e) => streakIdMap.has(e.streakId) && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
      .map((e) => ({
        streakId: streakIdMap.get(e.streakId)!,
        date: e.date,
      }));
    // Dedupe (streakId, date) — old exports occasionally double-counted.
    const seen = new Set<string>();
    const dedupedEntryRows = entryRows.filter((r) => {
      const k = `${r.streakId}|${r.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    for (const part of chunk(dedupedEntryRows, ROW_CHUNK)) {
      await tx.insert(customStreakEntries).values(part).onConflictDoNothing();
      result.customStreakEntries += part.length;
      tick("streakEntries", part.length);
    }

    // ---- Settings ----
    if (payload.settings && payload.settings.spreadsheetId !== undefined) {
      const existing = await tx
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId));
      if (existing.length) {
        await tx
          .update(userSettings)
          .set({ spreadsheetId: payload.settings.spreadsheetId })
          .where(eq(userSettings.userId, userId));
      } else {
        await tx
          .insert(userSettings)
          .values({ userId, spreadsheetId: payload.settings.spreadsheetId });
      }
    }
    tick("settings", 1);
  });

  onProgress({ phase: "done", done: totalSteps, total: totalSteps });
  return result;
}
