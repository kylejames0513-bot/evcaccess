// ============================================================
// EVC Training System — Core
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
//
// CONTENTS:
//   1. Menu & onOpen
//   2. doPost (sign-in form)
//   3. doGet (VBA: addEmployee, checkName)
//   4. Name matching
//   5. Duplicate detection (onEdit)
//   6. Training Access updates
//   7. Auto-fill rules
//   8. Installable trigger (onTrainingEdit)
//   9. Trigger installer
//  10. Backfill Training Access
//  11. Batch Pass/Fail
//  12. Batch Set Session Info
//  13. Flag late arrivals / early departures
//  14. Import from Paylocity
//
// DEPENDS ON: Config.gs, Utilities.gs
// ============================================================

function onOpen() {
  createMenu();
}

function createMenu() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu("EVC Tools")

    .addSubMenu(ui.createMenu("1. Training Records")
      .addItem("1a. Batch Pass/Fail for a session", "batchPassFail")
      .addItem("1b. Set Session End Time & Length", "batchSetSessionInfo")
      .addItem("1c. Flag late arrivals", "flagLateArrivals")
      .addItem("1d. Flag early departures", "flagEarlyDepartures")
      .addItem("1e. Backfill Training Access from Records", "backfillTrainingAccess")
      .addItem("1f. Import from Paylocity", "importFromPaylocity"))

    .addSeparator()

    .addSubMenu(ui.createMenu("2. Data Tools")
      .addItem("2a. Find Duplicates", "findDuplicates")
      .addItem("2b. Install Edit Trigger (run once)", "installEditTrigger"))

    .addToUi();
}


//   2. doPost — handles form submissions from QR sign-in
//
// ************************************************************

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Training Records");

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
      var errorSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Training Records");
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

  var bestFuzzyRow = -1;
  var bestFuzzyScore = 0;

  for (var r = 1; r < trainingData.length; r++) {
    var rowLast = trainingData[r][0] ? trainingData[r][0].toString().trim().toLowerCase() : "";
    var rowFirst = trainingData[r][1] ? trainingData[r][1].toString().trim().toLowerCase() : "";

    if (rowLast !== lastLower) continue;

    var cleanFirst = rowFirst.replace(/["'()]/g, " ").replace(/\s+/g, " ").trim();
    var rowNameParts = cleanFirst.split(" ");

    // Exact, partial, and nickname matching
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

    // Fuzzy matching — catches misspellings like Katlynn/Katelyn, Micheal/Michael
    var sim = stringSimilarity(firstLower, cleanFirst);
    if (sim > 0.75 && sim > bestFuzzyScore) {
      bestFuzzyRow = r;
      bestFuzzyScore = sim;
    }
  }

  // Return fuzzy match if found (spelling variants with same last name)
  if (bestFuzzyRow > -1) return bestFuzzyRow;

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
 * on the Training sheet.
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

  } catch (err) {
    Logger.log("onTrainingEdit error: " + err.toString());
  }
}


// ************************************************************
//
//   FIND DUPLICATES
//
// ************************************************************

