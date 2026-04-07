import { readRange, updateCell } from "@/lib/google-sheets";
import { invalidateAll } from "@/lib/cache";
import { namesMatch } from "@/lib/name-utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { division, employeeNames, trainingColumnKeys, reason } = body;

    // Support both single key (legacy) and array
    const keys: string[] = trainingColumnKeys
      ? (Array.isArray(trainingColumnKeys) ? trainingColumnKeys : [trainingColumnKeys])
      : body.trainingColumnKey ? [body.trainingColumnKey] : [];

    const names: string[] = employeeNames && Array.isArray(employeeNames) ? employeeNames : [];

    if ((!division && names.length === 0) || keys.length === 0 || !reason) {
      return Response.json(
        { error: "Missing required fields: division or employeeNames, trainingColumnKeys, reason" },
        { status: 400 }
      );
    }

    const rows = await readRange("Training");
    if (rows.length < 2) {
      return Response.json({ error: "Training sheet is empty" }, { status: 400 });
    }

    const headers = rows[0];
    const hdr = (label: string) =>
      headers.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());

    const activeCol = hdr("ACTIVE");
    const divCol = hdr("Division Description");
    const lNameCol = hdr("L NAME");
    const fNameCol = hdr("F NAME");

    // Resolve all training column indices
    const trainingCols: { key: string; col: number }[] = [];
    const notFound: string[] = [];
    for (const key of keys) {
      const col = hdr(key);
      if (col < 0) notFound.push(key);
      else trainingCols.push({ key, col });
    }

    let excused = 0;
    let skipped = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      if (activeCol >= 0) {
        const active = (row[activeCol] || "").toString().trim().toUpperCase();
        if (active !== "Y") continue;
      }

      // Check if this employee matches the filter (division or individual names)
      let matches = false;
      if (division && divCol >= 0) {
        const empDiv = (row[divCol] || "").trim();
        if (empDiv.toLowerCase() === division.toLowerCase()) matches = true;
      }
      if (names.length > 0 && lNameCol >= 0 && fNameCol >= 0) {
        const last = (row[lNameCol] || "").trim();
        const first = (row[fNameCol] || "").trim();
        const fullName = first ? `${last}, ${first}` : last;
        if (names.some((n) => namesMatch(n, fullName))) matches = true;
      }
      if (!matches) continue;

      for (const tc of trainingCols) {
        const currentValue = (row[tc.col] || "").trim();
        if (currentValue) {
          skipped++;
          continue;
        }
        await updateCell("Training", i + 1, tc.col, reason);
        excused++;
      }
    }

    invalidateAll();

    return Response.json({
      success: true,
      excused,
      skipped,
      trainingsProcessed: trainingCols.length,
      notFound: notFound.length > 0 ? notFound : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
