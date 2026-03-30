// ============================================================
// EVC Training System — Class Management
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
//
// CONTENTS:
//   1. Smart Remove (status-aware removal with move option)
//   2. Upload Roster Results (batch upload pass dates)
//   3. Smart Remove helpers
//   4. Manual Class Assignment
//   5. Manual Assignment helpers
//
// DEPENDS ON: Config.gs, Utilities.gs, Core.gs, Rosters.gs
//
// ============================================================


// ************************************************************
//   1. SMART REMOVE — Status-aware removal with move option
// ************************************************************

function smartRemove() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var sheetName = sheet.getName();
  var row = ss.getActiveCell().getRow();

  // ── STEP 1: Identify person and training ──

  var info = identifyPersonForRemoval_(ss, sheet, sheetName, row, ui);
  if (!info) return;

  var name = info.name;
  var matchedTraining = info.trainingType;
  var sourceTab = info.sourceTab;

  // ── STEP 2: Check their Training sheet status ──

  var status = checkPersonTrainingStatus_(ss, name, matchedTraining);

  // ── STEP 3: Present status and offer contextual actions ──

  var msg = "";
  msg += name + "\n";
  msg += "Training: " + matchedTraining + "\n";
  msg += "Class: " + sourceTab + "\n";
  msg += "───────────────────────\n\n";

  // ── BRANCH A: Person not found on Training sheet ──
  if (!status.found) {
    msg += "NOT FOUND on Training sheet.\n\n";
    msg += "1.  Remove from this class\n";
    msg += "2.  Cancel\n";

    var choice = ui.prompt("Smart Remove", msg, ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() !== ui.Button.OK) return;
    if (choice.getResponseText().trim() !== "1") return;

    executeRemoval_(ss, sheet, sheetName, row, name, matchedTraining, sourceTab, "Not on Training sheet");
    ui.alert("Removed " + name + "\n\nNot found on Training sheet.\nTraining Rosters refreshed.");
    return;
  }

  // ── BRANCH B: Inactive employee ──
  if (!status.active) {
    executeRemoval_(ss, sheet, sheetName, row, name, matchedTraining, sourceTab, "Inactive employee");
    ui.alert("Removed " + name + " (inactive).\n\nTraining Rosters refreshed.");
    return;
  }

  // ── BRANCH C: Already has current training ──
  if (status.alreadyCurrent) {
    msg += "ALREADY CURRENT\n";
    msg += "Completed: " + status.dateOnFile + "\n";
    if (status.expiresOn) msg += "Expires: " + status.expiresOn + "\n";
    msg += "\nThis person already has current " + matchedTraining + ".\n\n";
    msg += "1.  Remove (already current)\n";
    msg += "2.  Cancel\n";

    var choice = ui.prompt("Smart Remove", msg, ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() !== ui.Button.OK) return;
    if (choice.getResponseText().trim() !== "1") return;

    executeRemoval_(ss, sheet, sheetName, row, name, matchedTraining, sourceTab, "Already current (" + status.dateOnFile + ")");
    ui.alert("Removed " + name + "\n\nAlready current — completed " + status.dateOnFile + "\nTraining Rosters refreshed.");
    return;
  }

  // ── BRANCH D: Has Pass on Training Records but not yet on Training sheet ──
  if (status.hasPassOnRecords && !status.hasCurrentDate) {
    msg += "PASS ON RECORDS — NOT YET UPLOADED\n\n";
    msg += "Training Records shows PASS\n";
    msg += "Session: " + status.recordsSession + "\n";
    msg += "Date: " + status.recordsDate + "\n";
    msg += "But Training sheet doesn't have this date yet.\n\n";
    msg += "1.  Upload date to Training sheet & remove from class\n";
    msg += "2.  Remove without uploading\n";
    msg += "3.  Cancel\n";

    var choice = ui.prompt("Smart Remove", msg, ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() !== ui.Button.OK) return;
    var pick = choice.getResponseText().trim();

    if (pick === "1") {
      // Upload the date via existing updateTrainingAccess
      try {
        updateTrainingAccess(status.recordsSession, name, status.recordsDateRaw);
      } catch (err) {
        Logger.log("Smart remove upload error: " + err.toString());
      }
      executeRemoval_(ss, sheet, sheetName, row, name, matchedTraining, sourceTab, "Uploaded date (" + status.recordsDate + ") & removed");
      ui.alert("Done!\n\n" + name + ":\n  Date uploaded: " + status.recordsDate + "\n  Removed from " + sourceTab + "\n\nTraining Rosters refreshed.");
    } else if (pick === "2") {
      executeRemoval_(ss, sheet, sheetName, row, name, matchedTraining, sourceTab, "Removed without uploading pass");
      ui.alert("Removed " + name + "\n\nPass date NOT uploaded.\nTraining Rosters refreshed.");
    }
    return;
  }

  // ── BRANCH E: Still needs training ──
  msg += "STILL NEEDS " + matchedTraining.toUpperCase() + "\n";
  if (status.isExpired) {
    msg += "Last completed: " + status.dateOnFile + " (expired)\n";
  } else if (status.isFailed) {
    msg += "Status: " + status.columnValue + "\n";
  } else if (status.columnValue) {
    msg += "Current value: " + status.columnValue + "\n";
  } else {
    msg += "Never completed\n";
  }
  msg += "\n";

  // Check for ALL future classes (including full)
  var allClasses = findAllFutureClasses_(ss, matchedTraining, sourceTab);

  if (allClasses.length > 0) {
    msg += "Move to another class:\n";
    for (var i = 0; i < allClasses.length; i++) {
      var c = allClasses[i];
      if (c.isFull) {
        msg += "  " + (i + 1) + ".  " + c.tabName + " (FULL — " + c.filled + "/" + c.capacity + ", override)\n";
      } else {
        msg += "  " + (i + 1) + ".  " + c.tabName + " (" + c.openSeats + " open)\n";
      }
    }
    msg += "\nOr:\n";
    msg += "  " + (allClasses.length + 1) + ".  Remove only\n";
    msg += "  " + (allClasses.length + 2) + ".  Cancel\n";
  } else {
    msg += "No other " + matchedTraining + " classes found.\n\n";
    msg += "1.  Remove\n";
    msg += "2.  Cancel\n";
  }

  var choice = ui.prompt("Smart Remove", msg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;
  var pick = parseInt(choice.getResponseText().trim());
  if (isNaN(pick)) return;

  if (allClasses.length > 0) {
    if (pick >= 1 && pick <= allClasses.length) {
      var target = allClasses[pick - 1];

      // If full, confirm override
      if (target.isFull) {
        var override = ui.alert(
          "Class is Full",
          target.tabName + " is at " + target.filled + "/" + target.capacity + ".\n\n" +
          "Add " + name + " anyway (over capacity)?",
          ui.ButtonSet.YES_NO
        );
        if (override !== ui.Button.YES) return;
      }

      executeMove_(ss, sheet, sheetName, row, name, matchedTraining, sourceTab, target);
      ui.alert("Moved " + name + "!\n\nFrom: " + sourceTab + "\nTo: " + target.tabName +
               (target.isFull ? " (over capacity)" : "") + "\n\nTraining Rosters refreshed.");
    } else if (pick === allClasses.length + 1) {
      executeRemoval_(ss, sheet, sheetName, row, name, matchedTraining, sourceTab, "Removed — still needs " + matchedTraining);
      ui.alert("Removed " + name + "\n\nStill needs " + matchedTraining + " — will appear on Training Rosters.\nTraining Rosters refreshed.");
    }
  } else {
    if (pick === 1) {
      executeRemoval_(ss, sheet, sheetName, row, name, matchedTraining, sourceTab, "Removed — still needs " + matchedTraining + " (no other classes)");
      ui.alert("Removed " + name + "\n\nStill needs " + matchedTraining + " — will appear on Training Rosters.\nTraining Rosters refreshed.");
    }
  }
}


