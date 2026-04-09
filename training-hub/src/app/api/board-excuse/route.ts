import { createServerClient } from "@/lib/supabase";
import { namesMatch } from "@/lib/name-utils";

// Board of Directors — exempt from all trainings
const BOARD_MEMBERS = [
  "Sherri Alley",
  "Tim Porter",
  "Melissa Jackson-Wade",
  "Becky Dodson",
  "Scott Britton",
  "Elaine Brubaker",
  "Traci Golbach",
  "Dana Hewit",
  "Jennifer Hultz",
  "Rachel Lokitz",
  "Douglas Mapp",
  "Ashley Saunders",
  "Jay Shepard",
  "Bert Simmons",
];

export async function POST() {
  try {
    const supabase = createServerClient();

    // Fetch active employees
    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("is_active", true)
      .limit(10000);

    if (empError) throw new Error(`Failed to load employees: ${empError.message}`);

    // Fetch all training types
    const { data: trainingTypes, error: ttError } = await supabase
      .from("training_types")
      .select("id, name");

    if (ttError) throw new Error(`Failed to load training types: ${ttError.message}`);

    let matched = 0;
    let cellsWritten = 0;

    for (const emp of employees || []) {
      const fullName = `${emp.first_name} ${emp.last_name}`.trim();
      const isBoard = BOARD_MEMBERS.some((bm) => namesMatch(bm, fullName));
      if (!isBoard) continue;

      matched++;

      // Set excusal for every training type with reason "BOARD"
      for (const tt of trainingTypes || []) {
        // Check if already excused
        const { data: existing } = await supabase
          .from("excusals")
          .select("id, reason")
          .eq("employee_id", emp.id)
          .eq("training_type_id", tt.id)
          .limit(1)
          .maybeSingle();

        if (existing?.reason === "BOARD") continue;

        // Upsert excusal
        const { error: upsertError } = await supabase
          .from("excusals")
          .upsert(
            {
              employee_id: emp.id,
              training_type_id: tt.id,
              reason: "BOARD",
            },
            { onConflict: "employee_id,training_type_id" }
          );

        if (!upsertError) cellsWritten++;
      }
    }

    return Response.json({
      success: true,
      matched,
      cellsWritten,
      message: `Found ${matched} board member(s), wrote BOARD to ${cellsWritten} cell(s)`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ members: BOARD_MEMBERS });
}
