import {
  readRangeFresh,
  getSheets,
  getSpreadsheetId,
  writeRange,
} from "@/lib/google-sheets";
import { invalidateAll } from "@/lib/cache";

interface ClearGarbledPayload {
  action: "clear_garbled";
  items: Array<{ row: number; column: string; newValue?: string }>;
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
    const message = error instanceof Error ? error.stack || error.message : "Unknown error";
    console.error("data-health-fix error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

/** Convert 0-based column index to A1 notation (A, B, ... Z, AA, AB, ...) */
function colToLetter(col: number): string {
  let letter = "";
  let c = col;
  while (c >= 0) {
    letter = String.fromCharCode(65 + (c % 26)) + letter;
    c = Math.floor(c / 26) - 1;
  }
  return letter;
}

// ----------------------------------------------------------------
// Clear/fix garbled date cells — batch write
// ----------------------------------------------------------------
async function handleClearGarbled(payload: ClearGarbledPayload) {
  if (!payload.items?.length) {
    return Response.json({ error: "No items provided" }, { status: 400 });
  }

  const rows = await readRangeFresh("Training");
  const headers = rows[0];

  // Build cell-level writes (safe — only touches the specific cells)
  const data: Array<{ range: string; values: string[][] }> = [];
  for (const item of payload.items) {
    const colIndex = headers.findIndex(
      (h) => h.trim().toUpperCase() === item.column.toUpperCase()
    );
    if (colIndex < 0) continue;
    const col = colToLetter(colIndex);
    data.push({ range: `Training!${col}${item.row}`, values: [[item.newValue || ""]] });
  }

  // Write in chunks of 50 to avoid quota (with delay between chunks)
  const CHUNK_SIZE = 50;
  let written = 0;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    const sheets = getSheets();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSpreadsheetId(),
      requestBody: { valueInputOption: "USER_ENTERED", data: chunk },
    });
    written += chunk.length;
    // Wait 1 second between chunks to avoid quota
    if (i + CHUNK_SIZE < data.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  invalidateAll();
  return Response.json({ success: true, message: `Fixed ${written} cell(s)` });
}

// ----------------------------------------------------------------
// Remove duplicate rows
// ----------------------------------------------------------------
async function handleRemoveDuplicates(payload: RemoveDuplicatesPayload) {
  const { keepRow, deleteRows } = payload;
  if (!keepRow || !deleteRows?.length) {
    return Response.json({ error: "Missing keepRow or deleteRows" }, { status: 400 });
  }

  const rows = await readRangeFresh("Training");
  const headers = rows[0];
  const totalCols = headers.length;
  const keepData = rows[keepRow - 1];
  if (!keepData) {
    return Response.json({ error: `Row ${keepRow} not found` }, { status: 400 });
  }

  // Merge: collect all cells to update
  const mergeWrites: Array<{ range: string; value: string }> = [];
  for (const delRow of deleteRows) {
    const delData = rows[delRow - 1];
    if (!delData) continue;
    for (let col = 0; col < totalCols; col++) {
      const keptVal = (keepData[col] || "").trim();
      const delVal = (delData[col] || "").trim();
      if (!keptVal && delVal) {
        mergeWrites.push({ range: `Training!${colToLetter(col)}${keepRow}`, value: delVal });
      }
    }
  }

  // Batch merge writes
  if (mergeWrites.length > 0) {
    const sheets = getSheets();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSpreadsheetId(),
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: mergeWrites.map((w) => ({ range: w.range, values: [[w.value]] })),
      },
    });
  }

  // Delete rows
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });
  const trainingSheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === "Training"
  );
  if (!trainingSheet?.properties?.sheetId && trainingSheet?.properties?.sheetId !== 0) {
    return Response.json({ error: "Could not find Training sheet" }, { status: 500 });
  }
  const sheetId = trainingSheet.properties.sheetId!;

  const sortedDeleteRows = [...deleteRows].sort((a, b) => b - a);
  const requests = sortedDeleteRows.map((rowNum) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: "ROWS" as const,
        startIndex: rowNum - 1,
        endIndex: rowNum,
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
// Fix CPR/FA mismatches — batch write
// ----------------------------------------------------------------
async function handleFixCprFa(payload: FixCprFaPayload) {
  if (!payload.items?.length) {
    return Response.json({ error: "No items provided" }, { status: 400 });
  }

  const rows = await readRangeFresh("Training");
  const headers = rows[0];

  const cprCol = headers.findIndex((h) => h.trim().toUpperCase() === "CPR");
  const faCol = headers.findIndex((h) => h.trim().toUpperCase() === "FIRSTAID");

  if (cprCol < 0 || faCol < 0) {
    return Response.json({ error: `CPR (col ${cprCol}) or FIRSTAID (col ${faCol}) not found` }, { status: 500 });
  }

  const skipped: string[] = [];
  const writes: Array<{ range: string; values: string[][] }> = [];

  for (const item of payload.items) {
    const rowData = rows[item.row - 1];
    if (!rowData) { skipped.push(`Row ${item.row}: not found`); continue; }

    let cprVal = (rowData[cprCol] || "").toString().trim();
    if (!cprVal) { skipped.push(`Row ${item.row}: CPR is empty`); continue; }

    // Normalize to M/D/YYYY if needed
    if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cprVal)) {
      const shortYr = cprVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
      if (shortYr) {
        let yr = parseInt(shortYr[3]);
        yr += yr < 50 ? 2000 : 1900;
        cprVal = `${parseInt(shortYr[1])}/${parseInt(shortYr[2])}/${yr}`;
      } else {
        try {
          const d = new Date(cprVal);
          if (!isNaN(d.getTime()) && d.getFullYear() >= 1990) {
            cprVal = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
          }
        } catch {}
      }
    }

    // Add cell-level writes (safe — only touches CPR and FA columns)
    const cprLetter = colToLetter(cprCol);
    const faLetter = colToLetter(faCol);
    writes.push({ range: `Training!${cprLetter}${item.row}`, values: [[cprVal]] });
    writes.push({ range: `Training!${faLetter}${item.row}`, values: [[cprVal]] });
  }

  // Write in chunks of 50 to avoid quota
  const CHUNK_SIZE = 50;
  let written = 0;
  for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
    const chunk = writes.slice(i, i + CHUNK_SIZE);
    const sheets = getSheets();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSpreadsheetId(),
      requestBody: { valueInputOption: "USER_ENTERED", data: chunk },
    });
    written += chunk.length;
    if (i + CHUNK_SIZE < writes.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const fixed = Math.floor(written / 2);
  invalidateAll();
  return Response.json({
    success: true,
    message: `Synced ${fixed} row(s)${skipped.length > 0 ? ". Skipped: " + skipped.slice(0, 3).join("; ") : ""}`,
    fixed,
  });
}
