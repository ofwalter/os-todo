import { pgTable, text, integer, boolean, serial, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export { sessions } from "./models/auth.js";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
});

export const taskTemplates = pgTable("task_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  templateType: text("template_type").notNull(),
  parentId: integer("parent_id"),
  title: text("title").notNull(),
  position: integer("position").notNull().default(0),
});

export const dailyTasks = pgTable("daily_tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
  parentId: integer("parent_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("incomplete"),
  position: integer("position").notNull().default(0),
  isExempt: boolean("is_exempt").notNull().default(false),
  isCollapsed: boolean("is_collapsed").notNull().default(false),
  templateTaskId: integer("template_task_id"),
  deadlineName: text("deadline_name"),
  deadlineRepetition: text("deadline_repetition"),
  deadlineOriginalDate: text("deadline_original_date"),
  deadlinePutOffDays: integer("deadline_put_off_days"),
  deadlineBucket: text("deadline_bucket"),
  deadlineId: integer("deadline_id"),
});

// Recurring deadlines & chores. A deadline shows up as a task on the day it's
// due; completing it advances `dueDate` by `repeatDays` (or marks a one-off
// deadline done), putting it off pushes `dueDate` forward.
export const deadlines = pgTable("deadlines", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  dueDate: text("due_date").notNull(),
  // null/0 = one-off. 30 = monthly, 365 = yearly, anything else = every N days.
  repeatDays: integer("repeat_days"),
  // Title of a top-level task to nest this deadline under, if present that day.
  bucket: text("bucket"),
  isDone: boolean("is_done").notNull().default(false),
});

export const holidays = pgTable("holidays", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
}, (table) => [
  unique("holidays_user_date_unique").on(table.userId, table.date),
]);

export const customStreaks = pgTable("custom_streaks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  position: integer("position").notNull().default(0),
  skipWeekends: boolean("skip_weekends").notNull().default(false),
});

export const customStreakEntries = pgTable("custom_streak_entries", {
  id: serial("id").primaryKey(),
  streakId: integer("streak_id").notNull().references(() => customStreaks.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
}, (table) => [
  unique("custom_streak_entries_streak_date_unique").on(table.streakId, table.date),
]);

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertTaskTemplateSchema = createInsertSchema(taskTemplates).omit({ id: true });
export const insertDailyTaskSchema = createInsertSchema(dailyTasks).omit({ id: true });
export const insertHolidaySchema = createInsertSchema(holidays).omit({ id: true });
export const insertDeadlineSchema = createInsertSchema(deadlines).omit({ id: true });
export const insertCustomStreakSchema = createInsertSchema(customStreaks).omit({ id: true });
export const insertCustomStreakEntrySchema = createInsertSchema(customStreakEntries).omit({ id: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type InsertTaskTemplate = z.infer<typeof insertTaskTemplateSchema>;
export type DailyTask = typeof dailyTasks.$inferSelect;
export type InsertDailyTask = z.infer<typeof insertDailyTaskSchema>;
export type Holiday = typeof holidays.$inferSelect;
export type InsertHoliday = z.infer<typeof insertHolidaySchema>;
export type Deadline = typeof deadlines.$inferSelect;
export type InsertDeadline = z.infer<typeof insertDeadlineSchema>;
export type CustomStreak = typeof customStreaks.$inferSelect;
export type InsertCustomStreak = z.infer<typeof insertCustomStreakSchema>;
export type CustomStreakEntry = typeof customStreakEntries.$inferSelect;
export type InsertCustomStreakEntry = z.infer<typeof insertCustomStreakEntrySchema>;

export type TaskStatus = "incomplete" | "complete" | "skipped" | "partial";
export type TemplateType = "weekday" | "weekend";
