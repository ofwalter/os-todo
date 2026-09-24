import { db } from "./db.js";
import { eq, and, asc, gte, lte, desc } from "drizzle-orm";
import {
  users,
  taskTemplates,
  dailyTasks,
  holidays,
  deadlines,
  customStreaks,
  customStreakEntries,
} from "../shared/schema.js";
import type {
  User,
  InsertUser,
  TaskTemplate,
  InsertTaskTemplate,
  DailyTask,
  InsertDailyTask,
  Holiday,
  InsertHoliday,
  Deadline,
  InsertDeadline,
  CustomStreak,
  InsertCustomStreak,
  CustomStreakEntry,
} from "../shared/schema.js";

export interface IStorage {
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  deleteAllUserTemplates(userId: number): Promise<void>;
  deleteAllUserDailyTasks(userId: number): Promise<void>;
  setCollapseAll(userId: number, date: string, isCollapsed: boolean): Promise<void>;
  deleteAllUserHolidays(userId: number): Promise<void>;
  deleteAllUserCustomStreaks(userId: number): Promise<void>;

  getTemplates(userId: number, type: string): Promise<TaskTemplate[]>;
  createTemplate(template: InsertTaskTemplate): Promise<TaskTemplate>;
  updateTemplate(id: number, data: Partial<TaskTemplate>, userId?: number): Promise<TaskTemplate>;
  deleteTemplate(id: number, userId: number): Promise<void>;
  deleteTemplatesByParent(parentId: number, userId: number): Promise<void>;

  getDayTasks(userId: number, date: string): Promise<DailyTask[]>;
  getDailyTaskById(id: number, userId: number): Promise<DailyTask | undefined>;
  createDailyTask(task: InsertDailyTask): Promise<DailyTask>;
  updateDailyTask(id: number, data: Partial<DailyTask>, userId?: number): Promise<DailyTask>;
  deleteDailyTask(id: number, userId: number): Promise<void>;
  deleteDayTasks(userId: number, date: string): Promise<void>;
  getAllUserDays(userId: number): Promise<{ date: string; tasks: DailyTask[] }[]>;
  getDaysSummary(userId: number, startDate: string, endDate: string): Promise<{ date: string; tasks: DailyTask[] }[]>;

  getHolidays(userId: number): Promise<Holiday[]>;
  createHoliday(holiday: InsertHoliday): Promise<Holiday>;
  deleteHoliday(id: number): Promise<void>;
  isHoliday(userId: number, date: string): Promise<boolean>;

  getDeadlines(userId: number): Promise<Deadline[]>;
  getDeadlineById(id: number, userId: number): Promise<Deadline | undefined>;
  getDeadlinesDueOn(userId: number, date: string): Promise<Deadline[]>;
  createDeadline(deadline: InsertDeadline): Promise<Deadline>;
  updateDeadline(id: number, data: Partial<Deadline>, userId: number): Promise<Deadline | undefined>;
  deleteDeadline(id: number, userId: number): Promise<void>;

  getCustomStreaks(userId: number): Promise<CustomStreak[]>;
  createCustomStreak(streak: InsertCustomStreak): Promise<CustomStreak>;
  deleteCustomStreak(id: number, userId: number): Promise<void>;
  getCustomStreakEntries(streakId: number): Promise<CustomStreakEntry[]>;
  addCustomStreakEntry(streakId: number, date: string): Promise<CustomStreakEntry>;
  removeCustomStreakEntry(streakId: number, date: string): Promise<void>;
  getCustomStreakData(userId: number): Promise<{ streak: CustomStreak; entries: CustomStreakEntry[] }[]>;
}

class DatabaseStorage implements IStorage {
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async deleteAllUserTemplates(userId: number): Promise<void> {
    await db.delete(taskTemplates).where(eq(taskTemplates.userId, userId));
  }

  async deleteAllUserDailyTasks(userId: number): Promise<void> {
    await db.delete(dailyTasks).where(eq(dailyTasks.userId, userId));
  }

  async deleteAllUserHolidays(userId: number): Promise<void> {
    await db.delete(holidays).where(eq(holidays.userId, userId));
  }

  async deleteAllUserCustomStreaks(userId: number): Promise<void> {
    await db.delete(customStreaks).where(eq(customStreaks.userId, userId));
  }

  async getTemplates(userId: number, type: string): Promise<TaskTemplate[]> {
    return db
      .select()
      .from(taskTemplates)
      .where(
        and(
          eq(taskTemplates.userId, userId),
          eq(taskTemplates.templateType, type),
        ),
      )
      .orderBy(asc(taskTemplates.position));
  }

