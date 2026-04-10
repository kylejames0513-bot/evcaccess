import { describe, expect, it } from "vitest";
import { classifyTier, tierUrgency } from "./tiers";

const today = new Date(2026, 3, 10); // 2026-04-10

function days(n: number): Date {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
}

describe("classifyTier", () => {
  it("treats null/undefined as ok", () => {
    expect(classifyTier(null, today).tier).toBe("ok");
    expect(classifyTier(undefined, today).tier).toBe("ok");
  });

  it("classifies overdue", () => {
    const r = classifyTier(days(-5), today);
    expect(r.tier).toBe("overdue");
    expect(r.days_overdue).toBe(5);
    expect(r.days_until).toBe(-5);
  });

  it("classifies day 0 as due_30 (not overdue)", () => {
    expect(classifyTier(today, today).tier).toBe("due_30");
  });

  it("classifies day 30 as due_30 (boundary inclusive)", () => {
    expect(classifyTier(days(30), today).tier).toBe("due_30");
  });

  it("classifies day 31 as due_60", () => {
    expect(classifyTier(days(31), today).tier).toBe("due_60");
  });

  it("classifies day 60 as due_60 (boundary inclusive)", () => {
    expect(classifyTier(days(60), today).tier).toBe("due_60");
  });

  it("classifies day 61 as due_90", () => {
    expect(classifyTier(days(61), today).tier).toBe("due_90");
  });

  it("classifies day 90 as due_90 (boundary inclusive)", () => {
    expect(classifyTier(days(90), today).tier).toBe("due_90");
  });

  it("classifies day 91 as ok", () => {
    expect(classifyTier(days(91), today).tier).toBe("ok");
  });

  it("classifies day -1 as overdue with days_overdue=1", () => {
    const r = classifyTier(days(-1), today);
    expect(r.tier).toBe("overdue");
    expect(r.days_overdue).toBe(1);
  });

  it("ignores invalid date strings", () => {
    expect(classifyTier("not-a-date", today).tier).toBe("ok");
  });
});

describe("tierUrgency", () => {
  it("orders overdue first, ok last", () => {
    expect(tierUrgency("overdue")).toBeLessThan(tierUrgency("due_30"));
    expect(tierUrgency("due_30")).toBeLessThan(tierUrgency("due_60"));
    expect(tierUrgency("due_60")).toBeLessThan(tierUrgency("due_90"));
    expect(tierUrgency("due_90")).toBeLessThan(tierUrgency("ok"));
  });
});
