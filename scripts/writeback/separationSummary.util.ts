/**
 * Pure helpers for separation-summary writeback. Extracted so they can be
 * unit-tested without needing Supabase or the actual xlsx file.
 */

export const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

/** EVC fiscal year (FY starts July 1). A date of 2026-07-01 belongs to FY2027. */
export function evcFiscalYear(isoDate: string): number {
  const [y, m] = isoDate.split("-").map((v) => parseInt(v, 10));
  if (!y || !m || m < 1 || m > 12) throw new Error(`Invalid ISO date: ${isoDate}`);
  return m >= 7 ? y + 1 : y;
}

export function monthUpper(isoDate: string): string {
  const [, m] = isoDate.split("-").map((v) => parseInt(v, 10));
  if (!m || m < 1 || m > 12) throw new Error(`Invalid month: ${isoDate}`);
  return MONTH_NAMES[m - 1];
}

export function formatSheetDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

export function lengthOfService(hireIso: string | null | undefined, sepIso: string): string {
  if (!hireIso) return "";
  const sep = new Date(`${sepIso}T00:00:00`);
  const d = new Date(`${hireIso}T00:00:00`);
  if (isNaN(sep.getTime()) || isNaN(d.getTime())) return "";
  let years = sep.getFullYear() - d.getFullYear();
  let months = sep.getMonth() - d.getMonth();
  if (sep.getDate() < d.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${years}y ${months}m`;
}

export function findFYSheetName(sheetNames: string[], fy: number): string | null {
  const pattern = new RegExp(`^FY\\s*${fy}\\b`, "i");
  return sheetNames.find((n) => pattern.test(n.trim())) ?? null;
}

/**
 * Find the header row ("Name" at col 0) and last data row for a month
 * section within the rows of a FY sheet.
 */
export function findMonthBlock(
  rows: unknown[][],
  monthLabel: string,
): { headerIdx: number; lastDataIdx: number } | null {
  const label = monthLabel.toUpperCase();
  let monthRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const a = String(((rows[i] ?? [])[0]) ?? "").trim().toUpperCase();
    if (a.startsWith(label) && /\d{4}$/.test(a)) {
      monthRow = i;
      break;
    }
  }
  if (monthRow === -1) return null;

  let headerIdx = -1;
  for (let i = monthRow + 1; i < Math.min(rows.length, monthRow + 5); i++) {
    const a = String(((rows[i] ?? [])[0]) ?? "").trim().toLowerCase();
    if (a === "name") {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  let lastDataIdx = rows.length - 1;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const a = String(((rows[i] ?? [])[0]) ?? "").trim().toUpperCase();
    if (MONTH_NAMES.some((m) => a.startsWith(m)) && /\d{4}$/.test(a)) {
      lastDataIdx = i - 1;
      break;
    }
    if (/^(fy\s|tor|summary)/i.test(a) && i > headerIdx + 1) {
      lastDataIdx = i - 1;
      break;
    }
  }
  return { headerIdx, lastDataIdx };
}