function findDuplicates() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);
  if (!sheet) { ui.alert("Training sheet not found."); return; }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  // Find name and active columns by header
  var lNameCol = -1, fNameCol = -1, activeCol = -1;
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c].toString().trim().toUpperCase();
    if (h === "L NAME") lNameCol = c;
    if (h === "F NAME") fNameCol = c;
    if (h === "ACTIVE") activeCol = c;
  }
  if (lNameCol < 0 || fNameCol < 0) { ui.alert("L NAME / F NAME columns not found."); return; }

  // Group rows by normalized name
  var nameMap = {};  // normalized key → array of {row, last, first, active}
  for (var r = 1; r < data.length; r++) {
    var last = data[r][lNameCol] ? data[r][lNameCol].toString().trim() : "";
    var first = data[r][fNameCol] ? data[r][fNameCol].toString().trim() : "";
    if (!last) continue;

    var active = activeCol >= 0 ? (data[r][activeCol] || "").toString().trim().toUpperCase() : "";
    var key = last.toLowerCase() + "|" + first.toLowerCase().replace(/["'()]/g, "").replace(/\s+/g, " ").trim();

    if (!nameMap[key]) nameMap[key] = [];
    nameMap[key].push({ row: r + 1, last: last, first: first, active: active });
  }

  // Also check for fuzzy/nickname duplicates
  var exactDupes = [];
  var fuzzyDupes = [];
  var checkedPairs = {};

  var keys = Object.keys(nameMap);

  // Exact duplicates (same name)
  for (var k = 0; k < keys.length; k++) {
    if (nameMap[keys[k]].length > 1) {
      exactDupes.push(nameMap[keys[k]]);
    }
  }

  // Fuzzy duplicates (same last name, similar first name)
  for (var k1 = 0; k1 < keys.length; k1++) {
    var parts1 = keys[k1].split("|");
    var last1 = parts1[0];
    var first1 = parts1[1];

    for (var k2 = k1 + 1; k2 < keys.length; k2++) {
      var parts2 = keys[k2].split("|");
      var last2 = parts2[0];
      var first2 = parts2[1];

      if (last1 !== last2) continue;

      var pairKey = k1 + "|" + k2;
      if (checkedPairs[pairKey]) continue;
      checkedPairs[pairKey] = true;

      // Check nickname match
      var isNickname = false;
      var nicks1 = NICKNAMES[first1] || [];
      var nicks2 = NICKNAMES[first2] || [];
      if (nicks1.indexOf(first2) > -1 || nicks2.indexOf(first1) > -1) {
        isNickname = true;
      }

      // Check fuzzy similarity
      var sim = stringSimilarity(first1, first2);

      if (isNickname || sim > 0.7) {
        var allEntries = nameMap[keys[k1]].concat(nameMap[keys[k2]]);
        fuzzyDupes.push({ entries: allEntries, reason: isNickname ? "nickname" : "similar (" + Math.round(sim * 100) + "%)" });
      }
    }
  }

  // Highlight duplicates on the sheet
  var highlighted = 0;
  for (var d = 0; d < exactDupes.length; d++) {
    for (var e = 0; e < exactDupes[d].length; e++) {
      var row = exactDupes[d][e].row;
      sheet.getRange(row, lNameCol + 1).setBackground("#FFEB9C");
      sheet.getRange(row, fNameCol + 1).setBackground("#FFEB9C");
      sheet.getRange(row, fNameCol + 1).setNote(
        "EXACT DUPLICATE: " + exactDupes[d].length + " rows with this name: " +
        exactDupes[d].map(function(x) { return "row " + x.row + " (" + (x.active === "Y" ? "Active" : x.active || "?") + ")"; }).join(", ")
      );
      highlighted++;
    }
  }
  for (var f = 0; f < fuzzyDupes.length; f++) {
    for (var g = 0; g < fuzzyDupes[f].entries.length; g++) {
      var row = fuzzyDupes[f].entries[g].row;
      sheet.getRange(row, fNameCol + 1).setBackground("#BDD7EE");
      sheet.getRange(row, fNameCol + 1).setNote(
        "POSSIBLE DUPLICATE (" + fuzzyDupes[f].reason + "): " +
        fuzzyDupes[f].entries.map(function(x) { return x.first + " " + x.last + " (row " + x.row + ", " + (x.active === "Y" ? "Active" : x.active || "?") + ")"; }).join(", ")
      );
      highlighted++;
    }
  }

  // Build summary
  var summary = "Duplicate Scan Complete!\n\n";
  summary += "Exact duplicates: " + exactDupes.length + " group(s)\n";
  summary += "Possible duplicates (nickname/similar): " + fuzzyDupes.length + " group(s)\n";
  summary += "Cells highlighted: " + highlighted + "\n\n";

  if (exactDupes.length > 0) {
    summary += "── EXACT DUPLICATES (yellow) ──\n";
    for (var d = 0; d < Math.min(exactDupes.length, 20); d++) {
      var name = exactDupes[d][0].first + " " + exactDupes[d][0].last;
      var rows = exactDupes[d].map(function(x) { return "row " + x.row + " (" + (x.active === "Y" ? "Active" : x.active || "?") + ")"; }).join(", ");
      summary += "  " + name + ": " + rows + "\n";
    }
    summary += "\n";
  }

  if (fuzzyDupes.length > 0) {
    summary += "── POSSIBLE DUPLICATES (blue) ──\n";
    for (var f = 0; f < Math.min(fuzzyDupes.length, 20); f++) {
      var names = fuzzyDupes[f].entries.map(function(x) { return x.first + " " + x.last + " (row " + x.row + ")"; }).join(" ↔ ");
      summary += "  " + names + " [" + fuzzyDupes[f].reason + "]\n";
    }
    summary += "\n";
  }

  if (exactDupes.length === 0 && fuzzyDupes.length === 0) {
    summary += "No duplicates found!";
  } else {
    summary += "Yellow = exact duplicate\nBlue = possible duplicate (nickname or similar spelling)\n\nCheck the highlighted cells on the Training sheet.";
  }

  ui.alert(summary);
}


// ************************************************************
//
//   9. TRIGGER INSTALLER
//
// ************************************************************

function installEditTrigger() {
  var ui = SpreadsheetApp.getUi();

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
    "You only need to run this once. It persists across sessions."
  );
}



