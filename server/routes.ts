import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage.js";
import { setupAuth, isAuthenticated, registerAuthRoutes, type SessionUser } from "./auth/index.js";
import {
  getDeadlinesForDate,
  computeNewDate,
  updateDeadlineDateInSheet,
  removeDeadlineFromSheet,
  addDeadlineToSheet,
  pushBackBucketDeadlines,
  ReauthRequiredError,
} from "./googleSheets.js";
import type { DailyTask, TaskTemplate, User as AppUser } from "../shared/schema.js";
import { importUserData } from "./import/importer.js";

declare global {
  namespace Express {
    interface Request {
      appUser?: AppUser;
    }
  }
}

/**
 * Map a Sheets-touching route error to an HTTP response. ReauthRequiredError
 * becomes a 401 with `{code: "REAUTH_REQUIRED"}` so the client can redirect
 * the user through the OAuth flow to mint a fresh refresh token. Everything
 * else stays a 500 with the original message (preserving previous behavior).
 */
function sendSheetsError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof ReauthRequiredError) {
    res.status(401).json({ message: error.message, code: error.code });
    return;
  }
  const msg = (error as any)?.message || fallback;
  res.status(500).json({ message: msg });
}

async function resolveAppUser(req: Request, res: Response, next: NextFunction) {
  const sessionUser = req.user as SessionUser | undefined;
  if (!sessionUser?.googleId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const user = await storage.getUserByGoogleId(sessionUser.googleId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    req.appUser = user;
    next();
  } catch (err) {
    console.error("Error resolving app user:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

const requireAuth = [isAuthenticated, resolveAppUser] as any;

function getLeafTasks(tasks: DailyTask[]): DailyTask[] {
  const parentIds = new Set(tasks.filter((t) => t.parentId).map((t) => t.parentId));
  return tasks.filter((t) => !parentIds.has(t.id));
}

function computeProgress(tasks: DailyTask[]): number {
  const leaves = getLeafTasks(tasks);
  const countable = leaves.filter((t) => !t.isExempt);
  if (countable.length === 0) return 0;
  const completed = countable.filter((t) => t.status === "complete").length;
  return Math.round((completed / countable.length) * 100);
}

async function updateParentStatus(taskId: number, userId: number, date: string) {
  const allTasks = await storage.getDayTasks(userId, date);
  const task = allTasks.find((t) => t.id === taskId);
  if (!task || !task.parentId) return;

  const siblings = allTasks.filter((t) => t.parentId === task.parentId);
  if (siblings.length === 0) return;

  const effectiveStatus = (s: DailyTask) => s.isExempt ? "complete" : s.status;
  const allDone = siblings.every(
    (s) => effectiveStatus(s) === "complete" || effectiveStatus(s) === "skipped" || effectiveStatus(s) === "partial",
  );
  const allSkipped = siblings.every((s) => effectiveStatus(s) === "skipped");
  const allComplete = siblings.every((s) => effectiveStatus(s) === "complete");
  const hasComplete = siblings.some((s) => effectiveStatus(s) === "complete" || effectiveStatus(s) === "partial");
  const hasSkipped = siblings.some((s) => effectiveStatus(s) === "skipped" || effectiveStatus(s) === "partial");

  let parentStatus: string;
  if (allSkipped) {
    parentStatus = "skipped";
  } else if (allComplete) {
    parentStatus = "complete";
  } else if (allDone && hasComplete && hasSkipped) {
    parentStatus = "partial";
  } else if (allDone && hasComplete) {
    parentStatus = "complete";
  } else if (allDone && hasSkipped) {
    parentStatus = "skipped";
  } else {
    parentStatus = "incomplete";
  }

  await storage.updateDailyTask(task.parentId, { status: parentStatus });
  await updateParentStatus(task.parentId, userId, date);
}

async function cascadeStatusToChildren(taskId: number, userId: number, date: string, status: string) {
  const allTasks = await storage.getDayTasks(userId, date);
  const children = allTasks.filter((t) => t.parentId === taskId);
  for (const child of children) {
    await storage.updateDailyTask(child.id, { status }, userId);
    await cascadeStatusToChildren(child.id, userId, date, status);
  }
}

async function syncDeadlines(userId: number, date: string, tasks: DailyTask[]): Promise<void> {
  const settings = await storage.getSettings(userId);
  if (!settings?.spreadsheetId) return;

  try {
    const deadlines = await getDeadlinesForDate(userId, settings.spreadsheetId, date);

    const existingDeadlinesByName = new Map<string, DailyTask>();
    for (const t of tasks) {
      if (t.deadlineName) {
        existingDeadlinesByName.set(t.deadlineName, t);
      } else if (t.title.startsWith("[Deadline] ")) {
        const name = t.title.replace("[Deadline] ", "");
        if (!existingDeadlinesByName.has(name)) {
          existingDeadlinesByName.set(name, t);
        }
      }
    }

    const sheetDeadlineNames = new Set(deadlines.map((d) => d.name));

    const deadlineTasksByName = new Map<string, DailyTask[]>();
    for (const t of tasks) {
      if (t.title.startsWith("[Deadline] ")) {
        const name = t.deadlineName || t.title.replace("[Deadline] ", "");
        const list = deadlineTasksByName.get(name) || [];
        list.push(t);
        deadlineTasksByName.set(name, list);
      }
    }
    const deletedIds = new Set<number>();
    const entries = Array.from(deadlineTasksByName.values());
    for (const dupes of entries) {
      if (dupes.length > 1) {
        const keep = dupes.find((t: DailyTask) => t.deadlineName) || dupes[0];
        for (const t of dupes) {
          if (t.id !== keep.id) {
            await storage.deleteDailyTask(t.id, userId);
            deletedIds.add(t.id);
          }
        }
      }
    }

    const liveTasks = tasks.filter((t) => !deletedIds.has(t.id));
    existingDeadlinesByName.clear();
    for (const t of liveTasks) {
      if (t.deadlineName) {
        existingDeadlinesByName.set(t.deadlineName, t);
      } else if (t.title.startsWith("[Deadline] ")) {
        const name = t.title.replace("[Deadline] ", "");
        if (!existingDeadlinesByName.has(name)) {
          existingDeadlinesByName.set(name, t);
        }
      }
    }

    const findBucketTask = (bucketName: string, taskList: DailyTask[]): DailyTask | undefined => {
      if (!bucketName) return undefined;
      const lower = bucketName.toLowerCase();
      return taskList.find((t) => t.title.toLowerCase() === lower && !t.deadlineName);
    };

    const childCounters = new Map<number | null, number>();
    for (const t of liveTasks) {
      const key = t.parentId;
      childCounters.set(key, (childCounters.get(key) || 0) + 1);
    }
    const getNextPosition = (parentId: number | null): number => {
      const current = childCounters.get(parentId) || 0;
      childCounters.set(parentId, current + 1);
      return current;
    };

    for (const [name, task] of existingDeadlinesByName) {
      if (!sheetDeadlineNames.has(name) && task.status === "incomplete") {
        await storage.deleteDailyTask(task.id, userId);
        deletedIds.add(task.id);
      }
    }

    for (const dl of deadlines) {
      const existing = existingDeadlinesByName.get(dl.name);
      if (existing && deletedIds.has(existing.id)) continue;

      const bucketTask = findBucketTask(dl.bucket, liveTasks.filter((t) => !deletedIds.has(t.id)));
      const bucketParentId = bucketTask ? bucketTask.id : null;

      if (existing) {
        const updates: Partial<DailyTask> = {
          deadlineName: dl.name,
          deadlineRepetition: dl.repetition,
          deadlineBucket: dl.bucket || null,
        };

        if (dl.bucket && bucketTask && existing.parentId !== bucketTask.id) {
          updates.parentId = bucketTask.id;
          updates.position = getNextPosition(bucketTask.id);
        } else if (!dl.bucket && existing.parentId !== null) {
          updates.parentId = null;
          updates.position = getNextPosition(null);
        }

        if (existing.status === "complete" || existing.status === "skipped") {
          updates.status = "incomplete";
          updates.deadlineOriginalDate = null;
          updates.deadlinePutOffDays = null;
        }

        await storage.updateDailyTask(existing.id, updates, userId);
      } else {
        await storage.createDailyTask({
          userId,
          date,
          parentId: bucketParentId,
          title: `[Deadline] ${dl.name}`,
          status: "incomplete",
          position: getNextPosition(bucketParentId),
          isExempt: false,
          isCollapsed: false,
          templateTaskId: null,
          deadlineName: dl.name,
          deadlineRepetition: dl.repetition,
          deadlineOriginalDate: null,
          deadlineBucket: dl.bucket || null,
        });
      }
    }
  } catch (e) {
    console.error("Failed to fetch deadlines:", e);
  }
}

async function generateDayTasks(userId: number, date: string): Promise<DailyTask[]> {
  const existing = await storage.getDayTasks(userId, date);
  if (existing.length > 0) {
    await syncDeadlines(userId, date, existing);
    return storage.getDayTasks(userId, date);
  }

  const dateObj = new Date(date + "T00:00:00");
  const dayOfWeek = dateObj.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isHol = await storage.isHoliday(userId, date);

  const templateType = isWeekend || isHol ? "weekend" : "weekday";
  const templates = await storage.getTemplates(userId, templateType);

  if (templates.length > 0) {
    const idMapping = new Map<number, number>();
    const rootTemplates = templates.filter((t) => !t.parentId);
    const childTemplates = templates.filter((t) => t.parentId);

    for (const template of rootTemplates) {
      const task = await storage.createDailyTask({
        userId,
        date,
        parentId: null,
        title: template.title,
        status: "incomplete",
        position: template.position,
        isExempt: false,
        isCollapsed: false,
        templateTaskId: template.id,
        deadlineName: null,
        deadlineRepetition: null,
        deadlineOriginalDate: null,
      });
      idMapping.set(template.id, task.id);
    }

    let remaining = [...childTemplates];
    let iterations = 10;
    while (remaining.length > 0 && iterations-- > 0) {
      const next: typeof remaining = [];
      for (const template of remaining) {
        const parentDailyId = idMapping.get(template.parentId!);
        if (parentDailyId !== undefined) {
          const task = await storage.createDailyTask({
            userId,
            date,
            parentId: parentDailyId,
            title: template.title,
            status: "incomplete",
            position: template.position,
            isExempt: false,
            isCollapsed: false,
            templateTaskId: template.id,
            deadlineName: null,
            deadlineRepetition: null,
            deadlineOriginalDate: null,
          });
          idMapping.set(template.id, task.id);
        } else {
          next.push(template);
        }
      }
      remaining = next;
    }
  }

  const currentTasks = await storage.getDayTasks(userId, date);
  await syncDeadlines(userId, date, currentTasks);

  return storage.getDayTasks(userId, date);
}

export async function registerRoutes(app: Express): Promise<void> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.get("/api/templates/:type", requireAuth, async (req, res) => {
    const templates = await storage.getTemplates(
      req.appUser!.id,
      req.params.type as string,
    );
    res.json(templates);
  });

  app.post("/api/templates", requireAuth, async (req, res) => {
    const { templateType, parentId, title, position } = req.body;
    const template = await storage.createTemplate({
      userId: req.appUser!.id,
      templateType,
      parentId: parentId || null,
      title,
      position: position ?? 0,
    });
    res.json(template);
  });

  app.patch("/api/templates/:id", requireAuth, async (req, res) => {
    const updated = await storage.updateTemplate(
      parseInt(req.params.id as string),
      req.body,
      req.appUser!.id,
    );
    res.json(updated);
  });

  app.delete("/api/templates/:id", requireAuth, async (req, res) => {
    await storage.deleteTemplate(parseInt(req.params.id as string), req.appUser!.id);
    res.json({ success: true });
  });

  app.post("/api/templates/reorder", requireAuth, async (req, res) => {
    const { items } = req.body;
    for (const item of items) {
      const updateData: Partial<TaskTemplate> = { position: item.position };
      if ("parentId" in item) {
        updateData.parentId = item.parentId;
      }
      await storage.updateTemplate(item.id, updateData, req.appUser!.id);
    }
    res.json({ success: true });
  });

  app.put("/api/templates/:type/sync", requireAuth, async (req, res) => {
    const userId = req.appUser!.id;
    const templateType = req.params.type as string;
    const { lines } = req.body as { lines: { title: string; depth: number }[] };

    if (!Array.isArray(lines)) {
      return res.status(400).json({ message: "lines must be an array" });
    }

    const validated: { title: string; depth: number }[] = [];
    let maxAllowedDepth = 0;
    for (const line of lines) {
      const title = typeof line.title === "string" ? line.title.trim() : "";
      if (!title) continue;
      const rawDepth = typeof line.depth === "number" ? Math.max(0, Math.floor(line.depth)) : 0;
      const depth = Math.min(rawDepth, maxAllowedDepth);
      validated.push({ title, depth });
      maxAllowedDepth = depth + 1;
    }

    const existing = await storage.getTemplates(userId, templateType);

    const usedIds = new Set<number>();
    const createdItems: { id: number; title: string; parentId: number | null; position: number }[] = [];
    const parentStack: { id: number; depth: number }[] = [];

    for (let i = 0; i < validated.length; i++) {
      const { title, depth } = validated[i];

      while (parentStack.length > 0 && parentStack[parentStack.length - 1].depth >= depth) {
        parentStack.pop();
      }
      const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;

      const siblings = createdItems.filter((c) => c.parentId === parentId);
      const position = siblings.length;

      const reuse = existing.find(
        (c) => !usedIds.has(c.id) && c.title === title && c.parentId === parentId,
      ) || existing.find(
        (c) => !usedIds.has(c.id) && c.title === title,
      );

      let id: number;
      if (reuse) {
        usedIds.add(reuse.id);
        id = reuse.id;
        await storage.updateTemplate(id, { title, parentId, position }, userId);
      } else {
        const created = await storage.createTemplate({
          userId,
          templateType,
          parentId,
          title,
          position,
        });
        id = created.id;
      }

      createdItems.push({ id, title, parentId, position });
      parentStack.push({ id, depth });
    }

    for (const t of existing) {
      if (!usedIds.has(t.id)) {
        await storage.deleteTemplate(t.id, userId);
      }
    }

    const result = await storage.getTemplates(userId, templateType);
    res.json(result);
  });

  app.get("/api/days/:date/tasks", requireAuth, async (req, res) => {
    const tasks = await generateDayTasks(req.appUser!.id, req.params.date as string);
    res.json(tasks);
  });

  app.post("/api/days/:date/reset", requireAuth, async (req, res) => {
    const userId = req.appUser!.id;
    const date = req.params.date as string;
    await storage.deleteDayTasks(userId, date);
    const tasks = await generateDayTasks(userId, date);
    res.json(tasks);
  });

  app.post("/api/days/:date/set-collapse", requireAuth, async (req, res) => {
    const { isCollapsed } = req.body;
    await storage.setCollapseAll(req.appUser!.id, req.params.date as string, !!isCollapsed);
    res.json({ success: true });
  });

  app.post("/api/days/:date/tasks", requireAuth, async (req, res) => {
    const { title, parentId } = req.body;
    const existing = await storage.getDayTasks(req.appUser!.id, req.params.date as string);
    const position = existing.length;

    const task = await storage.createDailyTask({
      userId: req.appUser!.id,
      date: req.params.date as string,
      parentId: parentId || null,
      title,
      status: "incomplete",
      position,
      isExempt: false,
      isCollapsed: false,
      templateTaskId: null,
      deadlineName: null,
      deadlineRepetition: null,
      deadlineOriginalDate: null,
    });
    res.json(task);
  });

  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const updated = await storage.updateDailyTask(id, req.body, req.appUser!.id);

    if (req.body.status) {
      const allTasks = await storage.getDayTasks(req.appUser!.id, updated.date);
      const hasChildren = allTasks.some((t) => t.parentId === id);
      if (hasChildren) {
        await cascadeStatusToChildren(id, req.appUser!.id, updated.date, req.body.status);
      }
      await updateParentStatus(id, req.appUser!.id, updated.date);
    } else if (req.body.isExempt !== undefined) {
      await updateParentStatus(id, req.appUser!.id, updated.date);
    }

    const allTasks = await storage.getDayTasks(req.appUser!.id, updated.date);
    res.json(allTasks);
  });

  app.post("/api/tasks/:id/complete-deadline", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const task = await storage.getDailyTaskById(id, req.appUser!.id);

    if (!task || !task.deadlineName) {
      return res.status(400).json({ message: "Not a deadline task" });
    }

    const settings = await storage.getSettings(req.appUser!.id);
    if (!settings?.spreadsheetId) {
      return res.status(400).json({ message: "No spreadsheet configured" });
    }

    try {
      const rep = task.deadlineRepetition ? parseInt(task.deadlineRepetition) : 0;

      if (!rep || isNaN(rep)) {
        await removeDeadlineFromSheet(
          req.appUser!.id,
          settings.spreadsheetId,
          task.deadlineName,
          task.date,
        );
      } else {
        const newDate = computeNewDate(task.date, rep);
        await updateDeadlineDateInSheet(
          req.appUser!.id,
          settings.spreadsheetId,
          task.deadlineName,
          task.date,
          newDate,
        );
      }

      await storage.updateDailyTask(id, {
        status: "complete",
        deadlineOriginalDate: task.date,
      }, req.appUser!.id);

      await updateParentStatus(id, req.appUser!.id, task.date);

      const allTasks = await storage.getDayTasks(req.appUser!.id, task.date);
      res.json(allTasks);
    } catch (error: any) {
      console.error("Failed to complete deadline:", error);
      sendSheetsError(res, error, "Failed to update spreadsheet");
    }
  });

  app.post("/api/tasks/:id/putoff-deadline", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const { days } = req.body;

    if (!days || typeof days !== "number" || days < 1) {
      return res.status(400).json({ message: "days must be a positive number" });
    }

    const task = await storage.getDailyTaskById(id, req.appUser!.id);
    if (!task || !task.deadlineName) {
      return res.status(400).json({ message: "Not a deadline task" });
    }

    const settings = await storage.getSettings(req.appUser!.id);
    if (!settings?.spreadsheetId) {
      return res.status(400).json({ message: "No spreadsheet configured" });
    }

    try {
      const newDate = computeNewDate(task.date, days);
      await updateDeadlineDateInSheet(
        req.appUser!.id,
        settings.spreadsheetId,
        task.deadlineName,
        task.date,
        newDate,
      );

      if (task.deadlineBucket && task.deadlineBucket.toLowerCase() === "exercise") {
        await pushBackBucketDeadlines(
          req.appUser!.id,
          settings.spreadsheetId,
          task.deadlineBucket,
          days,
          task.deadlineName,
        );
      }

      await storage.updateDailyTask(id, {
        status: "skipped",
        deadlineOriginalDate: task.date,
        deadlinePutOffDays: days,
      }, req.appUser!.id);

      await updateParentStatus(id, req.appUser!.id, task.date);

      const allTasks = await storage.getDayTasks(req.appUser!.id, task.date);
      res.json(allTasks);
    } catch (error: any) {
      console.error("Failed to put off deadline:", error);
      sendSheetsError(res, error, "Failed to update spreadsheet");
    }
  });

  app.post("/api/tasks/:id/undo-deadline", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const task = await storage.getDailyTaskById(id, req.appUser!.id);

    if (!task || !task.deadlineName) {
      return res.status(400).json({ message: "Not a deadline task" });
    }

    if (!task.deadlineOriginalDate) {
      return res.status(400).json({ message: "No original date to restore" });
    }

    const settings = await storage.getSettings(req.appUser!.id);
    if (!settings?.spreadsheetId) {
      return res.status(400).json({ message: "No spreadsheet configured" });
    }

    try {
      const rep = task.deadlineRepetition ? parseInt(task.deadlineRepetition) : 0;
      const wasRemoved = task.status === "complete" && (!rep || isNaN(rep));

      if (wasRemoved) {
        await addDeadlineToSheet(
          req.appUser!.id,
          settings.spreadsheetId,
          task.deadlineName,
          task.deadlineOriginalDate,
          task.deadlineRepetition || "",
          task.deadlineBucket || "",
        );
      } else {
        let currentSheetDate: string;
        if (task.status === "complete" && rep) {
          currentSheetDate = computeNewDate(task.deadlineOriginalDate, rep);
        } else {
          if (task.deadlinePutOffDays) {
            currentSheetDate = computeNewDate(task.deadlineOriginalDate, task.deadlinePutOffDays);
          } else {
            currentSheetDate = computeNewDate(task.deadlineOriginalDate, 1);
          }
        }

        await updateDeadlineDateInSheet(
          req.appUser!.id,
          settings.spreadsheetId,
          task.deadlineName,
          currentSheetDate,
          task.deadlineOriginalDate,
        );
      }

      await storage.updateDailyTask(id, {
        status: "incomplete",
        deadlineOriginalDate: null,
        deadlinePutOffDays: null,
      }, req.appUser!.id);

      await updateParentStatus(id, req.appUser!.id, task.date);

      const allTasks = await storage.getDayTasks(req.appUser!.id, task.date);
      res.json(allTasks);
    } catch (error: any) {
      console.error("Failed to undo deadline:", error);
      sendSheetsError(res, error, "Failed to update spreadsheet");
    }
  });

  app.post("/api/days/:date/reorder", requireAuth, async (req, res) => {
    const { items } = req.body;
    for (const item of items) {
      const updateData: Record<string, any> = { position: item.position };
      if ("parentId" in item) {
        updateData.parentId = item.parentId;
      }
      await storage.updateDailyTask(item.id, updateData, req.appUser!.id);
    }
    const tasks = await storage.getDayTasks(req.appUser!.id, req.params.date as string);
    res.json(tasks);
  });

  app.get("/api/days/summary", requireAuth, async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ message: "start and end required" });
    }
    const days = await storage.getDaysSummary(
      req.appUser!.id,
      start as string,
      end as string,
    );

    const summary = days.map((day) => ({
      date: day.date,
      progress: computeProgress(day.tasks),
      total: getLeafTasks(day.tasks).filter((t) => !t.isExempt).length,
      completed: getLeafTasks(day.tasks).filter(
        (t) => !t.isExempt && t.status === "complete",
      ).length,
    }));

    res.json(summary);
  });

  app.get("/api/days/all-summary", requireAuth, async (req, res) => {
    const days = await storage.getAllUserDays(req.appUser!.id);
    const summary = days.map((day) => ({
      date: day.date,
      progress: computeProgress(day.tasks),
      total: getLeafTasks(day.tasks).filter((t) => !t.isExempt).length,
      completed: getLeafTasks(day.tasks).filter(
        (t) => !t.isExempt && t.status === "complete",
      ).length,
    }));
    res.json(summary);
  });

  app.get("/api/streaks", requireAuth, async (req, res) => {
    const days = await storage.getAllUserDays(req.appUser!.id);
    const progressMap = new Map<string, number>();

    for (const day of days) {
      progressMap.set(day.date, computeProgress(day.tasks));
    }

    const clientDate = req.query.today as string;
    const todayStr = clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate)
      ? clientDate
      : (() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; })();

    function countStreak(threshold: number): number {
      let streak = 0;
      const d = new Date(todayStr + "T12:00:00");
      while (true) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const progress = progressMap.get(dateStr);
        const isToday = dateStr === todayStr;
        if (progress === undefined) {
          if (isToday) {
            d.setDate(d.getDate() - 1);
            continue;
          }
          break;
        }
        if (progress >= threshold) {
          streak++;
          d.setDate(d.getDate() - 1);
        } else if (isToday) {
          d.setDate(d.getDate() - 1);
          continue;
        } else {
          break;
        }
      }
      return streak;
    }

    res.json({
      streak100: countStreak(90),
      streak75: countStreak(75),
      streak50: countStreak(50),
    });
  });

  app.get("/api/holidays", requireAuth, async (req, res) => {
    const h = await storage.getHolidays(req.appUser!.id);
    res.json(h);
  });

  app.post("/api/holidays", requireAuth, async (req, res) => {
    const { date } = req.body;
    const holiday = await storage.createHoliday({
      userId: req.appUser!.id,
      date,
    });
    res.json(holiday);
  });

  app.delete("/api/holidays/:id", requireAuth, async (req, res) => {
    await storage.deleteHoliday(parseInt(req.params.id as string));
    res.json({ success: true });
  });

  app.get("/api/settings", requireAuth, async (req, res) => {
    const settings = await storage.getSettings(req.appUser!.id);
    res.json(settings || { spreadsheetId: null });
  });

  app.patch("/api/settings", requireAuth, async (req, res) => {
    const settings = await storage.upsertSettings(req.appUser!.id, req.body);
    res.json(settings);
  });

  app.get("/api/custom-streaks", requireAuth, async (req, res) => {
    const data = await storage.getCustomStreakData(req.appUser!.id);
    res.json(data);
  });

  app.post("/api/custom-streaks", requireAuth, async (req, res) => {
    const { name, emoji, skipWeekends } = req.body;
    if (!name || !emoji) {
      return res.status(400).json({ message: "Name and emoji are required" });
    }
    const existing = await storage.getCustomStreaks(req.appUser!.id);
    const streak = await storage.createCustomStreak({
      userId: req.appUser!.id,
      name,
      emoji,
      position: existing.length,
      skipWeekends: !!skipWeekends,
    });
    res.json(streak);
  });

  app.delete("/api/custom-streaks/:id", requireAuth, async (req, res) => {
    await storage.deleteCustomStreak(parseInt(req.params.id as string), req.appUser!.id);
    res.json({ success: true });
  });

  app.post("/api/custom-streaks/:id/check-in", requireAuth, async (req, res) => {
    const streakId = parseInt(req.params.id as string);
    const streaks = await storage.getCustomStreaks(req.appUser!.id);
    if (!streaks.find((s) => s.id === streakId)) {
      return res.status(404).json({ message: "Streak not found" });
    }

    const dateStr = req.body.date;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    await storage.addCustomStreakEntry(streakId, dateStr);
    const data = await storage.getCustomStreakData(req.appUser!.id);
    res.json(data);
  });

  app.delete("/api/custom-streaks/:id/check-in", requireAuth, async (req, res) => {
    const streakId = parseInt(req.params.id as string);
    const streaks = await storage.getCustomStreaks(req.appUser!.id);
    if (!streaks.find((s) => s.id === streakId)) {
      return res.status(404).json({ message: "Streak not found" });
    }

    const dateStr = req.body.date;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    await storage.removeCustomStreakEntry(streakId, dateStr);
    const data = await storage.getCustomStreakData(req.appUser!.id);
    res.json(data);
  });

  app.get("/api/export", requireAuth, async (req, res) => {
    const userId = req.appUser!.id;

    const [
      weekdayTemplates,
      weekendTemplates,
      allDays,
      holidays,
      customStreakData,
      settings,
    ] = await Promise.all([
      storage.getTemplates(userId, "weekday"),
      storage.getTemplates(userId, "weekend"),
      storage.getAllUserDays(userId),
      storage.getHolidays(userId),
      storage.getCustomStreakData(userId),
      storage.getSettings(userId),
    ]);

    const templates = [...weekdayTemplates, ...weekendTemplates];
    const dailyTasks = allDays.flatMap((d) => d.tasks);

    const payload = {
      version: "1",
      exportedAt: new Date().toISOString(),
      templates,
      dailyTasks,
      holidays,
      customStreaks: customStreakData.map((sd) => sd.streak),
      customStreakEntries: customStreakData.flatMap((sd) =>
        sd.entries.map((e) => ({ streakId: sd.streak.id, date: e.date })),
      ),
      settings: settings ? { spreadsheetId: settings.spreadsheetId } : null,
    };

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dailydo-export-${dateStr}.json"`,
    );
    res.json(payload);
  });

  app.post("/api/import", requireAuth, async (req, res) => {
    const userId = req.appUser!.id;
    try {
      const result = await importUserData(userId, req.body);
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error("Import failed:", err);
      const status = err?.message?.includes("Invalid export") ? 400 : 500;
      res.status(status).json({ message: err?.message || "Import failed" });
    }
  });

  // Streaming variant — emits Server-Sent Events so the client can render a
  // progress bar. Uses the same importer under the hood.
  app.post("/api/import/stream", requireAuth, async (req, res) => {
    const userId = req.appUser!.id;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Disable proxy buffering so events flush immediately.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let lastSent = 0;
    try {
      const result = await importUserData(userId, req.body, (p) => {
        // Throttle progress events to ~5/sec so we don't drown the wire on
        // huge imports. Always emit phase changes and the final tick.
        const now = Date.now();
        if (
          p.phase === "starting" ||
          p.phase === "done" ||
          p.done === p.total ||
          now - lastSent > 200
        ) {
          send("progress", p);
          lastSent = now;
        }
      });
      send("done", { success: true, ...result });
    } catch (err: any) {
      console.error("Streaming import failed:", err);
      send("error", { message: err?.message || "Import failed" });
    } finally {
      res.end();
    }
  });
}
