import { applyFixesToSupabase } from "@/lib/import-utils";
import { createServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fixes } = body;
    // fixes: Array<{ employee: string, training: string, date: string }>

    if (!fixes || !Array.isArray(fixes) || fixes.length === 0) {
      return Response.json({ error: "No fixes provided" }, { status: 400 });
    }

    const supabase = createServerClient();
    const result = await applyFixesToSupabase(supabase, fixes);
    return Response.json({
      success: true,
      message: `Imported ${result.matched} record(s)${result.errors.length > 0 ? ". Errors: " + result.errors.slice(0, 5).join("; ") : ""}`,
      matched: result.matched,
      errors: result.errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
