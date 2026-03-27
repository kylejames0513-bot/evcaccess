// ============================================================
// EVC Data Integrity — Training Sheet Audit & Repair
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
// Scans the Training sheet for data issues and fixes them.
//
// PASTE INTO: Extensions > Apps Script as a new file
//   (click + next to Files, name it "DataIntegrity")
//
// Add these to your createMenu() in Code.gs:
//   .addItem("Audit Training Sheet", "auditTrainingSheet")
//   .addItem("Fix Training Sheet Issues", "fixTrainingSheetIssues")
// ============================================================

// ============================================================
// EXCUSAL CODES — text values that mean "doesn't need it"
// These are treated the same as NA/N/A: the person is excused.
// Add new codes as needed.
// ============================================================
var EXCUSAL_CODES = [
  "NA", "N/A", "N/",                              // Standard not-applicable
  "ELC", "EI",                                     // Location/program excusals
  "FACILITIES", "MAINT",                           // Facilities staff
  "HR", "FINANCE", "FIN", "IT", "ADMIN",           // Department excusals
  "NURSE", "LPN", "RN", "CNA",                     // Nursing credentials
  "BH", "PA", "BA", "QA", "TAC",                   // Role codes
  "FX1", "FX2", "FX3", "FS",                       // Facility codes
  "F X 2", "FX 1",                                 // Variant spacing
  "FX1*", "FX1/NS", "FX1 - S", "FX1 - R",         // FX1 variants
  "TRAINER",                                       // Is the trainer
  "LP", "NS",                                      // Other codes
  "LLL"                                            // Seems to be a location code
];

