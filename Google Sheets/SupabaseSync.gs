// ============================================================
// Supabase Sync — Merge 3 Sheets + Push to Supabase
// ============================================================
// Run addSupabaseSyncMenu() once to add the menu, then use
// "Supabase Sync > Merge All 3 Sheets → Supabase"
// ============================================================

const SUPABASE_URL = "https://xkfvipcxnzwyskknkmpj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrZnZpcGN4bnp3eXNra25rbXBqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY5NjU5MCwiZXhwIjoyMDkxMjcyNTkwfQ.VjmNtuLvrZoSEGiSLAcHHBBsbx-I72jSH5eIoOHejrk";

const PAYLOCITY_MAP = {
  "cpr.fa": "CPR", "cpr/fa": "CPR", "cpr": "CPR", "cpr/first aid": "CPR",
  "first aid": "FIRSTAID", "firstaid": "FIRSTAID",
  "med training": "MED_TRAIN", "med cert": "MED_TRAIN", "med recert": "MED_TRAIN",
  "medication training": "MED_TRAIN", "initial med training": "MED_TRAIN",
  "post med": "POST MED",
  "ukeru": "Ukeru", "behavior training": "Ukeru",
  "safety care": "Safety Care", "mealtime instructions": "Mealtime", "mealtime": "Mealtime",
  "pom": "POM", "poms": "POM",
  "pers cent thnk": "Pers Cent Thnk", "person centered thinking": "Pers Cent Thnk", "person centered": "Pers Cent Thnk",
  "meaningful day": "Meaningful Day", "md refresh": "MD refresh",
  "rights training": "Rights Training", "title vi": "Title VI",
  "active shooter": "Active Shooter", "skills system": "Skills System",
  "cpi": "CPI", "cpm": "CPM", "pfh/didd": "PFH/DIDD",
  "basic vcrm": "Basic VCRM", "advanced vcrm": "Advanced VCRM", "adv vcrm": "Advanced VCRM",
  "trn": "TRN", "asl": "ASL", "shift": "SHIFT", "adv shift": "ADV SHIFT", "advanced shift": "ADV SHIFT",
  "mc": "MC", "skills online": "Skills Online", "etis": "ETIS",
  "gerd": "GERD", "dysphagia": "Dysphagia Overview", "dysphagia overview": "Dysphagia Overview",
  "diabetes": "Diabetes", "falls": "Falls", "health passport": "Health Passport",
  "hco": "HCO Training", "hco training": "HCO Training",
};

const PHS_CATEGORY_MAP = { "med admin": "MED_TRAIN", "cpr/fa": "CPR" };
const PHS_TYPE_MAP = {
  "ukeru": "Ukeru", "safety care": "Safety Care", "behavior training": "Ukeru",
  "mealtime": "Mealtime", "mealtime instructions": "Mealtime",
  "med training": "MED_TRAIN", "medication training": "MED_TRAIN",
  "post med": "POST MED", "pom": "POM",
  "person centered": "Pers Cent Thnk", "person centered thinking": "Pers Cent Thnk",
  "meaningful day": "Meaningful Day", "rights training": "Rights Training", "rights": "Rights Training",
  "title vi": "Title VI", "active shooter": "Active Shooter", "skills system": "Skills System",
  "cpm": "CPM", "pfh/didd": "PFH/DIDD", "basic vcrm": "Basic VCRM", "advanced vcrm": "Advanced VCRM",
  "trn": "TRN", "asl": "ASL", "shift": "SHIFT",
  "gerd": "GERD", "dysphagia": "Dysphagia Overview", "dysphagia overview": "Dysphagia Overview",
  "diabetes": "Diabetes", "falls": "Falls", "health passport": "Health Passport",
  "hco": "HCO Training", "hco training": "HCO Training",
};

// Only these exact codes count as excusals
const SYNC_EXCUSALS = {
  "NA":1,"N/A":1,"N/":1,"VP":1,"DIR":1,"DIRECTOR":1,"CEO":1,"CFO":1,"COO":1,"CMO":1,
  "AVP":1,"SVP":1,"EVP":1,"PRESIDENT":1,"MGR":1,"MANAGER":1,"SUPERVISOR":1,"SUPV":1,
  "ELC":1,"EI":1,"FACILITIES":1,"MAINT":1,"HR":1,"FINANCE":1,"FIN":1,"IT":1,"ADMIN":1,
  "NURSE":1,"LPN":1,"RN":1,"CNA":1,"BH":1,"PA":1,"BA":1,"QA":1,"TAC":1,"BOARD":1,
  "TRAINER":1,"LP":1,"NS":1,"LLL":1
};

