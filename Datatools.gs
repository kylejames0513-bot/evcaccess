// ============================================================
// EVC Training System — Data Tools
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
//
// CONTENTS:
//   1. Backfill Training Access from Records
//   2. Batch Pass/Fail
//   3. Batch Set Session Info
//   4. Flag late arrivals / early departures
//   5. Clean garbled dates (runs silently on every roster refresh)
//   6. Audit Training Sheet (full report)
//   7. Fix Training Sheet Issues (auto-repair)
//   8. Data Integrity helpers
//
// DEPENDS ON: Config.gs, Utilities.gs, Core.gs
//
// ============================================================


// ************************************************************
//
//   1. BACKFILL — Process all Training Records into Training sheet
//
// ************************************************************

function backfillTrainingAccess() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var recordsSheet = ss.getSheets()[0];
  var trainingSheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);

  if (!trainingSheet) {
    ui.alert("Error: Could not find sheet named '" + TRAINING_ACCESS_SHEET_NAME + "'.");
    return;
  }

  var recordsData = recordsSheet.getDataRange().getValues();
  var trainingData = trainingSheet.getDataRange().getValues();
  var trainingHeaders = trainingData[0];

  var processed = 0, matched = 0;
  var skippedNoMap = 0, skippedNoMatch = 0, skippedNewer = 0;
  var writtenEmpty = 0, writtenOverWord = 0, writtenOverOlder = 0;
  var errors = [];

  for (var i = 1; i < recordsData.length; i++) {
    var session = recordsData[i][1] ? recordsData[i][1].toString().trim() : "";
    var attendeeName = recordsData[i][2] ? recordsData[i][2].toString().trim() : "";
    var dateVal = recordsData[i][3];
    var passFail = recordsData[i][9] ? recordsData[i][9].toString().trim() : "";

    processed++;

    if (passFail !== "Pass") continue;

    var columnHeaders = SESSION_TO_COLUMN[session];
    if (!columnHeaders || columnHeaders.length === 0) {
      skippedNoMap++;
      continue;
    }

    var targetCols = [];
    for (var ch = 0; ch < columnHeaders.length; ch++) {
      for (var c = 0; c < trainingHeaders.length; c++) {
        if (trainingHeaders[c].toString().trim() === columnHeaders[ch]) {
          targetCols.push(c);
          break;
        }
      }
    }
    if (targetCols.length === 0) {
      errors.push("Row " + (i+1) + ": Column not found for '" + session + "'");
      continue;
    }

    if (!attendeeName) continue;
    var firstName = "";
    var lastName = "";

    if (attendeeName.indexOf(",") > -1) {
      var parts = attendeeName.split(",");
      lastName = parts[0].trim();
      firstName = parts[1] ? parts[1].trim() : "";
    } else {
      var spaceParts = attendeeName.split(/\s+/);
      if (spaceParts.length >= 2) {
        firstName = spaceParts[0].trim();
        lastName = spaceParts.slice(1).join(" ").trim();
      } else {
        firstName = attendeeName;
      }
    }

    if (!firstName || !lastName) {
      errors.push("Row " + (i+1) + ": Could not parse '" + attendeeName + "'");
      continue;
    }

    var matchRow = findTrainingRow(trainingData, firstName, lastName);
    if (matchRow === -1) {
      skippedNoMatch++;
      Logger.log("Backfill: No match for '" + attendeeName + "' (row " + (i+1) + ")");
      errors.push("Row " + (i+1) + ": No match for '" + attendeeName + "'");
      continue;
    }

    matched++;

    var formattedDate = formatBackfillDate(dateVal);
    var newDate = parseToDate(dateVal);

    for (var tc = 0; tc < targetCols.length; tc++) {
      var currentVal = trainingData[matchRow][targetCols[tc]];
      var currentStr = currentVal ? currentVal.toString().trim() : "";

      if (!currentStr) {
        trainingSheet.getRange(matchRow + 1, targetCols[tc] + 1).setValue(formattedDate);
        trainingData[matchRow][targetCols[tc]] = formattedDate;
        writtenEmpty++;
        continue;
      }

      var currentUpper = currentStr.toUpperCase();
      if (currentUpper === "NA" || currentUpper === "N/A") {
        skippedNewer++;
        continue;
      }

      var existingDate = parseToDate(currentVal);

      if (!existingDate) {
        trainingSheet.getRange(matchRow + 1, targetCols[tc] + 1).setValue(formattedDate);
        trainingData[matchRow][targetCols[tc]] = formattedDate;
        writtenOverWord++;
        continue;
      }

      if (newDate && newDate.getTime() > existingDate.getTime()) {
        trainingSheet.getRange(matchRow + 1, targetCols[tc] + 1).setValue(formattedDate);
        trainingData[matchRow][targetCols[tc]] = formattedDate;
        writtenOverOlder++;
      } else {
        skippedNewer++;
      }
    }

    // Auto-fill linked columns
    for (var af = 0; af < targetCols.length; af++) {
      var writtenHeader = trainingHeaders[targetCols[af]] ? trainingHeaders[targetCols[af]].toString().trim() : "";
      applyAutoFillRules(trainingSheet, matchRow + 1, trainingHeaders, writtenHeader, formattedDate);
    }
  }

  var totalWritten = writtenEmpty + writtenOverWord + writtenOverOlder;
  generateRostersSilent();

  var summary =
    "Backfill Complete!\n\n" +
    "Rows processed: " + processed + "\n" +
    "Matched to Training sheet: " + matched + "\n\n" +
    "Cells written: " + totalWritten + "\n" +
    "  Into empty cells: " + writtenEmpty + "\n" +
    "  Replaced non-date text: " + writtenOverWord + "\n" +
    "  Replaced older date: " + writtenOverOlder + "\n\n" +
    "Skipped (no session mapping): " + skippedNoMap + "\n" +
    "Skipped (no name match): " + skippedNoMatch + "\n" +
    "Skipped (already had same/newer date): " + skippedNewer + "\n" +
    "\nTraining Rosters tab has been auto-refreshed.\n";

  if (errors.length > 0) {
    summary += "\nIssues (" + errors.length + "):\n";
    var showCount = Math.min(errors.length, 20);
    for (var e = 0; e < showCount; e++) {
      summary += "  " + errors[e] + "\n";
    }
    if (errors.length > 20) {
      summary += "  ...and " + (errors.length - 20) + " more (check View > Executions)\n";
    }
  }

  ui.alert(summary);
  Logger.log(summary);
}


