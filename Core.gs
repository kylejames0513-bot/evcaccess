// ============================================================
// EVC Training System — Core
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
//   9. Trigger installers
//  10. Test & utility functions
//
// DEPENDS ON: Config.gs, Utilities.gs
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
  SpreadsheetApp.getUi().createMenu("EVC Tools")
    .addItem("Set Session End Time & Length (batch)", "batchSetSessionInfo")
    .addItem("Batch Pass/Fail for a session", "batchPassFail")
    .addSeparator()
    .addItem("Flag late arrivals", "flagLateArrivals")
    .addItem("Flag early departures", "flagEarlyDepartures")
    .addSeparator()
    .addItem("Generate Training Rosters", "generateRosters")
    .addItem("Generate Roster for One Training", "generateSingleRoster")
    .addItem("Create a Class", "createClass")
    .addItem("Quick Build Class Rosters", "quickBuildRosters")
    .addItem("Build Class Rosters from Overview", "buildRostersFromOverview")
    .addItem("Generate Training Memo", "generateTrainingMemo")
    .addItem("Generate Class Rosters (advanced)", "generateClassRosters")
    .addItem("View Roster Config", "showConfig")
    .addSeparator()
    .addItem("Smart Remove / Move", "smartRemove")
    .addItem("Add to Standby", "addToStandby")
    .addItem("View Standby List", "viewStandbyList")
    .addItem("Upload Roster Results", "uploadRosterResults")
    .addItem("View Removal Log", "viewRemovalLog")
    .addItem("Clear Exemption", "clearExemption")
    .addSeparator()
    .addItem("Refresh All", "refreshAll")
    .addItem("Backfill Training Access from Records", "backfillTrainingAccess")
    .addSeparator()
    .addItem("Manual Class Assignment", "manualClassAssignment")
    .addItem("Sync Scheduled Trainings", "syncScheduledTrainings")
    .addSeparator()
    .addItem("Install Auto-Refresh Trigger (run once)", "installEditTrigger")
    .addItem("Install Class Roster Triggers (run once)", "installClassRosterTriggers")
    .addItem("Install Overview Sync Trigger (run once)", "installOverviewSyncTrigger")
    .addSeparator()
    .addItem("Test Training Access connection", "testTrainingAccessConnection")
    .addItem("Test Name Check", "testCheckName")
    .addItem("How to export to Excel", "exportReminder")
    .addSeparator()
    .addItem("Scan for Acronyms", "scanAcronyms")
    .addItem("Apply Acronym Changes", "applyAcronymChanges")
    .addSeparator()
    .addItem("Audit Training Sheet", "auditTrainingSheet")
    .addItem("Fix Training Sheet Issues", "fixTrainingSheetIssues")
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
        generateRostersSilent();
      } catch (taErr) {
        Logger.log("Training Access update error: " + taErr.toString());
      }
    }

    return HtmlService.createHtmlOutput(
      "<html><body><script>window.parent.postMessage('submission_success','*');</script></body></html>"
    );

  } catch (error) {
    Logger.log("doPost error: " + error.toString());
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
      generateRostersSilent();

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
//     - Training sheet: auto-fill + roster refresh
//     - Training Records: sync Pass/Fail to Training sheet
//     - Scheduled Overview: sync name edits to Scheduled sheet
//     - Scheduled sheet: does nothing (use Refresh All)
//
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
        generateRostersSilent();
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
        generateRostersSilent();
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

      // Update snapshot and refresh
      var currentState = readCurrentOverviewState_();
      if (currentState) saveOverviewSnapshot_(currentState);
      generateRostersSilent();
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
 * installEditTrigger — run ONCE to enable auto-refresh.
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
    "Auto-refresh trigger installed!\n\n" +
    (removed > 0 ? "Removed " + removed + " old trigger(s) first.\n\n" : "") +
    "What this does:\n" +
    "  1. When you edit a training date on the Training sheet,\n" +
    "     the Training Rosters tab auto-refreshes.\n\n" +
    "  2. When you manually change Pass/Fail to 'Pass' on\n" +
    "     Training Records, it updates the Training sheet\n" +
    "     AND refreshes rosters automatically.\n\n" +
    "  3. When you edit the date or attendee name on a row\n" +
    "     already marked Pass, it re-syncs the corrected\n" +
    "     info to the Training sheet and refreshes rosters.\n\n" +
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
