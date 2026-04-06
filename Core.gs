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
      .addItem("1f. Import from Paylocity", "importFromPaylocity")
      .addItem("1g. Sync Employees Sheet", "syncEmployeesSheet"))

    .addSeparator()

    .addSubMenu(ui.createMenu("2. Data Tools")
      .addItem("2a. Find Duplicates", "findDuplicates")
      .addItem("2b. Clean Garbled Dates", "cleanGarbledDatesUI")
      .addItem("2c. Fix Training Record Names", "fixTrainingRecordNames")
      .addItem("2d. Install Edit Trigger (run once)", "installEditTrigger"))

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
  var firstLower = firstName.toLowerCase().trim();
  var lastLower = lastName.toLowerCase().trim();
  // Strip special chars for comparison but keep originals for exact match
  var firstStripped = firstLower.replace(/['\-\u2019]/g, "");

  var namesToTry = [firstLower, firstStripped];
  if (NICKNAMES[firstLower]) namesToTry = namesToTry.concat(NICKNAMES[firstLower]);
  if (firstStripped !== firstLower && NICKNAMES[firstStripped]) {
    namesToTry = namesToTry.concat(NICKNAMES[firstStripped]);
  }
  // Deduplicate
  var seen = {};
  namesToTry = namesToTry.filter(function(n) { if (seen[n]) return false; seen[n] = true; return true; });

  var bestFuzzyRow = -1;
  var bestFuzzyScore = 0;

  for (var r = 1; r < trainingData.length; r++) {
    var rowLast = trainingData[r][0] ? trainingData[r][0].toString().trim().toLowerCase() : "";
    var rowFirst = trainingData[r][1] ? trainingData[r][1].toString().trim().toLowerCase() : "";

    // Last name must match (also try stripped version for hyphenated last names)
    var rowLastStripped = rowLast.replace(/['\-\u2019]/g, "");
    if (rowLast !== lastLower && rowLastStripped !== lastLower.replace(/['\-\u2019]/g, "")) continue;

    // Strip quotes/parens for part matching, but preserve apostrophes/hyphens
    var cleanFirst = rowFirst.replace(/["()]/g, " ").replace(/\s+/g, " ").trim();
    var rowFirstStripped = cleanFirst.replace(/['\-\u2019]/g, "");
    var rowNameParts = cleanFirst.split(" ");

    for (var n = 0; n < namesToTry.length; n++) {
      var tryName = namesToTry[n];
      var tryStripped = tryName.replace(/['\-\u2019]/g, "");

      // Exact match (with or without special chars)
      if (rowFirst === tryName || cleanFirst === tryName) return r;
      if (rowFirstStripped === tryStripped) return r;

      // Part matching
      for (var p = 0; p < rowNameParts.length; p++) {
        var part = rowNameParts[p];
        var partStripped = part.replace(/['\-\u2019]/g, "");
        if (part === tryName || partStripped === tryStripped) return r;
        if (part.indexOf(tryName) === 0 || tryName.indexOf(part) === 0) return r;
        if (partStripped.indexOf(tryStripped) === 0 || tryStripped.indexOf(partStripped) === 0) return r;
      }

      // Nickname matching
      for (var p2 = 0; p2 < rowNameParts.length; p2++) {
        var rp = rowNameParts[p2].replace(/['\-\u2019]/g, "");
        var rowNicks = NICKNAMES[rowNameParts[p2]] || NICKNAMES[rp] || [];
        if (rowNicks.indexOf(tryName) > -1 || rowNicks.indexOf(tryStripped) > -1) return r;
      }
    }

    // Fuzzy matching for misspellings
    var sim = stringSimilarity(firstStripped, rowFirstStripped);
    var levDist = levenshteinDistance_(firstStripped, rowFirstStripped);
    var levScore = 1 - (levDist / Math.max(firstStripped.length, rowFirstStripped.length, 1));
    var bestSim = Math.max(sim, levScore);
    if (bestSim > 0.6 && bestSim > bestFuzzyScore) {
      bestFuzzyRow = r;
      bestFuzzyScore = bestSim;
    }
  }

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
  var numCols = headers.length;

  // Find name and active columns by header
  var lNameCol = -1, fNameCol = -1, activeCol = -1;
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c].toString().trim().toUpperCase();
    if (h === "L NAME") lNameCol = c;
    if (h === "F NAME") fNameCol = c;
    if (h === "ACTIVE") activeCol = c;
  }
  if (lNameCol < 0 || fNameCol < 0) { ui.alert("L NAME / F NAME columns not found."); return; }

  // Find training column start (first column after the metadata columns)
  var trainingColStart = -1;
  for (var tc = 0; tc < TRAINING_CONFIG.length; tc++) {
    for (var hc = 0; hc < headers.length; hc++) {
      if (headers[hc].toString().trim() === TRAINING_CONFIG[tc].column) {
        if (trainingColStart < 0 || hc < trainingColStart) trainingColStart = hc;
      }
    }
  }
  if (trainingColStart < 0) trainingColStart = 3;

  // Group rows by normalized name
  var nameMap = {};
  for (var r = 1; r < data.length; r++) {
    var last = data[r][lNameCol] ? data[r][lNameCol].toString().trim() : "";
    var first = data[r][fNameCol] ? data[r][fNameCol].toString().trim() : "";
    if (!last) continue;
    var active = activeCol >= 0 ? (data[r][activeCol] || "").toString().trim().toUpperCase() : "";
    var key = last.toLowerCase() + "|" + first.toLowerCase().replace(/["'()]/g, "").replace(/\s+/g, " ").trim();
    if (!nameMap[key]) nameMap[key] = [];
    nameMap[key].push({ row: r + 1, rowIdx: r, last: last, first: first, active: active });
  }

  // Collect all duplicate groups
  var allDupes = [];
  var keys = Object.keys(nameMap);

  // Exact duplicates
  for (var k = 0; k < keys.length; k++) {
    if (nameMap[keys[k]].length > 1) {
      allDupes.push({ type: "EXACT", entries: nameMap[keys[k]], reason: "exact match" });
    }
  }

  // Fuzzy/nickname duplicates
  var checkedPairs = {};
  for (var k1 = 0; k1 < keys.length; k1++) {
    var parts1 = keys[k1].split("|");
    for (var k2 = k1 + 1; k2 < keys.length; k2++) {
      var parts2 = keys[k2].split("|");
      if (parts1[0] !== parts2[0]) continue;
      var pairKey = k1 + "|" + k2;
      if (checkedPairs[pairKey]) continue;
      checkedPairs[pairKey] = true;

      var nicks1 = NICKNAMES[parts1[1]] || [];
      var nicks2 = NICKNAMES[parts2[1]] || [];
      var isNickname = nicks1.indexOf(parts2[1]) > -1 || nicks2.indexOf(parts1[1]) > -1;
      var sim = stringSimilarity(parts1[1], parts2[1]);

      if (isNickname || sim > 0.7) {
        allDupes.push({
          type: "POSSIBLE",
          entries: nameMap[keys[k1]].concat(nameMap[keys[k2]]),
          reason: isNickname ? "nickname" : "similar (" + Math.round(sim * 100) + "%)"
        });
      }
    }
  }

  if (allDupes.length === 0) {
    ui.alert("No duplicates found!");
    return;
  }

  // Show summary first
  var exactCount = allDupes.filter(function(d) { return d.type === "EXACT"; }).length;
  var possibleCount = allDupes.length - exactCount;
  var startResult = ui.alert(
    "Found " + allDupes.length + " duplicate group(s)",
    exactCount + " exact duplicate(s)\n" +
    possibleCount + " possible duplicate(s)\n\n" +
    "Click OK to review each one and choose:\n" +
    "  • Which row to KEEP (newest dates are merged)\n" +
    "  • Whether to DELETE the other row\n" +
    "  • Or SKIP to the next one",
    ui.ButtonSet.OK_CANCEL
  );
  if (startResult !== ui.Button.OK) return;

  var deleted = 0;
  var merged = 0;
  var skipped = 0;
  var rowsDeleted = []; // track deleted rows to adjust later

  for (var d = 0; d < allDupes.length; d++) {
    var group = allDupes[d];
    var entries = group.entries;

    // Build comparison for each row
    var msg = "── " + group.type + " DUPLICATE (" + group.reason + ") ──\n";
    msg += "Group " + (d + 1) + " of " + allDupes.length + "\n\n";

    for (var e = 0; e < entries.length; e++) {
      var ent = entries[e];
      var rowData = data[ent.rowIdx];
      msg += (e + 1) + ") Row " + ent.row + ": " + ent.first + " " + ent.last;
      msg += " [" + (ent.active === "Y" ? "Active" : ent.active || "?") + "]\n";

      // Show training dates that have values
      var dateCount = 0;
      for (var col = trainingColStart; col < numCols && dateCount < 8; col++) {
        var val = rowData[col] ? rowData[col].toString().trim() : "";
        if (val) {
          msg += "   " + headers[col].toString().trim() + ": " + val + "\n";
          dateCount++;
        }
      }
      if (dateCount === 0) msg += "   (no training dates)\n";
      msg += "\n";
    }

    msg += "Enter the number to KEEP (1";
    for (var n = 2; n <= entries.length; n++) msg += ", " + n;
    msg += ") or S to skip:";

    var choice = ui.prompt("Review Duplicate", msg, ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() !== ui.Button.OK) {
      ui.alert("Stopped. Deleted " + deleted + " row(s), merged " + merged + ", skipped " + skipped + ".");
      return;
    }

    var response = choice.getResponseText().trim().toUpperCase();
    if (response === "S" || response === "SKIP") {
      skipped++;
      continue;
    }

    var keepIdx = parseInt(response) - 1;
    if (isNaN(keepIdx) || keepIdx < 0 || keepIdx >= entries.length) {
      skipped++;
      continue;
    }

    var keepEntry = entries[keepIdx];
    var keepRowData = data[keepEntry.rowIdx];

    // Merge: for each training column, keep the newest date across all rows
    for (var col = trainingColStart; col < numCols; col++) {
      var bestVal = keepRowData[col] ? keepRowData[col].toString().trim() : "";
      var bestDate = parseToDate(bestVal);

      for (var other = 0; other < entries.length; other++) {
        if (other === keepIdx) continue;
        var otherVal = data[entries[other].rowIdx][col] ? data[entries[other].rowIdx][col].toString().trim() : "";
        if (!otherVal) continue;

        // If keep row is empty, take the other value
        if (!bestVal) {
          bestVal = otherVal;
          bestDate = parseToDate(otherVal);
          continue;
        }

        // If other row has a date and it's newer, take it
        var otherDate = parseToDate(otherVal);
        if (otherDate && bestDate && otherDate.getTime() > bestDate.getTime()) {
          bestVal = otherVal;
          bestDate = otherDate;
        }

        // If keep has no date but other has excusal code, take the excusal
        if (!bestDate && !otherDate && EXCUSAL_MAP_[otherVal.toUpperCase()] && !EXCUSAL_MAP_[bestVal.toUpperCase()]) {
          bestVal = otherVal;
        }
      }

      // Write merged value to keep row
      var currentKeep = keepRowData[col] ? keepRowData[col].toString().trim() : "";
      if (bestVal !== currentKeep) {
        sheet.getRange(keepEntry.row, col + 1).setValue(bestVal);
        merged++;
      }
    }

    // Also keep Active=Y if any row has it
    for (var ae = 0; ae < entries.length; ae++) {
      if (entries[ae].active === "Y" && keepEntry.active !== "Y") {
        sheet.getRange(keepEntry.row, activeCol + 1).setValue("Y");
        break;
      }
    }

    // Delete the other rows (from bottom up to avoid row shift issues)
    var rowsToDelete = [];
    for (var del = 0; del < entries.length; del++) {
      if (del === keepIdx) continue;
      rowsToDelete.push(entries[del].row);
    }
    rowsToDelete.sort(function(a, b) { return b - a; }); // bottom up

    for (var dr = 0; dr < rowsToDelete.length; dr++) {
      // Adjust for previously deleted rows
      var adjustedRow = rowsToDelete[dr];
      for (var prev = 0; prev < rowsDeleted.length; prev++) {
        if (rowsDeleted[prev] < adjustedRow) adjustedRow--;
      }
      sheet.deleteRow(adjustedRow);
      rowsDeleted.push(rowsToDelete[dr]);
      deleted++;
    }

    // Clear highlights on kept row
    sheet.getRange(keepEntry.row, lNameCol + 1).setBackground(null);
    sheet.getRange(keepEntry.row, fNameCol + 1).setBackground(null).clearNote();
  }

  ui.alert(
    "Duplicate Review Complete!\n\n" +
    "Rows deleted: " + deleted + "\n" +
    "Cells merged (newer date kept): " + merged + "\n" +
    "Groups skipped: " + skipped
  );
}


// ************************************************************
//
//   CLEAN GARBLED DATES
//
// ************************************************************

function cleanGarbledDatesUI() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);
  if (!sheet) { ui.alert("Training sheet not found."); return; }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  // Find first training column
  var trainingStart = -1;
  for (var tc = 0; tc < TRAINING_CONFIG.length; tc++) {
    for (var hc = 0; hc < headers.length; hc++) {
      if (headers[hc].toString().trim() === TRAINING_CONFIG[tc].column) {
        if (trainingStart < 0 || hc < trainingStart) trainingStart = hc;
      }
    }
  }
  if (trainingStart < 0) { ui.alert("No training columns found."); return; }

  var fixed = 0;

  for (var r = 1; r < data.length; r++) {
    for (var c = trainingStart; c < headers.length; c++) {
      var val = data[r][c];
      if (!val) continue;
      var s = val.toString().trim();
      if (!s) continue;

      // Skip if already a clean date (M/D/YYYY or MM/DD/YYYY)
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) continue;

      // Skip excusal codes
      if (EXCUSAL_MAP_[s.toUpperCase()]) continue;

      var parsed = null;

      // If cell contains a Date object (Google Sheets stores dates as Date)
      if (val instanceof Date && !isNaN(val.getTime())) {
        parsed = val;
      }

      // Pattern: "Fri Sep 02 2016 03:00:00 GMT-0400 (Eastern Daylight Time)"
      if (!parsed && /^[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d/.test(s)) {
        try { parsed = new Date(s); } catch(e) {}
      }

      // Pattern: "2016-09-02T07:00:00.000Z" (ISO)
      if (!parsed && /^\d{4}-\d{2}-\d{2}T/.test(s)) {
        try { parsed = new Date(s); } catch(e) {}
      }

      // Pattern: "September 2, 2016" or "Sep 2, 2016"
      if (!parsed && /^[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}/.test(s)) {
        try { parsed = new Date(s); } catch(e) {}
      }

      // Pattern: "2016-09-02" (ISO date only)
      if (!parsed && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
        var isoP = s.split("-");
        parsed = new Date(parseInt(isoP[0]), parseInt(isoP[1]) - 1, parseInt(isoP[2]));
      }

      // Pattern: any remaining string with a parseable date
      if (!parsed && /[A-Z][a-z]{2}\s/.test(s)) {
        try { var attempt = new Date(s); if (!isNaN(attempt.getTime())) parsed = attempt; } catch(e) {}
      }

      if (parsed && !isNaN(parsed.getTime()) && parsed.getFullYear() > 1990 && parsed.getFullYear() < 2100) {
        var clean = (parsed.getMonth() + 1) + "/" + parsed.getDate() + "/" + parsed.getFullYear();
        sheet.getRange(r + 1, c + 1).setValue(clean);
        fixed++;
        Logger.log("Fixed: row " + (r + 1) + " " + headers[c] + ": '" + s.substring(0, 50) + "' → '" + clean + "'");
      }
    }
  }

  ui.alert("Clean Garbled Dates Complete!\n\nFixed: " + fixed + " cell(s) converted to M/D/YYYY format.");
}


// ************************************************************
//
//   FIX TRAINING RECORD NAMES
//
//   Scans the Training Records sheet and matches attendee names
//   to the Employees sheet. Fixes misspellings, missing last names,
//   wrong last names, etc. Shows each mismatch for confirmation.
//
// ************************************************************

function fixTrainingRecordNames() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var recordsSheet = ss.getSheetByName("Training Records");
  if (!recordsSheet) { ui.alert("Training Records sheet not found."); return; }

  var empSheet = ss.getSheetByName("Employees");
  if (!empSheet) { ui.alert("Employees sheet not found. Needed as the name authority."); return; }

  var empData = empSheet.getDataRange().getValues();
  var empHeaders = empData[0];

  // Parse Employees sheet
  var eLastCol = -1, eFirstCol = -1, ePrefCol = -1;
  for (var c = 0; c < empHeaders.length; c++) {
    var h = empHeaders[c].toString().trim().toLowerCase();
    if (h === "last name") eLastCol = c;
    if (h === "first name") eFirstCol = c;
    if (h === "preferred name") ePrefCol = c;
  }
  if (eLastCol < 0 || eFirstCol < 0) { ui.alert("Last Name / First Name not found on Employees sheet."); return; }

  // Build employee search data for findTrainingRow
  // Format: array of [lastName, firstName] rows (same structure findTrainingRow expects)
  var empSearchData = [["", ""]]; // placeholder header
  var empFullNames = [""]; // parallel array of "First Last" for display
  for (var i = 1; i < empData.length; i++) {
    var eLast = empData[i][eLastCol] ? empData[i][eLastCol].toString().trim() : "";
    var eFirst = empData[i][eFirstCol] ? empData[i][eFirstCol].toString().trim() : "";
    var ePref = ePrefCol >= 0 && empData[i][ePrefCol] ? empData[i][ePrefCol].toString().trim() : "";
    if (!eLast || !eFirst) continue;

    var displayFirst = ePref || eFirst;
    empSearchData.push([eLast, displayFirst]);
    empFullNames.push(displayFirst + " " + eLast);

    // Also add legal first name if different from preferred
    if (ePref && ePref !== eFirst) {
      empSearchData.push([eLast, eFirst]);
      empFullNames.push(eFirst + " " + eLast);
    }
  }

  // Also build a first-name-only lookup for cases like "Nynaka Weaver" where last name is wrong
  var firstNameLookup = {}; // lowercase first → [{last, displayFirst, fullName}]
  for (var i = 1; i < empData.length; i++) {
    var eLast = empData[i][eLastCol] ? empData[i][eLastCol].toString().trim() : "";
    var eFirst = empData[i][eFirstCol] ? empData[i][eFirstCol].toString().trim() : "";
    var ePref = ePrefCol >= 0 && empData[i][ePrefCol] ? empData[i][ePrefCol].toString().trim() : "";
    if (!eLast || !eFirst) continue;
    var displayFirst = ePref || eFirst;

    var names = [eFirst.toLowerCase(), displayFirst.toLowerCase()];
    for (var n = 0; n < names.length; n++) {
      if (!firstNameLookup[names[n]]) firstNameLookup[names[n]] = [];
      firstNameLookup[names[n]].push({ last: eLast, first: displayFirst, full: displayFirst + " " + eLast });
    }
  }

  var recordsData = recordsSheet.getDataRange().getValues();
  // Attendee is column C (index 2)
  var attendeeCol = 2;

  var mismatches = [];

  for (var r = 1; r < recordsData.length; r++) {
    var attendee = recordsData[r][attendeeCol] ? recordsData[r][attendeeCol].toString().trim() : "";
    if (!attendee) continue;

    // Parse the attendee name
    var firstName = "", lastName = "";
    if (attendee.indexOf(",") > -1) {
      var parts = attendee.split(",");
      lastName = parts[0].trim();
      firstName = parts[1] ? parts[1].trim() : "";
    } else {
      var spaceParts = attendee.split(/\s+/);
      if (spaceParts.length >= 2) {
        firstName = spaceParts[0].trim();
        lastName = spaceParts.slice(1).join(" ").trim();
      } else {
        firstName = attendee;
      }
    }

    if (!firstName) continue;

    // Try to find in Employees using full fuzzy matching
    var matchRow = -1;
    if (lastName) {
      matchRow = findTrainingRow(empSearchData, firstName, lastName);
    }

    // If no match with given last name, try first-name-only lookup
    if (matchRow < 0) {
      var candidates = firstNameLookup[firstName.toLowerCase()] || [];
      if (candidates.length === 1) {
        // Only one person with this first name — use them
        matchRow = -2; // special flag
        var candidate = candidates[0];
      } else if (candidates.length > 1 && lastName) {
        // Multiple candidates — try fuzzy on last name
        var bestCand = null, bestCandScore = 0;
        for (var ci = 0; ci < candidates.length; ci++) {
          var s = stringSimilarity(lastName.toLowerCase(), candidates[ci].last.toLowerCase());
          var l = levenshteinDistance_(lastName.toLowerCase(), candidates[ci].last.toLowerCase());
          var lScore = 1 - (l / Math.max(lastName.length, candidates[ci].last.length, 1));
          var best = Math.max(s, lScore);
          if (best > 0.4 && best > bestCandScore) { bestCand = candidates[ci]; bestCandScore = best; }
        }
        if (bestCand) { matchRow = -2; candidate = bestCand; }
      }
    }

    var correctName = null;
    if (matchRow > 0) {
      correctName = empFullNames[matchRow];
    } else if (matchRow === -2 && candidate) {
      correctName = candidate.full;
    }

    if (!correctName) continue;

    // Check if the name is already correct
    if (attendee.toLowerCase() === correctName.toLowerCase()) continue;
    // Also check "Last, First" format
    var correctLastFirst = correctName.split(" ").slice(1).join(" ") + ", " + correctName.split(" ")[0];
    if (attendee.toLowerCase() === correctLastFirst.toLowerCase()) continue;

    mismatches.push({
      row: r + 1,
      current: attendee,
      correct: correctName,
      session: recordsData[r][1] ? recordsData[r][1].toString().trim() : "",
      date: recordsData[r][3] ? recordsData[r][3].toString().trim() : ""
    });
  }

  if (mismatches.length === 0) {
    ui.alert("All Training Record names match! No fixes needed.");
    return;
  }

  // Deduplicate by current name (same misspelling appears for every session they attended)
  var seenNames = {};
  var uniqueMismatches = [];
  for (var m = 0; m < mismatches.length; m++) {
    var key = mismatches[m].current.toLowerCase();
    if (!seenNames[key]) {
      seenNames[key] = { correct: mismatches[m].correct, rows: [] };
    }
    seenNames[key].rows.push(mismatches[m].row);
  }
  var nameKeys = Object.keys(seenNames);

  var startConfirm = ui.alert(
    "Found " + nameKeys.length + " name(s) to fix",
    "Found " + nameKeys.length + " unique name(s) across " + mismatches.length + " row(s) that don't match Paylocity.\n\n" +
    "Click OK to review each one.",
    ui.ButtonSet.OK_CANCEL
  );
  if (startConfirm !== ui.Button.OK) return;

  // Load ignored name pairs
  var ignoredPairs = getIgnoredNamePairs_();

  var fixed = 0, skipped = 0, ignored = 0;

  for (var ni = 0; ni < nameKeys.length; ni++) {
    var entry = seenNames[nameKeys[ni]];

    // Skip if this pair was previously marked as "different people"
    if (isIgnoredPair_(ignoredPairs, nameKeys[ni], entry.correct)) {
      ignored++;
      continue;
    }

    var msg = "Name mismatch " + (ni + 1) + " of " + nameKeys.length + "\n\n";
    msg += "Training Records:  " + nameKeys[ni] + "\n";
    msg += "Paylocity match:   " + entry.correct + "\n";
    msg += "Appears on " + entry.rows.length + " row(s)\n\n";
    msg += "YES = Fix to Paylocity spelling\n";
    msg += "NO = Different people (never ask again)";

    var choice = ui.alert("Fix Name?", msg, ui.ButtonSet.YES_NO);
    if (choice === ui.Button.YES) {
      for (var ri = 0; ri < entry.rows.length; ri++) {
        recordsSheet.getRange(entry.rows[ri], attendeeCol + 1).setValue(entry.correct);
      }
      fixed++;
      Logger.log("Fixed: '" + nameKeys[ni] + "' → '" + entry.correct + "' (" + entry.rows.length + " rows)");
    } else {
      // Mark as different people — never ask again
      addIgnoredNamePair_(nameKeys[ni], entry.correct);
      skipped++;
    }
  }

  ui.alert(
    "Training Records Name Fix Complete!\n\n" +
    "Names fixed: " + fixed + "\n" +
    "Marked as different people: " + skipped + "\n" +
    "Previously ignored: " + ignored + "\n\n" +
    "Run 1e. Backfill to sync corrected records to the Training sheet."
  );
}

/**
 * Ignored name pairs — stored on Hub Settings sheet as Type="name_ignore"
 * Key = "name1|||name2" (sorted lowercase), Value = ""
 */
function getIgnoredNamePairs_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Hub Settings");
  if (!sheet) return {};
  var data = sheet.getDataRange().getValues();
  var pairs = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().trim() === "name_ignore") {
      pairs[data[i][1].toString().trim().toLowerCase()] = true;
    }
  }
  return pairs;
}

function isIgnoredPair_(ignoredPairs, name1, name2) {
  var key = makeIgnoreKey_(name1, name2);
  return ignoredPairs[key] === true;
}

function makeIgnoreKey_(name1, name2) {
  var a = name1.toLowerCase().trim();
  var b = name2.toLowerCase().trim();
  return a < b ? a + "|||" + b : b + "|||" + a;
}

function addIgnoredNamePair_(name1, name2) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Hub Settings");
  if (!sheet) return;
  var key = makeIgnoreKey_(name1, name2);
  sheet.appendRow(["name_ignore", key, ""]);
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
    // Collects mismatches and asks for confirmation after import
    var sheetLast = trainingData[matchRow][0] ? trainingData[matchRow][0].toString().trim() : "";
    var sheetFirst = trainingData[matchRow][1] ? trainingData[matchRow][1].toString().trim() : "";
    var paylocityLast = lastName;
    var paylocityFirst = preferred || firstName;

    var lastNeedsFix = false;
    var firstNeedsFix = false;

    // Case difference — auto-fix silently
    if (sheetLast !== paylocityLast && sheetLast.toLowerCase() === paylocityLast.toLowerCase()) {
      trainingSheet.getRange(matchRow + 1, 1).setValue(paylocityLast);
      trainingData[matchRow][0] = paylocityLast;
    } else if (sheetLast.toLowerCase() !== paylocityLast.toLowerCase()) {
      lastNeedsFix = true;
    }

    var sheetFirstClean = sheetFirst.replace(/["()].*/g, "").trim();
    if (sheetFirstClean.toLowerCase() !== paylocityFirst.toLowerCase() &&
        sheetFirstClean.toLowerCase() !== paylocityFirst.toLowerCase().split(" ")[0]) {
      firstNeedsFix = true;
    }

    // Queue name fixes for confirmation
    if (lastNeedsFix || firstNeedsFix) {
      if (!stats.nameFixQueue) stats.nameFixQueue = [];
      stats.nameFixQueue.push({
        row: matchRow + 1,
        rowIdx: matchRow,
        sheetLast: sheetLast,
        sheetFirst: sheetFirst,
        paylocityLast: paylocityLast,
        paylocityFirst: paylocityFirst,
        fixLast: lastNeedsFix,
        fixFirst: firstNeedsFix
      });
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

  // ── Name fix confirmation ──
  var nameFixQueue = stats.nameFixQueue || [];
  stats.namesFixed = 0;
  stats.namesSkipped = 0;
  var importIgnoredPairs = getIgnoredNamePairs_();

  if (nameFixQueue.length > 0) {
    // Deduplicate by row
    var seenRows = {};
    var uniqueFixes = [];
    for (var nf = 0; nf < nameFixQueue.length; nf++) {
      if (!seenRows[nameFixQueue[nf].row]) {
        seenRows[nameFixQueue[nf].row] = true;
        uniqueFixes.push(nameFixQueue[nf]);
      }
    }

    // Filter out ignored pairs
    var toReview = [];
    for (var nf = 0; nf < uniqueFixes.length; nf++) {
      var sheetFull = uniqueFixes[nf].sheetFirst + " " + uniqueFixes[nf].sheetLast;
      var payFull = uniqueFixes[nf].paylocityFirst + " " + uniqueFixes[nf].paylocityLast;
      if (!isIgnoredPair_(importIgnoredPairs, sheetFull, payFull)) {
        toReview.push(uniqueFixes[nf]);
      }
    }

    if (toReview.length > 0) {
      var fixConfirm = ui.alert(
        "Name Mismatches Found",
        "Found " + toReview.length + " name(s) that differ.\n\n" +
        "YES = Fix to Paylocity spelling\n" +
        "NO = Different people (never ask again)",
        ui.ButtonSet.OK_CANCEL
      );

      if (fixConfirm === ui.Button.OK) {
        for (var nf = 0; nf < toReview.length; nf++) {
          var fix = toReview[nf];
          var fixMsg = "Name mismatch " + (nf + 1) + " of " + toReview.length + "  (Row " + fix.row + ")\n\n";
          fixMsg += "Training sheet:  " + fix.sheetFirst + " " + fix.sheetLast + "\n";
          fixMsg += "Paylocity:       " + fix.paylocityFirst + " " + fix.paylocityLast + "\n\n";
          fixMsg += "YES = Fix to Paylocity spelling\n";
          fixMsg += "NO = Different people (never ask again)";

          var fixChoice = ui.alert("Fix Name?", fixMsg, ui.ButtonSet.YES_NO);

          if (fixChoice === ui.Button.YES) {
            if (fix.fixLast) {
              trainingSheet.getRange(fix.row, 1).setValue(fix.paylocityLast);
              Logger.log("Name fix (last): '" + fix.sheetLast + "' → '" + fix.paylocityLast + "' (row " + fix.row + ")");
            }
            if (fix.fixFirst) {
              var existingFirst = trainingSheet.getRange(fix.row, 2).getValue().toString().trim();
              var cleanExisting = existingFirst.replace(/["()].*/g, "").trim();
              var suffix = existingFirst.substring(cleanExisting.length).trim();
              var newFirst = suffix ? fix.paylocityFirst + " " + suffix : fix.paylocityFirst;
              trainingSheet.getRange(fix.row, 2).setValue(newFirst);
              Logger.log("Name fix (first): '" + existingFirst + "' → '" + newFirst + "' (row " + fix.row + ")");
            }
            stats.namesFixed++;
          } else {
            addIgnoredNamePair_(
              fix.sheetFirst + " " + fix.sheetLast,
              fix.paylocityFirst + " " + fix.paylocityLast
            );
            stats.namesSkipped++;
          }
        }
      }
    }
  }

  // Build summary
  var summary = "Paylocity Import Complete!\n\n";
  summary += "Rows processed: " + stats.processed + "\n";
  summary += "Dates written: " + stats.written + "\n";
  if (stats.namesFixed || stats.namesSkipped) {
    summary += "Names corrected: " + (stats.namesFixed || 0) + "\n";
    summary += "Names skipped: " + (stats.namesSkipped || 0) + "\n";
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


// ************************************************************
//
//   SYNC EMPLOYEES SHEET
//
//   Step 1: Updates Paylocity Import tab with correct names/info
//           from the Employees sheet
//   Step 2: Updates Training sheet with names, status, division,
//           department, position from Employees sheet
//   Step 3: Adds new employees, deactivates missing ones
//
//   Employees sheet columns:
//     A: Last Name, B: Suffix, C: First Name, D: Preferred Name,
//     E: ID, F: Position / Job Title, G: Hire Date,
//     H: Division, I: Department, J: Status
//
// ************************************************************

function syncEmployeesSheet() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var empSheet = ss.getSheetByName("Employees");
  if (!empSheet) {
    ui.alert("No tab named \"Employees\" found.\n\nCreate a tab called \"Employees\" with your Paylocity employee roster.");
    return;
  }

  var empData = empSheet.getDataRange().getValues();
  if (empData.length < 2) { ui.alert("Employees sheet is empty."); return; }

  // ── Parse Employees sheet headers ──
  var empHeaders = empData[0];
  var eLastCol = -1, eFirstCol = -1, ePrefCol = -1, ePositionCol = -1;
  var eDivCol = -1, eDeptCol = -1, eStatusCol = -1;
  for (var c = 0; c < empHeaders.length; c++) {
    var h = empHeaders[c].toString().trim().toLowerCase();
    if (h === "last name") eLastCol = c;
    if (h === "first name") eFirstCol = c;
    if (h === "preferred name") ePrefCol = c;
    if (h === "position / job title" || h === "position" || h === "job title" || h === "position title") ePositionCol = c;
    if (h === "division") eDivCol = c;
    if (h === "department") eDeptCol = c;
    if (h === "status") eStatusCol = c;
  }
  if (eLastCol < 0 || eFirstCol < 0) {
    ui.alert("Could not find Last Name / First Name on Employees sheet.\n\nFound: " + empHeaders.join(", "));
    return;
  }

  // Build employee lookup: lowercase "last|first" → employee data
  var empLookup = {};
  for (var i = 1; i < empData.length; i++) {
    var eLast = empData[i][eLastCol] ? empData[i][eLastCol].toString().trim() : "";
    var eFirst = empData[i][eFirstCol] ? empData[i][eFirstCol].toString().trim() : "";
    var ePref = ePrefCol >= 0 && empData[i][ePrefCol] ? empData[i][ePrefCol].toString().trim() : "";
    if (!eLast || !eFirst) continue;

    var eDiv = eDivCol >= 0 ? (empData[i][eDivCol] || "").toString().trim() : "";
    var eDept = eDeptCol >= 0 ? (empData[i][eDeptCol] || "").toString().trim() : "";
    var ePos = ePositionCol >= 0 ? (empData[i][ePositionCol] || "").toString().trim() : "";
    var eStat = eStatusCol >= 0 ? (empData[i][eStatusCol] || "").toString().trim() : "";
    var displayFirst = ePref || eFirst;
    var isActive = eStat.toLowerCase() === "active" || eStat === "A" || eStat === "Y";

    var entry = {
      lastName: eLast, firstName: eFirst, preferred: ePref,
      displayFirst: displayFirst, position: ePos, division: eDiv,
      department: eDept, status: eStat, active: isActive ? "Y" : "N"
    };

    // Index by multiple keys for matching
    var keys = [
      eLast.toLowerCase() + "|" + eFirst.toLowerCase(),
      eLast.toLowerCase() + "|" + displayFirst.toLowerCase()
    ];
    var stripped = eFirst.toLowerCase().replace(/['\-\u2019]/g, "");
    keys.push(eLast.toLowerCase() + "|" + stripped);
    if (ePref) {
      var prefStripped = ePref.toLowerCase().replace(/['\-\u2019]/g, "");
      keys.push(eLast.toLowerCase() + "|" + prefStripped);
    }
    for (var ki = 0; ki < keys.length; ki++) {
      if (!empLookup[keys[ki]]) empLookup[keys[ki]] = entry;
    }
  }

  // Confirm
  var confirm = ui.alert("Sync Employees",
    "Found " + (empData.length - 1) + " employees.\n\n" +
    "This will:\n" +
    "  Step 1: Fix names on Paylocity Import tab\n" +
    "  Step 2: Fix names, status, division, dept, position on Training\n" +
    "  Step 3: Add new employees, deactivate missing ones\n\n" +
    "Continue?",
    ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  var stats = { piFixed: 0, tUpdated: 0, tAdded: 0, tDeactivated: 0, tNamesFix: 0 };
  var syncIgnoredPairs_ = getIgnoredNamePairs_();

  // ═══════════════════════════════════════════════════════════
  //  STEP 1: Update Paylocity Import tab
  // ═══════════════════════════════════════════════════════════
  var piSheet = ss.getSheetByName("Paylocity Import");
  if (piSheet) {
    var piData = piSheet.getDataRange().getValues();
    var piHeaders = piData[0];
    var piLastCol = -1, piFirstCol = -1, piPrefCol = -1, piDivCol = -1;
    var piDeptCol = -1, piPosCol = -1, piStatusCol = -1;
    for (var c = 0; c < piHeaders.length; c++) {
      var ph = piHeaders[c].toString().trim().toLowerCase();
      if (ph === "last name") piLastCol = c;
      if (ph === "first name") piFirstCol = c;
      if (ph === "preferred/first name" || ph === "preferred name") piPrefCol = c;
      if (ph === "division description") piDivCol = c;
      if (ph === "department description") piDeptCol = c;
      if (ph === "position title") piPosCol = c;
      if (ph === "skill status") piStatusCol = c;
    }

    if (piLastCol >= 0 && piFirstCol >= 0) {
      for (var r = 1; r < piData.length; r++) {
        var piLast = piData[r][piLastCol] ? piData[r][piLastCol].toString().trim() : "";
        var piFirst = piData[r][piFirstCol] ? piData[r][piFirstCol].toString().trim() : "";
        if (!piLast || !piFirst) continue;

        // Find this person in the Employees lookup
        var lookupKey = piLast.toLowerCase() + "|" + piFirst.toLowerCase();
        var lookupKeyStripped = piLast.toLowerCase() + "|" + piFirst.toLowerCase().replace(/['\-\u2019]/g, "");
        var emp = empLookup[lookupKey] || empLookup[lookupKeyStripped];

        // Try fuzzy if no direct match
        if (!emp) {
          var bestMatch = null;
          var bestScore = 0;
          for (var key in empLookup) {
            var parts = key.split("|");
            if (parts[0] !== piLast.toLowerCase()) continue;
            var s1 = stringSimilarity(piFirst.toLowerCase(), parts[1]);
            var s2 = levenshteinDistance_(piFirst.toLowerCase(), parts[1]);
            var lev = 1 - (s2 / Math.max(piFirst.length, parts[1].length, 1));
            var best = Math.max(s1, lev);
            if (best > 0.6 && best > bestScore) { bestMatch = empLookup[key]; bestScore = best; }
          }
          emp = bestMatch;
        }

        if (!emp) continue;

        var piChanged = false;
        // Fix last name
        if (piLast !== emp.lastName) {
          piSheet.getRange(r + 1, piLastCol + 1).setValue(emp.lastName);
          piChanged = true;
        }
        // Fix first name
        if (piFirst !== emp.firstName) {
          piSheet.getRange(r + 1, piFirstCol + 1).setValue(emp.firstName);
          piChanged = true;
        }
        // Fix preferred name
        if (piPrefCol >= 0 && emp.preferred) {
          piSheet.getRange(r + 1, piPrefCol + 1).setValue(emp.displayFirst);
          piChanged = true;
        }
        // Fix division
        if (piDivCol >= 0 && emp.division) {
          piSheet.getRange(r + 1, piDivCol + 1).setValue(emp.division);
          piChanged = true;
        }
        // Fix department
        if (piDeptCol >= 0 && emp.department) {
          piSheet.getRange(r + 1, piDeptCol + 1).setValue(emp.department);
          piChanged = true;
        }
        // Fix position
        if (piPosCol >= 0 && emp.position) {
          piSheet.getRange(r + 1, piPosCol + 1).setValue(emp.position);
          piChanged = true;
        }
        if (piChanged) stats.piFixed++;
      }
    }
    Logger.log("Step 1 done: fixed " + stats.piFixed + " rows on Paylocity Import");
  }

  // ═══════════════════════════════════════════════════════════
  //  STEP 2: Update Training sheet
  // ═══════════════════════════════════════════════════════════
  var trainingSheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);
  if (!trainingSheet) { ui.alert("Training sheet not found."); return; }

  var trainingData = trainingSheet.getDataRange().getValues();
  var trainingHeaders = trainingData[0];

  var tLNameCol = -1, tFNameCol = -1, tActiveCol = -1, tDivCol = -1, tDeptCol = -1, tPosCol = -1;
  for (var c = 0; c < trainingHeaders.length; c++) {
    var th = trainingHeaders[c].toString().trim();
    if (th.toUpperCase() === "L NAME") tLNameCol = c;
    if (th.toUpperCase() === "F NAME") tFNameCol = c;
    if (th.toUpperCase() === "ACTIVE") tActiveCol = c;
    if (th === "Division Description") tDivCol = c;
    if (th === "Department Description") tDeptCol = c;
    if (th === "Position Title") tPosCol = c;
  }
  if (tLNameCol < 0 || tFNameCol < 0) { ui.alert("L NAME / F NAME not found on Training sheet."); return; }

  var paylocityNames = {};

  for (var i = 1; i < empData.length; i++) {
    var lastName = empData[i][eLastCol] ? empData[i][eLastCol].toString().trim() : "";
    var firstName = empData[i][eFirstCol] ? empData[i][eFirstCol].toString().trim() : "";
    var preferred = ePrefCol >= 0 && empData[i][ePrefCol] ? empData[i][ePrefCol].toString().trim() : "";
    if (!lastName || !firstName) continue;

    var displayFirst = preferred || firstName;
    var division = eDivCol >= 0 ? (empData[i][eDivCol] || "").toString().trim() : "";
    var department = eDeptCol >= 0 ? (empData[i][eDeptCol] || "").toString().trim() : "";
    var position = ePositionCol >= 0 ? (empData[i][ePositionCol] || "").toString().trim() : "";
    var status = eStatusCol >= 0 ? (empData[i][eStatusCol] || "").toString().trim() : "";
    var isActive = status.toLowerCase() === "active" || status === "A" || status === "Y";
    var activeFlag = isActive ? "Y" : "N";

    // Track for deactivation
    paylocityNames[lastName.toLowerCase() + "|" + displayFirst.toLowerCase()] = true;
    paylocityNames[lastName.toLowerCase() + "|" + firstName.toLowerCase()] = true;
    paylocityNames[lastName.toLowerCase() + "|" + firstName.toLowerCase().replace(/['\-\u2019]/g, "")] = true;

    var matchRow = findTrainingRow(trainingData, displayFirst, lastName);
    if (matchRow < 0 && preferred && preferred !== firstName) {
      matchRow = findTrainingRow(trainingData, firstName, lastName);
    }

    if (matchRow >= 0) {
      var changed = false;
      var tLast = trainingData[matchRow][tLNameCol] ? trainingData[matchRow][tLNameCol].toString().trim() : "";
      var tFirst = trainingData[matchRow][tFNameCol] ? trainingData[matchRow][tFNameCol].toString().trim() : "";

      // Check if this pair was marked as "different people" — don't fix names
      var sheetFullName = tFirst + " " + tLast;
      var empFullName = displayFirst + " " + lastName;
      var isIgnored = isIgnoredPair_(syncIgnoredPairs_, sheetFullName, empFullName);

      // Fix last name
      if (!isIgnored && tLast !== lastName) {
        trainingSheet.getRange(matchRow + 1, tLNameCol + 1).setValue(lastName);
        trainingData[matchRow][tLNameCol] = lastName;
        changed = true; stats.tNamesFix++;
      }
      // Fix first name (preserve nickname annotations)
      var tFirstBase = tFirst.replace(/["()].*/g, "").trim();
      if (!isIgnored && tFirstBase.toLowerCase() !== displayFirst.toLowerCase()) {
        var suffix = tFirst.substring(tFirstBase.length).trim();
        var newFirst = suffix ? displayFirst + " " + suffix : displayFirst;
        trainingSheet.getRange(matchRow + 1, tFNameCol + 1).setValue(newFirst);
        trainingData[matchRow][tFNameCol] = newFirst;
        changed = true; stats.tNamesFix++;
      }
      // Update status
      if (tActiveCol >= 0) {
        var cur = trainingData[matchRow][tActiveCol] ? trainingData[matchRow][tActiveCol].toString().trim() : "";
        if (cur !== activeFlag) {
          trainingSheet.getRange(matchRow + 1, tActiveCol + 1).setValue(activeFlag);
          trainingData[matchRow][tActiveCol] = activeFlag;
          changed = true;
        }
      }
      // Update division, department, position
      if (tDivCol >= 0 && division) { trainingSheet.getRange(matchRow + 1, tDivCol + 1).setValue(division); changed = true; }
      if (tDeptCol >= 0 && department) { trainingSheet.getRange(matchRow + 1, tDeptCol + 1).setValue(department); changed = true; }
      if (tPosCol >= 0 && position) { trainingSheet.getRange(matchRow + 1, tPosCol + 1).setValue(position); changed = true; }

      if (changed) stats.tUpdated++;
    } else {
      // Add new employee
      var newRow = [];
      for (var nc = 0; nc < trainingHeaders.length; nc++) newRow.push("");
      newRow[tLNameCol] = lastName;
      newRow[tFNameCol] = displayFirst;
      if (tActiveCol >= 0) newRow[tActiveCol] = activeFlag;
      if (tDivCol >= 0) newRow[tDivCol] = division;
      if (tDeptCol >= 0) newRow[tDeptCol] = department;
      if (tPosCol >= 0) newRow[tPosCol] = position;
      trainingSheet.appendRow(newRow);
      stats.tAdded++;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  STEP 3: Deactivate employees not in Paylocity
  //  Uses findTrainingRow in reverse for full fuzzy matching
  // ═══════════════════════════════════════════════════════════
  if (tActiveCol >= 0) {
    // Build a searchable array from Employees sheet (same format as trainingData)
    var empSearchData = [["", ""]]; // header row placeholder
    for (var ei = 1; ei < empData.length; ei++) {
      var eLast = empData[ei][eLastCol] ? empData[ei][eLastCol].toString().trim() : "";
      var eFirst = empData[ei][eFirstCol] ? empData[ei][eFirstCol].toString().trim() : "";
      var ePref = ePrefCol >= 0 && empData[ei][ePrefCol] ? empData[ei][ePrefCol].toString().trim() : "";
      var eStat = eStatusCol >= 0 ? (empData[ei][eStatusCol] || "").toString().trim() : "";
      var eActive = eStat.toLowerCase() === "active" || eStat === "A" || eStat === "Y";
      if (!eLast || !eFirst) continue;
      // Add both legal and preferred name entries
      empSearchData.push([eLast, eFirst, eActive ? "Y" : "N"]);
      if (ePref && ePref !== eFirst) {
        empSearchData.push([eLast, ePref, eActive ? "Y" : "N"]);
      }
    }

    trainingData = trainingSheet.getDataRange().getValues();
    var toDeactivate = [];

    for (var r = 1; r < trainingData.length; r++) {
      var tL = trainingData[r][tLNameCol] ? trainingData[r][tLNameCol].toString().trim() : "";
      var tF = trainingData[r][tFNameCol] ? trainingData[r][tFNameCol].toString().trim() : "";
      var curActive = trainingData[r][tActiveCol] ? trainingData[r][tActiveCol].toString().trim() : "";
      if (!tL || curActive !== "Y") continue;

      // Search the Employees list using full fuzzy matching
      var empMatch = findTrainingRow(empSearchData, tF, tL);
      if (empMatch >= 0) continue; // found in Paylocity — keep active

      toDeactivate.push({ row: r + 1, name: tF + " " + tL });
    }

    if (toDeactivate.length > 0) {
      var deactMsg = "Found " + toDeactivate.length + " active employee(s) NOT in the Employees sheet:\n\n";
      for (var di = 0; di < Math.min(toDeactivate.length, 30); di++) {
        deactMsg += "  Row " + toDeactivate[di].row + ": " + toDeactivate[di].name + "\n";
      }
      if (toDeactivate.length > 30) deactMsg += "  ...and " + (toDeactivate.length - 30) + " more\n";
      deactMsg += "\nSet these to Inactive?";

      var deactConfirm = ui.alert("Deactivate?", deactMsg, ui.ButtonSet.YES_NO);
      if (deactConfirm === ui.Button.YES) {
        for (var di = 0; di < toDeactivate.length; di++) {
          trainingSheet.getRange(toDeactivate[di].row, tActiveCol + 1).setValue("N");
          stats.tDeactivated++;
          Logger.log("Deactivated: " + toDeactivate[di].name + " (row " + toDeactivate[di].row + ")");
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  STEP 4: Auto-excuse based on department training rules
  //  Reads Hub Settings for dept_rule entries. For each employee,
  //  if their division has a rule, write "NA" to training columns
  //  that are NOT in their rule (only if cell is empty).
  // ═══════════════════════════════════════════════════════════
  stats.autoExcused = 0;
  var hubSheet = ss.getSheetByName("Hub Settings");
  if (hubSheet && tDivCol >= 0) {
    var hubData = hubSheet.getDataRange().getValues();
    var deptRules = {}; // lowercase division → set of training column keys (or "ALL")
    for (var h = 1; h < hubData.length; h++) {
      if (hubData[h][0] && hubData[h][0].toString().trim() === "dept_rule") {
        var ruleDept = hubData[h][1].toString().trim().toLowerCase();
        var ruleVal = hubData[h][2].toString().trim();
        if (ruleVal === "ALL") {
          deptRules[ruleDept] = "ALL";
        } else {
          // New format: "tracked_keys|required_keys" — we only need tracked
          // Old format: "CPR, Ukeru" (no pipe)
          var trackedStr = ruleVal.indexOf("|") > -1 ? ruleVal.split("|")[0] : ruleVal;
          var ruleKeys = {};
          var parts = trackedStr.split(",");
          for (var p = 0; p < parts.length; p++) {
            var k = parts[p].trim();
            if (k) ruleKeys[k] = true;
          }
          deptRules[ruleDept] = ruleKeys;
        }
      }
    }

    // Build list of all training column indices
    var allTrainingCols = [];
    var seenCols = {};
    for (var t = 0; t < TRAINING_CONFIG.length; t++) {
      var colName = TRAINING_CONFIG[t].column;
      if (seenCols[colName]) continue;
      seenCols[colName] = true;
      for (var c = 0; c < trainingHeaders.length; c++) {
        if (trainingHeaders[c].toString().trim() === colName) {
          allTrainingCols.push({ key: colName, index: c });
          break;
        }
      }
    }
    // Also include FIRSTAID
    for (var c = 0; c < trainingHeaders.length; c++) {
      if (trainingHeaders[c].toString().trim() === "FIRSTAID" && !seenCols["FIRSTAID"]) {
        allTrainingCols.push({ key: "FIRSTAID", index: c });
        seenCols["FIRSTAID"] = true;
      }
    }

    // Re-read training data since we may have added/modified rows
    trainingData = trainingSheet.getDataRange().getValues();

    for (var r = 1; r < trainingData.length; r++) {
      var empActive = tActiveCol >= 0 ? (trainingData[r][tActiveCol] || "").toString().trim().toUpperCase() : "Y";
      if (empActive !== "Y") continue;

      var empDiv = (trainingData[r][tDivCol] || "").toString().trim().toLowerCase();
      if (!empDiv) continue;

      var rule = deptRules[empDiv];
      if (!rule) {
        // Also try without spaces around hyphens (e.g., "100-Residential" vs "100 - Residential")
        var altDiv = empDiv.replace(/\s*-\s*/g, "-");
        rule = deptRules[altDiv];
        if (!rule) {
          altDiv = empDiv.replace(/\s*-\s*/g, " - ");
          rule = deptRules[altDiv];
        }
      }
      if (!rule) continue; // no rule = don't auto-excuse
      if (rule === "ALL") continue; // needs everything

      // For each training column NOT in the rule, write NA if cell is empty
      for (var tc = 0; tc < allTrainingCols.length; tc++) {
        var colKey = allTrainingCols[tc].key;
        var colIdx = allTrainingCols[tc].index;
        if (rule[colKey]) continue; // this training IS required — skip

        var cellVal = (trainingData[r][colIdx] || "").toString().trim();
        if (cellVal) continue; // already has a value — don't overwrite

        trainingSheet.getRange(r + 1, colIdx + 1).setValue("NA");
        stats.autoExcused++;
      }
    }
  }

  var summary = "Employee Sync Complete!\n\n";
  if (piSheet) summary += "Paylocity Import rows fixed: " + stats.piFixed + "\n";
  summary += "Training sheet updated: " + stats.tUpdated + "\n";
  summary += "Names corrected: " + stats.tNamesFix + "\n";
  summary += "New employees added: " + stats.tAdded + "\n";
  summary += "Deactivated (not in Paylocity): " + stats.tDeactivated + "\n";
  if (stats.autoExcused > 0) {
    summary += "Auto-excused (based on dept rules): " + stats.autoExcused + " cell(s)\n";
  }

  ui.alert(summary);
}
