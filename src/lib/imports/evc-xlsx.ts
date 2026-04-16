import * as XLSX from "xlsx";
import type { EmployeeStatus } from "@/lib/database.types";
import type { ImportPreview, ImportPreviewRow } from "@/lib/imports/types";

/** Only these workbook tabs are read (allowlist). */
export const EVC_MERGED_SHEET = "Merged" as const;
export const EVC_TRAINING_MATRIX_SHEET = "Training" as const;

const TRAINING_SHEET_META_HEADERS = new Set(
  [
    "id",
    "hire date",
    "l name",
    "f name",
    "active",
    "division description",
    "department description",
    "position title",
    "aliases",
  ].map((s) => s.toLowerCase())
);

function norm(s: string) {
  return s.trim().toLowerCase();
}

function parseExcelDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    const js = new Date(Date.UTC(d.y, d.m - 1, d.d));
    return js.toISOString().slice(0, 10);
  }
  const t = String(value).trim();
  if (!t) return null;
  const parsed = Date.parse(t);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

function parseEmployeeStatus(activeCell: unknown): EmployeeStatus {
  const t = String(activeCell ?? "")
    .trim()
    .toLowerCase();
  if (["n", "no", "0", "false", "inactive", "term", "terminated"].includes(t)) {
    return "terminated";
  }
  if (["leave", "on_leave", "loa"].includes(t)) {
    return "on_leave";
  }
  return "active";
}

function getCell(row: Record<string, unknown>, header: string): unknown {
  const direct = row[header];
  if (direct !== undefined && direct !== "") return direct;
  const found = Object.keys(row).find((h) => norm(h) === norm(header));
  return found ? row[found] : "";
}

export function previewEvcMergedEmployeesFromXlsx(buffer: ArrayBuffer, filename: string): ImportPreview {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  if (!wb.SheetNames.includes(EVC_MERGED_SHEET)) {
    throw new Error(`Workbook must contain an allowlisted sheet named "${EVC_MERGED_SHEET}".`);
  }
  const sheet = wb.Sheets[EVC_MERGED_SHEET];
  if (!sheet) throw new Error(`Missing sheet ${EVC_MERGED_SHEET}`);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });

  const previewRows: ImportPreviewRow[] = [];
  let wouldUpsert = 0;
  let invalid = 0;

  for (const row of rows) {
    const paylocity_id = String(getCell(row, "ID") ?? "").trim();
    const last_name = String(getCell(row, "L NAME") ?? "").trim();
    const first_name = String(getCell(row, "F NAME") ?? "").trim();
    const hireRaw = getCell(row, "Hire Date");
    const hireDate = parseExcelDate(hireRaw);
    const division = String(getCell(row, "Division") ?? "").trim();
    const status = parseEmployeeStatus(getCell(row, "ACTIVE"));

    const key = `${paylocity_id}|merged|${filename}`;
    if (!paylocity_id) {
      invalid += 1;
      previewRows.push({
        key,
        action: "invalid_employee_row",
        detail: "Missing ID",
      });
      continue;
    }
    if (!first_name || !last_name) {
      invalid += 1;
      previewRows.push({
        key,
        employeePaylocityId: paylocity_id,
        action: "invalid_employee_row",
        detail: "Missing first or last name",
      });
      continue;
    }
    if (!hireDate) {
      invalid += 1;
      previewRows.push({
        key,
        employeePaylocityId: paylocity_id,
        employeeFirstName: first_name,
        employeeLastName: last_name,
        action: "invalid_employee_row",
        detail: "Missing or invalid hire date",
      });
      continue;
    }

    wouldUpsert += 1;
    previewRows.push({
      key,
      employeePaylocityId: paylocity_id,
      employeeFirstName: first_name,
      employeeLastName: last_name,
      hireDate,
      employeeStatus: status,
      location: division,
      action: "upsert_employee",
    });
  }

  return {
    source: "evc_merged_employees_xlsx",
    filename,
    rows: previewRows,
    counts: {
      wouldInsert: 0,
      wouldUpdate: 0,
      noop: 0,
      unresolvedPeople: 0,
      unknownTrainings: 0,
      wouldUpsertEmployees: wouldUpsert,
      invalidEmployeeRows: invalid,
    },
  };
}

/** Preview cap to keep commit payloads reasonable; re-import can load remaining rows later. */
export const MAX_TRAINING_COMPLETION_PREVIEW_ROWS = 4000;

export function previewEvcTrainingMatrixFromXlsx(buffer: ArrayBuffer, filename: string): ImportPreview {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  if (!wb.SheetNames.includes(EVC_TRAINING_MATRIX_SHEET)) {
    throw new Error(`Workbook must contain an allowlisted sheet named "${EVC_TRAINING_MATRIX_SHEET}".`);
  }
  const sheet = wb.Sheets[EVC_TRAINING_MATRIX_SHEET];
  if (!sheet) throw new Error(`Missing sheet ${EVC_TRAINING_MATRIX_SHEET}`);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });

  const previewRows: ImportPreviewRow[] = [];
  let wouldInsert = 0;

  outer: for (const row of rows) {
    const employeePaylocityId = String(getCell(row, "ID") ?? "").trim();
    if (!employeePaylocityId) continue;

    for (const header of Object.keys(row)) {
      const hNorm = norm(header);
      if (!hNorm || TRAINING_SHEET_META_HEADERS.has(hNorm)) continue;
      const completedOn = parseExcelDate(row[header]);
      if (!completedOn) continue;

      if (wouldInsert >= MAX_TRAINING_COMPLETION_PREVIEW_ROWS) {
        break outer;
      }
      const trainingName = header.trim();
      const key = `${employeePaylocityId}|${trainingName}|${completedOn}|evc_training`;
      wouldInsert += 1;
      previewRows.push({
        key,
        employeePaylocityId,
        trainingName,
        completedOn,
        action: "insert_completion",
      });
    }
  }

  return {
    source: "evc_training_xlsx",
    filename,
    rows: previewRows,
    counts: {
      wouldInsert,
      wouldUpdate: 0,
      noop: 0,
      unresolvedPeople: 0,
      unknownTrainings: 0,
      wouldUpsertEmployees: 0,
      invalidEmployeeRows: 0,
    },
  };
}