// ************************************************************
//   2. UPLOAD ROSTER RESULTS — Batch upload pass dates
// ************************************************************

function uploadRosterResults() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var recordsSheet = ss.getSheets()[0];
  var trainingSheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);

  if (!trainingSheet) {
    ui.alert("Error: Training sheet not found.");
    return;
  }

  var recordsData = recordsSheet.getDataRange().getValues();
  var trainingData = trainingSheet.getDataRange().getValues();
  var trainingHeaders = trainingData[0];

  var missing = [];

  for (var r = 1; r < recordsData.length; r++) {
    var session = recordsData[r][1] ? recordsData[r][1].toString().trim() : "";
    var attendee = recordsData[r][2] ? recordsData[r][2].toString().trim() : "";
    var dateVal = recordsData[r][3];
    var passFail = recordsData[r][9] ? recordsData[r][9].toString().trim() : "";

    if (passFail !== "Pass" || !session || !attendee) continue;

    var columnHeaders = SESSION_TO_COLUMN[session];
    if (!columnHeaders || columnHeaders.length === 0) continue;

    // Parse name
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
        continue;
      }
    }

    if (!firstName || !lastName) continue;

    var matchRow = findTrainingRow(trainingData, firstName, lastName);
    if (matchRow === -1) continue;

    // Check if each target column already has this date or newer
    var formattedDate = formatBackfillDate(dateVal);
    var newDate = parseToDate(dateVal);

    for (var tc = 0; tc < columnHeaders.length; tc++) {
      var colIdx = -1;
      for (var c = 0; c < trainingHeaders.length; c++) {
        if (trainingHeaders[c].toString().trim() === columnHeaders[tc]) { colIdx = c; break; }
      }
      if (colIdx === -1) continue;

      var currentVal = trainingData[matchRow][colIdx];
      var currentStr = currentVal ? currentVal.toString().trim() : "";
      var currentUpper = currentStr.toUpperCase();

      // Skip if NA, excused, or failure code
      if (currentUpper === "NA" || currentUpper === "N/A") continue;
      if (currentUpper === "FAILED" || currentUpper === "FAIL" ||
          /^FAILED X\d$/.test(currentUpper) ||
          /^FX\d/.test(currentUpper) || currentUpper === "FS") continue;

      var existingDate = parseToDate(currentVal);
      if (existingDate && newDate && newDate.getTime() <= existingDate.getTime()) continue;

      // This is a missing or older date
      missing.push({
        row: r + 1,
        attendee: attendee,
        session: session,
        date: formattedDate,
        column: columnHeaders[tc],
        currentValue: currentStr || "(empty)",
        trainingRow: matchRow,
        trainingCol: colIdx,
        dateVal: dateVal
      });
    }
  }

  if (missing.length === 0) {
    ui.alert("All caught up!\n\nEvery Pass entry on Training Records is already reflected on the Training sheet.");
    return;
  }

  var msg = "Found " + missing.length + " date(s) to upload:\n\n";
  var showCount = Math.min(missing.length, 15);
  for (var m = 0; m < showCount; m++) {
    var item = missing[m];
    msg += "  " + item.attendee + " | " + item.session + " | " + item.date;
    msg += " (currently: " + item.currentValue + ")\n";
  }
  if (missing.length > 15) {
    msg += "  ...and " + (missing.length - 15) + " more\n";
  }
  msg += "\nUpload all " + missing.length + " date(s) to the Training sheet?";

  var confirm = ui.alert("Upload Roster Results", msg, ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  var uploaded = 0;
  for (var m = 0; m < missing.length; m++) {
    var item = missing[m];
    var formattedDate = formatBackfillDate(item.dateVal);
    trainingSheet.getRange(item.trainingRow + 1, item.trainingCol + 1).setValue(formattedDate);

    // Auto-fill linked columns
    var writtenHeader = trainingHeaders[item.trainingCol] ? trainingHeaders[item.trainingCol].toString().trim() : "";
    applyAutoFillRules(trainingSheet, item.trainingRow + 1, trainingHeaders, writtenHeader, formattedDate);

    uploaded++;
  }

  generateRostersSilent();

  ui.alert("Upload Complete!\n\n" + uploaded + " date(s) uploaded to the Training sheet.\n\nAuto-fill rules applied (CPR/FA sync, MedCert/PostMed sync).\nTraining Rosters refreshed.");
}


