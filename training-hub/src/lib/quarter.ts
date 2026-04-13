/**
 * Quarterly look-ahead helpers.
 *
 * "Quarterly" trainings (e.g. Med Recert) run once per calendar quarter,
 * so the scheduler needs to enroll anyone whose cert expires before the
 * NEXT quarter's class. We look through the end of the next calendar
 * quarter from the reference date.
 *
 *   Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec
 *
 * Examples (reference -> end of next quarter):
 *   2026-04-13 (Q2) -> 2026-09-30 (end of Q3)
 *   2026-11-15 (Q4) -> 2027-03-31 (end of Q1 next year)
 */

export function endOfNextCalendarQuarter(ref: Date): Date {
  const year = ref.getFullYear();
  const currentQuarter = Math.floor(ref.getMonth() / 3); // 0..3
  const nextQuarter = currentQuarter + 1;                // 1..4
  const nextYear = nextQuarter > 3 ? year + 1 : year;
  const nextQuarterIdx = nextQuarter > 3 ? 0 : nextQuarter; // 0..3
  const lastMonthOfNextQuarter = nextQuarterIdx * 3 + 2;    // 2,5,8,11
  // Day 0 of the month after = last day of lastMonthOfNextQuarter
  return new Date(nextYear, lastMonthOfNextQuarter + 1, 0);
}
