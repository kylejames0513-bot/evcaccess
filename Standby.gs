// ============================================================
// EVC Training System — Rescheduled & Class Creation
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
//
// CONTENTS:
//   1. Create a Class (menu item)
//   2. Add to Rescheduled (menu item)
//   3. View Rescheduled List (menu item)
//   4. Rescheduled sheet management (read, write, clear)
//   5. Rescheduled display helpers (for Training Rosters)
//
// DEPENDS ON: Config.gs, Utilities.gs, Core.gs, Rosters.gs
//
// ============================================================


var RESCHEDULED_SHEET_NAME = "Rescheduled";


// ************************************************************
//
//   1. CREATE A CLASS
//
//   Menu item: pick training, date, time, location.
//   Shows rescheduled people first, then priority pool.
//   User picks who goes in. Creates the class tab.
//
// ************************************************************

function createClass() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Step 1: Pick training type ──
  var msg = "Which training?\n\n";
  for (var i = 0; i < CLASS_ROSTER_CONFIG.length; i++) {
    msg += (i + 1) + ".  " + CLASS_ROSTER_CONFIG[i].name +
           " (cap " + CLASS_ROSTER_CONFIG[i].classCapacity + ")\n";
  }
  msg += "\nEnter a number:";

  var choice = ui.prompt("Create a Class — Pick Training", msg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;

  var idx = parseInt(choice.getResponseText().trim()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= CLASS_ROSTER_CONFIG.length) {
    ui.alert("Invalid selection.");
    return;
  }

  var config = CLASS_ROSTER_CONFIG[idx];
  var capacity = config.classCapacity;

  // ── Step 2: Enter date ──
  var dateResp = ui.prompt(
    "Create a Class — " + config.name,
    "Enter the class date (M/D/YYYY):",
    ui.ButtonSet.OK_CANCEL
  );
  if (dateResp.getSelectedButton() !== ui.Button.OK) return;

  var classDate = parseClassDate(dateResp.getResponseText().trim());
  if (!classDate) {
    ui.alert("Invalid date. Use M/D/YYYY format.");
    return;
  }

  // Check if tab already exists
  var tabName = buildTabName(config.name, classDate);
  if (ss.getSheetByName(tabName)) {
    var overwrite = ui.alert(
      "Tab Exists",
      "\"" + tabName + "\" already exists.\n\nDelete it and create a new one?",
      ui.ButtonSet.YES_NO
    );
    if (overwrite !== ui.Button.YES) return;
  }

  // ── Step 3: Enter time ──
  var timeResp = ui.prompt(
    "Create a Class — " + config.name,
    "Enter the class time (e.g., 9am to 1pm):\n\nLeave blank to fill in later.",
    ui.ButtonSet.OK_CANCEL
  );
  if (timeResp.getSelectedButton() !== ui.Button.OK) return;
  var classTime = timeResp.getResponseText().trim();

  // ── Step 4: Enter location ──
  var locResp = ui.prompt(
    "Create a Class — " + config.name,
    "Enter the location (e.g., Training Room A):\n\nLeave blank to fill in later.",
    ui.ButtonSet.OK_CANCEL
  );
  if (locResp.getSelectedButton() !== ui.Button.OK) return;
  var classLocation = locResp.getResponseText().trim();

  // ── Step 5: Build the candidate list ──

  // Get rescheduled people
  var allRescheduled = readRescheduledList_();
  var reschedThisDate = [];
  var reschedNext = [];
  var classDateStr = formatClassDate(classDate);

  for (var s = 0; s < allRescheduled.length; s++) {
    var sb = allRescheduled[s];
    if (sb.training.toLowerCase() !== config.name.toLowerCase()) continue;

    if (sb.targetDate === "next") {
      reschedNext.push(sb);
    } else if (sb.targetDate === classDateStr) {
      reschedThisDate.push(sb);
    } else {
      var sbDate = parseClassDate(sb.targetDate);
      if (sbDate && sbDate.getTime() === classDate.getTime()) {
        reschedThisDate.push(sb);
      }
    }
  }

  // Get priority pool (needs list minus already scheduled)
  var rosterResult = buildRosterData(true);
  if (!rosterResult) { ui.alert("Could not read Training sheet."); return; }

  var alreadyScheduled = buildFullScheduledMap_(ss);
  var rosterData = null;
  for (var r = 0; r < rosterResult.allRosters.length; r++) {
    if (rosterResult.allRosters[r].name === config.name) {
      rosterData = rosterResult.allRosters[r];
      break;
    }
  }

  var pool = [];
  if (rosterData && !rosterData.error) {
    pool = buildPriorityPool(rosterData, alreadyScheduled, config.name);
  }

  // Remove rescheduled people from the pool (they're listed separately)
  var reschedNames = {};
  for (var s = 0; s < reschedThisDate.length; s++) reschedNames[reschedThisDate[s].name.toLowerCase().trim()] = true;
  for (var s = 0; s < reschedNext.length; s++) reschedNames[reschedNext[s].name.toLowerCase().trim()] = true;
  pool = pool.filter(function(p) { return !reschedNames[p.name.toLowerCase().trim()]; });

  // ── Step 6: Show the selection list ──

  var totalCandidates = reschedThisDate.length + reschedNext.length + pool.length;

  if (totalCandidates === 0) {
    var proceed = ui.alert(
      "No Candidates",
      "No one needs " + config.name + " right now.\n\n" +
      "Create an empty class roster tab anyway?",
      ui.ButtonSet.YES_NO
    );
    if (proceed !== ui.Button.YES) return;

    // Create empty tab
    createClassTab_(ss, config, classDate, classTime, classLocation, [], rosterResult.today);
    ui.alert("Created empty class: " + tabName);
    return;
  }

  var selMsg = config.name + " — " + classDateStr + "\n";
  selMsg += "Capacity: " + capacity + " seats\n";
  selMsg += "─────────────────────\n\n";

  var candidateList = []; // unified numbered list
  var num = 1;

  if (reschedThisDate.length > 0) {
    selMsg += "★ RESCHEDULED — THIS DATE (" + reschedThisDate.length + "):\n";
    for (var i = 0; i < reschedThisDate.length; i++) {
      selMsg += "  " + num + ".  " + reschedThisDate[i].name + "\n";
      candidateList.push({ name: reschedThisDate[i].name, source: "resched-date", reschedRow: reschedThisDate[i].row,
        status: "Rescheduled (" + reschedThisDate[i].targetDate + ")", bucket: "needed" });
      num++;
    }
    selMsg += "\n";
  }

  if (reschedNext.length > 0) {
    selMsg += "★ RESCHEDULED — NEXT AVAILABLE (" + reschedNext.length + "):\n";
    for (var i = 0; i < reschedNext.length; i++) {
      selMsg += "  " + num + ".  " + reschedNext[i].name + "\n";
      candidateList.push({ name: reschedNext[i].name, source: "resched-next", reschedRow: reschedNext[i].row,
        status: "Rescheduled (next)", bucket: "needed" });
      num++;
    }
    selMsg += "\n";
  }

  if (pool.length > 0) {
    var showPool = Math.min(pool.length, 40);
    selMsg += "PRIORITY POOL (" + pool.length + "):\n";
    for (var i = 0; i < showPool; i++) {
      var p = pool[i];
      var tag = "";
      if (p.bucket === "expired") tag = " [EXPIRED]";
      else if (p.bucket === "needed") tag = " [NEEDS]";
      else if (p.bucket === "expiringSoon") tag = " [EXPIRING]";
      selMsg += "  " + num + ".  " + p.name + tag + "\n";
      candidateList.push({ name: p.name, source: "pool", reschedRow: -1,
        status: p.status, bucket: p.bucket, lastDate: p.lastDate || "", expDate: p.expDate || "" });
      num++;
    }
    if (pool.length > 40) {
      selMsg += "  ...and " + (pool.length - 40) + " more (not shown)\n";
    }
    selMsg += "\n";
  }

  selMsg += "Enter numbers to enroll (comma-separated).\n";
  selMsg += "Example: 1,2,3,5,8\n";
  selMsg += "Or type ALL to take the first " + capacity + ".\n";

  var pickResp = ui.prompt("Create a Class — Select People", selMsg, ui.ButtonSet.OK_CANCEL);
  if (pickResp.getSelectedButton() !== ui.Button.OK) return;

  var pickInput = pickResp.getResponseText().trim();
  var selectedPeople = [];

  if (pickInput.toUpperCase() === "ALL") {
    // Take rescheduled first, then pool, up to capacity
    for (var i = 0; i < candidateList.length && selectedPeople.length < capacity; i++) {
      selectedPeople.push(candidateList[i]);
    }
  } else {
    var picks = pickInput.split(",");
    for (var p = 0; p < picks.length; p++) {
      var pickIdx = parseInt(picks[p].trim()) - 1;
      if (!isNaN(pickIdx) && pickIdx >= 0 && pickIdx < candidateList.length) {
        // Avoid duplicates
        var already = false;
        for (var a = 0; a < selectedPeople.length; a++) {
          if (selectedPeople[a].name === candidateList[pickIdx].name) { already = true; break; }
        }
        if (!already) selectedPeople.push(candidateList[pickIdx]);
      }
    }
  }

  if (selectedPeople.length === 0) {
    var proceed = ui.alert(
      "No one selected.\n\nCreate an empty class roster tab anyway?",
      ui.ButtonSet.YES_NO
    );
    if (proceed !== ui.Button.YES) return;
  }

  if (selectedPeople.length > capacity) {
    ui.alert("You selected " + selectedPeople.length + " people but capacity is " +
             capacity + ".\n\nOnly the first " + capacity + " will be enrolled.");
    selectedPeople = selectedPeople.slice(0, capacity);
  }

  // ── Step 7: Create the class tab ──

  createClassTab_(ss, config, classDate, classTime, classLocation, selectedPeople, rosterResult.today);

  // ── Step 8: Clear rescheduled entries for enrolled people ──

  var clearedResched = 0;
  for (var i = 0; i < selectedPeople.length; i++) {
    if (selectedPeople[i].source === "resched-date" || selectedPeople[i].source === "resched-next") {
      removeFromRescheduled_(ss, selectedPeople[i].name, config.name);
      clearedResched++;
    }
  }

  // Refresh rosters
  generateRostersSilent();
  orderClassRosterTabs(ss);

  // ── Summary ──
  var summary = "Class Created!\n\n";
  summary += "Training: " + config.name + "\n";
  summary += "Date: " + classDateStr + "\n";
  if (classTime) summary += "Time: " + classTime + "\n";
  if (classLocation) summary += "Location: " + classLocation + "\n";
  summary += "Enrolled: " + selectedPeople.length + " / " + capacity + "\n";
  if (clearedResched > 0) summary += "Cleared from rescheduled: " + clearedResched + "\n";
  summary += "\nTab: " + tabName;
  summary += "\nTraining Rosters refreshed.";

  ui.alert(summary);
}