// ************************************************************
//
//   11. BACKFILL — Process all Training Records into Training sheet
//
// ************************************************************

function backfillTrainingAccess() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var recordsSheet = ss.getSheetByName("Training Records");
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
  var sheet = ss.getSheetByName("Training Records");
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

  ui.alert(doneMsg);
}


// ************************************************************
//
//   13. BATCH SET SESSION INFO
//
// ************************************************************

function batchSetSessionInfo() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Training Records");
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
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Training Records");
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
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Training Records");
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
//   20. IMPORT FROM PAYLOCITY
//
// ************************************************************

/**
 * Maps Paylocity Skill values to Training sheet column headers.
 * Skills not in this map are skipped during import.
 */
var PAYLOCITY_SKILL_MAP = {
  "cpr.fa":                      "CPR",
  "cpr/fa":                      "CPR",
  "ukeru":                       "Ukeru",
  "mealtime instructions":       "Mealtime",
  "med training":                "MED_TRAIN",
  "post med":                    "POST MED",
  "pom":                         "POM",
  "pers cent thnk":              "Pers Cent Thnk",
  "person centered thinking":    "Pers Cent Thnk",
  "safety care":                 "Safety Care",
  "meaningful day":              "Meaningful Day",
  "rights training":             "Rights Training",
  "title vi":                    "Title VI",
  "active shooter":              "Active Shooter",
  "skills system":               "Skills System",
  "cpm":                         "CPM",
  "pfh/didd":                    "PFH/DIDD",
  "basic vcrm":                  "Basic VCRM",
  "trn":                         "TRN",
  "asl":                         "ASL",
  "shift":                       "SHIFT"
};

/**
 * 1g. Import from Paylocity
 *
 * Reads a tab named "Paylocity Import" with columns:
 *   A: Company Code, B: Employee Id, C: Last Name, D: First Name,
 *   E: Middle Name, F: Preferred/First Name, G: Division Description,
 *   H: Department Description, I: Position Title, J: Skill, K: Code,
 *   L: Effective/Issue Date, M: Expiration Date, N: Record Type,
 *   O: Skill Status
 *
 * Matches employees by name to the Training sheet and writes
 * the Effective/Issue Date to the appropriate training column.
 * Only writes if the imported date is newer than what's already there.
 */
