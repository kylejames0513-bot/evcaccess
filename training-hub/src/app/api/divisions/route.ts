import { readRange } from "@/lib/google-sheets";

export async function GET() {
  try {
    const rows = await readRange("Training");
    if (rows.length < 2) return Response.json({ divisions: [] });

    const divisions = new Set<string>();
    for (let i = 1; i < rows.length; i++) {
      // Column C (index 2) = Active, Column D (index 3) = Division Description
      const active = (rows[i][2] || "").toString().trim().toUpperCase();
      if (active !== "Y") continue;
      const div = (rows[i][3] || "").trim();
      if (div) divisions.add(div);
    }

    const sorted = Array.from(divisions).sort();
    return Response.json({ divisions: sorted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
