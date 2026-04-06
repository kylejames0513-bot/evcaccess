import { readRange } from "@/lib/google-sheets";
import { getExcludedEmployees } from "@/lib/hub-settings";

export async function GET() {
  try {
    const rows = await readRange("Training");
    if (rows.length < 2) return Response.json({ error: "No data" });

    const headers = rows[0];
    const hdr = (label: string) =>
      headers.findIndex((h: string) => h.trim().toUpperCase() === label.toUpperCase());
    const lNameCol = hdr("L NAME");
    const fNameCol = hdr("F NAME");
    const activeCol = hdr("ACTIVE");
    const divCol = hdr("Division Description");

    const excluded = await getExcludedEmployees();
    const excludedSet = new Set(excluded.map((n: string) => n.toLowerCase()));

    let totalRows = 0;
    let blankNames = 0;
    let activeY = 0;
    let activeN = 0;
    let activeOther = 0;
    let excludedCount = 0;
    let noDivision = 0;
    const activeValues: Record<string, number> = {};
    const divisionCounts: Record<string, number> = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const lastName = lNameCol >= 0 ? (row[lNameCol] || "").trim() : "";
      const firstName = fNameCol >= 0 ? (row[fNameCol] || "").trim() : "";
      if (!lastName) { blankNames++; continue; }
      totalRows++;

      const activeRaw = activeCol >= 0 ? (row[activeCol] || "").toString().trim() : "";
      const activeUpper = activeRaw.toUpperCase();

      // Track all active values
      activeValues[activeRaw || "(empty)"] = (activeValues[activeRaw || "(empty)"] || 0) + 1;

      if (activeUpper === "Y") {
        activeY++;
        const name = firstName ? `${lastName}, ${firstName}` : lastName;
        if (excludedSet.has(name.toLowerCase())) { excludedCount++; continue; }

        const div = divCol >= 0 ? (row[divCol] || "").trim() : "";
        if (!div) noDivision++;
        else divisionCounts[div] = (divisionCounts[div] || 0) + 1;
      } else if (activeUpper === "N") {
        activeN++;
      } else {
        activeOther++;
      }
    }

    return Response.json({
      totalRows,
      blankNames,
      activeY,
      activeN,
      activeOther,
      excludedCount,
      noDivision,
      netTracked: activeY - excludedCount,
      activeValues,
      divisionCounts,
      columnPositions: { lNameCol, fNameCol, activeCol, divCol },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
