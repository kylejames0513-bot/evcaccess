import { readRange } from "@/lib/google-sheets";

export async function GET() {
  try {
    // Read first 5 data rows of Training sheet, columns A-J
    const rows = await readRange("Training!A1:J6");
    const headers = rows[0] || [];

    // Find CPR column
    const cprCol = headers.findIndex(
      (h: string) => h.trim().toUpperCase() === "CPR"
    );

    const sample = rows.slice(1, 6).map((row: string[], i: number) => ({
      row: i + 2,
      name: `${row[0]}, ${row[1]}`,
      active: row[2],
      cprColumnIndex: cprCol,
      cprRawValue: cprCol >= 0 ? row[cprCol] : "COL NOT FOUND",
      cprValueType: cprCol >= 0 ? typeof row[cprCol] : "N/A",
      allHeaders: headers,
    }));

    return Response.json({ sample, cprCol, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