/**
 * createClassTab_ — builds the class roster tab with selected people.
 */
function createClassTab_(ss, config, classDate, classTime, classLocation, selectedPeople, today) {
  var tabName = buildTabName(config.name, classDate);
  var capacity = config.classCapacity;

  // Build people array in the format writeClassRosterTab expects
  var people = [];
  for (var i = 0; i < selectedPeople.length; i++) {
    var sp = selectedPeople[i];
    people.push({
      name: sp.name,
      status: sp.status || "Enrolled",
      bucket: sp.bucket || "needed",
      lastDate: sp.lastDate || "",
      expDate: sp.expDate || "",
      effectiveBucket: sp.bucket || "needed"
    });
  }

  var classInfo = { date: classDate, people: people };

  var existing = ss.getSheetByName(tabName);
  if (existing) ss.deleteSheet(existing);

  var tab = ss.insertSheet(tabName);
  writeClassRosterTab(tab, config.name, classInfo, capacity, today);

  if (classTime) tab.getRange(3, 2).setValue(classTime);
  if (classLocation) tab.getRange(3, 4).setValue(classLocation);
}


// ************************************************************
//
//   2. ADD TO RESCHEDULED (menu item)
//
// ************************************************************

function addToRescheduled() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Pick training
  var msg = "Which training?\n\n";
  for (var i = 0; i < CLASS_ROSTER_CONFIG.length; i++) {
    msg += (i + 1) + ".  " + CLASS_ROSTER_CONFIG[i].name + "\n";
  }
  msg += "\nEnter a number:";

  var choice = ui.prompt("Add to Rescheduled — Pick Training", msg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;

  var idx = parseInt(choice.getResponseText().trim()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= CLASS_ROSTER_CONFIG.length) {
    ui.alert("Invalid selection.");
    return;
  }
  var training = CLASS_ROSTER_CONFIG[idx].name;

  // Enter name
  var nameResp = ui.prompt(
    "Add to Rescheduled — " + training,
    "Enter the person's name (First Last):",
    ui.ButtonSet.OK_CANCEL
  );
  if (nameResp.getSelectedButton() !== ui.Button.OK) return;
  var name = nameResp.getResponseText().trim();
  if (!name) { ui.alert("No name entered."); return; }

  // Enter date or "next"
  var dateResp = ui.prompt(
    "Add to Rescheduled — " + training,
    "Enter the target class date (M/D/YYYY)\nor type NEXT for the next available class:",
    ui.ButtonSet.OK_CANCEL
  );
  if (dateResp.getSelectedButton() !== ui.Button.OK) return;

  var dateInput = dateResp.getResponseText().trim();
  var targetDate = "next";

  if (dateInput.toUpperCase() !== "NEXT") {
    var parsed = parseClassDate(dateInput);
    if (!parsed) {
      ui.alert("Invalid date. Use M/D/YYYY or type NEXT.");
      return;
    }
    targetDate = formatClassDate(parsed);
  }

  // Check if already on rescheduled list
  var existing = readRescheduledList_();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].name.toLowerCase().trim() === name.toLowerCase().trim() &&
        existing[i].training.toLowerCase() === training.toLowerCase()) {
      ui.alert(name + " is already on the rescheduled list for " + training +
               " (" + existing[i].targetDate + ").\n\nRemove the existing entry first if you want to change the date.");
      return;
    }
  }

  writeRescheduledEntry_(ss, name, training, targetDate, "Manual");

  // Refresh rosters so the Scheduled column updates immediately
  generateRostersSilent();

  ui.alert("Added to rescheduled!\n\n" +
           "Name: " + name + "\n" +
           "Training: " + training + "\n" +
           "Target: " + targetDate);
}