// ************************************************************
//   3. SMART REMOVE HELPERS
// ************************************************************

function identifyPersonForRemoval_(ss, sheet, sheetName, row, ui) {
  var name = "", trainingType = "", sourceTab = "";

  if (sheetName === OVERVIEW_SHEET_NAME) {
    var rowData = sheet.getRange(row, 1, 1, 6).getValues()[0];
    var meta = rowData[5] ? rowData[5].toString().trim() : "";

    if (meta.indexOf("ENROLLEE:") !== 0) {
      ui.alert("Select a person's row in the Overview (one with a name in the Person column), then run this again.");
      return null;
    }

    name = rowData[1] ? rowData[1].toString().trim() : "";
    if (!name) { ui.alert("No name found on this row."); return null; }

    var allData = sheet.getDataRange().getValues();
    var sessionDate = "";
    for (var r = row - 1; r >= 0; r--) {
      var cellMeta = allData[r][5] ? allData[r][5].toString().trim() : "";
      if (cellMeta.indexOf("SESSION:") === 0) {
        var headerText = allData[r][0] ? allData[r][0].toString().trim() : "";
        var parts = headerText.split("  \u2014  ");
        trainingType = parts[0] ? parts[0].trim() : "";
        sessionDate = parts[1] ? parts[1].trim() : "";
        break;
      }
    }

    if (!trainingType) { ui.alert("Could not determine the training type for this row."); return null; }
    sourceTab = trainingType + (sessionDate ? " " + sessionDate : "");

  } else {
    var prefixes = getClassRosterPrefixes();
    for (var p = 0; p < prefixes.length; p++) {
      if (sheetName.indexOf(prefixes[p] + " ") === 0) {
        if (!trainingType || prefixes[p].length > trainingType.length) trainingType = prefixes[p];
      }
    }

    if (!trainingType) {
      ui.alert("Not a class roster or Overview tab.\n\nNavigate to a class roster tab or the Scheduled Overview, click on a person's row, then run this.");
      return null;
    }

    if (row < 9) {
      ui.alert("Select a person's row (row 9 or below), then run this again.");
      return null;
    }

    var data = sheet.getRange(row, 1, 1, 7).getValues()[0];
    name = data[1] ? data[1].toString().trim() : "";
    sourceTab = sheetName;
  }

  if (!name || name.toLowerCase().indexOf("open seat") > -1 ||
      name === "\u2014 open \u2014" || name.indexOf("- open -") > -1 ||
      name.toLowerCase() === "tbd") {
    ui.alert("That row doesn't have a person on it. Select a row with a name.");
    return null;
  }

  return { name: name, trainingType: trainingType, sourceTab: sourceTab };
}

function checkPersonTrainingStatus_(ss, personName, trainingType) {
  var result = {
    found: false,
    active: false,
    columnValue: "",
    hasCurrentDate: false,
    dateOnFile: "",
    expiresOn: "",
    alreadyCurrent: false,
    isExpired: false,
    isFailed: false,
    isExcused: false,
    hasPassOnRecords: false,
    recordsSession: "",
    recordsDate: "",
    recordsDateRaw: null,
    summary: ""
  };

  // ── Find person on Training sheet ──

  var trainingSheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);
  if (!trainingSheet) return result;

  var data = trainingSheet.getDataRange().getValues();
  var headers = data[0];

  // Parse person name into first/last
  var firstName = "", lastName = "";
  var nameParts = personName.trim().split(/\s+/);
  if (nameParts.length >= 2) {
    firstName = nameParts[0];
    lastName = nameParts.slice(1).join(" ");
  } else {
    firstName = personName;
  }

  var matchRow = findTrainingRow(data, firstName, lastName);
  if (matchRow === -1) return result;

  result.found = true;

  // ── Check active status ──

  var activeCol = findColumnIndex(headers, ["ACTIVE", "STATUS", "ACTIVE?"]);
  if (activeCol >= 0) {
    var activeVal = data[matchRow][activeCol] ? data[matchRow][activeCol].toString().trim().toUpperCase() : "";
    result.active = (activeVal !== "NO" && activeVal !== "INACTIVE" &&
                     activeVal !== "TERMINATED" && activeVal !== "N");
  } else {
    result.active = true;
  }

  // ── Find the training column(s) ──

  var columnHeaders = getTrainingColumnHeaders_(trainingType);
  if (!columnHeaders || columnHeaders.length === 0) {
    result.summary = "Could not map training type to column";
    return result;
  }

  // Use the first matching column
  var colIdx = -1;
  for (var ch = 0; ch < columnHeaders.length; ch++) {
    for (var c = 0; c < headers.length; c++) {
      if (headers[c].toString().trim() === columnHeaders[ch]) {
        colIdx = c;
        break;
      }
    }
    if (colIdx >= 0) break;
  }

  if (colIdx === -1) {
    result.summary = "Column not found for " + trainingType;
    return result;
  }

  // ── Read and interpret the cell value ──

  var cellVal = data[matchRow][colIdx];
  var cellStr = cellVal ? cellVal.toString().trim() : "";
  var cellUpper = cellStr.toUpperCase();
  result.columnValue = cellStr;

  // Excusal check
  var excusalCode = getExcusalCode(cellStr);
  if (excusalCode) {
    result.isExcused = true;
    result.alreadyCurrent = true;
    result.summary = "Excused (" + excusalCode + ")";
    return result;
  }

  // Failed check
  if (cellUpper === "FAILED" || cellUpper === "FAIL" || cellUpper === "FS" ||
      /^FAILED X\d$/.test(cellUpper) ||
      /^FX\d/i.test(cellUpper) || /^F\s*X\s*\d/i.test(cellUpper)) {
    result.isFailed = true;
    result.summary = "Failed — needs retake (" + cellStr + ")";
    return result;
  }

  // Empty / NEEDS / SCHED
  if (!cellStr || cellUpper === "NEEDS" || cellUpper === "NEEDDS" ||
      cellUpper === "SCHED" || cellUpper === "SCHEDULE" || cellUpper === "NO SHOW") {
    result.summary = cellStr ? cellUpper : "Never completed (empty)";
    // Fall through to check Training Records
  } else {
    // Try to parse as date
    var trainDate = parseTrainingDate(cellVal);
    if (trainDate) {
      result.hasCurrentDate = true;
      result.dateOnFile = formatDate(trainDate);

      // Check expiration
      var config = getTrainingConfigForType_(trainingType);
      if (config && config.renewalYears > 0) {
        var expDate = new Date(trainDate);
        expDate.setFullYear(expDate.getFullYear() + config.renewalYears);
        result.expiresOn = formatDate(expDate);

        var today = new Date();
        today.setHours(0, 0, 0, 0);

        if (expDate > today) {
          result.alreadyCurrent = true;
          result.summary = "Current (completed " + result.dateOnFile + ", expires " + result.expiresOn + ")";
        } else {
          result.isExpired = true;
          result.summary = "Expired (completed " + result.dateOnFile + ", expired " + result.expiresOn + ")";
        }
      } else {
        // No renewal (one-and-done)
        result.alreadyCurrent = true;
        result.summary = "Current (completed " + result.dateOnFile + ", no expiration)";
      }
      return result;
    } else {
      // Non-date text that isn't a known code
      result.summary = "Unknown value: " + cellStr;
    }
  }

  // ── Check Training Records for Pass entries ──

  var recordsResult = checkTrainingRecordsForPass_(ss, firstName, lastName, trainingType);
  if (recordsResult.found) {
    result.hasPassOnRecords = true;
    result.recordsSession = recordsResult.session;
    result.recordsDate = recordsResult.dateFormatted;
    result.recordsDateRaw = recordsResult.dateRaw;
    if (!result.summary || result.summary.indexOf("Never") > -1 || result.summary.indexOf("empty") > -1) {
      result.summary = "Pass on Records (" + recordsResult.dateFormatted + ") — not yet on Training sheet";
    }
  }

  return result;
}

