// ============================================================
// Supabase Sync — Merge 3 Sheets + Push to Supabase
// ============================================================
// Reads Training, Paylocity Import, and PHS Import sheets.
// For each employee+training, picks the MOST RECENT date
// across all 3 sources, then pushes to Supabase.
//
// Add via Extensions > Apps Script, then use the
// "Supabase Sync" menu that appears after reload.
// ============================================================

const SUPABASE_URL = "https://xkfvipcxnzwyskknkmpj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrZnZpcGN4bnp3eXNra25rbXBqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY5NjU5MCwiZXhwIjoyMDkxMjcyNTkwfQ.VjmNtuLvrZoSEGiSLAcHHBBsbx-I72jSH5eIoOHejrk";

// ── Paylocity skill → column key mapping ──
const PAYLOCITY_MAP = {
  "cpr.fa": "CPR", "cpr/fa": "CPR", "cpr": "CPR", "cpr/first aid": "CPR",
  "first aid": "FIRSTAID", "firstaid": "FIRSTAID",
  "med training": "MED_TRAIN", "med cert": "MED_TRAIN", "med recert": "MED_TRAIN",
  "medication training": "MED_TRAIN", "initial med training": "MED_TRAIN",
  "post med": "POST MED",
  "ukeru": "Ukeru", "behavior training": "Ukeru",
  "safety care": "Safety Care",
  "mealtime instructions": "Mealtime", "mealtime": "Mealtime",
  "pom": "POM", "poms": "POM",
  "pers cent thnk": "Pers Cent Thnk", "person centered thinking": "Pers Cent Thnk", "person centered": "Pers Cent Thnk",
  "meaningful day": "Meaningful Day", "md refresh": "MD refresh",
  "rights training": "Rights Training", "title vi": "Title VI",
  "active shooter": "Active Shooter", "skills system": "Skills System",
  "cpi": "CPI", "cpm": "CPM", "pfh/didd": "PFH/DIDD",
  "basic vcrm": "Basic VCRM", "advanced vcrm": "Advanced VCRM", "adv vcrm": "Advanced VCRM",
  "trn": "TRN", "asl": "ASL",
  "shift": "SHIFT", "adv shift": "ADV SHIFT", "advanced shift": "ADV SHIFT",
  "mc": "MC", "skills online": "Skills Online", "etis": "ETIS",
  "gerd": "GERD", "dysphagia": "Dysphagia Overview", "dysphagia overview": "Dysphagia Overview",
  "diabetes": "Diabetes", "falls": "Falls", "health passport": "Health Passport",
  "hco": "HCO Training", "hco training": "HCO Training",
};

// ── PHS category → column key mapping ──
const PHS_CATEGORY_MAP = { "med admin": "MED_TRAIN", "cpr/fa": "CPR" };
const PHS_ADDITIONAL_MAP = {
  "ukeru": "Ukeru", "safety care": "Safety Care", "behavior training": "Ukeru",
  "mealtime": "Mealtime", "mealtime instructions": "Mealtime",
  "med training": "MED_TRAIN", "medication training": "MED_TRAIN",
  "post med": "POST MED", "pom": "POM",
  "person centered": "Pers Cent Thnk", "person centered thinking": "Pers Cent Thnk",
  "meaningful day": "Meaningful Day", "rights training": "Rights Training", "rights": "Rights Training",
  "title vi": "Title VI", "active shooter": "Active Shooter", "skills system": "Skills System",
  "cpm": "CPM", "pfh/didd": "PFH/DIDD",
  "basic vcrm": "Basic VCRM", "advanced vcrm": "Advanced VCRM",
  "trn": "TRN", "asl": "ASL", "shift": "SHIFT",
  "gerd": "GERD", "dysphagia": "Dysphagia Overview", "dysphagia overview": "Dysphagia Overview",
  "diabetes": "Diabetes", "falls": "Falls",
  "health passport": "Health Passport", "hco": "HCO Training", "hco training": "HCO Training",
};

// Excusal codes (prefixed to avoid conflict with Core.gs)
const SYNC_EXCUSAL_CODES = new Set([
  "NA", "N/A", "N/", "VP", "DIR", "DIRECTOR", "CEO", "CFO", "COO", "CMO",
  "AVP", "SVP", "EVP", "PRESIDENT", "MGR", "MANAGER", "SUPERVISOR", "SUPV",
  "ELC", "EI", "FACILITIES", "MAINT", "HR", "FINANCE", "FIN", "IT", "ADMIN",
  "NURSE", "LPN", "RN", "CNA", "BH", "PA", "BA", "QA", "TAC", "BOARD",
  "TRAINER", "LP", "NS", "LLL",
]);