// ============================================================
// AUDIT: Scan the Training sheet and report all issues
// ============================================================
function auditTrainingSheet() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);

  if (!sheet) {
    ui.alert("Error: Could not find sheet named \"" + TRAINING_ACCESS_SHEET_NAME + "\".");
    return;
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var cprCol = findColumnIndex(headers, ["CPR"]);
  var faCol = findColumnIndex(headers, ["FIRSTAID"]);
  var medCol = findColumnIndex(headers, ["MED_TRAIN"]);
  var pmCol = findColumnIndex(headers, ["POST MED"]);
  var activeCol = findColumnIndex(headers, ["ACTIVE", "STATUS", "ACTIVE?"]);

  var issues = {
    blankRows: 0,
    duplicates: [],
    cprFaMismatch: [],
    medPmMismatch: [],
    garbledDates: [],
    typos: [],
    needdsTypo: [],
    unknownCodes: [],
    ancientDates: [],
    futureDates: []
  };

  var today = new Date();
  today.setHours(0,0,0,0);

  // Track names for duplicate detection
  var activeNames = {};

  for (var r = 1; r < data.length; r++) {
    var lastName = data[r][0] ? data[r][0].toString().trim() : "";
    var firstName = data[r][1] ? data[r][1].toString().trim() : "";
    var active = data[r][activeCol] ? data[r][activeCol].toString().trim().toUpperCase() : "";
    var fullName = firstName + " " + lastName;

    // Blank rows
    if (!lastName && !firstName) {
      issues.blankRows++;
      continue;
    }

    // Duplicate detection (active only)
    if (active === "Y") {
      var nameKey = lastName.toLowerCase() + "|" + firstName.toLowerCase().split('"')[0].split("(")[0].trim();
      if (!activeNames[nameKey]) activeNames[nameKey] = [];
      activeNames[nameKey].push({ row: r + 1, name: fullName });
    }

    // Skip inactive for data quality checks
    if (active !== "Y") continue;

    // CPR / FIRSTAID mismatch
    if (cprCol >= 0 && faCol >= 0) {
      var cprVal = data[r][cprCol];
      var faVal = data[r][faCol];
      var cprDate = parseCellDate(cprVal);
      var faDate = parseCellDate(faVal);
      var cprStr = cprVal ? cprVal.toString().trim() : "";
      var faStr = faVal ? faVal.toString().trim() : "";

      if (cprDate && !faDate && !isExcusal(faStr)) {
        issues.cprFaMismatch.push({
          row: r + 1, name: fullName,
          msg: "CPR=" + formatAuditDate(cprDate) + " but FA='" + faStr + "'"
        });
      } else if (faDate && !cprDate && !isExcusal(cprStr)) {
        issues.cprFaMismatch.push({
          row: r + 1, name: fullName,
          msg: "FA=" + formatAuditDate(faDate) + " but CPR='" + cprStr + "'"
        });
      } else if (cprDate && faDate && cprDate.getTime() !== faDate.getTime()) {
        issues.cprFaMismatch.push({
          row: r + 1, name: fullName,
          msg: "CPR=" + formatAuditDate(cprDate) + " FA=" + formatAuditDate(faDate) + " (should match)"
        });
      }
    }

    // MED_TRAIN / POST MED mismatch
    if (medCol >= 0 && pmCol >= 0) {
      var medVal = data[r][medCol];
      var pmVal = data[r][pmCol];
      var medDate = parseCellDate(medVal);
      var pmDate = parseCellDate(pmVal);
      var medStr = medVal ? medVal.toString().trim() : "";
      var pmStr = pmVal ? pmVal.toString().trim() : "";

      if (medDate && !pmDate && !isExcusal(pmStr)) {
        issues.medPmMismatch.push({
          row: r + 1, name: fullName,
          msg: "MED=" + formatAuditDate(medDate) + " but PM='" + pmStr + "'"
        });
      }
    }

    // Scan all training columns for issues
    for (var c = 3; c < data[r].length; c++) {
      var val = data[r][c];
      if (val === null || val === undefined || val === "") continue;
      if (val instanceof Date) {
        // Check for very old dates (before 2015)
        if (val.getFullYear() < 2015 && active === "Y") {
          var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c+1);
          issues.ancientDates.push({
            row: r + 1, name: fullName,
            msg: colName + "=" + formatAuditDate(val) + " (very old)"
          });
        }
        continue;
      }

      var s = val.toString().trim();
      var sUpper = s.toUpperCase();

      // NEEDDS typo
      if (sUpper === "NEEDDS") {
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c+1);
        issues.needdsTypo.push({ row: r + 1, name: fullName, col: c + 1, colName: colName });
        continue;
      }

      // Garbled dates (has digits and slashes but isn't a clean date)
      if (/\d+\/\d+/.test(s) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c+1);
        issues.garbledDates.push({
          row: r + 1, name: fullName, col: c + 1, colName: colName, value: s
        });
        continue;
      }

      // Known codes — skip
      if (sUpper === "NEEDS" || sUpper === "SCHED" || sUpper === "SCHEDULE" ||
          sUpper === "COMPLETE" || sUpper === "COMPLETED" || sUpper === "FAILED" ||
          sUpper === "NO SHOW" || sUpper === "TERM" || sUpper === "HALF" ||
          sUpper === "NEED CERTIF" || sUpper === "NCNS 2026" || sUpper === "1 DAY ONLY" ||
          sUpper === "1 DAY" || sUpper === "MASS" || sUpper === "WAIN" || sUpper === "WADS" ||
          sUpper === "Y" || sUpper === "YES" || sUpper === "S" || sUpper === "R" ||
          sUpper === "*" || sUpper === "." || sUpper === "/" || sUpper === "//" ||
          sUpper === "---" || sUpper === "?" ||
          sUpper === "JULY" || sUpper === "JAN" || sUpper === "FEB" ||
          sUpper.indexOf("S-") === 0 || sUpper.indexOf("S ") === 0 || sUpper.indexOf("S- ") === 0 ||
          isExcusal(s)) continue;

      // Dates with trailing text (like "10/26/11*" or "9/16/0256")
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}.+$/.test(s)) {
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c+1);
        issues.garbledDates.push({
          row: r + 1, name: fullName, col: c + 1, colName: colName, value: s
        });
        continue;
      }
    }
  }

  // Process duplicates
  for (var key in activeNames) {
    if (activeNames[key].length > 1) {
      issues.duplicates.push(activeNames[key]);
    }
  }

  // Build the audit report
  writeAuditReport(ss, issues);

  // Summary alert
  var totalIssues = issues.blankRows + issues.duplicates.length +
    issues.cprFaMismatch.length + issues.medPmMismatch.length +
    issues.garbledDates.length + issues.needdsTypo.length +
    issues.ancientDates.length;

  var summary = "Training Sheet Audit Complete!\n\n";
  summary += "Blank rows (no name): " + issues.blankRows + "\n";
  summary += "Duplicate active employees: " + issues.duplicates.length + " sets\n";
  summary += "CPR/FirstAid mismatches: " + issues.cprFaMismatch.length + "\n";
  summary += "MedCert/PostMed issues: " + issues.medPmMismatch.length + "\n";
  summary += "Garbled/malformed dates: " + issues.garbledDates.length + "\n";
  summary += "NEEDDS typos: " + issues.needdsTypo.length + "\n";
  summary += "Very old dates (pre-2015, active): " + issues.ancientDates.length + "\n";
  summary += "\nCheck the \"Data Audit\" tab for full details.";
  summary += "\n\nRun \"Fix Training Sheet Issues\" to auto-fix what can be fixed.";

  ui.alert(summary);
}


