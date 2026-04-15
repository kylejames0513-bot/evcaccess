import { daysBetweenLocalDates } from "@/lib/date-ymd";
import { ROSTER_AUTOMATION_FREEZE_DAYS } from "@/lib/training-constants";

/**
 * True when the session is inside the fixed "two-week notice" window
 * (session_date is today through today + ROSTER_AUTOMATION_FREEZE_DAYS inclusive).
 */
export function isAutoRosterLockWithin14Days(todayYmd: string, sessionDateYmd: string): boolean {
  const d = daysBetweenLocalDates(todayYmd, sessionDateYmd);
  return d >= 0 && d <= ROSTER_AUTOMATION_FREEZE_DAYS;
}

/**
 * Effective automation lock: HR flipped manual lock, OR session is within 14 days.
 */
export function isRosterAutomationLocked(
  todayYmd: string,
  sessionDateYmd: string,
  rosterManualLock: boolean
): boolean {
  return rosterManualLock || isAutoRosterLockWithin14Days(todayYmd, sessionDateYmd);
}