// ── Menu ──
// Call addSupabaseSyncMenu() from the existing onOpen() in Core.gs,
// or run it manually once from the script editor to add the menu.
function addSupabaseSyncMenu() {
  SpreadsheetApp.getUi().createMenu("Supabase Sync")
    .addItem("Merge All 3 Sheets → Supabase", "mergeAndSync")
    .addItem("Sync Employees Only", "syncEmployees")
    .addToUi();
}

// ════════════════════════════════════════════════════════════
// MAIN: Merge 3 sheets, pick most recent, push to Supabase
// ════════════════════════════════════════════════════════════
function mergeAndSync() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.alert(
    "Merge & Sync to Supabase",
    "This will:\n" +
    "1. Read Training, Paylocity Import, and PHS Import sheets\n" +
    "2. For each employee+training, pick the MOST RECENT date\n" +
    "3. Push employees, training records, and excusals to Supabase\n\n" +
    "Continue?",
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) return;

  const log = [];
  log.push("=== Step 1: Sync employees ===");
  log.push(syncEmployees());

  log.push("\n=== Step 2: Read all 3 sheets ===");

  // bestDates: "lastName,firstName|columnKey" → { date: Date, source: string }
  const bestDates = {};
  // excusals: "lastName,firstName|columnKey" → reason
  const excusalList = {};

  // ── Read Training sheet ──
  const trainingResult = readTrainingSheet(bestDates, excusalList);
  log.push(trainingResult);

  // ── Read Paylocity Import ──
  const payResult = readPaylocityImport(bestDates);
  log.push(payResult);

  // ── Read PHS Import ──
  const phsResult = readPHSImport(bestDates);
  log.push(phsResult);

  // ── Summary ──
  const totalRecords = Object.keys(bestDates).length;
  const totalExcusals = Object.keys(excusalList).length;
  log.push("\n=== Step 3: Push " + totalRecords + " records + " + totalExcusals + " excusals to Supabase ===");

  // ── Get employee IDs and training type IDs from Supabase ──
  const empLookup = getEmployeeLookup();
  const ttLookup = getTrainingTypeLookup();

  // ── Push training records ──
  const records = [];
  for (const key in bestDates) {
    const parts = key.split("|");
    const namePart = parts[0];
    const colKey = parts[1];

    const empId = empLookup[namePart.toLowerCase()];
    const ttId = ttLookup[colKey.toUpperCase()];
    if (!empId || !ttId) continue;

    const entry = bestDates[key];
    const dateStr = Utilities.formatDate(entry.date, "America/New_York", "yyyy-MM-dd");

    records.push({
      employee_id: empId,
      training_type_id: ttId,
      completion_date: dateStr,
      source: entry.source,
    });
  }

  let recInserted = 0;
  const BATCH = 50;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const resp = supabasePost("/rest/v1/training_records", batch, {
      "Prefer": "resolution=ignore-duplicates",
    });
    if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
      recInserted += batch.length;
    }
    Utilities.sleep(200);
  }
  log.push("Training records: " + recInserted + " of " + records.length + " pushed");

  // ── Push excusals ──
  const excRows = [];
  for (const key in excusalList) {
    const parts = key.split("|");
    const namePart = parts[0];
    const colKey = parts[1];

    const empId = empLookup[namePart.toLowerCase()];
    const ttId = ttLookup[colKey.toUpperCase()];
    if (!empId || !ttId) continue;

    excRows.push({
      employee_id: empId,
      training_type_id: ttId,
      reason: excusalList[key],
    });
  }

  let excInserted = 0;
  for (let i = 0; i < excRows.length; i += BATCH) {
    const batch = excRows.slice(i, i + BATCH);
    const resp = supabasePost("/rest/v1/excusals", batch, {
      "Prefer": "resolution=merge-duplicates",
    });
    if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
      excInserted += batch.length;
    }
    Utilities.sleep(200);
  }
  log.push("Excusals: " + excInserted + " of " + excRows.length + " pushed");

  log.push("\n=== Done! ===");
  ui.alert("Merge & Sync Complete", log.join("\n"), ui.ButtonSet.OK);
}

