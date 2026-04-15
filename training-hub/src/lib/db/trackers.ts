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
