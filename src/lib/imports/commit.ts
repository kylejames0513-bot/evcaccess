import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompletionSource, Database, ImportSource } from "@/lib/database.types";
import type { ImportPreview } from "@/lib/imports/types";

function parseLocalDate(s: string): string | null {
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function importRunSource(preview: ImportPreview): ImportSource {
  return preview.source;
}

function completionSourceForPreview(preview: ImportPreview): CompletionSource {
  if (preview.source === "paylocity") return "import_paylocity";
  if (preview.source === "phs") return "import_phs";
  if (preview.source === "evc_training_xlsx") return "import_evc_training";
  return "manual";
}

export async function commitImportPreview(input: {
  supabase: SupabaseClient<Database>;
  orgId: string;
  preview: ImportPreview;
  triggeredBy: string | null;
}): Promise<{ importRunId: string; inserted: number; updated: number; noop: number }> {
  const { supabase, orgId, preview, triggeredBy } = input;
  const source = importRunSource(preview);

  const { data: runRow, error: runErr } = await supabase
    .from("import_runs")
    .insert({
      org_id: orgId,
      source,
      filename: preview.filename,
      status: "running",
      triggered_by: triggeredBy,
    })
    .select("id")
    .single();
  if (runErr || !runRow) throw runErr ?? new Error("import run");

  if (preview.source === "evc_merged_employees_xlsx") {
    let inserted = 0;
    let updated = 0;
    let invalid = 0;

    for (const row of preview.rows) {
      if (row.action === "invalid_employee_row") {
        invalid += 1;
        continue;
      }
      if (row.action !== "upsert_employee") continue;

      const pid = row.employeePaylocityId?.trim();
      const first = row.employeeFirstName?.trim();
      const last = row.employeeLastName?.trim();
      const hire = row.hireDate ? parseLocalDate(row.hireDate) : null;
      if (!pid || !first || !last || !hire) {
        invalid += 1;
        continue;
      }

      const { data: existing } = await supabase
        .from("employees")
        .select("id")
        .eq("org_id", orgId)
        .eq("paylocity_id", pid)
        .maybeSingle();

      const payload = {
        org_id: orgId,
        paylocity_id: pid,
        first_name: first,
        last_name: last,
        hire_date: hire,
        status: row.employeeStatus ?? "active",
        location: (row.location ?? "").trim(),
        position: "",
      };

      if (existing?.id) {
        const { error: upErr } = await supabase
          .from("employees")
          .update({
            first_name: first,
            last_name: last,
            hire_date: hire,
            status: row.employeeStatus ?? "active",
            location: (row.location ?? "").trim(),
          })
          .eq("id", existing.id);
        if (upErr) throw upErr;
        updated += 1;
      } else {
        const { error: insErr } = await supabase.from("employees").insert(payload);
        if (insErr) throw insErr;
        inserted += 1;
      }
    }

    const status = invalid > 0 ? ("partial" as const) : ("success" as const);
    await supabase
      .from("import_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        rows_processed: preview.rows.length,
        rows_inserted: inserted,
        rows_updated: updated,
        rows_unresolved: invalid,
      })
      .eq("id", runRow.id);

    return { importRunId: runRow.id, inserted, updated, noop: 0 };
  }

  const completionSource = completionSourceForPreview(preview);

  const { data: employees } = await supabase
    .from("employees")
    .select("id, paylocity_id")
    .eq("org_id", orgId);
  const { data: trainings } = await supabase
    .from("training_types")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("archived", false);

  const empByPay = new Map((employees ?? []).map((e) => [e.paylocity_id, e.id]));
  const trainingByName = new Map(
    (trainings ?? []).map((t) => [t.name.trim().toLowerCase(), t.id])
  );

  let inserted = 0;
  const updated = 0;
  let noop = 0;
  let unresolved = 0;
  let unknown = 0;

  for (const row of preview.rows) {
    if (row.action === "unresolved_person") {
      unresolved += 1;
      await supabase.from("unresolved_people").insert({
        org_id: orgId,
        raw_name: row.employeeName ?? row.detail ?? "unknown",
        raw_source: preview.source,
        source_ref: runRow.id,
        reason: row.detail ?? "Unresolved person",
      });
      continue;
    }
    if (row.action === "unknown_training") {
      unknown += 1;
      await supabase.from("unknown_trainings").insert({
        org_id: orgId,
        raw_training_name: row.trainingName ?? row.detail ?? "unknown",
        raw_source: preview.source,
        source_ref: runRow.id,
      });
      continue;
    }
    if (row.action !== "insert_completion") continue;
    const pid = row.employeePaylocityId;
    const tname = row.trainingName;
    const d = row.completedOn ? parseLocalDate(row.completedOn) : null;
    if (!pid || !tname || !d) continue;

    const employeeId = empByPay.get(pid);
    if (!employeeId) {
      unresolved += 1;
      await supabase.from("unresolved_people").insert({
        org_id: orgId,
        raw_name: pid,
        raw_source: preview.source,
        source_ref: runRow.id,
        reason: "No employee for Paylocity ID",
      });
      continue;
    }
    const trainingTypeId = trainingByName.get(tname.trim().toLowerCase());
    if (!trainingTypeId) {
      unknown += 1;
      await supabase.from("unknown_trainings").insert({
        org_id: orgId,
        raw_training_name: tname,
        raw_source: preview.source,
        source_ref: runRow.id,
      });
      continue;
    }

    const { data: existing } = await supabase
      .from("completions")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("training_type_id", trainingTypeId)
      .eq("completed_on", d)
      .eq("source", completionSource)
      .maybeSingle();

    if (existing) {
      noop += 1;
      continue;
    }

    const { error: insErr } = await supabase.from("completions").insert({
      org_id: orgId,
      employee_id: employeeId,
      training_type_id: trainingTypeId,
      completed_on: d,
      source: completionSource,
      source_ref: runRow.id,
      recorded_by: triggeredBy,
    });
    if (insErr) throw insErr;
    inserted += 1;
  }

  const status =
    unresolved + unknown > 0 ? ("partial" as const) : ("success" as const);
  await supabase
    .from("import_runs")
    .update({
      finished_at: new Date().toISOString(),
      status,
      rows_processed: preview.rows.length,
      rows_inserted: inserted,
      rows_updated: updated,
      rows_unresolved: unresolved + unknown,
    })
    .eq("id", runRow.id);

  return { importRunId: runRow.id, inserted, updated, noop };
}
