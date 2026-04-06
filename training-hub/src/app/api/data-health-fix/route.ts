import {
  readRange,
  getSheets,
  getSpreadsheetId,
  updateCell,
  writeRange,
} from "@/lib/google-sheets";
import { invalidateAll } from "@/lib/cache";

// ----------------------------------------------------------------
// POST /api/data-health-fix
// Handles three action types: clear_garbled, remove_duplicates, fix_cpr_fa
// ----------------------------------------------------------------

interface ClearGarbledPayload {
  action: "clear_garbled";
  items: Array<{ row: number; column: string }>;
}

interface RemoveDuplicatesPayload {
  action: "remove_duplicates";
  keepRow: number;
  deleteRows: number[];
}

interface FixCprFaPayload {
  action: "fix_cpr_fa";
  items: Array<{ row: number }>;
}

type FixPayload = ClearGarbledPayload | RemoveDuplicatesPayload | FixCprFaPayload;

export async function POST(request: Request) {
  try {
    const body: FixPayload = await request.json();

    switch (body.action) {
      case "clear_garbled":
        return await handleClearGarbled(body);
      case "remove_duplicates":
        return await handleRemoveDuplicates(body);
      case "fix_cpr_fa":
        return await handleFixCprFa(body);
      default:
        return Response.json(
          { error: `Unknown action: ${(body as { action: string }).action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// Clear garbled date cells
// ----------------------------------------------------------------
async function handleClearGarbled(payload: ClearGarbledPayload) {
  if (!payload.items?.length) {
    return Response.json({ error: "No items provided" }, { status: 400 });
  }

  const rows = await readRange("Training");
  const headers = rows[0];

  for (const item of payload.items) {
    const colIndex = headers.findIndex(
      (h) => h.trim().toUpperCase() === item.column.toUpperCase()
    );
    if (colIndex < 0) continue;
    await updateCell("Training", item.row, colIndex, "");
  }

  invalidateAll();
  return Response.json({
    success: true,
    message: `Cleared ${payload.items.length} garbled date(s)`,
  });
}

// ----------------------------------------------------------------
// Remove duplicate rows (merge non-empty training cells into kept row)
// ----------------------------------------------------------------
async function handleRemoveDuplicates(payload: RemoveDuplicatesPayload) {
  const { keepRow, deleteRows } = payload;
  if (!keepRow || !deleteRows?.length) {
    return Response.json(
      { error: "Missing keepRow or deleteRows" },
      { status: 400 }
    );
  }

  const rows = await readRange("Training");
  const headers = rows[0];
  const totalCols = headers.length;

  // 0-based index for the kept row data
  const keepData = rows[keepRow - 1];
  if (!keepData) {
    return Response.json({ error: `Row ${keepRow} not found` }, { status: 400 });
  }

  // Merge: copy non-empty cells from deleted rows into the kept row
  // (only where the kept row's cell is empty)
  for (const delRow of deleteRows) {
    const delData = rows[delRow - 1];
    if (!delData) continue;

    for (let col = 0; col < totalCols; col++) {
      const keptVal = (keepData[col] || "").trim();
      const delVal = (delData[col] || "").trim();
      if (!keptVal && delVal) {
        // Copy from deleted row to kept row
        await updateCell("Training", keepRow, col, delVal);
      }
    }
  }

  // Delete the duplicate rows using batchUpdate (from bottom up to avoid shift issues)
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

  // We need the sheetId (numeric) for the Training sheet
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });
  const trainingSheet = spreadsheet.data.sheets?.find(
    (s: { properties?: { title?: string } }) => s.properties?.title === "Training"
  );
  if (!trainingSheet?.properties?.sheetId && trainingSheet?.properties?.sheetId !== 0) {
    return Response.json(
      { error: "Could not find Training sheet" },
      { status: 500 }
    );
  }
  const sheetId = trainingSheet.properties.sheetId!;

  // Sort deleteRows descending so we delete from bottom up
  const sortedDeleteRows = [...deleteRows].sort((a, b) => b - a);

  const requests = sortedDeleteRows.map((rowNum) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: "ROWS" as const,
        startIndex: rowNum - 1, // 0-based
        endIndex: rowNum, // exclusive
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  invalidateAll();
  return Response.json({
    success: true,
    message: `Kept row ${keepRow}, removed ${deleteRows.length} duplicate(s)`,
  });
}

// ----------------------------------------------------------------
// Fix CPR/FA mismatches: sync FA date to match CPR date
// ----------------------------------------------------------------
async function handleFixCprFa(payload: FixCprFaPayload) {
  if (!payload.items?.length) {
    return Response.json({ error: "No items provided" }, { status: 400 });
  }

  const rows = await readRange("Training");
  const headers = rows[0];

  const cprCol = headers.findIndex(
    (h) => h.trim().toUpperCase() === "CPR"
  );
  const faCol = headers.findIndex(
    (h) => h.trim().toUpperCase() === "FIRSTAID"
  );

  if (cprCol < 0 || faCol < 0) {
    return Response.json(
      { error: "CPR or FIRSTAID column not found" },
      { status: 500 }
    );
  }

  let fixed = 0;
  for (const item of payload.items) {
    const rowData = rows[item.row - 1];
    if (!rowData) continue;
    const cprVal = (rowData[cprCol] || "").trim();
    if (cprVal) {
      await updateCell("Training", item.row, faCol, cprVal);
      fixed++;
    }
  }

  invalidateAll();
  return Response.json({
    success: true,
    message: `Synced First Aid date to CPR date for ${fixed} row(s)`,
  });
}
