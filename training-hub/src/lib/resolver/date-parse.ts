// ============================================================
// Resolver date parsing.
// ============================================================
// Parses every date format the import sources throw at us:
//
//   - YYYY-MM-DD                           (canonical Postgres date)
//   - MM/DD/YYYY                           (Paylocity CSV export)
//   - M/D/YYYY                             (variants from older exports)
//   - YYYY-MM-DDTHH:mm:ss(.sss)Z           (Excel datetime via openpyxl)
//   - Excel serial dates                   (number, days since 1899-12-30)
//   - Date instances                       (already parsed by upstream)
//
// Returns a YYYY-MM-DD string ready to insert into a DATE column, or
// null if the value can't be interpreted. Pure, no Date.now() unless
// the input itself is a Date instance.
// ============================================================

export type DateLike = string | number | Date | null | undefined;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // Excel's day 0 is 1899-12-30

export function parseDate(value: DateLike): string | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return formatDate(value);
  }

  if (typeof value === "number") {
    return parseExcelSerial(value);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  // ISO first.
  const isoMatch = trimmed.match(ISO_DATE);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // US m/d/y.
  const usMatch = trimmed.match(US_DATE);
  if (usMatch) {
    const [, m, d] = usMatch;
    let y = usMatch[3];
    if (y.length === 2) {
      // Two-digit years: 70-99 = 1900s, 00-69 = 2000s. Mirrors xlrd.
      const yy = parseInt(y, 10);
      y = yy >= 70 ? `19${y}` : `20${y.padStart(2, "0")}`;
    }
    const mm = m.padStart(2, "0");
    const dd = d.padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }

  // Last resort: try Date.parse.
  const fallback = new Date(trimmed);
  if (!Number.isNaN(fallback.getTime())) {
    return formatDate(fallback);
  }

  return null;
}

/**
 * Excel stores dates as floating-point days since 1899-12-30 (Excel's
 * day 0). Whole-number days only here; the resolver doesn't care about
 * times.
 */
function parseExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const ms = EXCEL_EPOCH_MS + Math.floor(serial) * 86_400_000;
  const d = new Date(ms);
  return formatDate(d);
}

/**
 * Format a Date as YYYY-MM-DD using its UTC components. We use UTC
 * intentionally so that a date parsed from "2025-09-04 00:00:00" in
 * one timezone doesn't accidentally roll back a day in another.
 */
function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Compute an expiration date by adding `years` years to a parsed
 * completion date. Used when the source doesn't supply expiration
 * (Access tab, signin form) but the training has a renewal_years > 0.
 */
export function addYears(isoDate: string, years: number): string | null {
  const m = isoDate.match(ISO_DATE);
  if (!m) return null;
  const y = parseInt(m[1], 10) + years;
  return `${y}-${m[2]}-${m[3]}`;
}