// ============================================================
// Write the Data Audit report tab
// ============================================================
function writeAuditReport(ss, issues) {
  var NAVY = "#1F3864";
  var RED = "#C00000";
  var ORANGE = "#E65100";
  var GREEN = "#2E7D32";
  var BLUE = "#1565C0";
  var LIGHT_GRAY = "#F2F2F2";
  var WHITE = "#FFFFFF";

  var existing = ss.getSheetByName("Data Audit");
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet("Data Audit");

  var row = 1;

  sheet.getRange(row, 1, 1, 5).merge();
  sheet.getRange(row, 1).setValue("EVC Training Sheet — Data Audit");
  sheet.getRange(row, 1).setFontSize(14).setFontWeight("bold").setFontColor(WHITE).setBackground(NAVY).setFontFamily("Arial");
  row++;

  sheet.getRange(row, 1).setValue("Generated: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "M/d/yyyy h:mm a"));
  sheet.getRange(row, 1).setFontSize(9).setFontColor("#666666").setFontFamily("Arial");
  row += 2;

  // --- BLANK ROWS ---
  row = writeSection(sheet, row, "Blank Rows", NAVY, issues.blankRows + " rows with no name (can be auto-deleted)");

  // --- DUPLICATES ---
  row = writeSection(sheet, row, "Duplicate Active Employees", RED, "");
  if (issues.duplicates.length === 0) {
    sheet.getRange(row, 1).setValue("No duplicates found.").setFontColor(GREEN);
    row += 2;
  } else {
    for (var d = 0; d < issues.duplicates.length; d++) {
      var dupes = issues.duplicates[d];
      for (var dd = 0; dd < dupes.length; dd++) {
        sheet.getRange(row, 1).setValue(dupes[dd].name);
        sheet.getRange(row, 2).setValue("Row " + dupes[dd].row);
        sheet.getRange(row, 1, 1, 2).setFontColor(RED);
        row++;
      }
      row++;
    }
  }

  // --- CPR / FIRSTAID ---
  row = writeSection(sheet, row, "CPR / First Aid Mismatches (auto-fixable)", ORANGE, "");
  if (issues.cprFaMismatch.length === 0) {
    sheet.getRange(row, 1).setValue("All matched.").setFontColor(GREEN);
    row += 2;
  } else {
    sheet.getRange(row, 1, 1, 3).setValues([["Name", "Row", "Issue"]]);
    sheet.getRange(row, 1, 1, 3).setFontWeight("bold").setBackground(LIGHT_GRAY);
    row++;
    for (var i = 0; i < issues.cprFaMismatch.length; i++) {
      var m = issues.cprFaMismatch[i];
      sheet.getRange(row, 1, 1, 3).setValues([[m.name, m.row, m.msg]]);
      row++;
    }
    row++;
  }

  // --- MED / POST MED ---
  row = writeSection(sheet, row, "Med Cert / Post Med Issues", ORANGE, "");
  if (issues.medPmMismatch.length === 0) {
    sheet.getRange(row, 1).setValue("All matched.").setFontColor(GREEN);
    row += 2;
  } else {
    sheet.getRange(row, 1, 1, 3).setValues([["Name", "Row", "Issue"]]);
    sheet.getRange(row, 1, 1, 3).setFontWeight("bold").setBackground(LIGHT_GRAY);
    row++;
    for (var i = 0; i < issues.medPmMismatch.length; i++) {
      var m = issues.medPmMismatch[i];
      sheet.getRange(row, 1, 1, 3).setValues([[m.name, m.row, m.msg]]);
      row++;
    }
    row++;
  }

  // --- GARBLED DATES ---
  row = writeSection(sheet, row, "Garbled / Malformed Dates", RED, "");
  if (issues.garbledDates.length === 0) {
    sheet.getRange(row, 1).setValue("None found.").setFontColor(GREEN);
    row += 2;
  } else {
    sheet.getRange(row, 1, 1, 4).setValues([["Name", "Row", "Column", "Value"]]);
    sheet.getRange(row, 1, 1, 4).setFontWeight("bold").setBackground(LIGHT_GRAY);
    row++;
    for (var i = 0; i < issues.garbledDates.length; i++) {
      var g = issues.garbledDates[i];
      sheet.getRange(row, 1, 1, 4).setValues([[g.name, g.row, g.colName, g.value]]);
      sheet.getRange(row, 4).setFontColor(RED).setFontWeight("bold");
      row++;
    }
    row++;
  }

  // --- NEEDDS TYPO ---
  row = writeSection(sheet, row, "NEEDDS Typos (auto-fixable)", ORANGE, "");
  if (issues.needdsTypo.length === 0) {
    sheet.getRange(row, 1).setValue("None found.").setFontColor(GREEN);
    row += 2;
  } else {
    for (var i = 0; i < issues.needdsTypo.length; i++) {
      var t = issues.needdsTypo[i];
      sheet.getRange(row, 1).setValue(t.name + " — Row " + t.row + ", " + t.colName);
      row++;
    }
    row++;
  }

  // --- ANCIENT DATES ---
  row = writeSection(sheet, row, "Very Old Dates (active employees, pre-2015)", BLUE, "");
  if (issues.ancientDates.length === 0) {
    sheet.getRange(row, 1).setValue("None found.").setFontColor(GREEN);
    row += 2;
  } else {
    var showCount = Math.min(issues.ancientDates.length, 50);
    for (var i = 0; i < showCount; i++) {
      var a = issues.ancientDates[i];
      sheet.getRange(row, 1).setValue(a.name + " — Row " + a.row + " — " + a.msg);
      row++;
    }
    if (issues.ancientDates.length > 50) {
      sheet.getRange(row, 1).setValue("...and " + (issues.ancientDates.length - 50) + " more");
      row++;
    }
    row++;
  }

  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 250);
  sheet.setFrozenRows(3);
}

