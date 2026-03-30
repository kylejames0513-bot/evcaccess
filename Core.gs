// ============================================================
// EVC Training System — Core & Data Tools
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
//
// CONTENTS:
//   1. Menu & onOpen
//   2. doPost (HTML sign-in form)
//   3. doGet (VBA calls: addEmployee, checkName)
//   4. Name matching (checkNameInTraining, findTrainingRow)
//   5. Duplicate detection (onEdit, checkForDuplicateOnEdit)
//   6. Training Access updates (updateTrainingAccess)
//   7. Auto-fill rules
//   8. Installable trigger (onTrainingEdit)
//   9. Trigger installer
//  10. Test & utility functions
//  11. Backfill Training Access from Records
//  12. Batch Pass/Fail
//  13. Batch Set Session Info
//  14. Flag late arrivals / early departures
//  15. Clean garbled dates
//  16. Audit Training Sheet
//  17. Fix Training Sheet Issues
//  18. Data integrity helpers
//
// DEPENDS ON: Config.gs, Utilities.gs
//
// NOTE: Rosters never auto-refresh. Use EVC Tools >
//       5a. Refresh All when you are ready.
//
// ============================================================


// ************************************************************
//
//   1. MENU & onOpen
//
// ************************************************************

function onOpen() {
  createMenu();
}

function createMenu() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu("EVC Tools")

    // ── 1. TRAINING RECORDS ──
    .addSubMenu(ui.createMenu("1. Training Records")
      .addItem("1a. Batch Pass/Fail for a session", "batchPassFail")
      .addItem("1b. Set Session End Time & Length", "batchSetSessionInfo")
      .addItem("1c. Flag late arrivals", "flagLateArrivals")
      .addItem("1d. Flag early departures", "flagEarlyDepartures")
      .addItem("1e. Backfill Training Access from Records", "backfillTrainingAccess")
      .addItem("1f. Upload Roster Results", "uploadRosterResults"))

    .addSeparator()

    // ── 2. ROSTERS & SCHEDULING ──
    .addSubMenu(ui.createMenu("2. Rosters & Scheduling")
      .addItem("2a. Generate Training Rosters", "generateRosters")
      .addItem("2b. Generate Roster for One Training", "generateSingleRoster")
      .addItem("2c. Sync Scheduled Trainings", "syncScheduledTrainings")
      .addItem("2d. View Roster Config", "showConfig"))

    .addSeparator()

    // ── 3. CLASS MANAGEMENT ──
    .addSubMenu(ui.createMenu("3. Class Management")
      .addItem("3a. Create a Class", "createClass")
      .addItem("3b. Quick Build Class Rosters", "quickBuildRosters")
      .addItem("3c. Build Class Rosters from Overview", "buildRostersFromOverview")
      .addItem("3d. Generate Class Rosters (advanced)", "generateClassRosters")
      .addItem("3e. Manual Class Assignment", "manualClassAssignment")
      .addItem("3f. Generate Training Memo", "generateTrainingMemo"))

    .addSeparator()

    // ── 4. PEOPLE MANAGEMENT ──
    .addSubMenu(ui.createMenu("4. People Management")
      .addItem("4a. Smart Remove / Move", "smartRemove")
      .addItem("4b. Add to Rescheduled", "addToRescheduled")
      .addItem("4c. View Rescheduled List", "viewRescheduledList")
      .addItem("4d. View Removal Log", "viewRemovalLog")
      .addItem("4e. Clear Exemption", "clearExemption"))

    .addSeparator()

    // ── 5. REFRESH & MAINTENANCE ──
    .addSubMenu(ui.createMenu("5. Refresh & Maintenance")
      .addItem("5a. Refresh All (manual)", "refreshAll")
      .addItem("5b. Audit Training Sheet", "auditTrainingSheet")
      .addItem("5c. Fix Training Sheet Issues", "fixTrainingSheetIssues"))

    .addSeparator()

    // ── 6. EMAIL REPORTS ──
    .addSubMenu(ui.createMenu("6. Email Reports")
      .addItem("6a. Email Scheduled Overview (PDF)", "emailScheduledOverview")
      .addItem("6b. Email Training Rosters (PDF)", "emailTrainingRosters")
      .addItem("6c. Email Both Reports (PDF)", "emailBothReports"))

    .addSeparator()

    // ── 7. SETUP & HELP ──
    .addSubMenu(ui.createMenu("7. Setup & Help")
      .addItem("7a. Install Edit Trigger (run once)", "installEditTrigger")
      .addItem("7b. Test Training Access connection", "testTrainingAccessConnection")
      .addItem("7c. Test Name Check", "testCheckName")
      .addItem("7d. How to export to Excel", "exportReminder"))

    .addToUi();
}


// ************************************************************
//
//   2. doPost — handles form submissions from QR sign-in
//
// ************************************************************

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    var session   = e.parameter.session   || "";
    var attendee  = e.parameter.attendee  || "";
    var date      = e.parameter.date      || "";
    var leftEarly = e.parameter.leftEarly || "No";
    var reason    = e.parameter.reason    || "";
    var notes     = e.parameter.notes     || "";

    var now = new Date();
    var hours = now.getHours();
    var mins = now.getMinutes();
    var ampm = hours >= 12 ? "PM" : "AM";
    var h12 = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
    var arrivalTime = h12 + ":" + (mins < 10 ? "0" : "") + mins + " " + ampm;

    sheet.appendRow([
      arrivalTime,
      session,
      attendee,
      date,
      leftEarly,
      reason,
      notes,
      "",
      "",
      "Pending",
      ""
    ]);

    // Update Training sheet if this is a mapped session
    if (SESSION_TO_COLUMN[session]) {
      try {
        updateTrainingAccess(session, attendee, date);
      } catch (taErr) {
        Logger.log("Training Access update error: " + taErr.toString());
        // Still return success — the sign-in was recorded, just the
        // Training sheet sync failed. It will be caught on next manual refresh.
      }
    }

    return HtmlService.createHtmlOutput(
      "<html><body><script>window.parent.postMessage('submission_success','*');</script></body></html>"
    );

  } catch (error) {
    Logger.log("doPost error: " + error.toString());
    // Log to a cell so the error is visible to the admin
    try {
      var errorSheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
      errorSheet.appendRow([
        new Date().toLocaleTimeString(), "SYSTEM ERROR", "",
        new Date().toLocaleDateString(), "", "", "doPost failed: " + error.toString(),
        "", "", "Error", ""
      ]);
    } catch (logErr) {
      Logger.log("Could not log doPost error to sheet: " + logErr.toString());
    }
    return HtmlService.createHtmlOutput(
      "<html><body><script>window.parent.postMessage('submission_error','*');</script></body></html>"
    );
  }
}