function checkTrainingRecordsForPass_(ss, firstName, lastName, trainingType) {
  var result = { found: false, session: "", dateFormatted: "", dateRaw: null, row: -1 };

  var recordsSheet = ss.getSheets()[0]; // Training Records is Sheet 1
  if (!recordsSheet || recordsSheet.getName() === TRAINING_ACCESS_SHEET_NAME) return result;

  var data = recordsSheet.getDataRange().getValues();
  var targetColumns = getTrainingColumnHeaders_(trainingType);
  if (!targetColumns) return result;

  var firstLower = firstName.toLowerCase();
  var lastLower = lastName.toLowerCase();
  var bestDate = null;
  var bestRow = -1;
  var bestSession = "";

  for (var r = 1; r < data.length; r++) {
    var session = data[r][1] ? data[r][1].toString().trim() : "";
    var attendee = data[r][2] ? data[r][2].toString().trim() : "";
    var dateVal = data[r][3];
    var passFail = data[r][9] ? data[r][9].toString().trim() : "";

    if (passFail !== "Pass") continue;

    // Check if this session maps to the same training type
    var sessionCols = SESSION_TO_COLUMN[session];
    if (!sessionCols) continue;

    var matches = false;
    for (var sc = 0; sc < sessionCols.length; sc++) {
      for (var tc = 0; tc < targetColumns.length; tc++) {
        if (sessionCols[sc] === targetColumns[tc]) { matches = true; break; }
      }
      if (matches) break;
    }
    if (!matches) continue;

    // Check if the attendee name matches
    var attendeeLower = attendee.toLowerCase().trim();
    var nameMatch = false;

    // "Last, First" format
    if (attendeeLower.indexOf(",") > -1) {
      var parts = attendeeLower.split(",");
      var aLast = parts[0].trim();
      var aFirst = parts[1] ? parts[1].trim() : "";
      if (aLast === lastLower && (aFirst === firstLower || aFirst.indexOf(firstLower) === 0)) nameMatch = true;
    } else {
      // "First Last" format
      var spaceParts = attendeeLower.split(/\s+/);
      if (spaceParts.length >= 2) {
        var aFirst = spaceParts[0];
        var aLast = spaceParts.slice(1).join(" ");
        if (aLast === lastLower && (aFirst === firstLower || aFirst.indexOf(firstLower) === 0)) nameMatch = true;
      }
    }

    // Also try nickname matching
    if (!nameMatch) {
      var namesToTry = [firstLower];
      if (NICKNAMES[firstLower]) namesToTry = namesToTry.concat(NICKNAMES[firstLower]);
      for (var n = 0; n < namesToTry.length; n++) {
        if (attendeeLower.indexOf(namesToTry[n]) > -1 && attendeeLower.indexOf(lastLower) > -1) {
          nameMatch = true;
          break;
        }
      }
    }

    if (!nameMatch) continue;

    // Found a match — keep the most recent one
    var recordDate = parseToDate(dateVal);
    if (!bestDate || (recordDate && recordDate > bestDate)) {
      bestDate = recordDate;
      bestRow = r;
      bestSession = session;
    }
  }

  if (bestRow >= 0) {
    result.found = true;
    result.session = bestSession;
    result.dateRaw = data[bestRow][3];
    result.dateFormatted = formatBackfillDate(data[bestRow][3]);
    result.row = bestRow + 1;
  }

  return result;
}

function getTrainingColumnHeaders_(trainingType) {
  // Direct match in SESSION_TO_COLUMN
  if (SESSION_TO_COLUMN[trainingType]) return SESSION_TO_COLUMN[trainingType];

  // Case-insensitive SESSION_TO_COLUMN match
  var typeUpper = trainingType.toUpperCase();
  for (var key in SESSION_TO_COLUMN) {
    if (key.toUpperCase() === typeUpper) return SESSION_TO_COLUMN[key];
  }

  // Match via TRAINING_CONFIG name → column
  for (var i = 0; i < TRAINING_CONFIG.length; i++) {
    if (TRAINING_CONFIG[i].name.toLowerCase() === trainingType.toLowerCase()) {
      return [TRAINING_CONFIG[i].column];
    }
  }

  // Match via SCHEDULED_TYPE_MAP → TRAINING_CONFIG
  var mapped = SCHEDULED_TYPE_MAP[trainingType.toLowerCase()];
  if (mapped) {
    for (var i = 0; i < TRAINING_CONFIG.length; i++) {
      if (TRAINING_CONFIG[i].name === mapped) {
        return [TRAINING_CONFIG[i].column];
      }
    }
  }

  // Partial match fallback
  var typeLower = trainingType.toLowerCase();
  for (var key in SESSION_TO_COLUMN) {
    if (key.toLowerCase().indexOf(typeLower) > -1 || typeLower.indexOf(key.toLowerCase()) > -1) {
      return SESSION_TO_COLUMN[key];
    }
  }

  return null;
}

