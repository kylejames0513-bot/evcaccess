// ============================================================
// Supabase Sync — Push Google Sheet data to Supabase
// ============================================================
// Add this to your Google Sheet via Extensions > Apps Script
// Then run syncAllToSupabase() from the menu or script editor
// ============================================================

const SUPABASE_URL = "https://xkfvipcxnzwyskknkmpj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrZnZpcGN4bnp3eXNra25rbXBqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY5NjU5MCwiZXhwIjoyMDkxMjcyNTkwfQ.VjmNtuLvrZoSEGiSLAcHHBBsbx-I72jSH5eIoOHejrk";

// ── Menu ──
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Supabase Sync")
    .addItem("Sync All to Supabase", "syncAllToSupabase")
    .addItem("Sync Employees Only", "syncEmployees")
    .addItem("Sync Training Records Only", "syncTrainingRecords")
    .addToUi();
}

// ── Main: sync everything ──
function syncAllToSupabase() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.alert(
    "Sync to Supabase",
    "This will push all employees and training records from the Training sheet to Supabase.\n\nExisting Supabase data will NOT be deleted — new records will be added, duplicates skipped.\n\nContinue?",
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) return;

  const log = [];
  log.push("Starting sync...");

  const empResult = syncEmployees();
  log.push(empResult);

  const recResult = syncTrainingRecords();
  log.push(recResult);

  log.push("Done!");
  ui.alert("Sync Complete", log.join("\n\n"), ui.ButtonSet.OK);
}

// ── Sync employees ──
function syncEmployees() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Training");
  if (!sheet) return "ERROR: 'Training' sheet not found";

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const col = (name) => headers.findIndex(h => String(h).trim().toUpperCase() === name.toUpperCase());
  const lNameCol = col("L NAME");
  const fNameCol = col("F NAME");
  const activeCol = col("ACTIVE");
  const idCol = col("ID");
  const divCol = col("Division Description");
  const hireCol = col("Hire Date");

  if (lNameCol < 0 || fNameCol < 0) return "ERROR: L NAME / F NAME columns not found";

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
      department: divCol >= 0 ? String(row[divCol] || "").trim() : null,
      hire_date: null,
    };

    if (hireCol >= 0 && row[hireCol]) {
      const d = new Date(row[hireCol]);
      if (!isNaN(d.getTime())) {
        emp.hire_date = Utilities.formatDate(d, "America/New_York", "yyyy-MM-dd");
      }
    }

    if (idCol >= 0 && row[idCol]) {
      emp.job_title = String(row[idCol]).trim(); // store sheet ID in job_title for reference
    }

    employees.push(emp);
  }

  // Batch insert (upsert by name)
  let inserted = 0;
  let skipped = 0;
  const BATCH = 50;

  for (let i = 0; i < employees.length; i += BATCH) {
    const batch = employees.slice(i, i + BATCH);
    const resp = supabasePost("/rest/v1/employees", batch, {
      "Prefer": "resolution=merge-duplicates",
    });

    if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
      inserted += batch.length;
    } else {
      // Try one by one for this batch
      for (const emp of batch) {
        const r = supabasePost("/rest/v1/employees", [emp], {
          "Prefer": "resolution=ignore-duplicates",
        });
        if (r.getResponseCode() >= 200 && r.getResponseCode() < 300) {
          inserted++;
        } else {
          skipped++;
        }
      }
    }
  }

  return "Employees: " + inserted + " synced, " + skipped + " skipped (of " + employees.length + " total)";
}