// ************************************************************
//
//   3. doGet — handles VBA calls (addEmployee, checkName)
//
// ************************************************************

function doGet(e) {
  var action = e.parameter.action || "";

  // ── addEmployee: push new hire from Hiring Minutes ──
  if (action === "addEmployee") {
    try {
      var lastName = e.parameter.lastName || "";
      var firstName = e.parameter.firstName || "";
      var activeFlag = e.parameter.active || "Y";
      var forceNew = (e.parameter.forceNew === "true");

      if (!lastName || !firstName) {
        return ContentService.createTextOutput("ERROR: Missing name")
          .setMimeType(ContentService.MimeType.TEXT);
      }

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);
      if (!sheet) {
        return ContentService.createTextOutput("ERROR: Training sheet not found")
          .setMimeType(ContentService.MimeType.TEXT);
      }

      if (!forceNew) {
        var data = sheet.getDataRange().getValues();
        var lastLower = lastName.trim().toLowerCase();
        var firstLower = firstName.trim().toLowerCase();

        for (var r = 1; r < data.length; r++) {
          var rowLast = data[r][0] ? data[r][0].toString().trim().toLowerCase() : "";
          var rowFirst = data[r][1] ? data[r][1].toString().trim().toLowerCase() : "";

          var matched = false;

          if (rowLast === lastLower && rowFirst === firstLower) {
            matched = true;
          }

          if (!matched && rowLast === lastLower) {
            var cleanFirst = rowFirst.replace(/["'()]/g, " ").replace(/\s+/g, " ").trim();
            var rowNameParts = cleanFirst.split(" ");
            for (var p = 0; p < rowNameParts.length; p++) {
              if (rowNameParts[p] === firstLower || firstLower.indexOf(rowNameParts[p]) === 0 || rowNameParts[p].indexOf(firstLower) === 0) {
                matched = true;
                break;
              }
            }
          }

          if (matched) {
            var currentActive = data[r][2] ? data[r][2].toString().trim() : "";
            if (currentActive !== activeFlag) {
              sheet.getRange(r + 1, 3).setValue(activeFlag);
              return ContentService.createTextOutput("UPDATED: " + lastName + ", " + firstName + " Active=" + activeFlag)
                .setMimeType(ContentService.MimeType.TEXT);
            }
            return ContentService.createTextOutput("EXISTS: " + lastName + ", " + firstName + " (Active=" + currentActive + ")")
              .setMimeType(ContentService.MimeType.TEXT);
          }
        }
      }

      var newRow = [lastName.trim(), firstName.trim(), activeFlag];
      var numCols = sheet.getLastColumn();
      while (newRow.length < numCols) {
        newRow.push("");
      }

      sheet.appendRow(newRow);

      var addedMsg = forceNew ? "ADDED (NEW PERSON): " : "ADDED: ";
      return ContentService.createTextOutput(addedMsg + lastName + ", " + firstName + " Active=" + activeFlag)
        .setMimeType(ContentService.MimeType.TEXT);

    } catch (err) {
      return ContentService.createTextOutput("ERROR: " + err.toString())
        .setMimeType(ContentService.MimeType.TEXT);
    }
  }

  // ── checkName: duplicate/mismatch check from Hiring Minutes VBA ──
  if (action === "checkName") {
    try {
      var lastName = e.parameter.lastName || "";
      var firstName = e.parameter.firstName || "";
      var result = checkNameInTraining(lastName, firstName);
      return ContentService.createTextOutput(result)
        .setMimeType(ContentService.MimeType.TEXT);
    } catch (err) {
      return ContentService.createTextOutput("ERROR:" + err.toString())
        .setMimeType(ContentService.MimeType.TEXT);
    }
  }

  return ContentService.createTextOutput("EVC Training Attendance system is running.")
    .setMimeType(ContentService.MimeType.TEXT);
}


// ************************************************************
//
//   4. NAME MATCHING
//
// ************************************************************

/**
 * checkNameInTraining — scans Training sheet for matches.
 * Returns: "EXACT|Name" or "CLOSE|Name" or "NONE"
 * Called by doGet (checkName action) and testCheckName.
 */
function checkNameInTraining(lastName, firstName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);
  if (!sheet) return "ERROR|Training sheet not found";

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var lNameCol = -1;
  var fNameCol = -1;

  for (var c = 0; c < headers.length; c++) {
    var val = headers[c].toString().trim().toUpperCase();
    if (val === "L NAME") lNameCol = c;
    if (val === "F NAME") fNameCol = c;
  }
  if (lNameCol < 0 || fNameCol < 0) return "ERROR|Columns not found";

  var inputLast = lastName.trim().toLowerCase();
  var inputFirst = firstName.trim().toLowerCase();

  var namesToTry = [inputFirst];
  if (NICKNAMES[inputFirst]) {
    for (var i = 0; i < NICKNAMES[inputFirst].length; i++) {
      namesToTry.push(NICKNAMES[inputFirst][i]);
    }
  }

  var bestCloseMatch = null;
  var bestCloseScore = 0;

  for (var r = 1; r < data.length; r++) {
    var rowLast = data[r][lNameCol] ? data[r][lNameCol].toString().trim().toLowerCase() : "";
    var rowFirst = data[r][fNameCol] ? data[r][fNameCol].toString().trim().toLowerCase() : "";
    if (!rowLast) continue;

    if (rowLast !== inputLast) {
      if (stringSimilarity(inputLast, rowLast) > 0.85) {
        var cleanFirst = rowFirst.replace(/["'()]/g, " ").replace(/\s+/g, " ").trim();
        if (cleanFirst === inputFirst || cleanFirst.split(" ").indexOf(inputFirst) > -1) {
          var score = stringSimilarity(inputLast, rowLast);
          if (score > bestCloseScore) {
            bestCloseMatch = data[r][fNameCol] + " " + data[r][lNameCol];
            bestCloseScore = score;
          }
        }
      }
      continue;
    }

    var cleanFirst = rowFirst.replace(/["'()]/g, " ").replace(/\s+/g, " ").trim();
    var cleanParts = cleanFirst.split(" ");

    for (var n = 0; n < namesToTry.length; n++) {
      var tryName = namesToTry[n];

      if (cleanFirst === tryName) {
        return "EXACT|" + data[r][fNameCol] + " " + data[r][lNameCol];
      }

      for (var p = 0; p < cleanParts.length; p++) {
        if (cleanParts[p] === tryName) {
          return "EXACT|" + data[r][fNameCol] + " " + data[r][lNameCol];
        }
      }

      for (var p2 = 0; p2 < cleanParts.length; p2++) {
        var rowNicks = NICKNAMES[cleanParts[p2]] || [];
        if (rowNicks.indexOf(tryName) > -1) {
          return "EXACT|" + data[r][fNameCol] + " " + data[r][lNameCol];
        }
      }
    }

    var firstSim = stringSimilarity(inputFirst, cleanFirst);
    if (firstSim > 0.7 && firstSim < 1.0 && firstSim > bestCloseScore) {
      bestCloseMatch = data[r][fNameCol] + " " + data[r][lNameCol];
      bestCloseScore = firstSim;
    }

    for (var p3 = 0; p3 < cleanParts.length; p3++) {
      var partSim = stringSimilarity(inputFirst, cleanParts[p3]);
      if (partSim > 0.7 && partSim < 1.0 && partSim > bestCloseScore) {
        bestCloseMatch = data[r][fNameCol] + " " + data[r][lNameCol];
        bestCloseScore = partSim;
      }
    }
  }

  if (bestCloseMatch) return "CLOSE|" + bestCloseMatch;
  return "NONE";
}

/**
 * findTrainingRow — shared name-matching helper.
 * Returns 1-based row index into trainingData, or -1 if not found.
 */
function findTrainingRow(trainingData, firstName, lastName) {
  var firstLower = firstName.toLowerCase();
  var lastLower = lastName.toLowerCase();

  var namesToTry = [firstLower];
  if (NICKNAMES[firstLower]) {
    namesToTry = namesToTry.concat(NICKNAMES[firstLower]);
  }

  for (var r = 1; r < trainingData.length; r++) {
    var rowLast = trainingData[r][0] ? trainingData[r][0].toString().trim().toLowerCase() : "";
    var rowFirst = trainingData[r][1] ? trainingData[r][1].toString().trim().toLowerCase() : "";

    if (rowLast !== lastLower) continue;

    var cleanFirst = rowFirst.replace(/["'()]/g, " ").replace(/\s+/g, " ").trim();
    var rowNameParts = cleanFirst.split(" ");

    for (var n = 0; n < namesToTry.length; n++) {
      var tryName = namesToTry[n];

      if (rowFirst === tryName || cleanFirst === tryName) return r;

      for (var p = 0; p < rowNameParts.length; p++) {
        if (rowNameParts[p] === tryName) return r;
        if (rowNameParts[p].indexOf(tryName) === 0 || tryName.indexOf(rowNameParts[p]) === 0) return r;
      }

      for (var p2 = 0; p2 < rowNameParts.length; p2++) {
        var rowNicks = NICKNAMES[rowNameParts[p2]] || [];
        if (rowNicks.indexOf(tryName) > -1) return r;
      }
    }
  }

  return -1;
}


// ************************************************************
//
//   5. DUPLICATE DETECTION — Simple trigger
//
// ************************************************************

/**
 * onEdit — SIMPLE trigger (runs automatically, no setup needed).
 * Detects duplicate names when editing L NAME or F NAME columns
 * on the Training sheet. Cannot call generateRostersSilent
 * because simple triggers lack permission to delete/insert sheets.
 */
function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  if (sheet.getName() !== TRAINING_ACCESS_SHEET_NAME) return;

  var range = e.range;
  var row = range.getRow();
  var col = range.getColumn();

  if (row < 2) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var lNameCol = -1;
  var fNameCol = -1;
  for (var c = 0; c < headers.length; c++) {
    var val = headers[c].toString().trim().toUpperCase();
    if (val === "L NAME") lNameCol = c + 1;
    if (val === "F NAME") fNameCol = c + 1;
  }
  if (lNameCol < 0 || fNameCol < 0) return;

  if (col === lNameCol || col === fNameCol) {
    checkForDuplicateOnEdit(sheet, row, col, lNameCol, fNameCol);
  }
}

/**
 * checkForDuplicateOnEdit — highlights duplicates, nickname
 * matches, and similar names on the Training sheet.
 */
function checkForDuplicateOnEdit(sheet, row, col, lNameCol, fNameCol) {
  var lastName = sheet.getRange(row, lNameCol).getValue().toString().trim();
  var firstName = sheet.getRange(row, fNameCol).getValue().toString().trim();
  if (!lastName || !firstName) return;

  var data = sheet.getDataRange().getValues();
  var inputLast = lastName.toLowerCase();
  var inputFirst = firstName.toLowerCase().replace(/["'()]/g, " ").replace(/\s+/g, " ").trim();

  for (var r = 1; r < data.length; r++) {
    if (r === row - 1) continue;

    var existLast = data[r][lNameCol - 1] ? data[r][lNameCol - 1].toString().trim().toLowerCase() : "";
    var existFirst = data[r][fNameCol - 1] ? data[r][fNameCol - 1].toString().trim().toLowerCase() : "";
    var cleanExist = existFirst.replace(/["'()]/g, " ").replace(/\s+/g, " ").trim();

    if (existLast !== inputLast) continue;

    // Exact or part match → yellow highlight
    if (cleanExist === inputFirst || cleanExist.split(" ").indexOf(inputFirst) > -1) {
      sheet.getRange(row, fNameCol).setBackground("#FFEB9C");
      sheet.getRange(row, fNameCol).setNote(
        "DUPLICATE: This name already exists on row " + (r + 1) +
        " as " + data[r][fNameCol - 1] + " " + data[r][lNameCol - 1]
      );
      return;
    }

    // Nickname match → yellow highlight
    var inputNicks = NICKNAMES[inputFirst] || [];
    var existParts = cleanExist.split(" ");
    var nickFound = false;
    for (var n = 0; n < inputNicks.length; n++) {
      if (existParts.indexOf(inputNicks[n]) > -1) { nickFound = true; break; }
    }
    if (!nickFound) {
      for (var ep = 0; ep < existParts.length; ep++) {
        var existNicks = NICKNAMES[existParts[ep]] || [];
        if (existNicks.indexOf(inputFirst) > -1) { nickFound = true; break; }
      }
    }
    if (nickFound) {
      sheet.getRange(row, fNameCol).setBackground("#FFEB9C");
      sheet.getRange(row, fNameCol).setNote(
        "NICKNAME MATCH: This may be the same person as row " + (r + 1) +
        " (" + data[r][fNameCol - 1] + " " + data[r][lNameCol - 1] + ")"
      );
      return;
    }

    // Fuzzy match → blue highlight
    var sim = stringSimilarity(inputFirst, cleanExist);
    if (sim > 0.7 && sim < 1.0) {
      sheet.getRange(row, fNameCol).setBackground("#BDD7EE");
      sheet.getRange(row, fNameCol).setNote(
        "SIMILAR NAME: Check row " + (r + 1) +
        " (" + data[r][fNameCol - 1] + " " + data[r][lNameCol - 1] + ")"
      );
      return;
    }
  }

  // No match — clear any old highlights
  sheet.getRange(row, fNameCol).setBackground(null);
  sheet.getRange(row, fNameCol).clearNote();
}


// ************************************************************
//
//   6. TRAINING ACCESS UPDATES
//
// ************************************************************

/**
 * updateTrainingAccess — writes a training date to the
 * Training sheet. Handles multi-column sessions (e.g.,
 * CPR → CPR + FIRSTAID). Respects NA and failure codes.
 */
function updateTrainingAccess(session, attendeeName, dateStr) {
  var columnHeaders = SESSION_TO_COLUMN[session];
  if (!columnHeaders || columnHeaders.length === 0) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);
  if (!sheet) {
    Logger.log("Training Access: sheet '" + TRAINING_ACCESS_SHEET_NAME + "' not found.");
    return;
  }
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var targetCols = [];
  for (var ch = 0; ch < columnHeaders.length; ch++) {
    for (var c = 0; c < headers.length; c++) {
      if (headers[c].toString().trim() === columnHeaders[ch]) {
        targetCols.push(c);
        break;
      }
    }
  }
  if (targetCols.length === 0) {
    Logger.log("Training Access: no matching columns found for session '" + session + "'");
    return;
  }

  var firstName = "";
  var lastName = "";
  attendeeName = attendeeName.trim();

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
    Logger.log("Training Access: could not parse name '" + attendeeName + "'");
    return;
  }

  var matchRow = findTrainingRow(data, firstName, lastName);

  if (matchRow === -1) {
    Logger.log("Training Access: no match for '" + lastName + ", " + firstName + "'");
    return;
  }

  var formattedDate = formatBackfillDate(dateStr);

  for (var tc = 0; tc < targetCols.length; tc++) {
    var currentVal = data[matchRow][targetCols[tc]];
    var currentStr = currentVal ? currentVal.toString().trim().toUpperCase() : "";

    // Never overwrite NA/N/A
    if (currentStr === "NA" || currentStr === "N/A") {
      Logger.log("Training Access: skipping " + lastName + ", " + firstName + " | column " + targetCols[tc] + " is NA (excused)");
      continue;
    }

    // Never overwrite failure codes
    if (currentStr === "FAILED" || currentStr === "FAIL" ||
        /^FAILED X\d$/.test(currentStr) ||
        /^FX\d/.test(currentStr) || /^F\s*X\s*\d/.test(currentStr) ||
        currentStr === "FS") {
      Logger.log("Training Access: skipping " + lastName + ", " + firstName + " | column " + targetCols[tc] + " is failure code (" + currentStr + ")");
      continue;
    }

    sheet.getRange(matchRow + 1, targetCols[tc] + 1).setValue(formattedDate);

    // Auto-fill linked columns
    var writtenHeader = headers[targetCols[tc]] ? headers[targetCols[tc]].toString().trim() : "";
    applyAutoFillRules(sheet, matchRow + 1, headers, writtenHeader, formattedDate);
  }

  Logger.log("Training Access updated: " + lastName + ", " + firstName + " | " + session + " = " + formattedDate + " (" + targetCols.length + " columns)");
}


// ************************************************************
//
//   7. AUTO-FILL RULES
//
// ************************************************************

/**
 * applyAutoFillRules — when a date is written to one column,
 * automatically fill the linked column (e.g., CPR → FIRSTAID).
 * Respects NA/N/A and failure codes in the target cell.
 */
function applyAutoFillRules(sheet, rowNum, headers, writtenCol, dateStr) {
  for (var r = 0; r < AUTO_FILL_RULES.length; r++) {
    var rule = AUTO_FILL_RULES[r];
    if (rule.source !== writtenCol) continue;

    // Find target column
    var targetColIdx = -1;
    for (var h = 0; h < headers.length; h++) {
      if (headers[h].toString().trim() === rule.target) {
        targetColIdx = h;
        break;
      }
    }
    if (targetColIdx === -1) {
      Logger.log("Auto-fill: target column '" + rule.target + "' not found");
      continue;
    }

    // Check if target is NA or failure code
    var targetVal = sheet.getRange(rowNum, targetColIdx + 1).getValue();
    var targetStr = targetVal ? targetVal.toString().trim() : "";
    var targetUpper = targetStr.toUpperCase();
    if (targetUpper === "NA" || targetUpper === "N/A") {
      Logger.log("Auto-fill: skipping " + rule.target + " row " + rowNum + " (NA)");
      continue;
    }
    if (targetUpper === "FAILED" || targetUpper === "FAIL" ||
        /^FAILED X\d$/.test(targetUpper) ||
        /^FX\d/i.test(targetUpper) || /^F\s*X\s*\d/i.test(targetUpper) ||
        targetUpper === "FS") {
      Logger.log("Auto-fill: skipping " + rule.target + " row " + rowNum + " (failure code: " + targetStr + ")");
      continue;
    }

    // Calculate target date
    var sourceDate = parseToDate(dateStr);
    if (!sourceDate) {
      sourceDate = new Date(dateStr);
      if (isNaN(sourceDate.getTime())) {
        Logger.log("Auto-fill: could not parse date '" + dateStr + "'");
        continue;
      }
    }

    var targetDate = new Date(sourceDate);
    targetDate.setDate(targetDate.getDate() + rule.offset);
    var formattedTarget = formatBackfillDate(targetDate);

    // Skip if target already has this date (prevents infinite loops)
    var existingFormatted = formatBackfillDate(targetVal);
    if (existingFormatted === formattedTarget) continue;

    sheet.getRange(rowNum, targetColIdx + 1).setValue(formattedTarget);
    Logger.log("Auto-fill: " + rule.source + " → " + rule.target + " = " + formattedTarget + " (row " + rowNum + ")");
  }
}


// ************************************************************
//
//   8. INSTALLABLE TRIGGER — onTrainingEdit
//
//   Handles edits on:
//     - Training sheet: auto-fill linked columns (CPR/FA, Med/PostMed)
//     - Training Records: sync Pass to Training sheet
//     - Scheduled Overview: sync name edits to Scheduled sheet
//
//   NOTE: Rosters do NOT auto-refresh. Use EVC Tools > Refresh All.
//   Requires: run installEditTrigger() ONCE.
//
// ************************************************************

function onTrainingEdit(e) {
  try {
    var sheet = e.source.getActiveSheet();
    var sheetName = sheet.getName();

    // ── Training sheet: refresh rosters on date column edits ──
    if (sheetName === TRAINING_ACCESS_SHEET_NAME) {
      var range = e.range;
      var row = range.getRow();
      var col = range.getColumn();

      if (row < 2) return;

      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var editedHeader = headers[col - 1] ? headers[col - 1].toString().trim() : "";

      var isTrainingCol = false;
      for (var t = 0; t < TRAINING_CONFIG.length; t++) {
        if (TRAINING_CONFIG[t].column === editedHeader) {
          isTrainingCol = true;
          break;
        }
      }
      if (!isTrainingCol) {
        for (var key in SESSION_TO_COLUMN) {
          var cols = SESSION_TO_COLUMN[key];
          for (var sc = 0; sc < cols.length; sc++) {
            if (cols[sc] === editedHeader) {
              isTrainingCol = true;
              break;
            }
          }
          if (isTrainingCol) break;
        }
      }

      if (isTrainingCol) {
        var editedVal = e.range.getValue();
        var editedStr = editedVal ? editedVal.toString().trim() : "";
        if (editedStr) {
          applyAutoFillRules(sheet, row, headers, editedHeader, editedStr);
        }
        // Roster refresh is manual — use EVC Tools > 5a. Refresh All
      }
    }

    // ── Training Records: sync Pass/Fail, date, and name edits ──
    if (sheetName === "Training Records") {
      var col = e.range.getColumn();
      var row = e.range.getRow();
      if (row < 2) return;

      var data = sheet.getDataRange().getValues();
      var session = data[row - 1][1] ? data[row - 1][1].toString().trim() : "";
      var attendee = data[row - 1][2] ? data[row - 1][2].toString().trim() : "";
      var dateVal = data[row - 1][3];
      var passFail = data[row - 1][9] ? data[row - 1][9].toString().trim() : "";

      var shouldUpdate = false;

      // Pass/Fail just changed to Pass
      if (col === 10) {
        var newVal = e.range.getValue().toString().trim();
        if (newVal === "Pass") shouldUpdate = true;
      }

      // Date edited on a row already marked Pass
      if (col === 4 && passFail === "Pass") {
        shouldUpdate = true;
      }

      // Attendee name edited on a row already marked Pass
      if (col === 3 && passFail === "Pass") {
        attendee = e.range.getValue().toString().trim();
        shouldUpdate = true;
      }

      if (shouldUpdate && session && attendee && SESSION_TO_COLUMN[session]) {
        try {
          updateTrainingAccess(session, attendee, dateVal);
        } catch (err) {
          Logger.log("onTrainingEdit update error: " + err.toString());
        }
        // Roster refresh is manual — use EVC Tools > 5a. Refresh All
      }
    }

    // ── Scheduled sheet: DO NOTHING automatically ──
    // Use EVC Tools > Refresh All when ready

    // ── Scheduled Overview: sync name edits ──
    if (sheetName === OVERVIEW_SHEET_NAME) {
      var col = e.range.getColumn();
      var row = e.range.getRow();

      // Column B = Person name (column 2)
      if (col !== 2) return;

      // Check if this row has ENROLLEE: metadata in column F
      var meta = sheet.getRange(row, 6).getValue();
      var metaStr = meta ? meta.toString().trim() : "";
      if (metaStr.indexOf("ENROLLEE:") !== 0) return;

      var oldValue = e.oldValue ? e.oldValue.toString().trim() : "";
      var newValue = e.range.getValue();
      var newStr = newValue ? newValue.toString().trim() : "";

      if (oldValue === newStr) return;

      // Find the session by scanning up for SESSION: metadata
      var allData = sheet.getDataRange().getValues();
      var sessionType = "", sessionDate = "";
      for (var sr = row - 1; sr >= 0; sr--) {
        var cellMeta = allData[sr][5] ? allData[sr][5].toString().trim() : "";
        if (cellMeta.indexOf("SESSION:") === 0) {
          var headerText = allData[sr][0] ? allData[sr][0].toString().trim() : "";
          var dashIdx = headerText.indexOf("  \u2014  ");
          if (dashIdx > -1) {
            sessionType = headerText.substring(0, dashIdx).trim();
            sessionDate = headerText.substring(dashIdx + 5).trim();
          } else {
            sessionType = headerText.trim();
          }
          break;
        }
      }

      if (!sessionType) return;

      var ss = e.source;

      // Name REMOVED
      if (oldValue && !newStr) {
        syncOverviewToScheduled_(ss, [{
          sessionType: sessionType,
          dateDisplay: sessionDate,
          removedName: oldValue
        }]);
        Logger.log("Overview edit: removed " + oldValue + " from " + sessionType + " " + sessionDate);
      }

      // Name ADDED
      if (!oldValue && newStr) {
        syncOverviewAdditionsToScheduled_(ss, [{
          sessionType: sessionType,
          dateDisplay: sessionDate,
          name: newStr
        }]);
        Logger.log("Overview edit: added " + newStr + " to " + sessionType + " " + sessionDate);
      }

      // Name CHANGED
      if (oldValue && newStr && oldValue !== newStr) {
        syncOverviewToScheduled_(ss, [{
          sessionType: sessionType,
          dateDisplay: sessionDate,
          removedName: oldValue
        }]);
        syncOverviewAdditionsToScheduled_(ss, [{
          sessionType: sessionType,
          dateDisplay: sessionDate,
          name: newStr
        }]);
        Logger.log("Overview edit: swapped " + oldValue + " → " + newStr + " in " + sessionType + " " + sessionDate);
      }

      // Update snapshot
      var currentState = readCurrentOverviewState_();
      if (currentState) saveOverviewSnapshot_(currentState);
      // Roster refresh is manual — use EVC Tools > 5a. Refresh All
    }

  } catch (err) {
    Logger.log("onTrainingEdit error: " + err.toString());
  }
}


// ************************************************************
//
//   9. TRIGGER INSTALLERS
//
// ************************************************************

/**
 * installEditTrigger — run ONCE to enable edit syncing.
 * Creates the installable onTrainingEdit trigger.
 */
function installEditTrigger() {
  var ui = SpreadsheetApp.getUi();

  // Remove existing onTrainingEdit triggers to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "onTrainingEdit") {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }

  ScriptApp.newTrigger("onTrainingEdit")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  ui.alert(
    "Edit trigger installed!\n\n" +
    (removed > 0 ? "Removed " + removed + " old trigger(s) first.\n\n" : "") +
    "What this does:\n" +
    "  1. When you edit a training date on the Training sheet,\n" +
    "     linked columns auto-fill (CPR/FA, Med/PostMed).\n\n" +
    "  2. When you change Pass/Fail to 'Pass' on Training Records,\n" +
    "     it updates the Training sheet automatically.\n\n" +
    "  3. When you edit names on the Scheduled Overview,\n" +
    "     it syncs changes to the Scheduled sheet.\n\n" +
    "NOTE: Rosters do NOT auto-refresh.\n" +
    "Use EVC Tools > 5a. Refresh All when you're ready.\n\n" +
    "You only need to run this once. It persists across sessions."
  );
}


// ************************************************************
//
//   10. TEST & UTILITY FUNCTIONS
//
// ************************************************************

function testTrainingAccessConnection() {
  var ui = SpreadsheetApp.getUi();
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);
    if (!sheet) {
      ui.alert("Sheet '" + TRAINING_ACCESS_SHEET_NAME + "' not found in this workbook.\n\nMake sure your training access tracker is on a sheet named 'Training'.");
      return;
    }
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var rowCount = sheet.getLastRow() - 1;

    ui.alert(
      "Connection successful!\n\n" +
      "Sheet name: " + sheet.getName() + "\n" +
      "Employees: " + rowCount + "\n" +
      "Columns: " + headers.length + "\n\n" +
      "First few headers:\n" + headers.slice(0, 10).join(", ")
    );
  } catch (err) {
    ui.alert("Connection failed!\n\nError: " + err.toString());
  }
}

function testCheckName() {
  var ui = SpreadsheetApp.getUi();
  var lastInput = ui.prompt("Test Name Check", "Enter a last name:", ui.ButtonSet.OK_CANCEL);
  if (lastInput.getSelectedButton() !== ui.Button.OK) return;
  var firstInput = ui.prompt("Test Name Check", "Enter a first name:", ui.ButtonSet.OK_CANCEL);
  if (firstInput.getSelectedButton() !== ui.Button.OK) return;
  var result = checkNameInTraining(lastInput.getResponseText(), firstInput.getResponseText());
  ui.alert("Result: " + result);
}

function testWrite() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  sheet.appendRow([
    "9:05 AM", "TEST SESSION", "Test User", "2026-03-17",
    "No", "", "This is a test entry", "", "", "Pending", ""
  ]);
  SpreadsheetApp.getUi().alert("Test row added! Check the sheet, then delete it.");
}

function exportReminder() {
  SpreadsheetApp.getUi().alert("To export:\n\nFile > Download > Microsoft Excel (.xlsx)\n\nThis saves a local copy to your computer.");
}

function showConfig() {
  var ui = SpreadsheetApp.getUi();
  var msg = "Current Training Configuration:\n\n";
  msg += "Expiring Soon Window: " + EXPIRING_SOON_DAYS + " days\n";
  msg += "Training Sheet: \"" + TRAINING_ACCESS_SHEET_NAME + "\"\n\n";

  for (var i = 0; i < TRAINING_CONFIG.length; i++) {
    var c = TRAINING_CONFIG[i];
    var renewal = c.renewalYears === 0 ? "Indefinite (one and done)" : c.renewalYears + " year(s)";
    var reqLabel = c.required ? "REQUIRED FOR ALL" : "Excusable";
    msg += (i + 1) + ".  " + c.name + "\n";
    msg += "     Column: \"" + c.column + "\"\n";
    msg += "     Renewal: " + renewal + "\n";
    msg += "     Status: " + reqLabel + "\n";
    if (c.prerequisite) {
      msg += "     Prerequisite: \"" + c.prerequisite + "\" must be completed first\n";
    }
    msg += "\n";
  }

  ui.alert(msg);
}

function setupSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  sheet.clear();

  var headers = [
    "Arrival Time", "Training Session", "Attendee Name",
    "Date of Training", "Left Early", "Reason", "Notes / Issues",
    "Session End Time", "Session Length", "Pass / Fail", "Reviewed By"
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  var staffH = sheet.getRange(1, 1, 1, 7);
  staffH.setFontWeight("bold").setBackground("#1F3864").setFontColor("#FFFFFF").setFontFamily("Arial");

  var batchH = sheet.getRange(1, 8, 1, 2);
  batchH.setFontWeight("bold").setBackground("#E65100").setFontColor("#FFFFFF").setFontFamily("Arial");

  var mgmtH = sheet.getRange(1, 10, 1, 2);
  mgmtH.setFontWeight("bold").setBackground("#2E7D32").setFontColor("#FFFFFF").setFontFamily("Arial");

  var widths = [110, 170, 170, 130, 90, 200, 220, 130, 130, 100, 130];
  for (var i = 0; i < widths.length; i++) {
    sheet.setColumnWidth(i + 1, widths[i]);
  }

  var pfRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Pending", "Pass", "Fail"])
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 10, 999, 1).setDataValidation(pfRule);

  var leRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["No", "Yes"])
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 5, 999, 1).setDataValidation(leRule);

  sheet.setFrozenRows(1);
  sheet.setName("Training Records");

  createMenu();

  SpreadsheetApp.getUi().alert(
    "Setup complete!\n\n" +
    "Column colors:\n" +
    "  Blue = Staff data (auto-filled from form)\n" +
    "  Orange = Session End Time & Length (use EVC Tools menu)\n" +
    "  Green = Pass/Fail & Reviewed By (you fill manually)\n\n" +
    "Use the 'EVC Tools' menu at the top for batch updates."
  );
}


// ============================================================
//
//   DATA TOOLS (merged from Datatools.gs)
//
// ============================================================

// ************************************************************
//
//   11. BACKFILL — Process all Training Records into Training sheet
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
    "\nUse EVC Tools > 5a. Refresh All to update rosters.\n";

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

  generateRostersSilent();
  summary += "\nTraining Rosters refreshed.";
  ui.alert(summary);
  Logger.log(summary);
}