function getTrainingConfigForType_(trainingType) {
  var typeLower = trainingType.toLowerCase();

  for (var i = 0; i < TRAINING_CONFIG.length; i++) {
    if (TRAINING_CONFIG[i].name.toLowerCase() === typeLower) return TRAINING_CONFIG[i];
  }

  // Try via SCHEDULED_TYPE_MAP
  var mapped = SCHEDULED_TYPE_MAP[typeLower];
  if (mapped) {
    for (var i = 0; i < TRAINING_CONFIG.length; i++) {
      if (TRAINING_CONFIG[i].name === mapped) return TRAINING_CONFIG[i];
    }
  }

  // Try column name match
  for (var i = 0; i < TRAINING_CONFIG.length; i++) {
    if (TRAINING_CONFIG[i].column.toLowerCase() === typeLower) return TRAINING_CONFIG[i];
  }

  return null;
}

function executeRemoval_(ss, sheet, sheetName, row, name, trainingType, sourceTab, reason) {
  // Log to removal log
  logRemoval_(ss, name, trainingType, sourceTab, reason, sourceTab);

  if (sheetName === OVERVIEW_SHEET_NAME) {
    // Mark on the Overview
    var RED = "#C00000", LRED = "#FFC7CE";
    sheet.getRange(row, 3).setValue("REMOVED");
    sheet.getRange(row, 3).setBackground(LRED).setFontColor(RED).setFontWeight("bold");
    sheet.getRange(row, 4).setValue(reason).setFontColor("#999999");

    // Remove from the class roster tab if it exists
    var classTab = ss.getSheetByName(sourceTab);
    if (classTab) removePersonFromClassTab_(classTab, name);

    // Remove from Scheduled sheet
    removeFromScheduledSheet_(ss, trainingType, sourceTab, name);

  } else {
    // Clear from class roster tab
    var WHITE = "#FFFFFF", ALT_BLUE = "#EBF0F7";
    var rowData = sheet.getRange(row, 1, 1, 7).getValues()[0];
    var idx = rowData[0];
    var rowBg = ((idx - 1) % 2 === 0) ? WHITE : ALT_BLUE;
    sheet.getRange(row, 1, 1, 7).setValues([[idx, "\u2014 open \u2014", "", "", "", false, ""]]);
    sheet.getRange(row, 1, 1, 7).setFontColor("#AAAAAA").setBackground(rowBg);
    sheet.getRange(row, 6).insertCheckboxes();

    // Update capacity count
    var capData = sheet.getRange(5, 1, 1, 2).getValues()[0];
    var capStr = capData[1] ? capData[1].toString() : "";
    var capMatch = capStr.match(/(\d+)\s*\/\s*(\d+)/);
    if (capMatch) {
      sheet.getRange(5, 2).setValue((parseInt(capMatch[1]) - 1) + " / " + capMatch[2]);
    }

    // Remove from Scheduled sheet
    removeFromScheduledSheet_(ss, trainingType, sheetName, name);
  }

  generateRostersSilent();
}

function executeMove_(ss, sheet, sheetName, row, name, trainingType, sourceTab, targetClass) {
  // Remove from source
  if (sheetName === OVERVIEW_SHEET_NAME) {
    var BLUE = "#1565C0";
    sheet.getRange(row, 3).setValue("MOVED");
    sheet.getRange(row, 3).setBackground("#BDD7EE").setFontColor(BLUE).setFontWeight("bold");
    sheet.getRange(row, 4).setValue("Moved to " + targetClass.tabName).setFontColor("#666666");

    var classTab = ss.getSheetByName(sourceTab);
    if (classTab) removePersonFromClassTab_(classTab, name);
    removeFromScheduledSheet_(ss, trainingType, sourceTab, name);

  } else {
    var WHITE = "#FFFFFF", ALT_BLUE = "#EBF0F7";
    var rowData = sheet.getRange(row, 1, 1, 7).getValues()[0];
    var rowIdx = rowData[0];
    var rowBg = ((rowIdx - 1) % 2 === 0) ? WHITE : ALT_BLUE;
    sheet.getRange(row, 1, 1, 7).setValues([[rowIdx, "\u2014 open \u2014", "", "", "", false, ""]]);
    sheet.getRange(row, 1, 1, 7).setFontColor("#AAAAAA").setBackground(rowBg);
    sheet.getRange(row, 6).insertCheckboxes();

    var capData = sheet.getRange(5, 1, 1, 2).getValues()[0];
    var capStr = capData[1] ? capData[1].toString() : "";
    var capMatch = capStr.match(/(\d+)\s*\/\s*(\d+)/);
    if (capMatch) {
      sheet.getRange(5, 2).setValue((parseInt(capMatch[1]) - 1) + " / " + capMatch[2]);
    }

    removeFromScheduledSheet_(ss, trainingType, sheetName, name);
  }

  // Add to target
  var added = addPersonToClassTab_(ss, targetClass.tabName, name);
  if (added) {
    addToScheduledSheet_(ss, trainingType, targetClass.tabName, name);
  }

  generateRostersSilent();
}


// ************************************************************
//   4. MANUAL CLASS ASSIGNMENT
// ************************************************************

function manualClassAssignment() {
  var ui = SpreadsheetApp.getUi();

  // Step 1: Pick a training type
  var trainingConfig = promptPickTraining_(ui);
  if (!trainingConfig) return;

  // Run the assignment loop for this training
  runManualAssignmentLoop_(ui, trainingConfig);
}