// ════════════════════════════════════════════════════════════
// Read Training sheet
// ════════════════════════════════════════════════════════════
function readTrainingSheet(bestDates, excusalList) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Training");
  if (!sheet) return "Training sheet: NOT FOUND (skipped)";

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = (name) => headers.findIndex(h => String(h).trim().toUpperCase() === name.toUpperCase());

  const lNameCol = col("L NAME");
  const fNameCol = col("F NAME");
  const activeCol = col("ACTIVE");
  if (lNameCol < 0 || fNameCol < 0) return "Training sheet: L NAME / F NAME not found";

  // Find all training columns
  const trainingCols = [];
  const allColKeys = new Set();
  // Get training types from Supabase to know which headers are training columns
  const ttLookup = getTrainingTypeLookup();
  for (let c = 0; c < headers.length; c++) {
    const header = String(headers[c]).trim().toUpperCase();
    if (ttLookup[header]) {
      trainingCols.push({ col: c, key: findOriginalKey(headers[c], ttLookup) });
    }
  }

  let count = 0;
  let excCount = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const lastName = String(row[lNameCol] || "").trim();
    const firstName = String(row[fNameCol] || "").trim();
    if (!lastName) continue;

    const active = activeCol >= 0 ? String(row[activeCol] || "").trim().toUpperCase() : "Y";
    if (active !== "Y") continue;

    const nameKey = lastName + "," + firstName;

    for (const tc of trainingCols) {
      const value = String(row[tc.col] || "").trim();
      if (!value) continue;

      const upper = value.toUpperCase();
      if (SYNC_EXCUSAL_CODES.has(upper)) {
        excusalList[nameKey + "|" + tc.key] = value;
        excCount++;
        continue;
      }

      if (upper.startsWith("FX") || upper.startsWith("FAIL") || upper === "FS") continue;

      const d = tryParseDate(value);
      if (d) {
        updateBest(bestDates, nameKey + "|" + tc.key, d, "training_sheet");
        count++;
      }
    }
  }

  return "Training sheet: " + count + " dates, " + excCount + " excusals";
}

// ════════════════════════════════════════════════════════════
// Read Paylocity Import sheet
// ════════════════════════════════════════════════════════════
function readPaylocityImport(bestDates) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Paylocity Import");
  if (!sheet) return "Paylocity Import: NOT FOUND (skipped)";

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return "Paylocity Import: empty";

  const headers = data[0];
  const col = (name) => headers.findIndex(h => String(h).trim().toLowerCase().includes(name.toLowerCase()));

  const lNameCol = col("last");
  const fNameCol = col("first");
  const prefCol = col("preferred");
  const skillCol = col("skill");
  const dateCol = col("effective");

  if (lNameCol < 0 || fNameCol < 0 || skillCol < 0 || dateCol < 0) {
    return "Paylocity Import: missing columns (need Last Name, First Name, Skill, Effective Date)";
  }

  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const lastName = String(row[lNameCol] || "").trim();
    const firstName = String(row[fNameCol] || "").trim();
    const skill = String(row[skillCol] || "").trim().toLowerCase();
    const dateVal = String(row[dateCol] || "").trim();

    if (!lastName || !skill || !dateVal) continue;

    const colKey = PAYLOCITY_MAP[skill];
    if (!colKey) continue;

    const d = tryParseDate(dateVal);
    if (!d) continue;

    const nameKey = lastName + "," + firstName;
    updateBest(bestDates, nameKey + "|" + colKey, d, "paylocity");
    count++;

    // CPR auto-links to FIRSTAID
    if (colKey === "CPR") updateBest(bestDates, nameKey + "|FIRSTAID", d, "paylocity");
    if (colKey === "FIRSTAID") updateBest(bestDates, nameKey + "|CPR", d, "paylocity");
  }

  return "Paylocity Import: " + count + " dates";
}

// ════════════════════════════════════════════════════════════
// Read PHS Import sheet
// ════════════════════════════════════════════════════════════
function readPHSImport(bestDates) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("PHS Import");
  if (!sheet) return "PHS Import: NOT FOUND (skipped)";

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return "PHS Import: empty";

  const headers = data[0];
  const col = (name) => headers.findIndex(h => String(h).trim().toLowerCase().includes(name.toLowerCase()));

  const nameCol = col("employee");
  const catCol = col("category");
  const typeCol = col("type");
  const dateCol = col("effective");
  const termCol = col("termination");

  if (nameCol < 0 || catCol < 0 || dateCol < 0) {
    return "PHS Import: missing columns (need Employee Name, Upload Category, Effective Date)";
  }

  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const empName = String(row[nameCol] || "").trim();
    const category = String(row[catCol] || "").trim().toLowerCase();
    const uploadType = typeCol >= 0 ? String(row[typeCol] || "").trim().toLowerCase() : "";
    const dateVal = String(row[dateCol] || "").trim();
    const termVal = termCol >= 0 ? String(row[termCol] || "").trim() : "";

    if (!empName || !dateVal) continue;
    if (termVal) continue; // skip terminated
    if (uploadType === "fail" || uploadType === "no show") continue;

    // Resolve training column
    let colKey = PHS_CATEGORY_MAP[category] || null;
    if (!colKey && category === "additional training") {
      colKey = PHS_ADDITIONAL_MAP[uploadType] || null;
      if (!colKey) {
        for (const key in PHS_ADDITIONAL_MAP) {
          if (PHS_ADDITIONAL_MAP[key] && (uploadType.includes(key) || key.includes(uploadType))) {
            colKey = PHS_ADDITIONAL_MAP[key];
            break;
          }
        }
      }
    }
    if (!colKey) continue;

    const d = tryParseDate(dateVal);
    if (!d) continue;

    // PHS names are "Last, First" — parse
    let lastName = empName;
    let firstName = "";
    if (empName.includes(",")) {
      const parts = empName.split(",");
      lastName = parts[0].trim();
      firstName = parts.slice(1).join(",").trim();
    }

    const nameKey = lastName + "," + firstName;
    updateBest(bestDates, nameKey + "|" + colKey, d, "phs");
    count++;

    if (colKey === "CPR") updateBest(bestDates, nameKey + "|FIRSTAID", d, "phs");
    if (colKey === "FIRSTAID") updateBest(bestDates, nameKey + "|CPR", d, "phs");
  }

  return "PHS Import: " + count + " dates";
}

