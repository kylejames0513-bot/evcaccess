import Papa from "papaparse";
import type { ImportPreview, ImportPreviewRow } from "@/lib/imports/types";

/** Default column headers until you supply real Paylocity samples. */
const DEFAULT_MAP = {
  employeeId: "Employee ID",
  firstName: "First Name",
  lastName: "Last Name",
  courseName: "Course Name",
  completionDate: "Completion Date",
};

function norm(s: string) {
  return s.trim().toLowerCase();
}

function cell(row: Record<string, string>, key: string, map: Record<string, string>) {
  const header = map[key];
  if (!header) return "";
  const direct = row[header];
  if (direct !== undefined && direct !== "") return String(direct);
  const found = Object.keys(row).find((h) => norm(h) === norm(header));
  return found ? String(row[found] ?? "") : "";
}

export function parsePaylocityCsv(text: string): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) {
    throw new Error(parsed.errors.map((e) => e.message).join("; "));
  }
  return parsed.data;
}

export function previewPaylocityImport(
  rows: Record<string, string>[],
  filename: string,
  orgFieldMap: Record<string, string> = {}
): ImportPreview {
  const map = { ...DEFAULT_MAP, ...orgFieldMap };
  const previewRows: ImportPreviewRow[] = [];
  const noop = 0;
  let wouldInsert = 0;
  let unresolved = 0;
  let unknown = 0;
  for (const row of rows) {
    const employeePaylocityId = cell(row, "employeeId", map);
    const trainingName = cell(row, "courseName", map);
    const completedOn = cell(row, "completionDate", map);
    const key = `${employeePaylocityId}|${trainingName}|${completedOn}|import_paylocity`;
    if (!employeePaylocityId) {
      unresolved += 1;
      previewRows.push({
        key,
        action: "unresolved_person",
        detail: "Missing Employee ID",
      });
      continue;
    }
    if (!trainingName || !completedOn) {
      unknown += 1;
      previewRows.push({
        key,
        employeePaylocityId,
        action: "unknown_training",
        detail: "Missing course or date",
      });
      continue;
    }
    wouldInsert += 1;
    previewRows.push({
      key,
      employeePaylocityId,
      trainingName,
      completedOn,
      action: "insert_completion",
    });
  }
  return {
    source: "paylocity",
    filename,
    rows: previewRows,
    counts: {
      wouldInsert,
      wouldUpdate: 0,
      noop,
      unresolvedPeople: unresolved,
      unknownTrainings: unknown,
      wouldUpsertEmployees: 0,
      invalidEmployeeRows: 0,
    },
  };
}