function offerManualAssignment(ui, ss) {
  var offer = ui.alert(
    "Manual Assignment",
    "Do you want to manually assign anyone to a class roster?",
    ui.ButtonSet.YES_NO
  );
  if (offer !== ui.Button.YES) return;

  var trainingConfig = promptPickTraining_(ui);
  if (!trainingConfig) return;

  runManualAssignmentLoop_(ui, trainingConfig);
}

function runManualAssignmentLoop_(ui, trainingConfig) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Load needs data once for the entire loop
  var rosterResult = buildRosterData(true);
  var allRosters = rosterResult ? rosterResult.allRosters : [];
  var today = rosterResult ? rosterResult.today : new Date();

  // Find needs list for this training
  var rosterData = null;
  for (var r = 0; r < allRosters.length; r++) {
    if (allRosters[r].name === trainingConfig.name) {
      rosterData = allRosters[r];
      break;
    }
  }

  var keepGoing = true;

  while (keepGoing) {
    // Prompt: Do you want to manually assign someone?
    var assignPrompt = ui.alert(
      trainingConfig.name + " — Manual Assignment",
      "Do you want to manually assign someone to " + trainingConfig.name + "?",
      ui.ButtonSet.YES_NO
    );
    if (assignPrompt !== ui.Button.YES) {
      keepGoing = false;
      break;
    }

    // Get name input
    var nameResponse = ui.prompt(
      trainingConfig.name + " — Enter Name",
      "Enter the person's first and last name:",
      ui.ButtonSet.OK_CANCEL
    );
    if (nameResponse.getSelectedButton() !== ui.Button.OK) {
      keepGoing = false;
      break;
    }

    var enteredName = nameResponse.getResponseText().trim();
    if (!enteredName) {
      ui.alert("No name entered. Returning to assignment prompt.");
      continue;
    }

    // ---- CHECK 1: Scan class roster tabs for this person ----
    var alreadyScheduled = scanClassRosterTabs(ss);
    var trainKey = trainingConfig.name.toLowerCase();
    var scheduledMap = alreadyScheduled[trainKey] || {};
    var enteredLower = enteredName.toLowerCase();

    // Fuzzy match against scheduled tabs
    var scheduledMatch = findFuzzyMatch_(enteredLower, scheduledMap);

    if (scheduledMatch.found) {
      var alreadyDate = scheduledMap[scheduledMatch.matchedKey];
      var overridePrompt = ui.alert(
        "Already Scheduled",
        scheduledMatch.displayName + " is already scheduled for " +
        trainingConfig.name + " on " + alreadyDate + ".\n\n" +
        "Do you still want to assign them to another class?",
        ui.ButtonSet.YES_NO
      );
      if (overridePrompt !== ui.Button.YES) continue;
    }

    // ---- CHECK 2: Is this person on the needs list? ----
    var onNeedsList = false;
    var needsInfo = null;

    if (rosterData && !rosterData.error) {
      var buckets = ["expired", "expiringSoon", "needed"];
      for (var b = 0; b < buckets.length; b++) {
        var bucket = rosterData[buckets[b]] || [];
        for (var i = 0; i < bucket.length; i++) {
          if (bucket[i].name.toLowerCase().trim() === enteredLower) {
            onNeedsList = true;
            needsInfo = {
              name: bucket[i].name,
              status: bucket[i].status,
              bucket: buckets[b],
              lastDate: bucket[i].lastDate || "",
              expDate: bucket[i].expDate || ""
            };
            break;
          }
        }
        if (onNeedsList) break;
      }

      // Fuzzy match if exact didn't hit
      if (!onNeedsList) {
        var fuzzyResult = fuzzySearchNeedsList_(enteredLower, rosterData);
        if (fuzzyResult.matches.length > 0) {
          var fuzzyMsg = "Exact name not found on the " + trainingConfig.name +
                         " needs list.\n\nDid you mean one of these?\n\n";
          for (var fm = 0; fm < fuzzyResult.matches.length; fm++) {
            fuzzyMsg += (fm + 1) + ". " + fuzzyResult.matches[fm].name +
                        " (" + fuzzyResult.matches[fm].bucket + ")\n";
          }
          fuzzyMsg += "\nEnter a number to select, or 0 to use the name as typed:";

          var fuzzyChoice = ui.prompt(
            "Similar Names Found",
            fuzzyMsg,
            ui.ButtonSet.OK_CANCEL
          );
          if (fuzzyChoice.getSelectedButton() !== ui.Button.OK) continue;

          var fuzzyIdx = parseInt(fuzzyChoice.getResponseText().trim());
          if (!isNaN(fuzzyIdx) && fuzzyIdx >= 1 && fuzzyIdx <= fuzzyResult.matches.length) {
            var picked = fuzzyResult.matches[fuzzyIdx - 1];
            enteredName = picked.name;
            enteredLower = enteredName.toLowerCase();
            onNeedsList = true;
            needsInfo = picked;
          }
        }
      }
    }

    if (!onNeedsList) {
      var notOnListPrompt = ui.alert(
        "Not on Needs List",
        "\"" + enteredName + "\" was not found on the " + trainingConfig.name +
        " needs list.\n\nThis could mean they're already current, " +
        "not in the system, or the name was entered differently.\n\n" +
        "Do you want to assign them anyway?",
        ui.ButtonSet.YES_NO
      );
      if (notOnListPrompt !== ui.Button.YES) continue;

      // Build a basic info object for people not on the list
      needsInfo = {
        name: enteredName,
        status: "Manual assignment (not on needs list)",
        bucket: "manual",
        lastDate: "",
        expDate: ""
      };
    }

    // ---- STEP: Choose destination (existing tab or new tab) ----
    var destination = promptDestination_(ui, ss, trainingConfig, today);
    if (!destination) continue;

    // ---- WRITE THE ASSIGNMENT ----
    if (destination.type === "existing") {
      appendToExistingTab_(ss, destination.tabName, needsInfo, trainingConfig.name);
      ui.alert(
        "Assignment Complete",
        enteredName + " has been added to:\n" + destination.tabName
      );
    } else if (destination.type === "new") {
      createNewTabWithPerson_(ss, trainingConfig, destination.date, needsInfo, today);
      var newTabName = buildTabName(trainingConfig.name, destination.date);
      ui.alert(
        "Assignment Complete",
        enteredName + " has been added to new tab:\n" + newTabName
      );
    }

    // Refresh Training Rosters to pick up the new scheduled entry
    try {
      generateRostersSilent();
      orderClassRosterTabs(ss);
    } catch (e) {
      Logger.log("Post-assignment refresh error: " + e.toString());
    }
  }
}


