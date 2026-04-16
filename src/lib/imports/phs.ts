import Papa from "papaparse";
import type { ImportPreview, ImportPreviewRow } from "@/lib/imports/types";

const DEFAULT_MAP = {
  employeeId: "EmployeeNumber",
  courseName: "CourseTitle",
  completionDate: "CompletionDate",
};

function cell(row: Record<string, string>, key: string, map: Record<string, string>) {
  const header = map[key];
  if (!header) return "";
  const v = row[header];
  if (v !== undefined && v !== "") return String(v);
  const found = Object.keys(row).find((h) => h.replace(/\s+/g, "") === header.replace(/\s+/g, ""));
  return found ? String(row[found] ?? "") : "";
}

export function parsePhsCsv(text: string): Record<string, string>[] {
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

export function previewPhsImport(
  rows: Record<string, string>[],
  filename: string,
  fieldMap: Record<string, string> = {}
): ImportPreview {
  const map = { ...DEFAULT_MAP, ...fieldMap };
  const previewRows: ImportPreviewRow[] = [];
  let wouldInsert = 0;
  const noop = 0;
  let unresolved = 0;
  let unknown = 0;
  for (const row of rows) {
    const employeePaylocityId = cell(row, "employeeId", map);
    const trainingName = cell(row, "courseName", map);
    const completedOn = cell(row, "completionDate", map);
    const key = `${employeePaylocityId}|${trainingName}|${completedOn}|import_phs`;
    if (!employeePaylocityId) {
      unresolved += 1;
      previewRows.push({ key, action: "unresolved_person", detail: "Missing employee number" });
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
    source: "phs",
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
