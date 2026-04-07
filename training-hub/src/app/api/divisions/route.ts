import { readRange } from "@/lib/google-sheets";

export async function GET() {
  try {
    const rows = await readRange("Training");
    if (rows.length < 2) return Response.json({ divisions: [] });

    const headers = rows[0];
    const hdr = (label: string) =>
      headers.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());
    const activeCol = hdr("ACTIVE");
    const divCol = hdr("Division Description");
    if (divCol < 0) return Response.json({ divisions: [] });

    const divisions = new Set<string>();
    for (let i = 1; i < rows.length; i++) {
      if (activeCol >= 0) {
        const active = (rows[i][activeCol] || "").toString().trim().toUpperCase();
        if (active !== "Y") continue;
      }
      const div = (rows[i][divCol] || "").trim();
      if (div) divisions.add(div);
    }

    const sorted = Array.from(divisions).sort();
    return Response.json({ divisions: sorted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