  async createTemplate(template: InsertTaskTemplate): Promise<TaskTemplate> {
    const [created] = await db
      .insert(taskTemplates)
      .values(template)
      .returning();
    return created;
  }

  async updateTemplate(
    id: number,
    data: Partial<TaskTemplate>,
    userId?: number,
  ): Promise<TaskTemplate> {
    const conditions = userId
      ? and(eq(taskTemplates.id, id), eq(taskTemplates.userId, userId))
      : eq(taskTemplates.id, id);
    const [updated] = await db
      .update(taskTemplates)
      .set(data)
      .where(conditions)
      .returning();
    return updated;
  }

  async deleteTemplatesByParent(parentId: number, userId: number): Promise<void> {
    const children = await db
      .select()
      .from(taskTemplates)
      .where(and(eq(taskTemplates.parentId, parentId), eq(taskTemplates.userId, userId)));
    for (const child of children) {
      await this.deleteTemplatesByParent(child.id, userId);
    }
    await db
      .delete(taskTemplates)
      .where(and(eq(taskTemplates.parentId, parentId), eq(taskTemplates.userId, userId)));
  }

  async deleteTemplate(id: number, userId: number): Promise<void> {
    await this.deleteTemplatesByParent(id, userId);
    await db.delete(taskTemplates).where(and(eq(taskTemplates.id, id), eq(taskTemplates.userId, userId)));
  }

  async getDayTasks(userId: number, date: string): Promise<DailyTask[]> {
    return db
      .select()
      .from(dailyTasks)
      .where(
        and(eq(dailyTasks.userId, userId), eq(dailyTasks.date, date)),
      )
      .orderBy(asc(dailyTasks.position));
  }

  async getDailyTaskById(id: number, userId: number): Promise<DailyTask | undefined> {
    const [task] = await db
      .select()
      .from(dailyTasks)
      .where(and(eq(dailyTasks.id, id), eq(dailyTasks.userId, userId)));
    return task;
  }

  async createDailyTask(task: InsertDailyTask): Promise<DailyTask> {
    const [created] = await db.insert(dailyTasks).values(task).returning();
    return created;
  }

  async updateDailyTask(
    id: number,
    data: Partial<DailyTask>,
    userId?: number,
  ): Promise<DailyTask> {
    const conditions = userId
      ? and(eq(dailyTasks.id, id), eq(dailyTasks.userId, userId))
      : eq(dailyTasks.id, id);
    const [updated] = await db
      .update(dailyTasks)
      .set(data)
      .where(conditions)
      .returning();
    return updated;
  }

  async setCollapseAll(userId: number, date: string, isCollapsed: boolean): Promise<void> {
    await db
      .update(dailyTasks)
      .set({ isCollapsed })
      .where(and(eq(dailyTasks.userId, userId), eq(dailyTasks.date, date)));
  }

  async deleteDailyTask(id: number, userId: number): Promise<void> {
    await db
      .delete(dailyTasks)
      .where(and(eq(dailyTasks.id, id), eq(dailyTasks.userId, userId)));
  }

  async deleteDayTasks(userId: number, date: string): Promise<void> {
    await db
      .delete(dailyTasks)
      .where(and(eq(dailyTasks.userId, userId), eq(dailyTasks.date, date)));
  }

