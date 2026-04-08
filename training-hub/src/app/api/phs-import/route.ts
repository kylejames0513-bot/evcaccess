import { createServerClient } from "@/lib/supabase";
import { namesMatch, suggestNameMatches, type NameSuggestion } from "@/lib/name-utils";
import { normalizeDate, datesEqual, loadNameMappingsFromSupabase } from "@/lib/import-utils";

// Maps (Upload Category, Upload Type) → Training column key
const CATEGORY_TYPE_MAP: Record<string, string> = {
  "med admin": "MED_TRAIN",
  "cpr/fa": "CPR",
};

const ADDITIONAL_TRAINING_MAP: Record<string, string | null> = {
  "ukeru": "Ukeru",
  "safety care": "Safety Care",
  "behavior training": "Ukeru",
  "mealtime": "Mealtime",
  "mealtime instructions": "Mealtime",
  "med training": "MED_TRAIN",
  "medication training": "MED_TRAIN",
  "post med": "POST MED",
  "pom": "POM",
  "person centered": "Pers Cent Thnk",
  "person centered thinking": "Pers Cent Thnk",
  "meaningful day": "Meaningful Day",
  "rights training": "Rights Training",
  "rights": "Rights Training",
  "title vi": "Title VI",
  "active shooter": "Active Shooter",
  "skills system": "Skills System",
  "cpm": "CPM",
  "pfh/didd": "PFH/DIDD",
  "basic vcrm": "Basic VCRM",
  "advanced vcrm": "Advanced VCRM",
  "trn": "TRN",
  "asl": "ASL",
  "shift": "SHIFT",
  "gerd": "GERD",
  "dysphagia": "Dysphagia Overview",
  "dysphagia overview": "Dysphagia Overview",
  "diabetes": "Diabetes",
  "falls": "Falls",
  "health passport": "Health Passport",
  "hco": "HCO Training",
  "hco training": "HCO Training",
  "in-service": null,
  "general training": null,
};

function resolveTrainingColumn(category: string, uploadType: string): string | null {
  const catLower = category.toLowerCase().trim();
  const typeLower = uploadType.toLowerCase().trim();

  if (CATEGORY_TYPE_MAP[catLower]) return CATEGORY_TYPE_MAP[catLower];

  if (catLower === "additional training") {
    if (ADDITIONAL_TRAINING_MAP[typeLower] !== undefined) {
      return ADDITIONAL_TRAINING_MAP[typeLower];
    }
    for (const [key, val] of Object.entries(ADDITIONAL_TRAINING_MAP)) {
      if (val && (typeLower.includes(key) || key.includes(typeLower))) return val;
    }
  }

  return null;
}

interface Discrepancy {
  employee: string;
  training: string;
  trainingSheetDate: string;
  phsDate: string;
  issue: "mismatch" | "missing_on_training" | "na_but_has_date";
}

