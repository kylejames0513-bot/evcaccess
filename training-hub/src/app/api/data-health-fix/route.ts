import { createServerClient } from "@/lib/supabase";

interface ClearGarbledPayload {
  action: "clear_garbled";
  items: Array<{ row: number; column: string; newValue?: string }>;
}

interface RemoveDuplicatesPayload {
  action: "remove_duplicates";
  keepRow: number;
  deleteRows: number[];
}

interface FixCprFaPayload {
  action: "fix_cpr_fa";
  items: Array<{ row: number }>;
}

type FixPayload = ClearGarbledPayload | RemoveDuplicatesPayload | FixCprFaPayload;

export async function POST(request: Request) {
  try {
    const body: FixPayload = await request.json();

    switch (body.action) {
      case "clear_garbled":
        return await handleClearGarbled(body);
      case "remove_duplicates":
        return await handleRemoveDuplicates(body);
      case "fix_cpr_fa":
        return await handleFixCprFa(body);
      default:
        return Response.json(
          { error: `Unknown action: ${(body as { action: string }).action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : "Unknown error";
    console.error("data-health-fix error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Get all employees ordered by last_name to map row indices.
 * Row indices are 2-based (header is row 1) to maintain backward compat.
 */
async function getEmployeeByRow(supabase: ReturnType<typeof createServerClient>, rowNum: number) {
  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .order("last_name");

  if (!employees) return null;
  const idx = rowNum - 2; // 2-based to 0-based
  if (idx < 0 || idx >= employees.length) return null;
  return employees[idx];
}

async function getEmployeesSorted(supabase: ReturnType<typeof createServerClient>) {
  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .order("last_name");
  return employees || [];
}

async function getTrainingTypeByColumnKey(supabase: ReturnType<typeof createServerClient>, columnKey: string) {
  const { data: tt } = await supabase
    .from("training_types")
    .select("id, column_key")
    .ilike("column_key", columnKey)
    .limit(1)
    .maybeSingle();
  return tt;
}

// ----------------------------------------------------------------
// Clear/fix garbled values — update or delete records/excusals
// ----------------------------------------------------------------
async function handleClearGarbled(payload: ClearGarbledPayload) {
  if (!payload.items?.length) {
    return Response.json({ error: "No items provided" }, { status: 400 });
  }

  const supabase = createServerClient();
  const employees = await getEmployeesSorted(supabase);
  let written = 0;

  for (const item of payload.items) {
    const idx = item.row - 2;
    if (idx < 0 || idx >= employees.length) continue;
    const emp = employees[idx];

    const tt = await getTrainingTypeByColumnKey(supabase, item.column);
    if (!tt) continue;

    const newValue = (item.newValue || "").trim();

    if (!newValue) {
      // Clear: delete any training record or excusal for this cell
      await supabase
        .from("training_records")
        .delete()
        .eq("employee_id", emp.id)
        .eq("training_type_id", tt.id);
      await supabase
        .from("excusals")
        .delete()
        .eq("employee_id", emp.id)
        .eq("training_type_id", tt.id);
      written++;
    } else if (/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(newValue)) {
      // It's a date — upsert training record
      const match = newValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)!;
      const isoDate = `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;

      // Remove any excusal first
      await supabase
        .from("excusals")
        .delete()
        .eq("employee_id", emp.id)
        .eq("training_type_id", tt.id);

      // Upsert training record
      await supabase
        .from("training_records")
        .upsert(
          {
            employee_id: emp.id,
            training_type_id: tt.id,
            completion_date: isoDate,
            source: "data_health_fix",
          },
          { onConflict: "employee_id,training_type_id" }
        );
      written++;
    } else {
      // It's an excusal code or other value — upsert as excusal
      await supabase
        .from("training_records")
        .delete()
        .eq("employee_id", emp.id)
        .eq("training_type_id", tt.id);
      await supabase
        .from("excusals")
        .upsert(
          {
            employee_id: emp.id,
            training_type_id: tt.id,
            reason: newValue,
          },
          { onConflict: "employee_id,training_type_id" }
        );
      written++;
    }
  }

  return Response.json({ success: true, message: `Fixed ${written} cell(s)` });
}

// ----------------------------------------------------------------
// Remove duplicate employees — merge data into kept employee, delete others
// ----------------------------------------------------------------
async function handleRemoveDuplicates(payload: RemoveDuplicatesPayload) {
  const { keepRow, deleteRows } = payload;
  if (!keepRow || !deleteRows?.length) {
    return Response.json({ error: "Missing keepRow or deleteRows" }, { status: 400 });
  }

  const supabase = createServerClient();
  const employees = await getEmployeesSorted(supabase);
  const keepIdx = keepRow - 2;
  if (keepIdx < 0 || keepIdx >= employees.length) {
    return Response.json({ error: `Row ${keepRow} not found` }, { status: 400 });
  }
  const keepEmp = employees[keepIdx];

  // For each duplicate, merge their training records & excusals into the kept employee
  for (const delRow of deleteRows) {
    const delIdx = delRow - 2;
    if (delIdx < 0 || delIdx >= employees.length) continue;
    const delEmp = employees[delIdx];

    // Fetch records from the duplicate
    const { data: delRecords } = await supabase
      .from("training_records")
      .select("training_type_id, completion_date, source")
      .eq("employee_id", delEmp.id);

    // Fetch existing records for kept employee
    const { data: keepRecords } = await supabase
      .from("training_records")
      .select("training_type_id")
      .eq("employee_id", keepEmp.id);

    const keepRecordTypes = new Set((keepRecords || []).map((r: any) => r.training_type_id));

    // Merge: copy records from duplicate that the kept employee doesn't have
    for (const rec of delRecords || []) {
      if (!keepRecordTypes.has(rec.training_type_id)) {
        await supabase.from("training_records").insert({
          employee_id: keepEmp.id,
          training_type_id: rec.training_type_id,
          completion_date: rec.completion_date,
          source: rec.source,
        });
      }
    }

    // Same for excusals
    const { data: delExcusals } = await supabase
      .from("excusals")
      .select("training_type_id, reason")
      .eq("employee_id", delEmp.id);

    const { data: keepExcusals } = await supabase
      .from("excusals")
      .select("training_type_id")
      .eq("employee_id", keepEmp.id);

    const keepExcusalTypes = new Set((keepExcusals || []).map((e: any) => e.training_type_id));

    for (const exc of delExcusals || []) {
      if (!keepExcusalTypes.has(exc.training_type_id) && !keepRecordTypes.has(exc.training_type_id)) {
        await supabase.from("excusals").insert({
          employee_id: keepEmp.id,
          training_type_id: exc.training_type_id,
          reason: exc.reason,
        });
      }
    }

    // Delete the duplicate employee's records, excusals, enrollments, then the employee
    await supabase.from("training_records").delete().eq("employee_id", delEmp.id);
    await supabase.from("excusals").delete().eq("employee_id", delEmp.id);
    await supabase.from("enrollments").delete().eq("employee_id", delEmp.id);
    await supabase.from("employees").delete().eq("id", delEmp.id);
  }

  return Response.json({
    success: true,
    message: `Kept row ${keepRow}, removed ${deleteRows.length} duplicate(s)`,
  });
}

// ----------------------------------------------------------------
// Fix CPR/FA mismatches — sync FIRSTAID to match CPR
// ----------------------------------------------------------------
async function handleFixCprFa(payload: FixCprFaPayload) {
  if (!payload.items?.length) {
    return Response.json({ error: "No items provided" }, { status: 400 });
  }

  const supabase = createServerClient();
  const employees = await getEmployeesSorted(supabase);

  // Get CPR and FIRSTAID training type IDs
  const cprType = await getTrainingTypeByColumnKey(supabase, "CPR");
  const faType = await getTrainingTypeByColumnKey(supabase, "FIRSTAID");

  if (!cprType || !faType) {
    return Response.json({ error: "CPR or FIRSTAID training type not found" }, { status: 500 });
  }

  const skipped: string[] = [];
  let fixed = 0;

  for (const item of payload.items) {
    const idx = item.row - 2;
    if (idx < 0 || idx >= employees.length) {
      skipped.push(`Row ${item.row}: not found`);
      continue;
    }
    const emp = employees[idx];

    // Get CPR record
    const { data: cprRecord } = await supabase
      .from("training_records")
      .select("completion_date")
      .eq("employee_id", emp.id)
      .eq("training_type_id", cprType.id)
      .limit(1)
      .maybeSingle();

    if (!cprRecord?.completion_date) {
      skipped.push(`Row ${item.row}: CPR is empty`);
      continue;
    }

    // Upsert FIRSTAID to match CPR
    await supabase
      .from("training_records")
      .upsert(
        {
          employee_id: emp.id,
          training_type_id: faType.id,
          completion_date: cprRecord.completion_date,
          source: "cpr_fa_sync",
        },
        { onConflict: "employee_id,training_type_id" }
      );

    fixed++;
  }

  return Response.json({
    success: true,
    message: `Synced ${fixed} row(s)${skipped.length > 0 ? ". Skipped: " + skipped.slice(0, 3).join("; ") : ""}`,
    fixed,
  });
}