// Keep old name as alias for backward compatibility with existing triggers
var addToStandby = addToRescheduled;


// ************************************************************
//
//   3. VIEW RESCHEDULED LIST (menu item)
//
// ************************************************************

function viewRescheduledList() {
  var ui = SpreadsheetApp.getUi();
  var list = readRescheduledList_();

  if (list.length === 0) {
    ui.alert("No one is on the rescheduled list.");
    return;
  }

  var msg = "Current Rescheduled List (" + list.length + "):\n\n";

  // Group by training
  var byTraining = {};
  for (var i = 0; i < list.length; i++) {
    var key = list[i].training;
    if (!byTraining[key]) byTraining[key] = [];
    byTraining[key].push(list[i]);
  }

  var trainings = Object.keys(byTraining).sort();
  for (var t = 0; t < trainings.length; t++) {
    msg += trainings[t] + ":\n";
    var entries = byTraining[trainings[t]];
    for (var e = 0; e < entries.length; e++) {
      msg += "  " + entries[e].name + " → " + entries[e].targetDate +
             " (added " + entries[e].dateAdded + ")\n";
    }
    msg += "\n";
  }

  msg += "To remove someone, use Smart Remove or edit the Rescheduled sheet directly (it's hidden — right-click column headers to unhide).";

  ui.alert(msg);
}