export async function GET() {
  try {
    const supabase = createServerClient();

    // Load name mappings
    const nameMappings = await loadNameMappingsFromSupabase(supabase);

    // Fetch active employees
    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, is_active")
      .order("last_name");

    if (!employees || employees.length === 0) {
      return Response.json({ error: "No employees found" }, { status: 400 });
    }

    // Fetch training types
    const { data: trainingTypes } = await supabase
      .from("training_types")
      .select("id, column_key");

    const typeIdToColKey = new Map<string, string>();
    for (const tt of trainingTypes || []) {
      typeIdToColKey.set(tt.id, tt.column_key);
    }

    // Collect all known training column keys
    const allTrainingCols = new Set<string>([
      ...Object.values(CATEGORY_TYPE_MAP).filter(Boolean),
      ...Object.values(ADDITIONAL_TRAINING_MAP).filter((v): v is string => !!v),
    ]);

    // Fetch training records and excusals
    const empIds = employees.map((e: any) => e.id);
    const { data: records } = await supabase
      .from("training_records")
      .select("employee_id, training_type_id, completion_date")
      .in("employee_id", empIds);

    const { data: excusals } = await supabase
      .from("excusals")
      .select("employee_id, training_type_id, reason")
      .in("employee_id", empIds);

    // Build emp training map
    const empTrainingMap = new Map<string, Record<string, string>>();
    for (const rec of records || []) {
      const colKey = typeIdToColKey.get(rec.training_type_id);
      if (!colKey || !allTrainingCols.has(colKey)) continue;
      if (!empTrainingMap.has(rec.employee_id)) empTrainingMap.set(rec.employee_id, {});
      const map = empTrainingMap.get(rec.employee_id)!;
      if (rec.completion_date) {
        const d = new Date(rec.completion_date);
        map[colKey] = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      }
    }

    for (const exc of excusals || []) {
      const colKey = typeIdToColKey.get(exc.training_type_id);
      if (!colKey || !allTrainingCols.has(colKey)) continue;
      if (!empTrainingMap.has(exc.employee_id)) empTrainingMap.set(exc.employee_id, {});
      const map = empTrainingMap.get(exc.employee_id)!;
      if (!map[colKey]) {
        map[colKey] = exc.reason || "NA";
      }
    }

    // Build training lookup
    const trainingLookup: Array<{
      name: string;
      row: number;
      values: Record<string, string>;
    }> = [];
    const inactiveNames: string[] = [];

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const last = (emp.last_name || "").trim();
      const first = (emp.first_name || "").trim();
      if (!last) continue;
      const name = first ? `${last}, ${first}` : last;

      if (!emp.is_active) {
        inactiveNames.push(name);
        continue;
      }

      trainingLookup.push({
        name,
        row: i + 2,
        values: empTrainingMap.get(emp.id) || {},
      });
    }

    const allActiveNames = trainingLookup.map((t) => t.name);

    // Fetch PHS import data from Supabase
    const { data: phsRows, error: phsError } = await supabase
      .from("phs_imports")
      .select("employee_name, upload_category, upload_type, effective_date, termination_date");

    if (phsError) {
      return Response.json({
        error: "Could not read PHS imports. Make sure the phs_imports table exists.",
        discrepancies: [],
        noMatch: [],
        summary: { total: 0, mismatches: 0, missingOnTraining: 0, naButHasDate: 0, noMatchCount: 0 },
      });
    }

    if (!phsRows || phsRows.length === 0) {
      return Response.json({
        error: "PHS import table is empty",
        discrepancies: [],
        noMatch: [],
        summary: { total: 0, mismatches: 0, missingOnTraining: 0, naButHasDate: 0, noMatchCount: 0 },
      });
    }

    // Deduplicate: best date per (employee, training column)
    type BestRecord = { name: string; category: string; uploadType: string; date: string; timestamp: number };
    const bestRecords = new Map<string, BestRecord>();

    for (const row of phsRows) {
      const empName = (row.employee_name || "").trim();
      const category = (row.upload_category || "").trim();
      const uploadType = (row.upload_type || "").trim();
      const effectiveDateRaw = (row.effective_date || "").toString().trim();
      const terminationDateRaw = (row.termination_date || "").toString().trim();

      if (!empName || !category || !uploadType || !effectiveDateRaw) continue;

      const typeLower = uploadType.toLowerCase();
      if (typeLower === "fail" || typeLower === "no show") continue;
      if (terminationDateRaw) continue;

      const trainingCol = resolveTrainingColumn(category, uploadType);
      if (!trainingCol) continue;

      const normalizedDate = normalizeDate(effectiveDateRaw);
      if (!normalizedDate) continue;

      const parts = normalizedDate.split("/");
      let ts = 0;
      if (parts.length === 3) {
        const [m, d, y] = parts.map(Number);
        ts = new Date(y, m - 1, d).getTime();
      }

      const dedupeKey = `${empName.toLowerCase()}|${trainingCol}`;
      const existing = bestRecords.get(dedupeKey);
      if (!existing || ts > existing.timestamp) {
        bestRecords.set(dedupeKey, { name: empName, category, uploadType, date: normalizedDate, timestamp: ts });
      }
    }

    // Compare each best record against training data
    const discrepancies: Discrepancy[] = [];
    const noMatch: Array<{ name: string; category: string; date: string; suggestions: NameSuggestion[] }> = [];

    for (const [dedupeKey, record] of bestRecords) {
      const trainingCol = dedupeKey.split("|").slice(1).join("|");

      const mappedName = nameMappings.get(record.name.toLowerCase());
      let match = mappedName
        ? trainingLookup.find((t) => namesMatch(t.name, mappedName))
        : null;
      if (!match) {
        match = trainingLookup.find((t) => namesMatch(t.name, record.name));
      }

      if (!match) {
        const isInactive = inactiveNames.some((n) => namesMatch(n, record.name));
        if (!isInactive) {
          noMatch.push({
            name: record.name,
            category: `${record.category} / ${record.uploadType}`,
            date: record.date,
            suggestions: suggestNameMatches(record.name, allActiveNames),
          });
        }
        continue;
      }

      const trainingVal = match.values[trainingCol] || "";
      const trainingDate = trainingVal ? normalizeDate(trainingVal) : "";

      if (!trainingVal) {
        discrepancies.push({
          employee: match.name,
          training: trainingCol,
          trainingSheetDate: "(empty)",
          phsDate: record.date,
          issue: "missing_on_training",
        });
      } else if (trainingVal.toUpperCase() === "NA" || trainingVal.toUpperCase() === "N/A") {
        discrepancies.push({
          employee: match.name,
          training: trainingCol,
          trainingSheetDate: trainingVal,
          phsDate: record.date,
          issue: "na_but_has_date",
        });
      } else if (trainingDate && record.date && !datesEqual(trainingDate, record.date)) {
        discrepancies.push({
          employee: match.name,
          training: trainingCol,
          trainingSheetDate: trainingDate,
          phsDate: record.date,
          issue: "mismatch",
        });
      }
    }

    // Sort: mismatches first, then missing, then NA
    const priority: Record<string, number> = { mismatch: 0, na_but_has_date: 1, missing_on_training: 2 };
    discrepancies.sort((a, b) => (priority[a.issue] ?? 3) - (priority[b.issue] ?? 3));

    return Response.json({
      discrepancies,
      noMatch: noMatch.slice(0, 50),
      summary: {
        total: discrepancies.length,
        mismatches: discrepancies.filter((d) => d.issue === "mismatch").length,
        missingOnTraining: discrepancies.filter((d) => d.issue === "missing_on_training").length,
        naButHasDate: discrepancies.filter((d) => d.issue === "na_but_has_date").length,
        noMatchCount: noMatch.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
