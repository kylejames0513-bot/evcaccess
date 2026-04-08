import { createServerClient } from "@/lib/supabase";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

// Only these are recognized as valid excusals in the data health scan.
// Everything else gets flagged for review.
const EXCUSAL_CODES = new Set([
  "NA", "N/A",
  "BOARD",
  "FX1", "FX2", "FX3", "FS",
]);

function isExcusal(value: string): boolean {
  return EXCUSAL_CODES.has(value.trim().toUpperCase());
}

function isCleanDate(value: string): boolean {
  const s = value.trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return false;
  const month = parseInt(match[1]);
  const day = parseInt(match[2]);
  const yearStr = match[3];
  const year = yearStr.length === 2 ? (parseInt(yearStr) < 50 ? 2000 + parseInt(yearStr) : 1900 + parseInt(yearStr)) : parseInt(yearStr);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1950 && year <= 2100;
}

function formatDateToMDY(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

export async function GET() {
  try {
    const supabase = createServerClient();

    // Fetch all active employees
    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("id, first_name, last_name, department, is_active")
      .order("last_name");

    if (empError) throw new Error(`Failed to load employees: ${empError.message}`);
    if (!employees || employees.length === 0) {
      return Response.json({
        issues: {
          garbledDates: [],
          duplicateEmployees: [],
          cprFaMismatch: [],
          emptyRows: [],
          missingNames: [],
        },
        summary: { total: 0, garbled: 0, duplicates: 0, mismatches: 0, empty: 0, missing: 0 },
      });
    }

    // Fetch all training types
    const { data: trainingTypes } = await supabase
      .from("training_types")
      .select("id, name, column_key");

    const trainingTypeMap = new Map<string, { id: string; name: string; columnKey: string }>();
    for (const tt of trainingTypes || []) {
      trainingTypeMap.set(tt.id, { id: tt.id, name: tt.name, columnKey: tt.column_key });
    }

    // Build the set of training column keys we care about
    const trainingColKeysSet = new Set(TRAINING_DEFINITIONS.map((d) => d.columnKey));
    trainingColKeysSet.add("FIRSTAID");

    // Find training type IDs for these column keys
    const relevantTypes = new Map<string, string>(); // typeId -> columnKey
    for (const [id, tt] of trainingTypeMap) {
      if (trainingColKeysSet.has(tt.columnKey)) {
        relevantTypes.set(id, tt.columnKey);
      }
    }

    // Fetch all training records
    const employeeIds = employees.map((e: any) => e.id);
    const { data: records } = await supabase
      .from("training_records")
      .select("employee_id, training_type_id, completion_date, source")
      .in("employee_id", employeeIds);

    // Fetch all excusals
    const { data: excusals } = await supabase
      .from("excusals")
      .select("employee_id, training_type_id, reason")
      .in("employee_id", employeeIds);

    // Build employee data map: empId -> { columnKey -> value }
    const empDataMap = new Map<string, Record<string, string>>();

    for (const rec of records || []) {
      const colKey = relevantTypes.get(rec.training_type_id);
      if (!colKey) continue;
      if (!empDataMap.has(rec.employee_id)) empDataMap.set(rec.employee_id, {});
      const existing = empDataMap.get(rec.employee_id)!;
      // Keep latest completion date
      const dateStr = formatDateToMDY(rec.completion_date);
      if (!existing[colKey] || (dateStr && new Date(rec.completion_date) > new Date(existing[colKey]))) {
        existing[colKey] = dateStr;
      }
    }

    for (const exc of excusals || []) {
      const colKey = relevantTypes.get(exc.training_type_id);
      if (!colKey) continue;
      if (!empDataMap.has(exc.employee_id)) empDataMap.set(exc.employee_id, {});
      const existing = empDataMap.get(exc.employee_id)!;
      // Excusal takes priority only if no record date exists
      if (!existing[colKey]) {
        existing[colKey] = exc.reason || "NA";
      }
    }

    const garbledDates: Array<{ row: number; name: string; column: string; value: string; suggestion: string; category: string }> = [];
    const cprFaMismatch: Array<{ row: number; name: string; cprDate: string; faDate: string }> = [];
    const missingNames: number[] = [];

    // For duplicate detection
    const nameRows = new Map<string, number[]>();

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const rowNum = i + 2; // backward compat
      const lastName = (emp.last_name || "").trim();
      const firstName = (emp.first_name || "").trim();
      const name = firstName ? `${lastName}, ${firstName}` : lastName;

      if (!lastName) continue;
      if (!firstName) missingNames.push(rowNum);

      // Track active employees for duplicate check
      if (emp.is_active) {
        const nameKey = name.toLowerCase();
        const existing = nameRows.get(nameKey);
        if (existing) {
          existing.push(rowNum);
        } else {
          nameRows.set(nameKey, [rowNum]);
        }
      }

      // Check training values for this employee
      const empData = empDataMap.get(emp.id) || {};

      for (const colKey of trainingColKeysSet) {
        const value = (empData[colKey] || "").trim();
        if (!value) continue;
        if (isExcusal(value)) continue;
        if (isCleanDate(value)) continue;
        if (/^complete[d]?$/i.test(value)) continue;

        // In Supabase, data should be cleaner, but flag anything unexpected
        garbledDates.push({
          row: rowNum,
          name,
          column: colKey,
          value: value.substring(0, 60),
          suggestion: "",
          category: "other",
        });
      }

      // CPR/FA mismatch check
      const cprVal = (empData["CPR"] || "").trim();
      const faVal = (empData["FIRSTAID"] || "").trim();
      if (cprVal && !isExcusal(cprVal) && !/^complete[d]?$/i.test(cprVal)) {
        if (cprVal !== faVal && !isExcusal(faVal)) {
          cprFaMismatch.push({
            row: rowNum,
            name,
            cprDate: cprVal,
            faDate: faVal || "(empty)",
          });
        }
      }
    }

    // Duplicate employees
    const duplicateEmployees: Array<{ name: string; rows: Array<{ row: number; trainings: Record<string, string> }> }> = [];
    for (const [, rowNums] of nameRows) {
      if (rowNums.length > 1) {
        const empIdx = rowNums[0] - 2;
        const emp = employees[empIdx];
        const displayName = emp.first_name
          ? `${emp.last_name}, ${emp.first_name}`
          : emp.last_name;

        const rowDetails = rowNums.map((rowNum) => {
          const idx = rowNum - 2;
          const e = employees[idx];
          const data = empDataMap.get(e?.id) || {};
          const trainings: Record<string, string> = {};
          for (const colKey of trainingColKeysSet) {
            if (data[colKey]) trainings[colKey] = data[colKey];
          }
          return { row: rowNum, trainings };
        });

        duplicateEmployees.push({ name: displayName, rows: rowDetails });
      }
    }

    const totalIssues =
      garbledDates.length +
      duplicateEmployees.length +
      cprFaMismatch.length +
      0 + // emptyRows - not relevant for Supabase (rows always have structure)
      missingNames.length;

    return Response.json({
      issues: {
        garbledDates,
        duplicateEmployees,
        cprFaMismatch,
        emptyRows: [], // Not applicable with Supabase
        missingNames,
      },
      summary: {
        total: totalIssues,
        garbled: garbledDates.length,
        duplicates: duplicateEmployees.length,
        mismatches: cprFaMismatch.length,
        empty: 0,
        missing: missingNames.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