// ── Sync training records ──
function syncTrainingRecords() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Training");
  if (!sheet) return "ERROR: 'Training' sheet not found";

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const col = (name) => headers.findIndex(h => String(h).trim().toUpperCase() === name.toUpperCase());
  const lNameCol = col("L NAME");
  const fNameCol = col("F NAME");
  const activeCol = col("ACTIVE");

  if (lNameCol < 0 || fNameCol < 0) return "ERROR: L NAME / F NAME columns not found";

  // Get training types from Supabase
  const typesResp = supabaseGet("/rest/v1/training_types?select=id,name,column_key");
  const trainingTypes = JSON.parse(typesResp.getContentText());
  const typeByKey = {};
  for (const tt of trainingTypes) {
    typeByKey[tt.column_key.toUpperCase()] = tt;
    typeByKey[tt.name.toUpperCase()] = tt;
  }

  // Get employees from Supabase (for ID lookup)
  const empResp = supabaseGet("/rest/v1/employees?select=id,first_name,last_name&is_active=eq.true");
  const empList = JSON.parse(empResp.getContentText());
  const empByName = {};
  for (const e of empList) {
    const key = (e.last_name + ", " + e.first_name).toLowerCase();
    empByName[key] = e.id;
    // Also index by last name only for fallback
    const lastKey = e.last_name.toLowerCase();
    if (!empByName[lastKey]) empByName[lastKey] = e.id;
  }

  // Excusal codes
  const EXCUSAL_CODES = new Set([
    "NA", "N/A", "N/", "VP", "DIR", "DIRECTOR", "CEO", "CFO", "COO", "CMO",
    "AVP", "SVP", "EVP", "PRESIDENT", "MGR", "MANAGER", "SUPERVISOR", "SUPV",
    "ELC", "EI", "FACILITIES", "MAINT", "HR", "FINANCE", "FIN", "IT", "ADMIN",
    "NURSE", "LPN", "RN", "CNA", "BH", "PA", "BA", "QA", "TAC", "BOARD",
    "TRAINER", "LP", "NS", "LLL",
  ]);

  const records = [];
  const excusals = [];

  // Find training columns by matching header to training type column_keys
  const trainingCols = [];
  for (let c = 0; c < headers.length; c++) {
    const header = String(headers[c]).trim().toUpperCase();
    if (typeByKey[header]) {
      trainingCols.push({ col: c, type: typeByKey[header] });
    }
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const lastName = String(row[lNameCol] || "").trim();
    const firstName = String(row[fNameCol] || "").trim();
    if (!lastName) continue;

    const active = activeCol >= 0 ? String(row[activeCol] || "").trim().toUpperCase() : "Y";
    if (active !== "Y") continue;

    const nameKey = (lastName + ", " + firstName).toLowerCase();
    const employeeId = empByName[nameKey];
    if (!employeeId) continue;

    for (const tc of trainingCols) {
      const value = String(row[tc.col] || "").trim();
      if (!value) continue;

      const upper = value.toUpperCase();

      // Excusal
      if (EXCUSAL_CODES.has(upper)) {
        excusals.push({
          employee_id: employeeId,
          training_type_id: tc.type.id,
          reason: value,
        });
        continue;
      }

      // Skip failure codes for now
      if (upper.startsWith("FX") || upper.startsWith("FAIL") || upper === "FS") continue;

      // Try to parse as date
      let dateStr = null;
      try {
        const d = new Date(value);
        if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
          dateStr = Utilities.formatDate(d, "America/New_York", "yyyy-MM-dd");
        }
      } catch (e) {}

      // Also try M/D/YYYY format
      if (!dateStr) {
        const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (m) {
          let yr = parseInt(m[3]);
          if (yr < 100) yr += 2000;
          const d = new Date(yr, parseInt(m[1]) - 1, parseInt(m[2]));
          if (!isNaN(d.getTime())) {
            dateStr = Utilities.formatDate(d, "America/New_York", "yyyy-MM-dd");
          }
        }
      }

      if (dateStr) {
        records.push({
          employee_id: employeeId,
          training_type_id: tc.type.id,
          completion_date: dateStr,
          source: "import",
        });
      }
    }
  }

  // Insert training records in batches
  let recInserted = 0;
  let recSkipped = 0;
  const BATCH = 50;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const resp = supabasePost("/rest/v1/training_records", batch, {
      "Prefer": "resolution=ignore-duplicates",
    });
    if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
      recInserted += batch.length;
    } else {
      recSkipped += batch.length;
    }
    Utilities.sleep(200); // rate limit
  }

  // Insert excusals in batches
  let excInserted = 0;
  for (let i = 0; i < excusals.length; i += BATCH) {
    const batch = excusals.slice(i, i + BATCH);
    const resp = supabasePost("/rest/v1/excusals", batch, {
      "Prefer": "resolution=merge-duplicates",
    });
    if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
      excInserted += batch.length;
    }
    Utilities.sleep(200);
  }

  return "Training records: " + recInserted + " synced, " + recSkipped + " skipped\nExcusals: " + excInserted + " synced";
}

// ── HTTP helpers ──
function supabaseGet(path) {
  return UrlFetchApp.fetch(SUPABASE_URL + path, {
    method: "get",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
    },
    muteHttpExceptions: true,
  });
}

function supabasePost(path, data, extraHeaders) {
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json",
  };
  if (extraHeaders) {
    for (const k in extraHeaders) headers[k] = extraHeaders[k];
  }
  return UrlFetchApp.fetch(SUPABASE_URL + path, {
    method: "post",
    headers: headers,
    payload: JSON.stringify(data),
    muteHttpExceptions: true,
  });
}
