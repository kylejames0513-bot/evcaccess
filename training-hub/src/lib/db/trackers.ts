import { createServerClient } from "@/lib/supabase";
import type {
  NewHireTrackerRow,
  NewHireTrackerRowInsert,
  NewHireTrackerRowUpdate,
  SeparationTrackerRow,
  SeparationTrackerRowInsert,
  SeparationTrackerRowUpdate,
} from "@/types/database";

export async function listNewHireTrackerRows(): Promise<NewHireTrackerRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("new_hire_tracker_rows")
    .select("*")
    .order("sheet")
    .order("row_number");
  if (error) throw new Error(error.message);
  return (data ?? []) as NewHireTrackerRow[];
}

export async function insertNewHireTrackerRow(
  row: NewHireTrackerRowInsert
): Promise<NewHireTrackerRow> {
  const db = createServerClient();
  const { data, error } = await db.from("new_hire_tracker_rows").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data as NewHireTrackerRow;
}

export async function updateNewHireTrackerRow(
  id: string,
  patch: NewHireTrackerRowUpdate
): Promise<NewHireTrackerRow> {
  const db = createServerClient();
  const { data, error } = await db
    .from("new_hire_tracker_rows")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as NewHireTrackerRow;
}

export async function deleteNewHireTrackerRow(id: string): Promise<void> {
  const db = createServerClient();
  const { error } = await db.from("new_hire_tracker_rows").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listSeparationTrackerRows(): Promise<SeparationTrackerRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("separation_tracker_rows")
    .select("*")
    .order("fy_sheet")
    .order("row_number");
  if (error) throw new Error(error.message);
  return (data ?? []) as SeparationTrackerRow[];
}

export async function insertSeparationTrackerRow(
  row: SeparationTrackerRowInsert
): Promise<SeparationTrackerRow> {
  const db = createServerClient();
  const { data, error } = await db.from("separation_tracker_rows").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data as SeparationTrackerRow;
}

export async function updateSeparationTrackerRow(
  id: string,
  patch: SeparationTrackerRowUpdate
): Promise<SeparationTrackerRow> {
  const db = createServerClient();
  const { data, error } = await db
    .from("separation_tracker_rows")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as SeparationTrackerRow;
}

export async function deleteSeparationTrackerRow(id: string): Promise<void> {
  const db = createServerClient();
  const { error } = await db.from("separation_tracker_rows").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Default section for rows correlated with Monthly New Hire Tracker (VBA sync). */
const NEW_HIRE_SYNC_SECTION = "new_hire";

/**
 * Idempotent audit row after Excel → hub sync. Unique on (sheet, row_number, section).
 * Failures are logged only so a tracker issue never blocks employee upserts.
 */
export async function upsertNewHireTrackerAuditFromSync(row: {
  sheet: string;
  row_number: number;
  last_name: string;
  first_name: string;
  hire_date: string;
  paylocity_id: string | null;
  division: string | null;
  department: string | null;
  position: string | null;
  job_title: string | null;
  employee_id: string | null;
  hubSyncStatus: string;
  hubMessage: string | null;
}): Promise<void> {
  const db = createServerClient();
  const notes = row.hubMessage
    ? `hub_sync:${row.hubSyncStatus} — ${row.hubMessage}`.slice(0, 4000)
    : `hub_sync:${row.hubSyncStatus}`;
  const { error } = await db.from("new_hire_tracker_rows").upsert(
    {
      sheet: row.sheet,
      row_number: row.row_number,
      section: NEW_HIRE_SYNC_SECTION,
      last_name: row.last_name,
      first_name: row.first_name,
      hire_date: row.hire_date,
      paylocity_id: row.paylocity_id,
      division: row.division,
      department: row.department,
      position: row.position,
      job_title: row.job_title,
      status: "active",
      employee_id: row.employee_id,
      notes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "sheet,row_number,section" }
  );
  if (error) {
    console.error("[upsertNewHireTrackerAuditFromSync]", error.message);
  }
}

/**
 * Idempotent audit row for FY Separation Summary sync. Unique on (fy_sheet, row_number).
 */
export async function upsertSeparationTrackerAuditFromSync(row: {
  fy_sheet: string;
  row_number: number;
  last_name: string;
  first_name: string;
  date_of_separation: string;
  employee_id: string | null;
  sync_status: string;
  notes: string | null;
}): Promise<void> {
  const db = createServerClient();
  const { error } = await db.from("separation_tracker_rows").upsert(
    {
      fy_sheet: row.fy_sheet,
      row_number: row.row_number,
      last_name: row.last_name,
      first_name: row.first_name,
      date_of_separation: row.date_of_separation,
      employee_id: row.employee_id,
      sync_status: row.sync_status,
      notes: row.notes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "fy_sheet,row_number" }
  );
  if (error) {
    console.error("[upsertSeparationTrackerAuditFromSync]", error.message);
  }
}
