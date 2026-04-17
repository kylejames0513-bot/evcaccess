/**
 * Pure normalization functions for ingestion.
 * Handles dates, status fields, training cell values.
 */

/**
 * Parse any date string encountered in sources.
 * Handles: MM/DD/YYYY, YYYY-MM-DD, M/D/YY, "Jan 15, 2025", Excel serial numbers.
 */
export function parseDate(raw: string | number | null | undefined): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;

  // Excel serial number (number of days since 1900-01-01, with the Lotus 1-2-3 bug)
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 1 && raw < 200000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + raw);
    return epoch;
  }

  const s = String(raw).trim();
  if (!s) return null;

  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
  }

  // US format: M/D/YYYY or MM/DD/YYYY
  const usMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (usMatch) {
    let year = parseInt(usMatch[3], 10);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const month = parseInt(usMatch[1], 10) - 1;
    const day = parseInt(usMatch[2], 10);
    const d = new Date(Date.UTC(year, month, day));
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback: let Date.parse try
  const parsed = Date.parse(s);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }

  return null;
}

/** Format a Date to ISO date string (YYYY-MM-DD) */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Parse training cell value from the Attendance Tracker.
 * Value semantics:
 * - Valid date → compliant
 * - Starts with "FAIL" → failed
 * - Excusal codes (FACILITIES, ELC, LLL, HR, RN, EI, ECF, NA, N/A) → exempt
 * - Blank/empty → skip
 */
export function parseCompletionValue(raw: string | number | null | undefined): {
  status: "compliant" | "failed" | "exempt" | "skip";
  completedOn?: Date;
  exemptReason?: string;
  notes?: string;
} {
  if (raw === null || raw === undefined || raw === "") {
    return { status: "skip" };
  }

  const s = String(raw).trim();
  if (!s) return { status: "skip" };

  // Check for FAIL prefix
  if (s.toUpperCase().startsWith("FAIL")) {
    return { status: "failed", notes: s };
  }

  // Check excusal codes
  const excusalCodes = new Set([
    "FACILITIES", "ELC", "LLL", "HR", "RN", "EI", "ECF", "NA", "N/A",
  ]);
  if (excusalCodes.has(s.toUpperCase())) {
    return { status: "exempt", exemptReason: s.toUpperCase() };
  }

  // Try to parse as date
  const date = parseDate(s);
  if (date) {
    return { status: "compliant", completedOn: date };
  }

  // Unknown value — treat as skip but log
  return { status: "skip", notes: `Unrecognized value: ${s}` };
}

/**
 * Parse employee status from source data.
 * Skip-worthy statuses that should not create completion records.
 */
export function parseEmployeeStatus(
  raw: string | null | undefined
): "active" | "inactive" | "terminated" | "on_leave" | "unknown" {
  const s = String(raw ?? "").trim().toLowerCase();

  if (["active", "a", "yes", "y", "1", "true"].includes(s)) return "active";
  if (["inactive", "i"].includes(s)) return "inactive";
  if (["terminated", "term", "t", "no", "n", "0", "false"].includes(s)) return "terminated";
  if (["on_leave", "leave", "loa", "on leave"].includes(s)) return "on_leave";

  return "unknown";
}

/** Statuses that mean "skip this employee for new completion records" */
export function shouldSkipForCompletions(status: string): boolean {
  const skip = new Set(["terminated", "resigned", "ncns", "quit", "inactive"]);
  return skip.has(status.toLowerCase());
}

/**
 * Normalize a name for comparison.
 * Lowercase, trim, strip apostrophes / hyphens / periods / quotes /
 * parens, collapse whitespace. Keeps letters, digits, and single
 * spaces. Produces the same result for "O'Brien", "OBrien", "obrien"
 * and for "Smith-Jones", "SmithJones", "smithjones".
 */