  async getAllUserDays(userId: number): Promise<{ date: string; tasks: DailyTask[] }[]> {
    const allTasks = await db
      .select()
      .from(dailyTasks)
      .where(eq(dailyTasks.userId, userId))
      .orderBy(asc(dailyTasks.date), asc(dailyTasks.position));

    const grouped = new Map<string, DailyTask[]>();
    for (const task of allTasks) {
      if (!grouped.has(task.date)) grouped.set(task.date, []);
      grouped.get(task.date)!.push(task);
    }

    return Array.from(grouped.entries())
      .map(([date, tasks]) => ({ date, tasks }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getDaysSummary(
    userId: number,
    startDate: string,
    endDate: string,
  ): Promise<{ date: string; tasks: DailyTask[] }[]> {
    const tasks = await db
      .select()
      .from(dailyTasks)
      .where(
        and(
          eq(dailyTasks.userId, userId),
          gte(dailyTasks.date, startDate),
          lte(dailyTasks.date, endDate),
        ),
      )
      .orderBy(asc(dailyTasks.date), asc(dailyTasks.position));

    const grouped = new Map<string, DailyTask[]>();
    for (const task of tasks) {
      if (!grouped.has(task.date)) grouped.set(task.date, []);
      grouped.get(task.date)!.push(task);
    }

    return Array.from(grouped.entries())
      .map(([date, tasks]) => ({ date, tasks }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getHolidays(userId: number): Promise<Holiday[]> {
    return db.select().from(holidays).where(eq(holidays.userId, userId));
  }

  async createHoliday(holiday: InsertHoliday): Promise<Holiday> {
    const [created] = await db.insert(holidays).values(holiday).returning();
    return created;
  }

  async deleteHoliday(id: number): Promise<void> {
    await db.delete(holidays).where(eq(holidays.id, id));
  }

  async isHoliday(userId: number, date: string): Promise<boolean> {
    const [holiday] = await db
      .select()
      .from(holidays)
      .where(and(eq(holidays.userId, userId), eq(holidays.date, date)));
    return !!holiday;
  }

  async getDeadlines(userId: number): Promise<Deadline[]> {
    return db
      .select()
      .from(deadlines)
      .where(eq(deadlines.userId, userId))
      .orderBy(asc(deadlines.dueDate), asc(deadlines.name));
  }

  async getDeadlineById(id: number, userId: number): Promise<Deadline | undefined> {
    const [deadline] = await db
      .select()
      .from(deadlines)
      .where(and(eq(deadlines.id, id), eq(deadlines.userId, userId)));
    return deadline;
  }

  async getDeadlinesDueOn(userId: number, date: string): Promise<Deadline[]> {
    return db
      .select()
      .from(deadlines)
      .where(
        and(
          eq(deadlines.userId, userId),
          eq(deadlines.dueDate, date),
          eq(deadlines.isDone, false),
        ),
      )
      .orderBy(asc(deadlines.name));
  }

  async createDeadline(deadline: InsertDeadline): Promise<Deadline> {
    const [created] = await db.insert(deadlines).values(deadline).returning();
    return created;
  }

  async updateDeadline(
    id: number,
    data: Partial<Deadline>,
    userId: number,
  ): Promise<Deadline | undefined> {
    const [updated] = await db
      .update(deadlines)
      .set(data)
      .where(and(eq(deadlines.id, id), eq(deadlines.userId, userId)))
      .returning();
    return updated;
  }

  async deleteDeadline(id: number, userId: number): Promise<void> {
    await db
      .delete(deadlines)
      .where(and(eq(deadlines.id, id), eq(deadlines.userId, userId)));
  }

  async getCustomStreaks(userId: number): Promise<CustomStreak[]> {
    return db
      .select()
      .from(customStreaks)
      .where(eq(customStreaks.userId, userId))
      .orderBy(asc(customStreaks.position));
  }

  async createCustomStreak(streak: InsertCustomStreak): Promise<CustomStreak> {
    const [created] = await db.insert(customStreaks).values(streak).returning();
    return created;
  }

  async deleteCustomStreak(id: number, userId: number): Promise<void> {
    await db
      .delete(customStreaks)
      .where(and(eq(customStreaks.id, id), eq(customStreaks.userId, userId)));
  }

  async getCustomStreakEntries(streakId: number): Promise<CustomStreakEntry[]> {
    return db
      .select()
      .from(customStreakEntries)
      .where(eq(customStreakEntries.streakId, streakId))
      .orderBy(desc(customStreakEntries.date));
  }

  async addCustomStreakEntry(streakId: number, date: string): Promise<CustomStreakEntry> {
    const [entry] = await db
      .insert(customStreakEntries)
      .values({ streakId, date })
      .onConflictDoNothing()
      .returning();
    if (!entry) {
      const [existing] = await db
        .select()
        .from(customStreakEntries)
        .where(and(eq(customStreakEntries.streakId, streakId), eq(customStreakEntries.date, date)));
      return existing;
    }
    return entry;
  }

  async removeCustomStreakEntry(streakId: number, date: string): Promise<void> {
    await db
      .delete(customStreakEntries)
      .where(and(eq(customStreakEntries.streakId, streakId), eq(customStreakEntries.date, date)));
  }

  async getCustomStreakData(userId: number): Promise<{ streak: CustomStreak; entries: CustomStreakEntry[] }[]> {
    const streaks = await this.getCustomStreaks(userId);
    const result: { streak: CustomStreak; entries: CustomStreakEntry[] }[] = [];
    for (const streak of streaks) {
      const entries = await this.getCustomStreakEntries(streak.id);
      result.push({ streak, entries });
    }
    return result;
  }
}

export const storage = new DatabaseStorage();
