import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

export const GET = withApiHandler(async (request) => {
  const employee = request.nextUrl.searchParams.get("employee");

  const supabase = createServerClient();

  const { data: settings, error } = await supabase
    .from("hub_settings")
    .select("key, value")
    .eq("type", "training_note");
  if (error) throw new Error(`Failed to load training notes: ${error.message}`);

  const notes: Record<string, string> = {};

  for (const s of settings || []) {
    const key = (s.key || "").trim();
    const val = (s.value || "").trim();
    if (!key || !val) continue;

    if (employee) {
      if (key.toLowerCase().startsWith(employee.toLowerCase() + "|")) {
        const trainingKey = key.split("|")[1];
        notes[trainingKey] = val;
      }
    } else {
      notes[key] = val;
    }
  }

  return { notes };
});

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const { employee, training, note } = body;

  if (!employee || !training) {
    throw new ApiError("Missing employee or training", 400, "missing_field");
  }

  const settingsKey = `${employee}|${training}`;
  const supabase = createServerClient();

  if (note) {
    const { error } = await supabase
      .from("hub_settings")
      .upsert(
        { type: "training_note", key: settingsKey, value: note },
        { onConflict: "type,key" }
      );
    if (error) throw new Error(`Failed to save note: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("hub_settings")
      .delete()
      .eq("type", "training_note")
      .eq("key", settingsKey);
    if (error) throw new Error(`Failed to delete note: ${error.message}`);
  }

  return { success: true };
});