// ************************************************************
//   5. MANUAL ASSIGNMENT HELPERS
// ************************************************************

function promptPickTraining_(ui) {
  var msg = "Which training?\n\n";
  for (var i = 0; i < CLASS_ROSTER_CONFIG.length; i++) {
    msg += (i + 1) + ".  " + CLASS_ROSTER_CONFIG[i].name + "\n";
  }
  msg += "\nEnter a number:";

  var response = ui.prompt(
    "Manual Class Assignment — Pick Training",
    msg,
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return null;

  var idx = parseInt(response.getResponseText().trim()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= CLASS_ROSTER_CONFIG.length) {
    ui.alert("Invalid selection.");
    return null;
  }

  return CLASS_ROSTER_CONFIG[idx];
}

function promptDestination_(ui, ss, trainingConfig, today) {
  // Find existing class roster tabs for this training
  var prefixes = getClassRosterPrefixes();
  var sheets = ss.getSheets();
  var existingTabs = [];

  for (var s = 0; s < sheets.length; s++) {
    var name = sheets[s].getName();
    if (name.indexOf(trainingConfig.name + " ") === 0) {
      // Extract date and current count
      var datePart = name.substring(trainingConfig.name.length + 1).trim();
      var parsedDate = parseClassDate(datePart);
      var count = countPeopleOnTab_(sheets[s]);

      existingTabs.push({
        tabName: name,
        date: parsedDate,
        dateStr: datePart,
        count: count
      });
    }
  }

  // Sort by date
  existingTabs.sort(function(a, b) {
    if (a.date && b.date) return a.date - b.date;
    return 0;
  });

  // Build the prompt
  var msg = "Where do you want to assign this person?\n\n";

  if (existingTabs.length > 0) {
    msg += "EXISTING CLASS ROSTER TABS:\n";
    for (var i = 0; i < existingTabs.length; i++) {
      msg += (i + 1) + ".  " + existingTabs[i].tabName +
             " (" + existingTabs[i].count + "/" + trainingConfig.classCapacity + " filled)\n";
    }
    msg += "\n";
  }

  msg += "N.  Create a NEW class roster tab\n";
  msg += "C.  Cancel\n";
  msg += "\nEnter your choice:";

  var response = ui.prompt(
    trainingConfig.name + " — Choose Destination",
    msg,
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return null;

  var input = response.getResponseText().trim().toUpperCase();

  if (input === "C") return null;

  if (input === "N") {
    // Prompt for new class date
    var dateResponse = ui.prompt(
      trainingConfig.name + " — New Class Date",
      "Enter the class date (M/D/YYYY):",
      ui.ButtonSet.OK_CANCEL
    );
    if (dateResponse.getSelectedButton() !== ui.Button.OK) return null;

    var newDate = parseClassDate(dateResponse.getResponseText().trim());
    if (!newDate) {
      ui.alert("Invalid date. Please try again.");
      return null;
    }

    // Check if a tab already exists for this date
    var newTabName = buildTabName(trainingConfig.name, newDate);
    var existingTab = ss.getSheetByName(newTabName);
    if (existingTab) {
      var useExisting = ui.alert(
        "Tab Already Exists",
        "A tab named \"" + newTabName + "\" already exists.\n\n" +
        "Do you want to add to that existing tab instead?",
        ui.ButtonSet.YES_NO
      );
      if (useExisting === ui.Button.YES) {
        return { type: "existing", tabName: newTabName };
      }
      return null;
    }

    return { type: "new", date: newDate };
  }

  // Numeric selection for existing tab
  var idx = parseInt(input) - 1;
  if (!isNaN(idx) && idx >= 0 && idx < existingTabs.length) {
    return { type: "existing", tabName: existingTabs[idx].tabName };
  }

  ui.alert("Invalid selection. Please try again.");
  return null;
}

function appendToExistingTab_(ss, tabName, personInfo, trainingName) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) return;

  var NAVY = "#1F3864";
  var RED = "#C00000";
  var ORANGE = "#E65100";

  var data = sheet.getDataRange().getValues();

  // Find last data row (col B has names, starting after row 8 header in v4, row 7 in legacy)
  var headerRow = 8; // v4 layout
  if (data.length >= 7 && data[6] && data[6][0] && data[6][0].toString().trim() === "#") {
    headerRow = 7; // legacy layout
  }
  var lastDataRow = headerRow;
  for (var r = headerRow; r < data.length; r++) {
    var val = data[r][1] ? data[r][1].toString().trim() : "";
    if (val && val.toLowerCase().indexOf("open seat") === -1 && val !== "— open —") {
      lastDataRow = r + 1; // 1-indexed
    }
  }

  // Determine the next row number in the # column
  var nextNum = 1;
  for (var r = headerRow; r < data.length; r++) {
    var numVal = data[r][0];
    if (typeof numVal === "number" && numVal >= nextNum) {
      nextNum = numVal + 1;
    }
  }

  // Clear any "open seats remaining" row that might be just below
  var insertRow = lastDataRow + 1;
  if (insertRow <= data.length) {
    var belowVal = data[insertRow - 1] ? (data[insertRow - 1][0] || "").toString() : "";
    if (belowVal.toLowerCase().indexOf("open seat") > -1) {
      sheet.getRange(insertRow, 1, 1, 5).clearContent().clearFormat();
    }
  }

  // Build priority label and color
  var priorityLabel = "MANUAL";
  var labelColor = NAVY;

  if (personInfo.bucket === "expired") {
    priorityLabel = "EXPIRED";
    labelColor = RED;
  } else if (personInfo.bucket === "needed") {
    priorityLabel = "NEVER COMPLETED";
    labelColor = NAVY;
  } else if (personInfo.bucket === "expiringSoon") {
    priorityLabel = "EXPIRING SOON";
    labelColor = ORANGE;
  }

  // Write the row (7 columns: #, Name, Status, Last Completed, Priority, Attended, Notes)
  var vals = [nextNum, personInfo.name, personInfo.status, personInfo.lastDate, priorityLabel, false, ""];
  sheet.getRange(insertRow, 1, 1, vals.length).setValues([vals]);
  sheet.getRange(insertRow, 1, 1, vals.length).setFontFamily("Arial").setFontSize(10);
  sheet.getRange(insertRow, 5).setFontColor("#FFFFFF").setBackground(labelColor).setFontWeight("bold");
  sheet.getRange(insertRow, 6, 1, 1).insertCheckboxes();
  if (labelColor !== NAVY) {
    sheet.getRange(insertRow, 3).setFontColor(labelColor);
  }

  // Update the capacity line (row 4) if it exists
  updateCapacityLine_(sheet);
}