// ************************************************************
//
//   2. BATCH PASS/FAIL
//
// ************************************************************

function batchPassFail() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();

  if (data.length <= 1) { ui.alert("No data rows found."); return; }

  var combos = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][9] !== "Pending") continue;
    var key = data[i][1] + " | " + data[i][3];
    if (!combos[key]) combos[key] = { session: data[i][1], date: data[i][3], rows: [] };
    combos[key].rows.push(i + 1);
  }

  var keys = Object.keys(combos);
  if (keys.length === 0) { ui.alert("No pending entries found. All sessions have been reviewed."); return; }

  var msg = "These sessions have pending entries. Enter a number:\n\n";
  for (var c = 0; c < keys.length; c++) {
    var cm = combos[keys[c]];
    msg += (c+1) + ".  " + cm.session + "  |  " + cm.date + "  (" + cm.rows.length + " pending)\n";
  }

  var choice = ui.prompt("Select Session to Grade", msg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;
  var idx = parseInt(choice.getResponseText()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= keys.length) { ui.alert("Invalid selection."); return; }

  var selected = combos[keys[idx]];

  var result = ui.prompt(
    "Pass or Fail",
    "Set all " + selected.rows.length + " pending attendees in \"" + selected.session + "\" on " + selected.date + " to:\n\nType: Pass or Fail",
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;
  var pf = result.getResponseText().trim();

  if (pf.toLowerCase() === "pass") pf = "Pass";
  else if (pf.toLowerCase() === "fail") pf = "Fail";
  else { ui.alert("Please enter Pass or Fail."); return; }

  var reviewer = ui.prompt(
    "Reviewed By",
    "Enter your name for the Reviewed By column:",
    ui.ButtonSet.OK_CANCEL
  );
  if (reviewer.getSelectedButton() !== ui.Button.OK) return;
  var reviewerName = reviewer.getResponseText().trim();

  data = sheet.getDataRange().getValues();

  var trainingUpdated = 0;
  var trainingErrors = [];

  for (var r = 0; r < selected.rows.length; r++) {
    var rowNum = selected.rows[r];
    sheet.getRange(rowNum, 10).setValue(pf);
    if (reviewerName) sheet.getRange(rowNum, 11).setValue(reviewerName);

    if (pf === "Pass") {
      var sessionName = data[rowNum - 1][1] ? data[rowNum - 1][1].toString().trim() : "";
      var attendeeName = data[rowNum - 1][2] ? data[rowNum - 1][2].toString().trim() : "";
      var dateVal = data[rowNum - 1][3];

      if (sessionName && attendeeName && SESSION_TO_COLUMN[sessionName]) {
        try {
          updateTrainingAccess(sessionName, attendeeName, dateVal);
          trainingUpdated++;
        } catch (taErr) {
          trainingErrors.push(attendeeName + ": " + taErr.toString());
        }
      }
    }
  }

  generateRostersSilent();

  var doneMsg = "Done! Marked " + selected.rows.length + " attendees as " + pf + ".";

  if (pf === "Pass" && trainingUpdated > 0) {
    doneMsg += "\n\nTraining sheet updated for " + trainingUpdated + " staff.";
    doneMsg += "\nTraining Rosters tab auto-refreshed.";
  }

  if (trainingErrors.length > 0) {
    doneMsg += "\n\nTraining update errors (" + trainingErrors.length + "):";
    for (var te = 0; te < Math.min(trainingErrors.length, 10); te++) {
      doneMsg += "\n  " + trainingErrors[te];
    }
  }

  ui.alert(doneMsg);
}


// ************************************************************
//
//   3. BATCH SET SESSION INFO
//
// ************************************************************

function batchSetSessionInfo() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var data = sheet.getDataRange().getValues();

  if (data.length <= 1) { ui.alert("No data rows found."); return; }

  var combos = {};
  for (var i = 1; i < data.length; i++) {
    var key = data[i][1] + " | " + data[i][3];
    if (!combos[key]) combos[key] = { session: data[i][1], date: data[i][3], rows: [] };
    combos[key].rows.push(i + 1);
  }

  var keys = Object.keys(combos);
  if (keys.length === 0) { ui.alert("No entries found."); return; }

  var msg = "Enter the number for the session to update:\n\n";
  for (var c = 0; c < keys.length; c++) {
    var cm = combos[keys[c]];
    msg += (c+1) + ".  " + cm.session + "  |  " + cm.date + "  (" + cm.rows.length + " staff)\n";
  }

  var choice = ui.prompt("Select Training Session", msg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;
  var idx = parseInt(choice.getResponseText()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= keys.length) { ui.alert("Invalid selection."); return; }

  var selected = combos[keys[idx]];

  var endInput = ui.prompt(
    "Session End Time",
    "What time did \"" + selected.session + "\" end on " + selected.date + "?\n\nExamples: 11:00 AM, 2:30 PM, 4:00 PM",
    ui.ButtonSet.OK_CANCEL
  );
  if (endInput.getSelectedButton() !== ui.Button.OK) return;
  var endTime = endInput.getResponseText().trim();
  if (!endTime) { ui.alert("No end time entered."); return; }

  var lenInput = ui.prompt(
    "Session Length",
    "How long was the session supposed to run?\n\nExamples: 2 hrs, 1 hr 30 min, 45 min",
    ui.ButtonSet.OK_CANCEL
  );
  if (lenInput.getSelectedButton() !== ui.Button.OK) return;
  var sessionLen = lenInput.getResponseText().trim();
  if (!sessionLen) { ui.alert("No length entered."); return; }

  for (var r = 0; r < selected.rows.length; r++) {
    sheet.getRange(selected.rows[r], 8).setValue(endTime);
    sheet.getRange(selected.rows[r], 9).setValue(sessionLen);
  }

  ui.alert(
    "Done!\n\n" +
    "Session: " + selected.session + "\n" +
    "Date: " + selected.date + "\n" +
    "End Time: " + endTime + "\n" +
    "Length: " + sessionLen + "\n" +
    "Updated: " + selected.rows.length + " attendees"
  );
}


// ************************************************************
//
//   4. FLAG LATE ARRIVALS / EARLY DEPARTURES
//
// ************************************************************

function flagLateArrivals() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var data = sheet.getDataRange().getValues();

  var threshold = ui.prompt(
    "Late Arrival Threshold",
    "What time did the session start?\n\nAnyone who arrived AFTER this time will be highlighted.\n\nExamples: 9:00 AM, 1:00 PM",
    ui.ButtonSet.OK_CANCEL
  );
  if (threshold.getSelectedButton() !== ui.Button.OK) return;
  var startStr = threshold.getResponseText().trim().toUpperCase();

  var threshMins = parseTimeToMinutes(startStr);
  if (threshMins < 0) {
    ui.alert("Could not understand that time format. Use format like 9:00 AM or 1:30 PM.");
    return;
  }

  var flagged = 0;
  for (var i = 1; i < data.length; i++) {
    var arrivalStr = (data[i][0] || "").toString().trim().toUpperCase();
    var arrivalMins = parseTimeToMinutes(arrivalStr);
    if (arrivalMins > threshMins) {
      sheet.getRange(i + 1, 1).setBackground("#FFF3CD");
      sheet.getRange(i + 1, 3).setBackground("#FFF3CD");
      flagged++;
    }
  }

  if (flagged > 0) {
    ui.alert("Flagged " + flagged + " late arrival(s) in yellow.");
  } else {
    ui.alert("No late arrivals found for that start time.");
  }
}