// ************************************************************
//
//   12. BATCH PASS/FAIL
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
  }

  if (trainingErrors.length > 0) {
    doneMsg += "\n\nTraining update errors (" + trainingErrors.length + "):";
    for (var te = 0; te < Math.min(trainingErrors.length, 10); te++) {
      doneMsg += "\n  " + trainingErrors[te];
    }
  }

  doneMsg += "\n\nTraining Rosters refreshed.";
  ui.alert(doneMsg);
}


// ************************************************************
//
//   13. BATCH SET SESSION INFO
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
//   14. FLAG LATE ARRIVALS / EARLY DEPARTURES
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
//   15. CLEAN GARBLED DATES
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
//   16. AUDIT TRAINING SHEET — Full report
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
//   17. FIX TRAINING SHEET ISSUES — Auto-repair
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



  var summary = "Training Sheet Fixes Applied!\n\n";
  summary += "NEEDDS → NEEDS: " + fixedNeedds + "\n";
  summary += "N/ → N/A: " + fixedNA + "\n";
  summary += "COMPLETED → COMPLETE: " + fixedCompleted + "\n";
  summary += "FAIL → FAILED: " + fixedFail + "\n";
  summary += "Garbled dates cleared: " + clearedGarbled + "\n";
  summary += "CPR ↔ FirstAid synced: " + fixedCprFa + "\n";
  summary += "MedCert → PostMed filled: " + fixedMedPm + "\n";
  summary += "Blank rows deleted: " + deletedRows + "\n";

  generateRostersSilent();
  summary += "\nTraining Rosters refreshed.";

  ui.alert(summary);
}


