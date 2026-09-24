import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Advance a YYYY-MM-DD date by a repetition. 30 and 365 are treated as
 * "same day next month" and "same day next year"; anything else is days.
 */
export function computeNewDate(currentDate: string, repetitionDays: number): string {
  const d = new Date(currentDate + "T00:00:00");

  if (repetitionDays === 30) {
    d.setMonth(d.getMonth() + 1);
  } else if (repetitionDays === 365) {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setDate(d.getDate() + repetitionDays);
  }

  return formatDateKey(d);
}

export const deadlineInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  dueDate: z.string().regex(DATE_RE, "dueDate must be YYYY-MM-DD"),
  repeatDays: z.number().int().min(0).nullable().optional(),
  bucket: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((b) => b || null),
  isDone: z.boolean().optional(),
});

export const deadlinePatchSchema = deadlineInputSchema.partial();
