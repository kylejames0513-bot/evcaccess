import { createServerClient } from "@/lib/supabase";
import { namesMatch } from "@/lib/name-utils";
import { normalizeDate, datesEqual, loadNameMappingsFromSupabase, applyFixesToSupabase } from "@/lib/import-utils";
import { addSyncLogEntry } from "@/lib/hub-settings";
import { PAYLOCITY_SKILL_MAP } from "@/app/api/paylocity-audit/route";

export async function POST() {
  try {
    const supabase = createServerClient();

    // Load name mappings from Supabase
    const nameMappings = await loadNameMappingsFromSupabase(supabase);

    // Fetch active employees with their training data
    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, is_active")
      .eq("is_active", true)
      .order("last_name");

    if (!employees || employees.length === 0) {
      return Response.json({ error: "No active employees found" }, { status: 400 });
    }

    // Fetch training types
    const { data: trainingTypes } = await supabase
      .from("training_types")
      .select("id, column_key");

    const typeIdToColKey = new Map<string, string>();
    const colKeyToTypeId = new Map<string, string>();
    for (const tt of trainingTypes || []) {
      typeIdToColKey.set(tt.id, tt.column_key);
      colKeyToTypeId.set(tt.column_key, tt.id);
    }

    // Fetch existing training records
    const empIds = employees.map((e: any) => e.id);
    const { data: records } = await supabase
      .from("training_records")
      .select("employee_id, training_type_id, completion_date")
      .in("employee_id", empIds);

    const { data: excusals } = await supabase
      .from("excusals")
      .select("employee_id, training_type_id, reason")
      .in("employee_id", empIds);

    // Build lookup: empId -> { columnKey -> dateString }
    const empTrainingMap = new Map<string, Record<string, string>>();
    for (const rec of records || []) {
      const colKey = typeIdToColKey.get(rec.training_type_id);
      if (!colKey) continue;
      if (!empTrainingMap.has(rec.employee_id)) empTrainingMap.set(rec.employee_id, {});
      const map = empTrainingMap.get(rec.employee_id)!;
      if (rec.completion_date) {
        const d = new Date(rec.completion_date);
        map[colKey] = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
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

    // Build training lookup
    const trainingLookup: Array<{ name: string; empId: string; values: Record<string, string> }> = [];
    for (const emp of employees) {
      const last = (emp.last_name || "").trim();
      const first = (emp.first_name || "").trim();
      if (!last) continue;
      trainingLookup.push({
        name: first ? `${last}, ${first}` : last,
        empId: emp.id,
        values: empTrainingMap.get(emp.id) || {},
      });
    }

    // Fetch paylocity import data
    const { data: paylocityRows, error: payError } = await supabase
      .from("paylocity_imports")
      .select("last_name, first_name, preferred_name, skill, effective_date");

    if (payError || !paylocityRows || paylocityRows.length === 0) {
      return Response.json({ error: "Paylocity import table is empty or not found" }, { status: 400 });
    }

    // Process: only auto-apply safe fixes (missing_on_training)
    const fixes: Array<{ employee: string; training: string; date: string }> = [];
    let skippedMismatches = 0;
    let skippedNA = 0;
    let noMatchCount = 0;
    const seen = new Set<string>();

    for (const row of paylocityRows) {
      const pLastName = (row.last_name || "").trim();
      const pFirstName = (row.first_name || "").trim();
      const pPrefName = (row.preferred_name || "").trim();
      const skill = (row.skill || "").trim();
      const dateVal = (row.effective_date || "").toString().trim();

      if (!pLastName || !pFirstName || !skill || !dateVal) continue;

      const targetCol = PAYLOCITY_SKILL_MAP[skill.toLowerCase()];
      if (!targetCol) continue;

      const payDate = normalizeDate(dateVal);
      if (!payDate) continue;

      const displayFirst = pPrefName || pFirstName;
      const payName = `${pLastName}, ${displayFirst}`;
      const dedupeKey = `${pLastName.toLowerCase()}|${displayFirst.toLowerCase()}|${targetCol}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const mappedName = nameMappings.get(payName.toLowerCase()) || nameMappings.get(`${pLastName}, ${pFirstName}`.toLowerCase());
      let match = mappedName ? trainingLookup.find((t) => namesMatch(t.name, mappedName)) : null;
      if (!match) match = trainingLookup.find((t) => namesMatch(t.name, payName) || namesMatch(t.name, `${pLastName}, ${pFirstName}`));

      if (!match) { noMatchCount++; continue; }

      const trainingVal = match.values[targetCol] || "";
      const trainingDate = trainingVal ? normalizeDate(trainingVal) : "";

      if (!trainingVal) {
        // Safe to auto-apply: empty cell, has date on Paylocity
        fixes.push({ employee: match.name, training: targetCol, date: payDate });
      } else if (trainingVal.toUpperCase() === "NA" || trainingVal.toUpperCase() === "N/A") {
        skippedNA++;
      } else if (trainingDate && payDate && !datesEqual(trainingDate, payDate)) {
        skippedMismatches++;
      }
    }

    // Apply fixes to Supabase
    let applied = 0;
    const errors: string[] = [];
    if (fixes.length > 0) {
      const result = await applyFixesToSupabase(supabase, fixes);
      applied = result.matched;
      errors.push(...result.errors);
    }

    // Log the sync
    await addSyncLogEntry({
      timestamp: new Date().toISOString(),
      source: "paylocity",
      applied,
      skipped: skippedMismatches + skippedNA,
      errors: errors.length,
    });

    return Response.json({
      applied,
      skippedMismatches,
      skippedNA,
      noMatchCount,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