// ************************************************************
//
//   18. DATA INTEGRITY HELPERS
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


// ************************************************************
//
//   19. EMAIL REPORTS
//
// ************************************************************

/**
 * Exports a single sheet as a PDF blob.
 */
function exportSheetAsPdf_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return null;

  var ssId = ss.getId();
  var sheetId = sheet.getSheetId();

  var url = "https://docs.google.com/spreadsheets/d/" + ssId + "/export?" +
    "format=pdf" +
    "&gid=" + sheetId +
    "&size=letter" +
    "&portrait=true" +
    "&fitw=true" +
    "&gridlines=false" +
    "&printtitle=false" +
    "&sheetnames=false" +
    "&fzr=true" +
    "&top_margin=0.25" +
    "&bottom_margin=0.25" +
    "&left_margin=0.25" +
    "&right_margin=0.25";

  var token = ScriptApp.getOAuthToken();
  var response = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    Logger.log("PDF export failed for " + sheetName + ": " + response.getContentText());
    return null;
  }

  var fileName = sheetName + " — " +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "M-d-yyyy") + ".pdf";
  return response.getBlob().setName(fileName);
}

/**
 * Prompts for email addresses (comma-separated).
 * Returns array of trimmed addresses, or null if cancelled.
 */
function promptEmailAddresses_(ui, reportName) {
  var response = ui.prompt(
    "Email " + reportName,
    "Enter email address(es), separated by commas:",
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return null;

  var input = response.getResponseText().trim();
  if (!input) { ui.alert("No email addresses entered."); return null; }

  var addresses = input.split(",");
  var cleaned = [];
  for (var i = 0; i < addresses.length; i++) {
    var addr = addresses[i].trim();
    if (addr && addr.indexOf("@") > -1) cleaned.push(addr);
  }
  if (cleaned.length === 0) { ui.alert("No valid email addresses found."); return null; }
  return cleaned;
}

/**
 * 6a. Email Scheduled Overview as PDF
 */
function emailScheduledOverview() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var addresses = promptEmailAddresses_(ui, "Scheduled Overview");
  if (!addresses) return;

  var pdf = exportSheetAsPdf_(ss, OVERVIEW_SHEET_NAME);
  if (!pdf) {
    ui.alert("Could not generate PDF.\n\nMake sure the \"" + OVERVIEW_SHEET_NAME + "\" tab exists.\nRun 5a. Refresh All first if needed.");
    return;
  }

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM d, yyyy");
  var subject = "EVC Scheduled Training Overview — " + today;
  var body = "Attached is the current Scheduled Training Overview as of " + today + ".\n\n" +
    "This report shows all upcoming training sessions and who is enrolled.\n\n" +
    "— EVC Training System";

  for (var i = 0; i < addresses.length; i++) {
    MailApp.sendEmail({
      to: addresses[i],
      subject: subject,
      body: body,
      attachments: [pdf]
    });
  }

  ui.alert("Sent!\n\nScheduled Overview emailed to:\n" + addresses.join("\n"));
}