function flagEarlyDepartures() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var data = sheet.getDataRange().getValues();
  var flagged = 0;

  for (var i = 1; i < data.length; i++) {
    var leftEarly = (data[i][4] || "").toString().trim();
    if (leftEarly === "Yes") {
      sheet.getRange(i + 1, 5, 1, 3).setBackground("#FFCDD2");
      flagged++;
    }
  }

  if (flagged > 0) {
    ui.alert("Flagged " + flagged + " early departure(s) in red.");
  } else {
    ui.alert("No one flagged as leaving early.");
  }
}


// ************************************************************
//
//   5. CLEAN GARBLED DATES
//
//   Runs silently on every roster refresh (called by
//   generateRostersSilent). Clears invalid data from
//   training columns on active employees.
//
// ************************************************************

function cleanGarbledDates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var cleaned = 0;

  var activeCol = findColumnIndex(headers, ["ACTIVE", "STATUS", "ACTIVE?"]);

  for (var r = 1; r < data.length; r++) {
    // Only clean active employees
    if (activeCol >= 0) {
      var activeStatus = data[r][activeCol] ? data[r][activeCol].toString().trim().toUpperCase() : "";
      if (activeStatus !== "Y") continue;
    }

    for (var c = 3; c < data[r].length; c++) {
      var val = data[r][c];
      if (val === null || val === undefined) continue;

      // Valid Date objects — check year range
      if (val instanceof Date) {
        if (!isNaN(val.getTime())) {
          var yr = val.getFullYear();
          if (yr < 2000 || yr > 2099) {
            sheet.getRange(r + 1, c + 1).setValue("");
            cleaned++;
            var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c + 1);
            var name = (data[r][1] || "") + " " + (data[r][0] || "");
            Logger.log("Cleared bad year date: " + name.trim() + " | " + colName + " | was '" + val + "'");
          }
        }
        continue;
      }

      var s = val.toString().trim();
      if (!s) continue;
      var sUpper = s.toUpperCase();

      // Known valid values — keep
      var isKnown = false;
      for (var k = 0; k < KEEP_VALUES.length; k++) {
        if (sUpper === KEEP_VALUES[k]) { isKnown = true; break; }
      }
      if (isKnown) continue;

      // Known excusal codes — keep
      if (getExcusalCode(s)) continue;

      // Failure codes — keep but standardize
      if (isFailureCode(s)) {
        var standardized = standardizeFailureCode(s);
        if (standardized) {
          sheet.getRange(r + 1, c + 1).setValue(standardized);
          cleaned++;
          var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c + 1);
          var name = (data[r][1] || "") + " " + (data[r][0] || "");
          Logger.log("Standardized failure code: " + name.trim() + " | " + colName + " | '" + s + "' → '" + standardized + "'");
        }
        continue;
      }

      // Schedule codes (S-11/7, S- 12/12, etc.) — clear
      if (/^S[\s-]/i.test(s)) {
        sheet.getRange(r + 1, c + 1).setValue("");
        cleaned++;
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c + 1);
        var name = (data[r][1] || "") + " " + (data[r][0] || "");
        Logger.log("Cleared schedule code: " + name.trim() + " | " + colName + " | was '" + s + "'");
        continue;
      }

      // Valid slash date — check year range
      var slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (slashMatch) {
        var yr = parseInt(slashMatch[3]);
        if (yr < 100) yr += 2000;
        if (yr >= 2000 && yr <= 2099) continue;
        sheet.getRange(r + 1, c + 1).setValue("");
        cleaned++;
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c + 1);
        var name = (data[r][1] || "") + " " + (data[r][0] || "");
        Logger.log("Cleared bad year: " + name.trim() + " | " + colName + " | was '" + s + "'");
        continue;
      }

      // Valid dash date — check year range
      var dashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
      if (dashMatch) {
        var yr = parseInt(dashMatch[3]);
        if (yr < 100) yr += 2000;
        if (yr >= 2000 && yr <= 2099) continue;
        sheet.getRange(r + 1, c + 1).setValue("");
        cleaned++;
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c + 1);
        var name = (data[r][1] || "") + " " + (data[r][0] || "");
        Logger.log("Cleared bad year: " + name.trim() + " | " + colName + " | was '" + s + "'");
        continue;
      }

      // Junk punctuation
      if (/^[*.\/?-]+$/.test(s)) {
        sheet.getRange(r + 1, c + 1).setValue("");
        cleaned++;
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c + 1);
        var name = (data[r][1] || "") + " " + (data[r][0] || "");
        Logger.log("Cleared junk: " + name.trim() + " | " + colName + " | was '" + s + "'");
        continue;
      }

      // Anything with digits that isn't a clean date is garbled
      if (/\d/.test(s)) {
        sheet.getRange(r + 1, c + 1).setValue("");
        cleaned++;
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c + 1);
        var name = (data[r][1] || "") + " " + (data[r][0] || "");
        Logger.log("Cleared garbled: " + name.trim() + " | " + colName + " | was '" + s + "'");
        continue;
      }
    }
  }

  if (cleaned > 0) {
    Logger.log("cleanGarbledDates: cleared " + cleaned + " bad value(s)");
  }
}


