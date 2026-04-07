import { readRange } from "@/lib/google-sheets";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

export async function GET() {
  try {
    const rows = await readRange("Training");
    if (rows.length < 2) return Response.json({ newHires: [] });

    const headers = rows[0];
    const hdr = (label: string) => headers.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());
    const lNameCol = hdr("L NAME");
    const fNameCol = hdr("F NAME");
    const activeCol = hdr("ACTIVE");
    const divCol = hdr("Division Description");
    const hireCol = hdr("Hire Date");

    if (lNameCol < 0 || fNameCol < 0) return Response.json({ error: "Name columns not found" }, { status: 400 });

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get all training column indices
    const trainingCols: Array<{ key: string; name: string; index: number }> = [];
    const seenKeys = new Set<string>();
    for (const def of TRAINING_DEFINITIONS) {
      if (seenKeys.has(def.columnKey)) continue;
      seenKeys.add(def.columnKey);
      const idx = hdr(def.columnKey);
      if (idx >= 0) trainingCols.push({ key: def.columnKey, name: def.name, index: idx });
    }

    const newHires: Array<{
      name: string;
      division: string;
      hireDate: string;
      daysEmployed: number;
      row: number;
      totalTrainings: number;
      completedTrainings: number;
      missingTrainings: string[];
    }> = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const lastName = (row[lNameCol] || "").trim();
      const firstName = (row[fNameCol] || "").trim();
      if (!lastName) continue;

      const active = activeCol >= 0 ? (row[activeCol] || "").toString().trim().toUpperCase() : "Y";
      if (active !== "Y") continue;

      const name = firstName ? `${lastName}, ${firstName}` : lastName;
      const division = divCol >= 0 ? (row[divCol] || "").trim() : "";
      const hireDateStr = hireCol >= 0 ? (row[hireCol] || "").toString().trim() : "";

      // Parse hire date
      let hireDate: Date | null = null;
      if (hireDateStr) {
        const match = hireDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (match) {
          let yr = parseInt(match[3]);
          if (yr < 100) yr += yr < 50 ? 2000 : 1900;
          hireDate = new Date(yr, parseInt(match[1]) - 1, parseInt(match[2]));
        } else {
          hireDate = new Date(hireDateStr);
          if (isNaN(hireDate.getTime())) hireDate = null;
        }
      }

      // Count completed vs missing trainings
      let completed = 0;
      const missing: string[] = [];
      for (const col of trainingCols) {
        const val = (row[col.index] || "").toString().trim();
        if (val && val.toUpperCase() !== "NA" && val.toUpperCase() !== "N/A") {
          completed++;
        } else if (!val) {
          missing.push(col.name);
        }
      }

      // Determine if "new hire" by hire date OR by having zero completions
      const isNewByDate = hireDate && hireDate >= ninetyDaysAgo;
      const isNewByTrainings = completed === 0 && missing.length > 0;

      if (isNewByDate || isNewByTrainings) {
        const daysEmployed = hireDate ? Math.round((now.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24)) : -1;
        newHires.push({
          name,
          division,
          hireDate: hireDateStr,
          daysEmployed,
          row: i + 1,
          totalTrainings: trainingCols.length,
          completedTrainings: completed,
          missingTrainings: missing,
        });
      }
    }

    // Sort by hire date (newest first), then by name
    newHires.sort((a, b) => {
      if (a.daysEmployed >= 0 && b.daysEmployed >= 0) return a.daysEmployed - b.daysEmployed;
      if (a.daysEmployed >= 0) return -1;
      if (b.daysEmployed >= 0) return 1;
      return a.name.localeCompare(b.name);
    });

    return Response.json({ newHires });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
