import { google, sheets_v4 } from "googleapis";

// ============================================================
// Google Sheets Client — connects to your existing spreadsheet
// ============================================================
// Uses a Google Cloud service account for server-side access.
// Setup: https://cloud.google.com/iam/docs/service-accounts-create
//   1. Create a service account in Google Cloud Console
//   2. Download the JSON key file
//   3. Share your spreadsheet with the service account email
//   4. Set the env vars below
// ============================================================

let sheetsClient: sheets_v4.Sheets | null = null;

function getCredentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!email || !key) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY env vars. " +
      "See .env.local.example for setup instructions."
    );
  }
  // The key comes in with literal \n in the env var — replace with real newlines
  return { email, key: key.replace(/\\n/g, "\n") };
}

export function getSheets(): sheets_v4.Sheets {
  if (sheetsClient) return sheetsClient;

  const { email, key } = getCredentials();

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

export function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) {
    throw new Error("Missing GOOGLE_SPREADSHEET_ID env var.");
  }
  return id;
}

// ============================================================
// Core read/write helpers
// ============================================================

import { cached, invalidateCache } from "@/lib/cache";

/**
 * Read a range from the spreadsheet.
 * Results are cached for 60 seconds to avoid hitting API quota.
 */
export async function readRange(range: string): Promise<string[][]> {
  return cached(`sheet:${range}`, async () => {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range,
      valueRenderOption: "FORMATTED_VALUE",
    });
    return (res.data.values as string[][]) || [];
  });
}

/**
 * Read without cache — for when you need fresh data right after a write.
 */
export async function readRangeFresh(range: string): Promise<string[][]> {
  invalidateCache(`sheet:${range}`);
  return readRange(range);
}

/**
 * Read a sheet and return rows as objects keyed by header names.
 * First row is treated as headers.
 */
export async function readSheetAsObjects<T extends Record<string, string>>(
  sheetName: string
): Promise<T[]> {
  const rows = await readRange(sheetName);
  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] || "";
    });
    return obj as T;
  });
}

/**
 * Write values to a range (overwrite).
 */
export async function writeRange(
  range: string,
  values: (string | number | null)[][]
): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/**
 * Append rows to the bottom of a sheet.
 */
export async function appendRows(
  sheetName: string,
  values: (string | number | null)[][]
): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: sheetName,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

/**
 * Find a row by matching a column value. Returns the 1-based row index, or -1.
 */
export async function findRow(
  sheetName: string,
  columnIndex: number,
  value: string
): Promise<number> {
  const rows = await readRange(sheetName);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][columnIndex]?.trim().toLowerCase() === value.trim().toLowerCase()) {
      return i + 1; // 1-based for Sheets API
    }
  }
  return -1;
}

/**
 * Update a specific cell.
 */
export async function updateCell(
  sheetName: string,
  row: number,
  col: number,
  value: string | number
): Promise<void> {
  // Convert col number to letter (0=A, 1=B, etc.)
  const colLetter = String.fromCharCode(65 + col);
  const range = `${sheetName}!${colLetter}${row}`;
  await writeRange(range, [[value]]);
}

/**
 * Get all sheet names in the spreadsheet.
 */
export async function getSheetNames(): Promise<string[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: getSpreadsheetId(),
    fields: "sheets.properties.title",
  });
  return (
    res.data.sheets?.map((s) => s.properties?.title || "").filter(Boolean) || []
  );
}
