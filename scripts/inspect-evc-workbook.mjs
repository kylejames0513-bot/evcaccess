/**
 * Lists sheet names and first-row headers for EVC workbooks (dev-only).
 * Usage: node scripts/inspect-evc-workbook.mjs [path-to-xlsx]
 * Default: ./EVC_Attendance_Tracker.xlsx
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const defaultFile = path.join(root, "EVC_Attendance_Tracker.xlsx");
const filePath = path.resolve(process.argv[2] ?? defaultFile);

if (!fs.existsSync(filePath)) {
  console.error("File not found:", filePath);
  process.exit(1);
}

const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: "buffer", cellDates: true });

console.log("Workbook:", path.basename(filePath));
console.log("Sheets:", wb.SheetNames.length);
for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  if (!sheet) continue;
  const ref = sheet["!ref"];
  const range = ref ? XLSX.utils.decode_range(ref) : null;
  const rowCount = range ? range.e.r - range.s.r + 1 : 0;
  const headerRow = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    range: range ? 0 : undefined,
  })[0];
  const headers = Array.isArray(headerRow)
    ? headerRow.map((c) => String(c ?? "").trim()).filter(Boolean)
    : [];
  console.log("\n---", name, "---");
  console.log("  Approx data rows (incl. header):", rowCount);
  console.log("  First row cells:", headers.length ? headers.join(" | ") : "(empty or no grid)");
}
