import type {
  Employee,
  EmployeeStatus,
  ImportData,
  ImportSummary,
  RequiredTrainingKey,
  TrainingRecord,
} from "@/lib/training/types";

const REQUIRED_EMPLOYEE_COLUMNS = ["employee_id", "name", "division", "location", "status"] as const;
const REQUIRED_RECORD_COLUMNS = [
  "employee_id",
  "training_key",
  "completed_at",
  "expires_at",
  "source",
] as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      row.push(value.trim());
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.trim());
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((cell) => cell.length > 0));
}

function toNormalizedHeaderMap(headerRow: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((column, index) => {
    map.set(column.trim().toLowerCase(), index);
  });
  return map;
}

function readCell(row: string[], index: number | undefined): string {
  if (index === undefined) {
    return "";
  }
  return (row[index] ?? "").trim();
}

function parseEmployeeStatus(raw: string): EmployeeStatus {
  return raw.toLowerCase() === "inactive" ? "inactive" : "active";
}

function parseTrainingKey(raw: string): RequiredTrainingKey | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "cpi") {
    return "cpi";
  }
  if (normalized === "med" || normalized === "medication") {
    return "med";
  }
  if (normalized === "cpr") {
    return "cpr";
  }
  if (normalized === "abuse") {
    return "abuse";
  }
  if (normalized === "hipaa") {
    return "hipaa";
  }
  return null;
}

function requireColumns(headerMap: Map<string, number>, requiredColumns: readonly string[]): void {
  const missing = requiredColumns.filter((column) => !headerMap.has(column));
  if (missing.length > 0) {
    throw new Error(`Missing required CSV columns: ${missing.join(", ")}`);
  }
}

export function parseImportCsvs(
  employeesCsv: string,
  recordsCsv: string,
): {
  data: ImportData;
  summary: ImportSummary;
} {
  const warnings: string[] = [];

  const employeeRows = parseCsv(employeesCsv);
  const recordRows = parseCsv(recordsCsv);

  if (employeeRows.length === 0) {
    throw new Error("Employees CSV is empty.");
  }
  if (recordRows.length === 0) {
    throw new Error("Records CSV is empty.");
  }

  const employeeHeader = toNormalizedHeaderMap(employeeRows[0]);
  const recordHeader = toNormalizedHeaderMap(recordRows[0]);

  requireColumns(employeeHeader, REQUIRED_EMPLOYEE_COLUMNS);
  requireColumns(recordHeader, REQUIRED_RECORD_COLUMNS);

  const employees: Employee[] = [];
  for (const [index, row] of employeeRows.slice(1).entries()) {
    const employeeId = readCell(row, employeeHeader.get("employee_id"));
    const name = readCell(row, employeeHeader.get("name"));
    const status = parseEmployeeStatus(readCell(row, employeeHeader.get("status")));
    if (!employeeId || !name) {
      warnings.push(`Skipped employee row ${index + 2}: missing employee_id or name.`);
      continue;
    }

    employees.push({
      employeeId,
      name,
      division: readCell(row, employeeHeader.get("division")) || null,
      location: readCell(row, employeeHeader.get("location")) || null,
      status,
    });
  }

  const records: TrainingRecord[] = [];
  for (const [index, row] of recordRows.slice(1).entries()) {
    const employeeId = readCell(row, recordHeader.get("employee_id"));
    const trainingKeyRaw = readCell(row, recordHeader.get("training_key"));
    const trainingKey = parseTrainingKey(trainingKeyRaw);

    if (!employeeId || !trainingKey) {
      warnings.push(
        `Skipped record row ${index + 2}: missing employee_id or unsupported training_key (${trainingKeyRaw || "blank"}).`,
      );
      continue;
    }

    records.push({
      employeeId,
      trainingKey,
      completedAt: readCell(row, recordHeader.get("completed_at")) || null,
      expiresAt: readCell(row, recordHeader.get("expires_at")) || null,
      source: readCell(row, recordHeader.get("source")) || null,
    });
  }

  return {
    data: {
      employees,
      records,
    },
    summary: {
      employeeCount: employees.length,
      recordCount: records.length,
      warningCount: warnings.length,
      warnings,
    },
  };
}
