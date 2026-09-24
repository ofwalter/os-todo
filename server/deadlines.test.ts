import { describe, it, expect } from "vitest";
import { computeNewDate, deadlineInputSchema } from "./deadlines.js";

describe("computeNewDate", () => {
  it("adds plain days", () => {
    expect(computeNewDate("2026-09-23", 1)).toBe("2026-09-24");
    expect(computeNewDate("2026-09-23", 7)).toBe("2026-09-30");
    expect(computeNewDate("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("treats 30 as same day next month", () => {
    expect(computeNewDate("2026-01-15", 30)).toBe("2026-02-15");
    expect(computeNewDate("2026-12-01", 30)).toBe("2027-01-01");
  });

  it("treats 365 as same day next year", () => {
    expect(computeNewDate("2026-09-23", 365)).toBe("2027-09-23");
  });
});

describe("deadlineInputSchema", () => {
  it("accepts a minimal deadline and blanks empty buckets", () => {
    const parsed = deadlineInputSchema.parse({ name: " Rent ", dueDate: "2026-10-01", bucket: "" });
    expect(parsed).toMatchObject({ name: "Rent", dueDate: "2026-10-01", bucket: null });
  });

  it("rejects a bad date or empty name", () => {
    expect(deadlineInputSchema.safeParse({ name: "Rent", dueDate: "10/1/2026" }).success).toBe(false);
    expect(deadlineInputSchema.safeParse({ name: "  ", dueDate: "2026-10-01" }).success).toBe(false);
  });
});
