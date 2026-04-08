import { createServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const employee = searchParams.get("employee");

    const supabase = createServerClient();

    let query = supabase
      .from("hub_settings")
      .select("key, value")
      .eq("type", "training_note");

    const { data: settings, error } = await query;
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

    return Response.json({ notes });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { employee, training, note } = body;

    if (!employee || !training) {
      return Response.json({ error: "Missing employee or training" }, { status: 400 });
    }

    const settingsKey = `${employee}|${training}`;
    const supabase = createServerClient();

    if (note) {
      // Upsert the note
      const { error } = await supabase
        .from("hub_settings")
        .upsert(
          { type: "training_note", key: settingsKey, value: note },
          { onConflict: "type,key" }
        );

      if (error) throw new Error(`Failed to save note: ${error.message}`);
    } else {
      // Delete the note
      const { error } = await supabase
        .from("hub_settings")
        .delete()
        .eq("type", "training_note")
        .eq("key", settingsKey);

      if (error) throw new Error(`Failed to delete note: ${error.message}`);
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}
