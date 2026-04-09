import { createServerClient } from "@/lib/supabase";
import { namesMatch } from "@/lib/name-utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { division, employeeNames, trainingColumnKeys, reason } = body;

    // Support both single key (legacy) and array
    const keys: string[] = trainingColumnKeys
      ? (Array.isArray(trainingColumnKeys) ? trainingColumnKeys : [trainingColumnKeys])
      : body.trainingColumnKey ? [body.trainingColumnKey] : [];

    const names: string[] = employeeNames && Array.isArray(employeeNames) ? employeeNames : [];

    if ((!division && names.length === 0) || keys.length === 0 || !reason) {
      return Response.json(
        { error: "Missing required fields: division or employeeNames, trainingColumnKeys, reason" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Fetch active employees
    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("id, first_name, last_name, department")
      .eq("is_active", true)
      .limit(10000);

    if (empError) throw new Error(`Failed to load employees: ${empError.message}`);

    // Resolve training type IDs for requested column keys
    const trainingCols: Array<{ key: string; typeId: string }> = [];
    const notFound: string[] = [];

    for (const key of keys) {
      const { data: tt } = await supabase
        .from("training_types")
        .select("id")
        .or(`column_key.ilike.${key},name.ilike.${key}`)
        .limit(1)
        .maybeSingle();

      if (!tt) {
        notFound.push(key);
      } else {
        trainingCols.push({ key, typeId: tt.id });
      }
    }

    let excused = 0;
    let skipped = 0;

    for (const emp of employees || []) {
      const empName = emp.first_name
        ? `${emp.last_name}, ${emp.first_name}`
        : emp.last_name;

      // Check if this employee matches the filter (division or individual names)
      let matches = false;
      if (division) {
        const empDiv = (emp.department || "").trim();
        if (empDiv.toLowerCase() === division.toLowerCase()) matches = true;
      }
      if (names.length > 0) {
        if (names.some((n) => namesMatch(n, empName))) matches = true;
      }
      if (!matches) continue;

      for (const tc of trainingCols) {
        // Check if already has a training record or excusal
        const { data: existingRecord } = await supabase
          .from("training_records")
          .select("id")
          .eq("employee_id", emp.id)
          .eq("training_type_id", tc.typeId)
          .limit(1)
          .maybeSingle();

        const { data: existingExcusal } = await supabase
          .from("excusals")
          .select("id")
          .eq("employee_id", emp.id)
          .eq("training_type_id", tc.typeId)
          .limit(1)
          .maybeSingle();

        if (existingRecord || existingExcusal) {
          skipped++;
          continue;
        }

        // Insert excusal
        const { error: insertError } = await supabase
          .from("excusals")
          .upsert(
            {
              employee_id: emp.id,
              training_type_id: tc.typeId,
              reason,
            },
            { onConflict: "employee_id,training_type_id" }
          );

        if (!insertError) excused++;
      }
    }

    return Response.json({
      success: true,
      excused,
      skipped,
      trainingsProcessed: trainingCols.length,
      notFound: notFound.length > 0 ? notFound : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