// ************************************************************
//
//   6. AUDIT TRAINING SHEET — Full report
//
// ************************************************************

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
  var activeNames = {};

  for (var r = 1; r < data.length; r++) {
    var lastName = data[r][0] ? data[r][0].toString().trim() : "";
    var firstName = data[r][1] ? data[r][1].toString().trim() : "";
    var active = data[r][activeCol] ? data[r][activeCol].toString().trim().toUpperCase() : "";
    var fullName = firstName + " " + lastName;

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
        issues.cprFaMismatch.push({ row: r + 1, name: fullName, msg: "CPR=" + formatAuditDate(cprDate) + " but FA='" + faStr + "'" });
      } else if (faDate && !cprDate && !isExcusal(cprStr)) {
        issues.cprFaMismatch.push({ row: r + 1, name: fullName, msg: "FA=" + formatAuditDate(faDate) + " but CPR='" + cprStr + "'" });
      } else if (cprDate && faDate && cprDate.getTime() !== faDate.getTime()) {
        issues.cprFaMismatch.push({ row: r + 1, name: fullName, msg: "CPR=" + formatAuditDate(cprDate) + " FA=" + formatAuditDate(faDate) + " (should match)" });
      }
    }

    // MED_TRAIN / POST MED mismatch
    if (medCol >= 0 && pmCol >= 0) {
      var medVal = data[r][medCol];
      var pmVal = data[r][pmCol];
      var medDate = parseCellDate(medVal);
      var pmStr = pmVal ? pmVal.toString().trim() : "";

      if (medDate && !parseCellDate(pmVal) && !isExcusal(pmStr)) {
        issues.medPmMismatch.push({ row: r + 1, name: fullName, msg: "MED=" + formatAuditDate(medDate) + " but PM='" + pmStr + "'" });
      }
    }

    // Scan training columns for issues
    for (var c = 3; c < data[r].length; c++) {
      var val = data[r][c];
      if (val === null || val === undefined || val === "") continue;
      if (val instanceof Date) {
        if (val.getFullYear() < 2015 && active === "Y") {
          var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c+1);
          issues.ancientDates.push({ row: r + 1, name: fullName, msg: colName + "=" + formatAuditDate(val) + " (very old)" });
        }
        continue;
      }

      var s = val.toString().trim();
      var sUpper = s.toUpperCase();

      if (sUpper === "NEEDDS") {
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c+1);
        issues.needdsTypo.push({ row: r + 1, name: fullName, col: c + 1, colName: colName });
        continue;
      }

      if (/\d+\/\d+/.test(s) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c+1);
        issues.garbledDates.push({ row: r + 1, name: fullName, col: c + 1, colName: colName, value: s });
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

      // Dates with trailing text
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}.+$/.test(s)) {
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c+1);
        issues.garbledDates.push({ row: r + 1, name: fullName, col: c + 1, colName: colName, value: s });
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

  writeAuditReport(ss, issues);

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