function addSupabaseSyncMenu() {
  SpreadsheetApp.getUi().createMenu("Supabase Sync")
    .addItem("Merge All 3 Sheets → Supabase", "mergeAndSync")
    .addToUi();
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════
function mergeAndSync() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert("Merge & Sync", "Read all 3 sheets, pick most recent dates, push to Supabase?\n\nThis will clear existing records first.", ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;

  // Step 1: Get training types from Supabase (so we know valid column keys)
  var ttResp = supabaseGet("/rest/v1/training_types?select=id,name,column_key&is_active=eq.true&limit=100");
  var trainingTypes = JSON.parse(ttResp.getContentText());
  // Build lookup: lowercase column_key → { id, column_key }
  var ttByKey = {};
  for (var t = 0; t < trainingTypes.length; t++) {
    ttByKey[trainingTypes[t].column_key.toLowerCase()] = trainingTypes[t];
    ttByKey[trainingTypes[t].name.toLowerCase()] = trainingTypes[t];
  }

  // Step 2: Read Training sheet — get employees + dates + excusals
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Training");
  if (!sheet) { ui.alert("Training sheet not found"); return; }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var lnCol = findCol(headers, "L NAME");
  var fnCol = findCol(headers, "F NAME");
  var actCol = findCol(headers, "ACTIVE");
  var divCol = findCol(headers, "Division Description");
  var hireCol = findCol(headers, "Hire Date");

  if (lnCol < 0 || fnCol < 0) { ui.alert("L NAME / F NAME columns not found"); return; }

  // Map each header to a training type (case-insensitive)
  var headerTT = [];
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).trim();
    var match = ttByKey[h.toLowerCase()] || null;
    headerTT.push(match);
  }

  // Collect employees and best dates
  var employees = []; // { first_name, last_name, is_active, department, hire_date }
  var bestDates = {}; // "last,first|ttId" → { date: Date, source: string }
  var excusals = {};  // "last,first|ttId" → reason
  var empKeys = {};   // track seen employees

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var ln = String(row[lnCol] || "").trim();
    var fn = String(row[fnCol] || "").trim();
    if (!ln) continue;

    var active = actCol >= 0 ? String(row[actCol] || "").trim().toUpperCase() === "Y" : true;
    var dept = divCol >= 0 ? String(row[divCol] || "").trim() : "";
    var hd = null;
    if (hireCol >= 0 && row[hireCol]) {
      var hDate = new Date(row[hireCol]);
      if (!isNaN(hDate.getTime())) hd = Utilities.formatDate(hDate, "America/New_York", "yyyy-MM-dd");
    }

    var empKey = ln.toLowerCase() + "|" + fn.toLowerCase();
    if (!empKeys[empKey]) {
      employees.push({ first_name: fn, last_name: ln, is_active: active, department: dept || null, hire_date: hd });
      empKeys[empKey] = true;
    }

    if (!active) continue; // skip inactive for training data

    var nameKey = ln + "|" + fn;

    for (var c2 = 0; c2 < headers.length; c2++) {
      var tt = headerTT[c2];
      if (!tt) continue;

      var val = String(row[c2] || "").trim();
      if (!val) continue;

      var upper = val.toUpperCase();

      // Check excusal
      if (SYNC_EXCUSALS[upper]) {
        excusals[nameKey + "|" + tt.id] = val;
        continue;
      }

      // Skip failure codes
      if (upper.indexOf("FX") === 0 || upper.indexOf("FAIL") === 0 || upper === "FS") continue;

      // Try parse date
      var d = tryParseDate_(val);
      if (d) {
        updateBest_(bestDates, nameKey + "|" + tt.id, d, "training_sheet");
      }
    }
  }

  var log = ["Training sheet: " + employees.length + " employees, " + Object.keys(bestDates).length + " dates, " + Object.keys(excusals).length + " excusals"];

  // Step 3: Read Paylocity Import
  var paySheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Paylocity Import");
  if (paySheet) {
    var payData = paySheet.getDataRange().getValues();
    var payH = payData[0];
    var payLn = findColPartial(payH, "last");
    var payFn = findColPartial(payH, "first");
    var paySk = findColPartial(payH, "skill");
    var payDt = findColPartial(payH, "effective");
    var payCount = 0;

    if (payLn >= 0 && payFn >= 0 && paySk >= 0 && payDt >= 0) {
      for (var p = 1; p < payData.length; p++) {
        var pRow = payData[p];
        var pLn = String(pRow[payLn] || "").trim();
        var pFn = String(pRow[payFn] || "").trim();
        var skill = String(pRow[paySk] || "").trim().toLowerCase();
        var pDate = String(pRow[payDt] || "").trim();
        if (!pLn || !skill || !pDate) continue;

        var colKey = PAYLOCITY_MAP[skill];
        if (!colKey) continue;
        var pTT = ttByKey[colKey.toLowerCase()];
        if (!pTT) continue;

        var pd = tryParseDate_(pDate);
        if (!pd) continue;

        var pNameKey = pLn + "|" + pFn;
        updateBest_(bestDates, pNameKey + "|" + pTT.id, pd, "paylocity");
        payCount++;

        // CPR <-> FIRSTAID link
        if (colKey === "CPR" && ttByKey["firstaid"]) updateBest_(bestDates, pNameKey + "|" + ttByKey["firstaid"].id, pd, "paylocity");
        if (colKey === "FIRSTAID" && ttByKey["cpr"]) updateBest_(bestDates, pNameKey + "|" + ttByKey["cpr"].id, pd, "paylocity");
      }
    }
    log.push("Paylocity Import: " + payCount + " dates");
  } else {
    log.push("Paylocity Import: not found (skipped)");
  }

  // Step 4: Read PHS Import
  var phsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("PHS Import");
  if (phsSheet) {
    var phsData = phsSheet.getDataRange().getValues();
    var phsH = phsData[0];
    var phsName = findColPartial(phsH, "employee");
    var phsCat = findColPartial(phsH, "category");
    var phsType = findColPartial(phsH, "type");
    var phsDt = findColPartial(phsH, "effective");
    var phsTerm = findColPartial(phsH, "termination");
    var phsCount = 0;

    if (phsName >= 0 && phsCat >= 0 && phsDt >= 0) {
      for (var q = 1; q < phsData.length; q++) {
        var qRow = phsData[q];
        var qName = String(qRow[phsName] || "").trim();
        var qCat = String(qRow[phsCat] || "").trim().toLowerCase();
        var qType = phsType >= 0 ? String(qRow[phsType] || "").trim().toLowerCase() : "";
        var qDate = String(qRow[phsDt] || "").trim();
        var qTerm = phsTerm >= 0 ? String(qRow[phsTerm] || "").trim() : "";

        if (!qName || !qDate) continue;
        if (qTerm) continue;
        if (qType === "fail" || qType === "no show") continue;

        var qColKey = PHS_CATEGORY_MAP[qCat] || null;
        if (!qColKey && qCat === "additional training") {
          qColKey = PHS_TYPE_MAP[qType] || null;
        }
        if (!qColKey) continue;

        var qTT = ttByKey[qColKey.toLowerCase()];
        if (!qTT) continue;

        var qd = tryParseDate_(qDate);
        if (!qd) continue;

        // PHS names are "Last, First"
        var qLn = qName, qFn = "";
        if (qName.indexOf(",") >= 0) {
          var parts = qName.split(",");
          qLn = parts[0].trim();
          qFn = parts.slice(1).join(",").trim();
        }

        var qNameKey = qLn + "|" + qFn;
        updateBest_(bestDates, qNameKey + "|" + qTT.id, qd, "phs");
        phsCount++;

        if (qColKey === "CPR" && ttByKey["firstaid"]) updateBest_(bestDates, qNameKey + "|" + ttByKey["firstaid"].id, qd, "phs");
        if (qColKey === "FIRSTAID" && ttByKey["cpr"]) updateBest_(bestDates, qNameKey + "|" + ttByKey["cpr"].id, qd, "phs");
      }
    }
    log.push("PHS Import: " + phsCount + " dates");
  } else {
    log.push("PHS Import: not found (skipped)");
  }

  log.push("\nTotal: " + Object.keys(bestDates).length + " records, " + Object.keys(excusals).length + " excusals");
  log.push("\nPushing to Supabase...");

  // Step 5: Push employees
  var empInserted = 0;
  var BATCH = 20;
  for (var e = 0; e < employees.length; e += BATCH) {
    var batch = employees.slice(e, e + BATCH);
    var resp = supabasePost("/rest/v1/employees", batch, { "Prefer": "resolution=ignore-duplicates" });
    if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) empInserted += batch.length;
    Utilities.sleep(150);
  }
  log.push("Employees: " + empInserted + " pushed");

  // Step 6: Get employee ID lookup from Supabase
  var empLookup = {};
  var offset = 0;
  while (true) {
    var empResp = supabaseGet("/rest/v1/employees?select=id,first_name,last_name&limit=1000&offset=" + offset);
    var empList = JSON.parse(empResp.getContentText());
    if (empList.length === 0) break;
    for (var el = 0; el < empList.length; el++) {
      var key = empList[el].last_name + "|" + empList[el].first_name;
      empLookup[key] = empList[el].id;
      // Also lowercase version for fuzzy matching
      empLookup[key.toLowerCase()] = empList[el].id;
    }
    offset += empList.length;
    if (empList.length < 1000) break;
  }

  // Step 7: Push training records
  var records = [];
  for (var bk in bestDates) {
    var bParts = bk.split("|");
    var bName = bParts[0] + "|" + bParts[1];
    var bTTId = parseInt(bParts[2]);
    var bEmpId = empLookup[bName] || empLookup[bName.toLowerCase()];
    if (!bEmpId) continue;

    var entry = bestDates[bk];
    records.push({
      employee_id: bEmpId,
      training_type_id: bTTId,
      completion_date: Utilities.formatDate(entry.date, "America/New_York", "yyyy-MM-dd"),
      source: entry.source,
    });
  }

  var recInserted = 0;
  for (var r = 0; r < records.length; r += BATCH) {
    var rBatch = records.slice(r, r + BATCH);
    var rResp = supabasePost("/rest/v1/training_records", rBatch, { "Prefer": "resolution=ignore-duplicates" });
    if (rResp.getResponseCode() >= 200 && rResp.getResponseCode() < 300) recInserted += rBatch.length;
    Utilities.sleep(150);
  }
  log.push("Training records: " + recInserted + " of " + records.length);

  // Step 8: Push excusals
  var excRows = [];
  for (var ek in excusals) {
    var eParts = ek.split("|");
    var eName = eParts[0] + "|" + eParts[1];
    var eTTId = parseInt(eParts[2]);
    var eEmpId = empLookup[eName] || empLookup[eName.toLowerCase()];
    if (!eEmpId) continue;

    excRows.push({
      employee_id: eEmpId,
      training_type_id: eTTId,
      reason: excusals[ek],
    });
  }

  var excInserted = 0;
  for (var x = 0; x < excRows.length; x += BATCH) {
    var xBatch = excRows.slice(x, x + BATCH);
    var xResp = supabasePost("/rest/v1/excusals", xBatch, { "Prefer": "resolution=merge-duplicates" });
    if (xResp.getResponseCode() >= 200 && xResp.getResponseCode() < 300) excInserted += xBatch.length;
    Utilities.sleep(150);
  }
  log.push("Excusals: " + excInserted + " of " + excRows.length);

  log.push("\nDone!");
  ui.alert("Merge Complete", log.join("\n"), ui.ButtonSet.OK);
}

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════