function writeSection(sheet, row, title, color, subtitle) {
  sheet.getRange(row, 1, 1, 5).merge();
  sheet.getRange(row, 1).setValue(title);
  sheet.getRange(row, 1).setFontSize(12).setFontWeight("bold").setFontColor("#FFFFFF").setBackground(color).setFontFamily("Arial");
  row++;
  if (subtitle) {
    sheet.getRange(row, 1).setValue(subtitle).setFontSize(10).setFontColor("#666666");
    row++;
  }
  return row;
}


// ============================================================
// FIX: Auto-repair what can be fixed
// ============================================================
function fixTrainingSheetIssues() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);

  if (!sheet) {
    ui.alert("Error: Could not find sheet named \"" + TRAINING_ACCESS_SHEET_NAME + "\".");
    return;
  }

  var confirm = ui.alert(
    "Fix Training Sheet Issues",
    "This will:\n\n" +
    "1. Fix NEEDDS → NEEDS typos\n" +
    "2. Standardize N/ → N/A\n" +
    "3. Standardize COMPLETED → COMPLETE\n" +
    "4. Standardize FAIL → FAILED\n" +
    "5. Clear garbled/malformed dates (e.g. 9/246/24, 5/1712)\n" +
    "6. Sync CPR → FIRSTAID (same date) where FA is empty or NEEDS\n" +
    "7. Sync FIRSTAID → CPR where CPR is empty or NEEDS\n" +
    "8. Fill POST MED = MED_TRAIN + 1 day where PM is empty or NEEDS\n" +
    "9. Delete blank rows (no name)\n\n" +
    "This CANNOT be undone easily. Continue?",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var cprCol = findColumnIndex(headers, ["CPR"]);
  var faCol = findColumnIndex(headers, ["FIRSTAID"]);
  var medCol = findColumnIndex(headers, ["MED_TRAIN"]);
  var pmCol = findColumnIndex(headers, ["POST MED"]);
  var activeCol = findColumnIndex(headers, ["ACTIVE", "STATUS", "ACTIVE?"]);

  var fixedNeedds = 0;
  var fixedNA = 0;
  var fixedCprFa = 0;
  var fixedMedPm = 0;
  var fixedCompleted = 0;
  var fixedFail = 0;
  var clearedGarbled = 0;
  var deletedRows = 0;

  // Pass 1: Fix text issues across all cells (active employees only)
  for (var r = 1; r < data.length; r++) {
    var activeStatus = data[r][activeCol] ? data[r][activeCol].toString().trim().toUpperCase() : "";
    if (activeStatus !== "Y") continue;

    for (var c = 3; c < data[r].length; c++) {
      var val = data[r][c];
      if (val === null || val === undefined) continue;
      if (val instanceof Date) continue;

      var s = val.toString().trim();
      var sUpper = s.toUpperCase();

      // NEEDDS → NEEDS
      if (sUpper === "NEEDDS") {
        sheet.getRange(r + 1, c + 1).setValue("NEEDS");
        fixedNeedds++;
        continue;
      }

      // N/ → N/A
      if (s === "N/" || s === "n/") {
        sheet.getRange(r + 1, c + 1).setValue("N/A");
        fixedNA++;
        continue;
      }

      // COMPLETED → COMPLETE (standardize)
      if (sUpper === "COMPLETED") {
        sheet.getRange(r + 1, c + 1).setValue("COMPLETE");
        fixedCompleted++;
        continue;
      }

      // FAIL → FAILED (standardize)
      if (sUpper === "FAIL") {
        sheet.getRange(r + 1, c + 1).setValue("FAILED");
        fixedFail++;
        continue;
      }

      // FX variants → FAILED X1, FAILED X2, FAILED X3
      // FX1, FX 1, F X 1, FX1*, FX1 - S, FX1 - R, FX1/NS, FS → standardize
      if (sUpper === "FS") {
        sheet.getRange(r + 1, c + 1).setValue("FAILED");
        fixedFail++;
        continue;
      }
      var fxMatch = sUpper.match(/^F\s*X\s*(\d)/);
      if (fxMatch) {
        sheet.getRange(r + 1, c + 1).setValue("FAILED X" + fxMatch[1]);
        fixedFail++;
        continue;
      }

      // Garbled dates and junk — clear anything that isn't a valid date
      // or a known code. The cleanGarbledDates function in Code.gs
      // handles this on every refresh, but we also do it here for
      // the manual fix run.

      // Junk punctuation (*, ., /, //, ---, ?)
      if (/^[*.\/?-]+$/.test(s)) {
        sheet.getRange(r + 1, c + 1).setValue("");
        clearedGarbled++;
        Logger.log("Cleared junk: row " + (r+1) + " col " + (c+1) + " was '" + s + "'");
        continue;
      }

      // Anything with digits that isn't a clean date
      if (/\d/.test(s)) {
        // Check clean slash date with valid year
        var slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (slashMatch) {
          var yr = parseInt(slashMatch[3]);
          if (yr < 100) yr += 2000;
          if (yr >= 2000 && yr <= 2099) continue;  // Valid date
        }
        // Check clean dash date with valid year
        var dashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
        if (dashMatch) {
          var yr = parseInt(dashMatch[3]);
          if (yr < 100) yr += 2000;
          if (yr >= 2000 && yr <= 2099) continue;  // Valid date
        }
        // Schedule codes — no longer protected, clear them
        // Known codes with digits (NCNS 2026, 1 DAY, etc.) already handled above
        // Everything else with digits is garbled
        sheet.getRange(r + 1, c + 1).setValue("");
        clearedGarbled++;
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c+1);
        var name = (data[r][1] || "") + " " + (data[r][0] || "");
        Logger.log("Cleared garbled: " + name.trim() + " | " + colName + " | was '" + s + "'");
        continue;
      }
    }
  }

  // Pass 2: Sync CPR ↔ FIRSTAID and MED_TRAIN ↔ POST MED (active only)
  // Re-read data after pass 1
  data = sheet.getDataRange().getValues();

  for (var r = 1; r < data.length; r++) {
    var active = data[r][activeCol] ? data[r][activeCol].toString().trim().toUpperCase() : "";
    if (active !== "Y") continue;

    // CPR ↔ FIRSTAID sync — they must always match
    if (cprCol >= 0 && faCol >= 0) {
      var cprVal = data[r][cprCol];
      var faVal = data[r][faCol];
      var cprDate = parseCellDate(cprVal);
      var faDate = parseCellDate(faVal);
      var faStr = faVal ? faVal.toString().trim().toUpperCase() : "";
      var cprStr = cprVal ? cprVal.toString().trim().toUpperCase() : "";

      // Both are excused — leave alone
      if (isExcusal(cprStr) && isExcusal(faStr)) {
        // fine
      }
      // CPR has date, FA doesn't (empty, NEEDS, or excusal doesn't apply here)
      else if (cprDate && !faDate && !isExcusal(faStr)) {
        sheet.getRange(r + 1, faCol + 1).setValue(formatBackfillDate(cprDate));
        fixedCprFa++;
      }
      // FA has date, CPR doesn't
      else if (faDate && !cprDate && !isExcusal(cprStr)) {
        sheet.getRange(r + 1, cprCol + 1).setValue(formatBackfillDate(faDate));
        fixedCprFa++;
      }
      // Both have dates but they don't match — use the NEWER date for both
      else if (cprDate && faDate && cprDate.getTime() !== faDate.getTime()) {
        var newerDate = cprDate > faDate ? cprDate : faDate;
        sheet.getRange(r + 1, cprCol + 1).setValue(formatBackfillDate(newerDate));
        sheet.getRange(r + 1, faCol + 1).setValue(formatBackfillDate(newerDate));
        fixedCprFa++;
      }
    }

    // MED_TRAIN ↔ POST MED sync — POST MED = MED_TRAIN + 1 day
    if (medCol >= 0 && pmCol >= 0) {
      var medVal = data[r][medCol];
      var pmVal = data[r][pmCol];
      var medDate = parseCellDate(medVal);
      var pmDate = parseCellDate(pmVal);
      var medStr = medVal ? medVal.toString().trim().toUpperCase() : "";
      var pmStr = pmVal ? pmVal.toString().trim().toUpperCase() : "";

      // If either has a failure code (FAILED, FAILED X1, etc.) — leave it alone
      var medIsFail = (medStr === "FAILED" || medStr === "FAIL" || 
                       /^FAILED X\d$/.test(medStr) ||
                       /^FX\d/.test(medStr) || /^F\s*X\s*\d/.test(medStr) ||
                       medStr === "FS");
      var pmIsFail = (pmStr === "FAILED" || pmStr === "FAIL" || 
                      /^FAILED X\d$/.test(pmStr) ||
                      /^FX\d/.test(pmStr) || /^F\s*X\s*\d/.test(pmStr) ||
                      pmStr === "FS");
      if (medIsFail || pmIsFail) {
        // don't touch — failure tracking matters
      }
      // Both excused — leave alone
      else if (isExcusal(medStr) && isExcusal(pmStr)) {
        // fine
      }
      // MED has date, PM doesn't or is NEEDS/SCHED
      else if (medDate && !pmDate && !isExcusal(pmStr)) {
        var nextDay = new Date(medDate);
        nextDay.setDate(nextDay.getDate() + 1);
        sheet.getRange(r + 1, pmCol + 1).setValue(formatBackfillDate(nextDay));
        fixedMedPm++;
      }
      // PM has date, MED doesn't or is NEEDS/SCHED
      else if (pmDate && !medDate && !isExcusal(medStr)) {
        var prevDay = new Date(pmDate);
        prevDay.setDate(prevDay.getDate() - 1);
        sheet.getRange(r + 1, medCol + 1).setValue(formatBackfillDate(prevDay));
        fixedMedPm++;
      }
      // Both have dates — POST MED should be MED + 1 day
      // If PM is way off (more than 7 days from MED), fix it
      else if (medDate && pmDate) {
        var expectedPm = new Date(medDate);
        expectedPm.setDate(expectedPm.getDate() + 1);
        var daysDiff = Math.abs(Math.round((pmDate - medDate) / (1000 * 60 * 60 * 24)));

        if (daysDiff > 7) {
          sheet.getRange(r + 1, pmCol + 1).setValue(formatBackfillDate(expectedPm));
          fixedMedPm++;
          Logger.log("Fixed PM date: row " + (r+1) + " MED=" + formatBackfillDate(medDate) + " PM was " + formatBackfillDate(pmDate) + " → " + formatBackfillDate(expectedPm));
        }
      }
    }
  }

  // Pass 3: Delete blank rows (bottom to top to preserve row indices)
  data = sheet.getDataRange().getValues();
  for (var r = data.length - 1; r >= 1; r--) {
    var lastName = data[r][0] ? data[r][0].toString().trim() : "";
    var firstName = data[r][1] ? data[r][1].toString().trim() : "";
    if (!lastName && !firstName) {
      // Check if entire row is blank
      var allEmpty = true;
      for (var c = 0; c < data[r].length; c++) {
        if (data[r][c] !== null && data[r][c] !== undefined && data[r][c].toString().trim() !== "") {
          allEmpty = false;
          break;
        }
      }
      if (allEmpty) {
        sheet.deleteRow(r + 1);
        deletedRows++;
      }
    }
  }

  // Refresh rosters
  generateRostersSilent();

  var summary = "Training Sheet Fixes Applied!\n\n";
  summary += "NEEDDS → NEEDS: " + fixedNeedds + "\n";
  summary += "N/ → N/A: " + fixedNA + "\n";
  summary += "COMPLETED → COMPLETE: " + fixedCompleted + "\n";
  summary += "FAIL → FAILED: " + fixedFail + "\n";
  summary += "Garbled dates cleared: " + clearedGarbled + "\n";
  summary += "CPR ↔ FirstAid synced: " + fixedCprFa + "\n";
  summary += "MedCert → PostMed filled: " + fixedMedPm + "\n";
  summary += "Blank rows deleted: " + deletedRows + "\n";
  summary += "\nTraining Rosters refreshed.";
  summary += "\n\nGarbled dates were cleared to empty cells.";
  summary += "\nCheck View > Executions for a log of every cleared value.";
  summary += "\nDuplicates still need manual review — check the Data Audit tab.";

  ui.alert(summary);
}