// Keep old name as alias for backward compatibility with existing triggers
var viewStandbyList = viewRescheduledList;


// ************************************************************
//
//   4. RESCHEDULED SHEET MANAGEMENT
//
// ************************************************************

/**
 * getOrCreateRescheduledSheet_ — creates the Rescheduled sheet if
 * it doesn't exist, with headers. Always hidden.
 */
function getOrCreateRescheduledSheet_(ss) {
  var sheet = ss.getSheetByName(RESCHEDULED_SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(RESCHEDULED_SHEET_NAME);
  sheet.getRange(1, 1, 1, 5).setValues([["Name", "Training", "Target Date", "Date Added", "Source"]]);
  sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#1F3864").setFontColor("#FFFFFF");
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 120);
  sheet.setFrozenRows(1);
  sheet.hideSheet();

  return sheet;
}

/**
 * writeRescheduledEntry_ — adds a row to the Rescheduled sheet.
 */
function writeRescheduledEntry_(ss, name, training, targetDate, source) {
  var sheet = getOrCreateRescheduledSheet_(ss);
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "M/d/yyyy");
  sheet.appendRow([name, training, targetDate, today, source || ""]);
}

/**
 * readRescheduledList_ — reads all rescheduled entries.
 * Returns array of { name, training, targetDate, dateAdded, source, row }.
 */
