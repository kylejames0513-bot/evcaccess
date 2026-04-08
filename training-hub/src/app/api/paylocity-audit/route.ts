import { createServerClient } from "@/lib/supabase";
import { namesMatch, suggestNameMatches, type NameSuggestion } from "@/lib/name-utils";
import { normalizeDate, datesEqual, loadNameMappingsFromSupabase } from "@/lib/import-utils";

// Same mapping as Core.gs PAYLOCITY_SKILL_MAP
export const PAYLOCITY_SKILL_MAP: Record<string, string> = {
  // CPR / First Aid
  "cpr.fa": "CPR",
  "cpr/fa": "CPR",
  "cpr": "CPR",
  "first aid": "FIRSTAID",
  "firstaid": "FIRSTAID",
  "cpr/first aid": "CPR",
  // Med
  "med training": "MED_TRAIN",
  "med cert": "MED_TRAIN",
  "med recert": "MED_TRAIN",
  "medication training": "MED_TRAIN",
  "initial med training": "MED_TRAIN",
  "post med": "POST MED",
  // Core trainings
  "ukeru": "Ukeru",
  "behavior training": "Ukeru",
  "safety care": "Safety Care",
  "mealtime instructions": "Mealtime",
  "mealtime": "Mealtime",
  "pom": "POM",
  "poms": "POM",
  "pers cent thnk": "Pers Cent Thnk",
  "person centered thinking": "Pers Cent Thnk",
  "person centered": "Pers Cent Thnk",
  "meaningful day": "Meaningful Day",
  "md refresh": "MD refresh",
  "rights training": "Rights Training",
  "title vi": "Title VI",
  "active shooter": "Active Shooter",
  "skills system": "Skills System",
  "cpi": "CPI",
  "cpm": "CPM",
  "pfh/didd": "PFH/DIDD",
  // VCRM
  "basic vcrm": "Basic VCRM",
  "advanced vcrm": "Advanced VCRM",
  "adv vcrm": "Advanced VCRM",
  // Other
  "trn": "TRN",
  "asl": "ASL",
  "shift": "SHIFT",
  "adv shift": "ADV SHIFT",
  "advanced shift": "ADV SHIFT",
  "mc": "MC",
  "skills online": "Skills Online",
  "etis": "ETIS",
  // Health / clinical
  "gerd": "GERD",
  "dysphagia": "Dysphagia Overview",
  "dysphagia overview": "Dysphagia Overview",
  "diabetes": "Diabetes",
  "falls": "Falls",
  "health passport": "Health Passport",
  "hco": "HCO Training",
  "hco training": "HCO Training",
};

interface Discrepancy {
  employee: string;
  training: string;
  trainingSheetDate: string;
  paylocityDate: string;
  issue: string; // "mismatch" | "missing_on_training" | "missing_on_paylocity" | "na_but_has_date"
}

/**
 * Build a lookup of active employees with their training data from Supabase.
 */