// ════════════════════════════════════════════════════════════
// Sync employees from Training sheet to Supabase
// ════════════════════════════════════════════════════════════
function syncEmployees() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Training");
  if (!sheet) return "Training sheet not found";

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = (name) => headers.findIndex(h => String(h).trim().toUpperCase() === name.toUpperCase());

  const lNameCol = col("L NAME");
  const fNameCol = col("F NAME");
  const activeCol = col("ACTIVE");
  const divCol = col("Division Description");
  const hireCol = col("Hire Date");
  if (lNameCol < 0 || fNameCol < 0) return "L NAME / F NAME columns not found";

  const employees = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const lastName = String(row[lNameCol] || "").trim();
    const firstName = String(row[fNameCol] || "").trim();
    if (!lastName) continue;

    const active = activeCol >= 0 ? String(row[activeCol] || "").trim().toUpperCase() : "Y";
    const emp = {
      first_name: firstName,
      last_name: lastName,
      is_active: active === "Y",
      department: divCol >= 0 ? String(row[divCol] || "").trim() || null : null,
      hire_date: null,
    };

    if (hireCol >= 0 && row[hireCol]) {
      const d = new Date(row[hireCol]);
      if (!isNaN(d.getTime())) {
        emp.hire_date = Utilities.formatDate(d, "America/New_York", "yyyy-MM-dd");
      }
    }

    employees.push(emp);
  }

  let inserted = 0;
  const BATCH = 50;
  for (let i = 0; i < employees.length; i += BATCH) {
    const batch = employees.slice(i, i + BATCH);
    const resp = supabasePost("/rest/v1/employees", batch, { "Prefer": "resolution=ignore-duplicates" });
    if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) inserted += batch.length;
    Utilities.sleep(100);
  }

  return "Employees: " + inserted + " of " + employees.length + " synced";
}

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════

function updateBest(bestDates, key, date, source) {
  const existing = bestDates[key];
  if (!existing || date.getTime() > existing.date.getTime()) {
    bestDates[key] = { date: date, source: source };
  }
}

function tryParseDate(value) {
  if (!value) return null;
  const s = String(value).trim();

  // M/D/YYYY or M/D/YY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let yr = parseInt(m[3]);
    if (yr < 100) yr += 2000;
    const d = new Date(yr, parseInt(m[1]) - 1, parseInt(m[2]));
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;
  }

  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    if (!isNaN(d.getTime())) return d;
  }

  // Native parse fallback
  const d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;

  return null;
}

function findOriginalKey(header, ttLookup) {
  const h = String(header).trim();
  const upper = h.toUpperCase();
  if (ttLookup[upper]) return h;
  // Return the header as-is since it matched
  return h;
}

function getEmployeeLookup() {
  const resp = supabaseGet("/rest/v1/employees?select=id,first_name,last_name&is_active=eq.true&limit=10000");
  const employees = JSON.parse(resp.getContentText());
  const lookup = {};
  for (const e of employees) {
    const key = (e.last_name + "," + e.first_name).toLowerCase();
    lookup[key] = e.id;
  }
  return lookup;
}

function getTrainingTypeLookup() {
  const resp = supabaseGet("/rest/v1/training_types?select=id,name,column_key&is_active=eq.true");
  const types = JSON.parse(resp.getContentText());
  const lookup = {};
  for (const tt of types) {
    lookup[tt.column_key.toUpperCase()] = tt.id;
    lookup[tt.name.toUpperCase()] = tt.id;
  }
  return lookup;
}

// ── HTTP helpers ──
function supabaseGet(path) {
  return UrlFetchApp.fetch(SUPABASE_URL + path, {
    method: "get",
    headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY },
    muteHttpExceptions: true,
  });
}

function supabasePost(path, data, extraHeaders) {
  const headers = { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" };
  if (extraHeaders) { for (const k in extraHeaders) headers[k] = extraHeaders[k]; }
  return UrlFetchApp.fetch(SUPABASE_URL + path, {
    method: "post", headers: headers, payload: JSON.stringify(data), muteHttpExceptions: true,
  });
}
