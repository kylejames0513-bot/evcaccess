import { describe, it, expect } from "vitest";
import { addDaysLocalYmd, daysBetweenLocalDates, toLocalYmd } from "./date-ymd";

describe("date-ymd", () => {
  it("computes span between yyyy-mm-dd strings in local calendar sense", () => {
    expect(daysBetweenLocalDates("2026-04-01", "2026-04-15")).toBe(14);
    expect(daysBetweenLocalDates("2026-04-15", "2026-04-15")).toBe(0);
  });

  it("adds days in local calendar", () => {
    const base = new Date(2026, 3, 1);
    expect(addDaysLocalYmd(base, 14)).toBe("2026-04-15");
    expect(toLocalYmd(base)).toBe("2026-04-01");
  });
});