/**
 * 6b. Email Training Rosters as PDF
 */
function emailTrainingRosters() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var addresses = promptEmailAddresses_(ui, "Training Rosters");
  if (!addresses) return;

  var pdf = exportSheetAsPdf_(ss, ROSTER_SHEET_NAME);
  if (!pdf) {
    ui.alert("Could not generate PDF.\n\nMake sure the \"" + ROSTER_SHEET_NAME + "\" tab exists.\nRun 2a. Generate Training Rosters first if needed.");
    return;
  }

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM d, yyyy");
  var subject = "EVC Training Rosters — " + today;
  var body = "Attached is the current Training Rosters report as of " + today + ".\n\n" +
    "This report shows who needs training, who is expiring soon, and who is scheduled.\n\n" +
    "— EVC Training System";

  for (var i = 0; i < addresses.length; i++) {
    MailApp.sendEmail({
      to: addresses[i],
      subject: subject,
      body: body,
      attachments: [pdf]
    });
  }

  ui.alert("Sent!\n\nTraining Rosters emailed to:\n" + addresses.join("\n"));
}

/**
 * 6c. Email Both Reports as PDF
 */
function emailBothReports() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var addresses = promptEmailAddresses_(ui, "Scheduled Overview + Training Rosters");
  if (!addresses) return;

  var overviewPdf = exportSheetAsPdf_(ss, OVERVIEW_SHEET_NAME);
  var rosterPdf = exportSheetAsPdf_(ss, ROSTER_SHEET_NAME);

  var attachments = [];
  var sent = [];
  if (overviewPdf) { attachments.push(overviewPdf); sent.push("Scheduled Overview"); }
  if (rosterPdf) { attachments.push(rosterPdf); sent.push("Training Rosters"); }

  if (attachments.length === 0) {
    ui.alert("Could not generate either PDF.\n\nMake sure the tabs exist.\nRun 5a. Refresh All first.");
    return;
  }

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM d, yyyy");
  var subject = "EVC Training Reports — " + today;
  var body = "Attached are the current EVC training reports as of " + today + ":\n\n";
  for (var i = 0; i < sent.length; i++) body += "  • " + sent[i] + "\n";
  body += "\n— EVC Training System";

  for (var i = 0; i < addresses.length; i++) {
    MailApp.sendEmail({
      to: addresses[i],
      subject: subject,
      body: body,
      attachments: attachments
    });
  }

  ui.alert("Sent!\n\n" + sent.join(" + ") + " emailed to:\n" + addresses.join("\n"));
}
