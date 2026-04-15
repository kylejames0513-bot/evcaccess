/**
 * Prints workbook sheet names only (no cell data). For local inventory / dev.
 * Usage: node scripts/list-workbook-sheets.js <path-to.xlsx|.xlsm>
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts/list-workbook-sheets.js <workbook.xlsx|.xlsm>");
  process.exit(1);
}
const resolved = path.resolve(process.cwd(), filePath);
if (!fs.existsSync(resolved)) {
  console.error("File not found:", resolved);
  process.exit(1);
}
const buf = fs.readFileSync(resolved);
const wb = XLSX.read(buf, { type: "buffer", bookSheets: true });
for (const name of wb.SheetNames) {
  console.log(name);
}