// ============================================================
// HELPERS
// ============================================================

// Check if a cell value is an excusal code
function isExcusal(str) {
  if (!str) return false;
  var upper = str.toString().trim().toUpperCase();
  for (var i = 0; i < EXCUSAL_CODES.length; i++) {
    if (upper === EXCUSAL_CODES[i].toUpperCase()) return true;
  }
  return false;
}

// Parse a cell value to a Date (handles Date objects and strings)
function parseCellDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;

  var str = val.toString().trim();
  if (!str) return null;

  // M/D/YY or M/D/YYYY
  var parts = str.split("/");
  if (parts.length === 3) {
    var mo = parseInt(parts[0]);
    var da = parseInt(parts[1]);
    var yr = parseInt(parts[2]);
    if (yr < 100) yr += 2000;
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31 && yr >= 2000 && yr <= 2099) {
      var d = new Date(yr, mo - 1, da);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // M-D-YY or M-D-YYYY (dash format)
  var dashParts = str.split("-");
  if (dashParts.length === 3) {
    var mo = parseInt(dashParts[0]);
    var da = parseInt(dashParts[1]);
    var yr = parseInt(dashParts[2]);
    if (yr < 100) yr += 2000;
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31 && yr >= 2000 && yr <= 2099) {
      var d = new Date(yr, mo - 1, da);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

// Format date for audit display
function formatAuditDate(d) {
  if (!d) return "";
  return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
}
