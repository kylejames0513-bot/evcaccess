import { describe, it, expect } from "vitest";
import { isAutoRosterLockWithin14Days, isRosterAutomationLocked } from "./roster-lock";

describe("roster-lock", () => {
  const today = "2026-04-01";

  it("auto lock is true for today through +14 days inclusive", () => {
    expect(isAutoRosterLockWithin14Days(today, "2026-04-01")).toBe(true);
    expect(isAutoRosterLockWithin14Days(today, "2026-04-15")).toBe(true);
    expect(isAutoRosterLockWithin14Days(today, "2026-04-16")).toBe(false);
  });

  it("effective lock is manual OR auto window", () => {
    expect(isRosterAutomationLocked(today, "2026-05-01", false)).toBe(false);
    expect(isRosterAutomationLocked(today, "2026-05-01", true)).toBe(true);
    expect(isRosterAutomationLocked(today, "2026-04-10", false)).toBe(true);
    expect(isRosterAutomationLocked(today, "2026-04-10", true)).toBe(true);
  });
});