// ************************************************************
//
//   AUDIT REPORT WRITER
//
// ************************************************************

function writeAuditReport(ss, issues) {
  var NAVY = "#1F3864", RED = "#C00000", ORANGE = "#E65100";
  var GREEN = "#2E7D32", BLUE = "#1565C0", LIGHT_GRAY = "#F2F2F2", WHITE = "#FFFFFF";

  var existing = ss.getSheetByName("Data Audit");
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet("Data Audit");

  var row = 1;

  sheet.getRange(row, 1, 1, 5).merge();
  sheet.getRange(row, 1).setValue("EVC Training Sheet — Data Audit")
    .setFontSize(14).setFontWeight("bold").setFontColor(WHITE).setBackground(NAVY).setFontFamily("Arial");
  row++;

  sheet.getRange(row, 1).setValue("Generated: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "M/d/yyyy h:mm a"))
    .setFontSize(9).setFontColor("#666666").setFontFamily("Arial");
  row += 2;

  // Blank rows
  row = writeSection(sheet, row, "Blank Rows", NAVY, issues.blankRows + " rows with no name (can be auto-deleted)");

  // Duplicates
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

  // CPR / FIRSTAID
  row = writeSection(sheet, row, "CPR / First Aid Mismatches (auto-fixable)", ORANGE, "");
  if (issues.cprFaMismatch.length === 0) {
    sheet.getRange(row, 1).setValue("All matched.").setFontColor(GREEN);
    row += 2;
  } else {
    sheet.getRange(row, 1, 1, 3).setValues([["Name", "Row", "Issue"]]).setFontWeight("bold").setBackground(LIGHT_GRAY);
    row++;
    for (var i = 0; i < issues.cprFaMismatch.length; i++) {
      var m = issues.cprFaMismatch[i];
      sheet.getRange(row, 1, 1, 3).setValues([[m.name, m.row, m.msg]]);
      row++;
    }
    row++;
  }

  // MED / POST MED
  row = writeSection(sheet, row, "Med Cert / Post Med Issues", ORANGE, "");
  if (issues.medPmMismatch.length === 0) {
    sheet.getRange(row, 1).setValue("All matched.").setFontColor(GREEN);
    row += 2;
  } else {
    sheet.getRange(row, 1, 1, 3).setValues([["Name", "Row", "Issue"]]).setFontWeight("bold").setBackground(LIGHT_GRAY);
    row++;
    for (var i = 0; i < issues.medPmMismatch.length; i++) {
      var m = issues.medPmMismatch[i];
      sheet.getRange(row, 1, 1, 3).setValues([[m.name, m.row, m.msg]]);
      row++;
    }
    row++;
  }

  // Garbled dates
  row = writeSection(sheet, row, "Garbled / Malformed Dates", RED, "");
  if (issues.garbledDates.length === 0) {
    sheet.getRange(row, 1).setValue("None found.").setFontColor(GREEN);
    row += 2;
  } else {
    sheet.getRange(row, 1, 1, 4).setValues([["Name", "Row", "Column", "Value"]]).setFontWeight("bold").setBackground(LIGHT_GRAY);
    row++;
    for (var i = 0; i < issues.garbledDates.length; i++) {
      var g = issues.garbledDates[i];
      sheet.getRange(row, 1, 1, 4).setValues([[g.name, g.row, g.colName, g.value]]);
      sheet.getRange(row, 4).setFontColor(RED).setFontWeight("bold");
      row++;
    }
    row++;
  }

  // NEEDDS typos
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

  // Ancient dates
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
  sheet.getRange(row, 1).setValue(title)
    .setFontSize(12).setFontWeight("bold").setFontColor("#FFFFFF").setBackground(color).setFontFamily("Arial");
  row++;
  if (subtitle) {
    sheet.getRange(row, 1).setValue(subtitle).setFontSize(10).setFontColor("#666666");
    row++;
  }
  return row;
}


// ************************************************************
//
//   7. FIX TRAINING SHEET ISSUES — Auto-repair
//
// ************************************************************

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
    "5. Clear garbled/malformed dates\n" +
    "6. Sync CPR ↔ FIRSTAID (same date)\n" +
    "7. Fill POST MED = MED_TRAIN + 1 day\n" +
    "8. Delete blank rows (no name)\n\n" +
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

  var fixedNeedds = 0, fixedNA = 0, fixedCprFa = 0, fixedMedPm = 0;
  var fixedCompleted = 0, fixedFail = 0, clearedGarbled = 0, deletedRows = 0;

  // Pass 1: Fix text issues (active employees only)
  for (var r = 1; r < data.length; r++) {
    var activeStatus = data[r][activeCol] ? data[r][activeCol].toString().trim().toUpperCase() : "";
    if (activeStatus !== "Y") continue;

    for (var c = 3; c < data[r].length; c++) {
      var val = data[r][c];
      if (val === null || val === undefined) continue;
      if (val instanceof Date) continue;

      var s = val.toString().trim();
      var sUpper = s.toUpperCase();

      if (sUpper === "NEEDDS") { sheet.getRange(r + 1, c + 1).setValue("NEEDS"); fixedNeedds++; continue; }
      if (s === "N/" || s === "n/") { sheet.getRange(r + 1, c + 1).setValue("N/A"); fixedNA++; continue; }
      if (sUpper === "COMPLETED") { sheet.getRange(r + 1, c + 1).setValue("COMPLETE"); fixedCompleted++; continue; }
      if (sUpper === "FAIL") { sheet.getRange(r + 1, c + 1).setValue("FAILED"); fixedFail++; continue; }
      if (sUpper === "FS") { sheet.getRange(r + 1, c + 1).setValue("FAILED"); fixedFail++; continue; }

      var fxMatch = sUpper.match(/^F\s*X\s*(\d)/);
      if (fxMatch) { sheet.getRange(r + 1, c + 1).setValue("FAILED X" + fxMatch[1]); fixedFail++; continue; }

      // Junk punctuation
      if (/^[*.\/?-]+$/.test(s)) { sheet.getRange(r + 1, c + 1).setValue(""); clearedGarbled++; continue; }

      // Garbled: has digits, not a valid date
      if (/\d/.test(s)) {
        var slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (slashMatch) { var yr = parseInt(slashMatch[3]); if (yr < 100) yr += 2000; if (yr >= 2000 && yr <= 2099) continue; }
        var dashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
        if (dashMatch) { var yr = parseInt(dashMatch[3]); if (yr < 100) yr += 2000; if (yr >= 2000 && yr <= 2099) continue; }
        // Known codes with digits
        if (sUpper === "NCNS 2026" || sUpper === "1 DAY ONLY" || sUpper === "1 DAY") continue;

        sheet.getRange(r + 1, c + 1).setValue("");
        clearedGarbled++;
        Logger.log("Cleared garbled: row " + (r+1) + " col " + (c+1) + " was '" + s + "'");
        continue;
      }
    }
  }

  // Pass 2: Sync CPR ↔ FIRSTAID and MED_TRAIN ↔ POST MED
  data = sheet.getDataRange().getValues();

  for (var r = 1; r < data.length; r++) {
    var active = data[r][activeCol] ? data[r][activeCol].toString().trim().toUpperCase() : "";
    if (active !== "Y") continue;

    // CPR ↔ FIRSTAID
    if (cprCol >= 0 && faCol >= 0) {
      var cprVal = data[r][cprCol], faVal = data[r][faCol];
      var cprDate = parseCellDate(cprVal), faDate = parseCellDate(faVal);
      var faStr = faVal ? faVal.toString().trim().toUpperCase() : "";
      var cprStr = cprVal ? cprVal.toString().trim().toUpperCase() : "";

      if (isExcusal(cprStr) && isExcusal(faStr)) { /* fine */ }
      else if (cprDate && !faDate && !isExcusal(faStr)) {
        sheet.getRange(r + 1, faCol + 1).setValue(formatBackfillDate(cprDate)); fixedCprFa++;
      } else if (faDate && !cprDate && !isExcusal(cprStr)) {
        sheet.getRange(r + 1, cprCol + 1).setValue(formatBackfillDate(faDate)); fixedCprFa++;
      } else if (cprDate && faDate && cprDate.getTime() !== faDate.getTime()) {
        var newerDate = cprDate > faDate ? cprDate : faDate;
        sheet.getRange(r + 1, cprCol + 1).setValue(formatBackfillDate(newerDate));
        sheet.getRange(r + 1, faCol + 1).setValue(formatBackfillDate(newerDate));
        fixedCprFa++;
      }
    }

    // MED_TRAIN ↔ POST MED
    if (medCol >= 0 && pmCol >= 0) {
      var medVal = data[r][medCol], pmVal = data[r][pmCol];
      var medDate = parseCellDate(medVal), pmDate = parseCellDate(pmVal);
      var medStr = medVal ? medVal.toString().trim().toUpperCase() : "";
      var pmStr = pmVal ? pmVal.toString().trim().toUpperCase() : "";

      // Don't touch failure codes
      var medIsFail = isFailureCode(medStr);
      var pmIsFail = isFailureCode(pmStr);
      if (medIsFail || pmIsFail) { /* leave alone */ }
      else if (isExcusal(medStr) && isExcusal(pmStr)) { /* fine */ }
      else if (medDate && !pmDate && !isExcusal(pmStr)) {
        var nextDay = new Date(medDate); nextDay.setDate(nextDay.getDate() + 1);
        sheet.getRange(r + 1, pmCol + 1).setValue(formatBackfillDate(nextDay)); fixedMedPm++;
      } else if (pmDate && !medDate && !isExcusal(medStr)) {
        var prevDay = new Date(pmDate); prevDay.setDate(prevDay.getDate() - 1);
        sheet.getRange(r + 1, medCol + 1).setValue(formatBackfillDate(prevDay)); fixedMedPm++;
      } else if (medDate && pmDate) {
        var expectedPm = new Date(medDate); expectedPm.setDate(expectedPm.getDate() + 1);
        var daysDiff = Math.abs(Math.round((pmDate - medDate) / (1000 * 60 * 60 * 24)));
        if (daysDiff > 7) {
          sheet.getRange(r + 1, pmCol + 1).setValue(formatBackfillDate(expectedPm)); fixedMedPm++;
        }
      }
    }
  }

  // Pass 3: Delete blank rows (bottom to top)
  data = sheet.getDataRange().getValues();
  for (var r = data.length - 1; r >= 1; r--) {
    var lastName = data[r][0] ? data[r][0].toString().trim() : "";
    var firstName = data[r][1] ? data[r][1].toString().trim() : "";
    if (!lastName && !firstName) {
      var allEmpty = true;
      for (var c = 0; c < data[r].length; c++) {
        if (data[r][c] !== null && data[r][c] !== undefined && data[r][c].toString().trim() !== "") {
          allEmpty = false; break;
        }
      }
      if (allEmpty) { sheet.deleteRow(r + 1); deletedRows++; }
    }
  }

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

  ui.alert(summary);
}


// ************************************************************
//
//   8. DATA INTEGRITY HELPERS
//
// ************************************************************

/** Check if a cell value is an excusal code (wrapper) */
function isExcusal(str) {
  return getExcusalCode(str) !== null;
}

/** Parse a cell value to a Date (strict: validates year 2000-2099) */
function parseCellDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;

  var str = val.toString().trim();
  if (!str) return null;

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

/** Format date for audit display */
function formatAuditDate(d) {
  if (!d) return "";
  return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
}