async function buildTrainingLookup(supabase: ReturnType<typeof createServerClient>) {
  // Fetch active employees
  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name, is_active")
    .order("last_name");

  // Fetch training types
  const { data: trainingTypes } = await supabase
    .from("training_types")
    .select("id, column_key");

  const typeIdToColKey = new Map<string, string>();
  for (const tt of trainingTypes || []) {
    typeIdToColKey.set(tt.id, tt.column_key);
  }

  // Fetch training records for all employees
  const empIds = (employees || []).map((e: any) => e.id);
  const { data: records } = await supabase
    .from("training_records")
    .select("employee_id, training_type_id, completion_date")
    .in("employee_id", empIds);

  const { data: excusals } = await supabase
    .from("excusals")
    .select("employee_id, training_type_id, reason")
    .in("employee_id", empIds);

  // Build empId -> { columnKey -> dateString }
  const empTrainingMap = new Map<string, Record<string, string>>();

  for (const rec of records || []) {
    const colKey = typeIdToColKey.get(rec.training_type_id);
    if (!colKey) continue;
    if (!empTrainingMap.has(rec.employee_id)) empTrainingMap.set(rec.employee_id, {});
    const map = empTrainingMap.get(rec.employee_id)!;
    if (rec.completion_date) {
      const d = new Date(rec.completion_date);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      // Keep latest date
      if (!map[colKey] || new Date(rec.completion_date) > new Date(map[colKey])) {
        map[colKey] = dateStr;
      }
    }
  }

  for (const exc of excusals || []) {
    const colKey = typeIdToColKey.get(exc.training_type_id);
    if (!colKey) continue;
    if (!empTrainingMap.has(exc.employee_id)) empTrainingMap.set(exc.employee_id, {});
    const map = empTrainingMap.get(exc.employee_id)!;
    if (!map[colKey]) {
      map[colKey] = exc.reason || "NA";
    }
  }

  const trainingLookup: Array<{
    name: string;
    row: number;
    values: Record<string, string>;
  }> = [];
  const inactiveNames: string[] = [];

  for (let i = 0; i < (employees || []).length; i++) {
    const emp = employees![i];
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

  return { trainingLookup, inactiveNames };
}

export async function GET() {
  try {
    const supabase = createServerClient();

    // Build training lookup from Supabase
    const { trainingLookup, inactiveNames } = await buildTrainingLookup(supabase);
    const allActiveNames = trainingLookup.map((t) => t.name);

    // Load name mappings from Supabase
    const nameMappings = await loadNameMappingsFromSupabase(supabase);

    // Check if paylocity_imports table exists and has data
    const { data: paylocityRows, error: payError } = await supabase
      .from("paylocity_imports")
      .select("last_name, first_name, preferred_name, skill, effective_date");

    if (payError) {
      return Response.json({
        error: "Could not read paylocity imports. Make sure the paylocity_imports table exists.",
        discrepancies: [],
        noMatch: [],
        summary: { total: 0, mismatches: 0, missingOnTraining: 0, naButHasDate: 0, noMatchCount: 0 },
      });
    }

    if (!paylocityRows || paylocityRows.length === 0) {
      return Response.json({
        error: "Paylocity import table is empty",
        discrepancies: [],
        noMatch: [],
        summary: { total: 0, mismatches: 0, missingOnTraining: 0, naButHasDate: 0, noMatchCount: 0 },
      });
    }

    // Process Paylocity Import rows
    const discrepancies: Discrepancy[] = [];
    const noMatch: Array<{ name: string; skill: string; date: string; suggestions: NameSuggestion[] }> = [];
    const seen = new Map<string, Set<string>>();

    for (const row of paylocityRows) {
      const pLastName = (row.last_name || "").trim();
      const pFirstName = (row.first_name || "").trim();
      const pPrefName = (row.preferred_name || "").trim();
      const skill = (row.skill || "").trim();
      const dateVal = (row.effective_date || "").toString().trim();

      if (!pLastName || !pFirstName || !skill || !dateVal) continue;

      const skillLower = skill.toLowerCase();
      const targetCol = PAYLOCITY_SKILL_MAP[skillLower];
      if (!targetCol) continue;

      const payDate = normalizeDate(dateVal);
      if (!payDate) continue;

      const displayFirst = pPrefName || pFirstName;
      const payName = `${pLastName}, ${displayFirst}`;

      const dedupeKey = `${pLastName.toLowerCase()}|${displayFirst.toLowerCase()}|${targetCol}`;
      if (seen.has(dedupeKey)) continue;
      seen.set(dedupeKey, new Set());

      // Find on Training lookup
      const mappedName = nameMappings.get(payName.toLowerCase()) || nameMappings.get(`${pLastName}, ${pFirstName}`.toLowerCase());
      let match = mappedName
        ? trainingLookup.find((t) => namesMatch(t.name, mappedName))
        : null;

      if (!match) {
        match = trainingLookup.find((t) => namesMatch(t.name, payName) || namesMatch(t.name, `${pLastName}, ${pFirstName}`));
      }

      if (!match) {
        const isInactive = inactiveNames.some((n) => namesMatch(n, payName) || namesMatch(n, `${pLastName}, ${pFirstName}`));
        if (!isInactive) {
          const suggestions = suggestNameMatches(payName, allActiveNames);
          noMatch.push({ name: payName, skill, date: payDate, suggestions });
        }
        continue;
      }

      const trainingVal = match.values[targetCol] || "";
      const trainingDate = trainingVal ? normalizeDate(trainingVal) : "";

      if (!trainingVal) {
        discrepancies.push({
          employee: match.name,
          training: targetCol,
          trainingSheetDate: "(empty)",
          paylocityDate: payDate,
          issue: "missing_on_training",
        });
      } else if (trainingVal.toUpperCase() === "NA" || trainingVal.toUpperCase() === "N/A") {
        discrepancies.push({
          employee: match.name,
          training: targetCol,
          trainingSheetDate: trainingVal,
          paylocityDate: payDate,
          issue: "na_but_has_date",
        });
      } else if (trainingDate && payDate && !datesEqual(trainingDate, payDate)) {
        discrepancies.push({
          employee: match.name,
          training: targetCol,
          trainingSheetDate: trainingDate,
          paylocityDate: payDate,
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