function createNewTabWithPerson_(ss, trainingConfig, classDate, personInfo, today) {
  var tabName = buildTabName(trainingConfig.name, classDate);
  var capacity = trainingConfig.classCapacity;

  // Build a classInfo object matching the shape writeClassRosterTab expects
  var classInfo = {
    date: classDate,
    people: [{
      name: personInfo.name,
      status: personInfo.status,
      bucket: personInfo.bucket,
      lastDate: personInfo.lastDate,
      expDate: personInfo.expDate,
      effectiveBucket: personInfo.bucket
    }]
  };

  var existingTab = ss.getSheetByName(tabName);
  if (existingTab) ss.deleteSheet(existingTab);

  var tab = ss.insertSheet(tabName);
  writeClassRosterTab(tab, trainingConfig.name, classInfo, capacity, today);
}

function countPeopleOnTab_(sheet) {
  var data = sheet.getDataRange().getValues();
  var count = 0;
  // Start after headers (row 8 in v4, row 7 in legacy)
  var startRow = 8;
  if (data.length >= 7 && data[6] && data[6][0] && data[6][0].toString().trim() === "#") {
    startRow = 7; // legacy layout
  }
  for (var r = startRow; r < data.length; r++) {
    var val = data[r][1] ? data[r][1].toString().trim() : "";
    if (val && val.toLowerCase().indexOf("open seat") === -1 && val !== "— open —") {
      count++;
    }
  }
  return count;
}

function updateCapacityLine_(sheet) {
  // Row 5 contains "Capacity: X / Y" (updated layout v4)
  // Fall back to row 4 for legacy tabs
  var data = sheet.getDataRange().getValues();
  if (data.length < 5) return;

  var capRow = -1;
  // Check row 5 first (new layout), then row 4 (old layout)
  if (data[4] && data[4][0] && data[4][0].toString().indexOf("Capacity") > -1) {
    capRow = 5;
  } else if (data[3] && data[3][0] && data[3][0].toString().indexOf("Capacity") > -1) {
    capRow = 4;
  }
  if (capRow === -1) return;

  var currentCount = countPeopleOnTab_(sheet);

  // Extract the capacity number from "X / Y"
  var capVal = data[capRow - 1][1] ? data[capRow - 1][1].toString() : "";
  var capParts = capVal.split("/");
  var maxCap = capParts.length === 2 ? capParts[1].trim() : currentCount.toString();

  sheet.getRange(capRow, 2).setValue(currentCount + " / " + maxCap);
}

function findFuzzyMatch_(enteredLower, scheduledMap) {
  // Exact match first
  if (scheduledMap[enteredLower]) {
    return { found: true, matchedKey: enteredLower, displayName: enteredLower };
  }

  // Check for partial matches (entered name appears in a scheduled name or vice versa)
  var keys = Object.keys(scheduledMap);
  for (var k = 0; k < keys.length; k++) {
    // Split both into parts and check if first+last match in any order
    var enteredParts = enteredLower.split(/\s+/);
    var keyParts = keys[k].split(/\s+/);

    if (enteredParts.length >= 2 && keyParts.length >= 2) {
      // Check if first and last name match regardless of ordering or extra middle names
      var enteredFirst = enteredParts[0];
      var enteredLast = enteredParts[enteredParts.length - 1];
      var keyFirst = keyParts[0];
      var keyLast = keyParts[keyParts.length - 1];

      if ((enteredFirst === keyFirst && enteredLast === keyLast) ||
          (enteredFirst === keyLast && enteredLast === keyFirst)) {
        return { found: true, matchedKey: keys[k], displayName: keys[k] };
      }
    }
  }

  return { found: false, matchedKey: null, displayName: null };
}

function fuzzySearchNeedsList_(enteredLower, rosterData) {
  var matches = [];
  var enteredParts = enteredLower.split(/\s+/);

  var buckets = ["expired", "expiringSoon", "needed"];
  for (var b = 0; b < buckets.length; b++) {
    var bucket = rosterData[buckets[b]] || [];
    for (var i = 0; i < bucket.length; i++) {
      var personLower = bucket[i].name.toLowerCase().trim();
      var personParts = personLower.split(/\s+/);

      var score = 0;

      // Check each entered part against each person part
      for (var ep = 0; ep < enteredParts.length; ep++) {
        for (var pp = 0; pp < personParts.length; pp++) {
          if (enteredParts[ep] === personParts[pp]) {
            score += 2; // exact part match
          } else if (personParts[pp].indexOf(enteredParts[ep]) === 0 ||
                     enteredParts[ep].indexOf(personParts[pp]) === 0) {
            score += 1; // starts-with partial match
          }
        }
      }

      if (score >= 2) {
        matches.push({
          name: bucket[i].name,
          status: bucket[i].status,
          bucket: buckets[b],
          lastDate: bucket[i].lastDate || "",
          expDate: bucket[i].expDate || "",
          score: score
        });
      }
    }
  }

  // Sort by score descending, cap at 5 results
  matches.sort(function(a, b) { return b.score - a.score; });
  if (matches.length > 5) matches = matches.slice(0, 5);

  return { matches: matches };
}