function readRescheduledList_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RESCHEDULED_SHEET_NAME);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];

  for (var r = 1; r < data.length; r++) {
    var name = data[r][0] ? data[r][0].toString().trim() : "";
    var training = data[r][1] ? data[r][1].toString().trim() : "";
    if (!name || !training) continue;

    var targetDate = data[r][2] ? data[r][2].toString().trim() : "next";
    // Handle Date objects in target date column
    if (data[r][2] instanceof Date && !isNaN(data[r][2].getTime())) {
      targetDate = formatClassDate(data[r][2]);
    }

    var dateAdded = data[r][3] ? data[r][3].toString().trim() : "";
    if (data[r][3] instanceof Date && !isNaN(data[r][3].getTime())) {
      dateAdded = formatClassDate(data[r][3]);
    }

    var source = data[r][4] ? data[r][4].toString().trim() : "";

    list.push({
      name: name,
      training: training,
      targetDate: targetDate,
      dateAdded: dateAdded,
      source: source,
      row: r + 1  // 1-indexed sheet row
    });
  }

  return list;
}

// Backward-compatible aliases
var readStandbyList_ = readRescheduledList_;

/**
 * removeFromRescheduled_ — removes a specific person + training from rescheduled list.
 */
function removeFromRescheduled_(ss, name, training) {
  var sheet = ss.getSheetByName(RESCHEDULED_SHEET_NAME);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  var nameLower = name.toLowerCase().trim();
  var trainingLower = training.toLowerCase().trim();

  // Delete from bottom to top to preserve row indices
  for (var r = data.length - 1; r >= 1; r--) {
    var rowName = data[r][0] ? data[r][0].toString().trim().toLowerCase() : "";
    var rowTraining = data[r][1] ? data[r][1].toString().trim().toLowerCase() : "";

    if (rowName === nameLower && rowTraining === trainingLower) {
      sheet.deleteRow(r + 1);
    }
  }
}

// Backward-compatible alias
var removeFromStandby_ = removeFromRescheduled_;

/**
 * addToRescheduledFromSmartRemove_ — called by smartRemove after
 * removing someone who still needs training. Prompts for date.
 */
