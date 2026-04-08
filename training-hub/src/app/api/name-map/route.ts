import { createServerClient } from "@/lib/supabase";

// Name mappings are stored in hub_settings with type="name_map"
// key = paylocity/source name, value = training sheet name

export async function GET() {
  try {
    const supabase = createServerClient();

    const { data: settings, error } = await supabase
      .from("hub_settings")
      .select("key, value")
      .eq("type", "name_map");

    if (error) throw new Error(`Failed to load name mappings: ${error.message}`);

    const mappings = (settings || []).map((s) => ({
      paylocityName: s.key,
      trainingName: s.value,
    }));

    return Response.json({ mappings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, paylocityName, trainingName } = body;
    const supabase = createServerClient();

    if (action === "add" && paylocityName && trainingName) {
      const { error } = await supabase
        .from("hub_settings")
        .upsert(
          { type: "name_map", key: paylocityName, value: trainingName },
          { onConflict: "type,key" }
        );

      if (error) throw new Error(`Failed to save mapping: ${error.message}`);

      return Response.json({ success: true, message: `Updated mapping: ${paylocityName} → ${trainingName}` });
    }

    if (action === "remove" && paylocityName) {
      const { error } = await supabase
        .from("hub_settings")
        .delete()
        .eq("type", "name_map")
        .eq("key", paylocityName);

      if (error) throw new Error(`Failed to remove mapping: ${error.message}`);

      return Response.json({ success: true, message: `Removed mapping for ${paylocityName}` });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