function updateBest_(bestDates, key, date, source) {
  var existing = bestDates[key];
  if (!existing || date.getTime() > existing.date.getTime()) {
    bestDates[key] = { date: date, source: source };
  }
}

function tryParseDate_(value) {
  if (!value) return null;
  var s = String(value).trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    var yr = parseInt(m[3]);
    if (yr < 100) yr += 2000;
    var d = new Date(yr, parseInt(m[1]) - 1, parseInt(m[2]));
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;
  }
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    var d2 = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    if (!isNaN(d2.getTime())) return d2;
  }
  var d3 = new Date(s);
  if (!isNaN(d3.getTime()) && d3.getFullYear() > 2000) return d3;
  return null;
}

function findCol(headers, name) {
  var upper = name.toUpperCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toUpperCase() === upper) return i;
  }
  return -1;
}

function findColPartial(headers, partial) {
  var lower = partial.toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase().indexOf(lower) >= 0) return i;
  }
  return -1;
}

function supabaseGet(path) {
  return UrlFetchApp.fetch(SUPABASE_URL + path, {
    method: "get",
    headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY },
    muteHttpExceptions: true,
  });
}

function supabasePost(path, data, extraHeaders) {
  var headers = { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" };
  for (var k in extraHeaders) headers[k] = extraHeaders[k];
  return UrlFetchApp.fetch(SUPABASE_URL + path, {
    method: "post", headers: headers, payload: JSON.stringify(data), muteHttpExceptions: true,
  });
}