function addToRescheduledFromSmartRemove_(ui, ss, name, trainingType) {
  var addPrompt = ui.alert(
    "Add to Rescheduled?",
    name + " still needs " + trainingType + ".\n\n" +
    "Add them to the rescheduled list so they populate\n" +
    "first when a new class is created?",
    ui.ButtonSet.YES_NO
  );

  if (addPrompt !== ui.Button.YES) return;

  var dateResp = ui.prompt(
    "Rescheduled — Target Date",
    "Enter the target class date (M/D/YYYY)\nor type NEXT for the next available class:",
    ui.ButtonSet.OK_CANCEL
  );
  if (dateResp.getSelectedButton() !== ui.Button.OK) return;

  var dateInput = dateResp.getResponseText().trim();
  var targetDate = "next";

  if (dateInput.toUpperCase() !== "NEXT") {
    var parsed = parseClassDate(dateInput);
    if (parsed) {
      targetDate = formatClassDate(parsed);

      // Check if a class tab exists for this date
      var allClasses = findAllFutureClasses_(ss, trainingType, "");
      for (var i = 0; i < allClasses.length; i++) {
        if (allClasses[i].classDate.getTime() === parsed.getTime()) {
          var existingClass = allClasses[i];
          var classMsg = existingClass.tabName + " exists";
          if (existingClass.isFull) {
            classMsg += " (FULL — " + existingClass.filled + "/" + existingClass.capacity + ").\n\n" +
                        "1. Add to this class anyway (over capacity)\n" +
                        "2. Add to rescheduled for this date\n" +
                        "3. Cancel";
          } else {
            classMsg += " (" + existingClass.openSeats + " open).\n\n" +
                        "1. Add directly to this class\n" +
                        "2. Add to rescheduled for this date\n" +
                        "3. Cancel";
          }
          var directChoice = ui.prompt("Class Found", classMsg, ui.ButtonSet.OK_CANCEL);
          if (directChoice.getSelectedButton() !== ui.Button.OK) return;
          var directPick = directChoice.getResponseText().trim();

          if (directPick === "1") {
            // Add directly to the class tab
            var added = addPersonToClassTab_(ss, existingClass.tabName, name);
            if (added) {
              addToScheduledSheet_(ss, trainingType, existingClass.tabName, name);
              generateRostersSilent();
              ui.alert("Added " + name + " to " + existingClass.tabName +
                       (existingClass.isFull ? " (over capacity)" : "") +
                       "!\n\nTraining Rosters refreshed.");
            } else {
              ui.alert("Could not add to " + existingClass.tabName + " — no open seat rows found.\nAdding to rescheduled instead.");
              writeRescheduledEntry_(ss, name, trainingType, targetDate, "Smart Remove");
              generateRostersSilent();
            }
            return;
          } else if (directPick === "2") {
            // Fall through to write rescheduled
            break;
          } else {
            return;
          }
        }
      }
    } else {
      ui.alert("Invalid date — defaulting to 'next available'.");
    }
  } else {
    // "NEXT" — check if any class with open seats exists right now
    var openClasses = findAllClassesWithOpenSeats_(ss, trainingType, "");
    if (openClasses.length > 0) {
      var nextClass = openClasses[0];
      var nextMsg = nextClass.tabName + " has " + nextClass.openSeats + " open seat(s).\n\n" +
                    "1. Add directly to this class now\n" +
                    "2. Add to rescheduled (next available)\n" +
                    "3. Cancel";
      var nextChoice = ui.prompt("Class Available Now", nextMsg, ui.ButtonSet.OK_CANCEL);
      if (nextChoice.getSelectedButton() !== ui.Button.OK) return;
      var nextPick = nextChoice.getResponseText().trim();

      if (nextPick === "1") {
        var added = addPersonToClassTab_(ss, nextClass.tabName, name);
        if (added) {
          addToScheduledSheet_(ss, trainingType, nextClass.tabName, name);
          generateRostersSilent();
          ui.alert("Added " + name + " to " + nextClass.tabName + "!\n\nTraining Rosters refreshed.");
        } else {
          ui.alert("Could not add — adding to rescheduled instead.");
          writeRescheduledEntry_(ss, name, trainingType, "next", "Smart Remove");
          generateRostersSilent();
        }
        return;
      } else if (nextPick !== "2") {
        return;
      }
      // Fall through to write rescheduled
    }
  }

  writeRescheduledEntry_(ss, name, trainingType, targetDate, "Smart Remove");
  generateRostersSilent();

  ui.alert("Added to rescheduled!\n\n" + name + " → " + trainingType + " (" + targetDate + ")");
}

// Backward-compatible alias
var addToStandbyFromSmartRemove_ = addToRescheduledFromSmartRemove_;


// ************************************************************
//
//   5. RESCHEDULED DISPLAY — for Training Rosters
//
//   Returns a map: { "training_name": { "person_name": "date" } }
//   Used by writeRosterSheet to show rescheduled info in the
//   Scheduled column alongside class roster tab data.
//
// ************************************************************

/**
 * buildRescheduledMap_ — reads rescheduled list and returns a lookup map.
 * Keys are lowercased training name → lowercased person name → display string.
 */
function buildRescheduledMap_() {
  var reschedMap = {};
  var list = readRescheduledList_();

  for (var i = 0; i < list.length; i++) {
    var trainKey = list[i].training.toLowerCase().trim();
    if (!reschedMap[trainKey]) reschedMap[trainKey] = {};
    reschedMap[trainKey][list[i].name.toLowerCase().trim()] = list[i].targetDate;
  }

  return reschedMap;
}

// Backward-compatible alias
var buildStandbyMap_ = buildRescheduledMap_;