export function normalizeName(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019'`]/g, "") // curly + straight apostrophes + backtick
    .replace(/["\u201C\u201D()[\]]/g, " ") // quotes + brackets → space
    .replace(/[-_./\\,.]/g, "") // separators that we collapse out
    .replace(/[^\p{L}\p{N}\s]/gu, "") // drop anything else non-alphanumeric (keeps spaces)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a name field that may carry quoted or parenthesized nicknames
 * alongside the legal/formal form.
 *
 *   "Michael"                → { primary: "Michael", variants: [] }
 *   'Michael "Mike"'         → { primary: "Michael", variants: ["Mike"] }
 *   "Michael (Mickey)"       → { primary: "Michael", variants: ["Mickey"] }
 *   'Michael "Mike" (Mickey)'→ { primary: "Michael", variants: ["Mike","Mickey"] }
 *   "Mary Jane"              → { primary: "Mary Jane", variants: [] }
 *
 * Variants preserve the casing from the source so they can be stored
 * on the employee as human-readable aliases. Comparison downstream is
 * always done through `normalizeName`.
 */
export function extractNameVariants(raw: string | null | undefined): {
  primary: string;
  variants: string[];
} {
  const s = String(raw ?? "").trim();
  if (!s) return { primary: "", variants: [] };

  const variants: string[] = [];
  const quoted = [...s.matchAll(/[\u201C"]([^\u201D"]+)[\u201D"]/g)];
  const parened = [...s.matchAll(/\(([^)]+)\)/g)];
  for (const m of quoted) {
    const v = m[1].trim();
    if (v) variants.push(v);
  }
  for (const m of parened) {
    const v = m[1].trim();
    if (v) variants.push(v);
  }

  // Primary = the original string with the quoted/parened chunks removed
  const primary = s
    .replace(/[\u201C"][^\u201D"]+[\u201D"]/g, " ")
    .replace(/\([^)]+\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { primary: primary || s, variants };
}

/**
 * Parse separation type from free text.
 */
export function parseSeparationType(
  raw: string
): "voluntary" | "involuntary" | "layoff" | "retirement" | "end_of_contract" | "job_abandonment" | "death" | "other" {
  const s = raw.trim().toLowerCase();
  if (s.includes("voluntary") && !s.includes("involuntary")) return "voluntary";
  if (s.includes("involuntary")) return "involuntary";
  if (s.includes("layoff") || s.includes("lay off") || s.includes("rif")) return "layoff";
  if (s.includes("retire")) return "retirement";
  if (s.includes("end of contract") || s.includes("contract end")) return "end_of_contract";
  if (s.includes("abandon") || s.includes("ncns") || s.includes("no call")) return "job_abandonment";
  if (s.includes("death") || s.includes("deceased")) return "death";
  return "other";
}

/**
 * Parse rehire eligibility.
 */
export function parseRehireEligible(raw: string): "yes" | "no" | "conditional" {
  const s = raw.trim().toLowerCase();
  if (["yes", "y", "true", "1", "eligible"].includes(s)) return "yes";
  if (["no", "n", "false", "0", "not eligible", "ineligible"].includes(s)) return "no";
  return "conditional";
}

/**
 * Parse exit interview status.
 */
export function parseExitInterviewStatus(
  raw: string
): "completed" | "declined" | "scheduled" | "not_done" {
  const s = raw.trim().toLowerCase();
  if (s.includes("complete") || s.includes("done") || s.includes("yes")) return "completed";
  if (s.includes("decline") || s.includes("refuse")) return "declined";
  if (s.includes("schedule") || s.includes("pending")) return "scheduled";
  return "not_done";
}

/**
 * Compute EVC fiscal year from a date.
 * EVC fiscal year runs July 1 to June 30.
 * A separation on March 15, 2025 → FY 2025 (Jul 2024 - Jun 2025)
 * A separation on August 1, 2025 → FY 2026 (Jul 2025 - Jun 2026)
 */
export function evcFiscalYear(d: Date): number {
  const month = d.getUTCMonth() + 1; // 1-based
  const year = d.getUTCFullYear();
  return month >= 7 ? year + 1 : year;
}