function importFromPaylocity() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Find the Paylocity Import tab
  var importSheet = ss.getSheetByName("Paylocity Import");
  if (!importSheet) {
    ui.alert("No tab named \"Paylocity Import\" found.\n\n" +
      "To use this:\n" +
      "  1. Open your Paylocity .xlsx file in Google Sheets\n" +
      "  2. Copy all the data\n" +
      "  3. Create a tab called \"Paylocity Import\" in this spreadsheet\n" +
      "  4. Paste the data there\n" +
      "  5. Run this again");
    return;
  }

  var trainingSheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);
  if (!trainingSheet) {
    ui.alert("Error: Training sheet \"" + TRAINING_ACCESS_SHEET_NAME + "\" not found.");
    return;
  }

  var importData = importSheet.getDataRange().getValues();
  var trainingData = trainingSheet.getDataRange().getValues();
  var trainingHeaders = trainingData[0];

  if (importData.length < 2) {
    ui.alert("The Paylocity Import tab appears to be empty.");
    return;
  }

  // Find column indices in the import sheet
  var importHeaders = importData[0];
  var colLast = -1, colFirst = -1, colPreferred = -1, colSkill = -1, colDate = -1, colStatus = -1;
  var colDivision = -1, colDepartment = -1, colPosition = -1;
  for (var c = 0; c < importHeaders.length; c++) {
    var h = importHeaders[c].toString().trim().toLowerCase();
    if (h === "last name") colLast = c;
    if (h === "first name") colFirst = c;
    if (h === "preferred/first name" || h === "preferred name") colPreferred = c;
    if (h === "skill") colSkill = c;
    if (h === "effective/issue date" || h === "effective date" || h === "issue date") colDate = c;
    if (h === "skill status") colStatus = c;
    if (h === "division description") colDivision = c;
    if (h === "department description") colDepartment = c;
    if (h === "position title") colPosition = c;
  }

  if (colLast < 0 || colFirst < 0 || colSkill < 0 || colDate < 0) {
    ui.alert("Could not find required columns.\n\n" +
      "Expected: Last Name, First Name, Skill, Effective/Issue Date\n\n" +
      "Found: " + importHeaders.join(", "));
    return;
  }

  // Confirm before importing
  var confirm = ui.alert("Import from Paylocity",
    "Found " + (importData.length - 1) + " rows on the Paylocity Import tab.\n\n" +
    "This will:\n" +
    "  • Match employees by name to the Training sheet\n" +
    "  • Write training dates (only if newer than existing)\n" +
    "  • Skip non-training skills (Driver's License, Insurance, etc.)\n" +
    "  • Respect NA/excusal codes and failure codes\n\n" +
    "Continue?",
    ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  var stats = {
    processed: 0,
    skippedSkill: 0,
    skippedNoMatch: 0,
    skippedNoDate: 0,
    skippedNewer: 0,
    skippedNA: 0,
    skippedFailed: 0,
    written: 0,
    errors: []
  };

  var noMatchNames = {};

  // Find Division/Department/Position Title columns on the Training sheet
  var tDivCol = -1, tDeptCol = -1, tPosCol = -1;
  for (var c = 0; c < trainingHeaders.length; c++) {
    var th = trainingHeaders[c].toString().trim();
    if (th === "Division Description") tDivCol = c;
    if (th === "Department Description") tDeptCol = c;
    if (th === "Position Title") tPosCol = c;
  }

  for (var i = 1; i < importData.length; i++) {
    stats.processed++;

    var lastName = importData[i][colLast] ? importData[i][colLast].toString().trim() : "";
    var firstName = importData[i][colFirst] ? importData[i][colFirst].toString().trim() : "";
    var preferred = colPreferred >= 0 && importData[i][colPreferred] ? importData[i][colPreferred].toString().trim() : "";
    var skill = importData[i][colSkill] ? importData[i][colSkill].toString().trim() : "";
    var dateVal = importData[i][colDate];
    var status = colStatus >= 0 && importData[i][colStatus] ? importData[i][colStatus].toString().trim() : "";

    if (!lastName || !firstName) continue;
    if (!skill) continue;

    // Map skill to training column
    var skillLower = skill.toLowerCase();
    var targetColumn = PAYLOCITY_SKILL_MAP[skillLower];
    if (!targetColumn) {
      stats.skippedSkill++;
      continue;
    }

    // Parse the date
    var importDate = parseToDate(dateVal);
    if (!importDate) {
      stats.skippedNoDate++;
      continue;
    }

    // Find the target column index on the Training sheet
    var targetColIdx = -1;
    for (var c = 0; c < trainingHeaders.length; c++) {
      if (trainingHeaders[c].toString().trim() === targetColumn) {
        targetColIdx = c;
        break;
      }
    }
    if (targetColIdx < 0) {
      stats.errors.push("Column \"" + targetColumn + "\" not found on Training sheet");
      continue;
    }

    // Match employee — try preferred name first, then first name
    var nameToTry = preferred || firstName;
    var matchRow = findTrainingRow(trainingData, nameToTry, lastName);
    if (matchRow < 0 && preferred && preferred !== firstName) {
      matchRow = findTrainingRow(trainingData, firstName, lastName);
    }

    if (matchRow < 0) {
      var nameKey = lastName.toLowerCase() + "|" + firstName.toLowerCase();
      if (!noMatchNames[nameKey]) {
        noMatchNames[nameKey] = true;
        stats.skippedNoMatch++;
      }
      continue;
    }

    // Fix misspelled names — Paylocity is the authoritative source
    var sheetLast = trainingData[matchRow][0] ? trainingData[matchRow][0].toString().trim() : "";
    var sheetFirst = trainingData[matchRow][1] ? trainingData[matchRow][1].toString().trim() : "";
    var paylocityLast = lastName;
    var paylocityFirst = preferred || firstName;

    if (sheetLast !== paylocityLast && sheetLast.toLowerCase() === paylocityLast.toLowerCase()) {
      // Case difference only — update to Paylocity's casing
      trainingSheet.getRange(matchRow + 1, 1).setValue(paylocityLast);
      trainingData[matchRow][0] = paylocityLast;
    } else if (sheetLast.toLowerCase() !== paylocityLast.toLowerCase()) {
      // Actual spelling difference — update to Paylocity
      trainingSheet.getRange(matchRow + 1, 1).setValue(paylocityLast);
      trainingData[matchRow][0] = paylocityLast;
      if (!stats.namesFixed) stats.namesFixed = 0;
      stats.namesFixed++;
      Logger.log("Name fix (last): '" + sheetLast + "' → '" + paylocityLast + "' (row " + (matchRow + 1) + ")");
    }

    // Fix first name — but preserve parenthetical nicknames like 'Michael "Mike"'
    var sheetFirstClean = sheetFirst.replace(/["'()].*/g, "").trim();
    if (sheetFirstClean.toLowerCase() !== paylocityFirst.toLowerCase()) {
      // Check if the existing name has extra info (nickname in parens/quotes)
      var suffix = sheetFirst.substring(sheetFirstClean.length).trim();
      var newFirst = suffix ? paylocityFirst + " " + suffix : paylocityFirst;
      trainingSheet.getRange(matchRow + 1, 2).setValue(newFirst);
      trainingData[matchRow][1] = newFirst;
      if (!stats.namesFixed) stats.namesFixed = 0;
      stats.namesFixed++;
      Logger.log("Name fix (first): '" + sheetFirst + "' → '" + newFirst + "' (row " + (matchRow + 1) + ")");
    }

    // Update Division, Department, Position Title (always overwrite with latest)
    var divVal = colDivision >= 0 && importData[i][colDivision] ? importData[i][colDivision].toString().trim() : "";
    var deptVal = colDepartment >= 0 && importData[i][colDepartment] ? importData[i][colDepartment].toString().trim() : "";
    var posVal = colPosition >= 0 && importData[i][colPosition] ? importData[i][colPosition].toString().trim() : "";
    if (tDivCol >= 0 && divVal) {
      trainingSheet.getRange(matchRow + 1, tDivCol + 1).setValue(divVal);
      trainingData[matchRow][tDivCol] = divVal;
    }
    if (tDeptCol >= 0 && deptVal) {
      trainingSheet.getRange(matchRow + 1, tDeptCol + 1).setValue(deptVal);
      trainingData[matchRow][tDeptCol] = deptVal;
    }
    if (tPosCol >= 0 && posVal) {
      trainingSheet.getRange(matchRow + 1, tPosCol + 1).setValue(posVal);
      trainingData[matchRow][tPosCol] = posVal;
    }

    // Check current value
    var currentVal = trainingData[matchRow][targetColIdx];
    var currentStr = currentVal ? currentVal.toString().trim() : "";
    var currentUpper = currentStr.toUpperCase();

    // Skip NA/excusal codes
    if (currentUpper === "NA" || currentUpper === "N/A" || getExcusalCode(currentStr)) {
      stats.skippedNA++;
      continue;
    }

    // Skip failure codes
    if (isFailureCode(currentStr)) {
      stats.skippedFailed++;
      continue;
    }

    // Only write if newer than existing date
    var existingDate = parseToDate(currentVal);
    if (existingDate && importDate.getTime() <= existingDate.getTime()) {
      stats.skippedNewer++;
      continue;
    }

    // Write the date
    var formattedDate = formatBackfillDate(importDate);
    trainingSheet.getRange(matchRow + 1, targetColIdx + 1).setValue(formattedDate);
    trainingData[matchRow][targetColIdx] = formattedDate;
    stats.written++;

    // Apply auto-fill rules (CPR → FIRSTAID, MED_TRAIN → POST MED)
    applyAutoFillRules(trainingSheet, matchRow + 1, trainingHeaders, targetColumn, formattedDate);
  }

  // Build summary
  var summary = "Paylocity Import Complete!\n\n";
  summary += "Rows processed: " + stats.processed + "\n";
  summary += "Dates written: " + stats.written + "\n";
  if (stats.namesFixed) {
    summary += "Names corrected: " + stats.namesFixed + "\n";
  }
  summary += "\n";
  summary += "Skipped (not a tracked training): " + stats.skippedSkill + "\n";
  summary += "Skipped (no name match): " + stats.skippedNoMatch + "\n";
  summary += "Skipped (no valid date): " + stats.skippedNoDate + "\n";
  summary += "Skipped (already had same/newer date): " + stats.skippedNewer + "\n";
  summary += "Skipped (NA/excused): " + stats.skippedNA + "\n";
  summary += "Skipped (failure code): " + stats.skippedFailed + "\n";

  if (stats.errors.length > 0) {
    summary += "\nErrors:\n";
    for (var e = 0; e < Math.min(stats.errors.length, 10); e++) {
      summary += "  " + stats.errors[e] + "\n";
    }
  }

  summary += "\nYou can delete the \"Paylocity Import\" tab when done.";

  ui.alert(summary);
}
