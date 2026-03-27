// ============================================================
// EVC Manual Class Assignment — Add-on Module
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
// PASTE THIS INTO: Extensions > Apps Script as a NEW file
//   (click the + next to Files, name it "ManualAssignment")
//   Do NOT replace Code.gs or ClassRosters.gs.
//
// MENU: Add this line to your createMenu() in Code.gs:
//   .addItem("Manual Class Assignment", "manualClassAssignment")
//
// This module is also called at the end of generateClassRosters()
// via the offerManualAssignment() hook.
// ============================================================


// ************************************************************
//
//   MAIN ENTRY: Manual Class Assignment (standalone)
//
// ************************************************************

function manualClassAssignment() {
  var ui = SpreadsheetApp.getUi();

  // Step 1: Pick a training type
  var trainingConfig = promptPickTraining_(ui);
  if (!trainingConfig) return;

  // Run the assignment loop for this training
  runManualAssignmentLoop_(ui, trainingConfig);
}


// ************************************************************
//
//   HOOK: Called from generateClassRosters()
//   Paste the call to this at the end of generateClassRosters,
//   right before the final ui.alert(summary):
//
//     offerManualAssignment(ui, ss);
//
// ************************************************************

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


// ************************************************************
//
//   ASSIGNMENT LOOP
//
// ************************************************************

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
//
//   DESTINATION PICKER
//
// ************************************************************

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


// ************************************************************
//
//   WRITING TO TABS
//
// ************************************************************

// ============================================================
// appendToExistingTab_ — adds a person to the bottom of an
// existing class roster tab. Finds the last occupied row in
// col B (names column) and appends below it. Updates the
// seat counter at the top if detectable.
// ============================================================
function appendToExistingTab_(ss, tabName, personInfo, trainingName) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) return;

  var NAVY = "#1F3864";
  var RED = "#C00000";
  var ORANGE = "#E65100";

  var data = sheet.getDataRange().getValues();

  // Find last data row (col B has names, starting after row 7 header)
  var lastDataRow = 7; // header row is 7
  for (var r = 7; r < data.length; r++) {
    var val = data[r][1] ? data[r][1].toString().trim() : "";
    if (val && val.toLowerCase().indexOf("open seat") === -1) {
      lastDataRow = r + 1; // 1-indexed
    }
  }

  // Determine the next row number in the # column
  var nextNum = 1;
  for (var r = 7; r < data.length; r++) {
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

  // Write the row
  var vals = [nextNum, personInfo.name, personInfo.status, personInfo.lastDate, priorityLabel];
  sheet.getRange(insertRow, 1, 1, vals.length).setValues([vals]);
  sheet.getRange(insertRow, 1, 1, vals.length).setFontFamily("Arial").setFontSize(10);
  sheet.getRange(insertRow, 5).setFontColor("#FFFFFF").setBackground(labelColor).setFontWeight("bold");
  if (labelColor !== NAVY) {
    sheet.getRange(insertRow, 3).setFontColor(labelColor);
  }

  // Update the capacity line (row 4) if it exists
  updateCapacityLine_(sheet);
}

// ============================================================
// createNewTabWithPerson_ — creates a brand new class roster
// tab with a single person on it (same format as the auto
// generated tabs from generateClassRosters)
// ============================================================
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


// ************************************************************
//
//   HELPER: Count people on a class roster tab
//
// ************************************************************

function countPeopleOnTab_(sheet) {
  var data = sheet.getDataRange().getValues();
  var count = 0;
  for (var r = 7; r < data.length; r++) {
    var val = data[r][1] ? data[r][1].toString().trim() : "";
    if (val && val.toLowerCase().indexOf("open seat") === -1) {
      count++;
    }
  }
  return count;
}


// ************************************************************
//
//   HELPER: Update capacity line on a class roster tab
//
// ************************************************************

function updateCapacityLine_(sheet) {
  // Row 4 should contain "Capacity: X / Y"
  var data = sheet.getDataRange().getValues();
  if (data.length < 4) return;

  var label = data[3][0] ? data[3][0].toString() : "";
  if (label.indexOf("Capacity") === -1) return;

  var currentCount = countPeopleOnTab_(sheet);

  // Extract the capacity number from "X / Y"
  var capVal = data[3][1] ? data[3][1].toString() : "";
  var capParts = capVal.split("/");
  var maxCap = capParts.length === 2 ? capParts[1].trim() : currentCount.toString();

  sheet.getRange(4, 2).setValue(currentCount + " / " + maxCap);
}


// ************************************************************
//
//   HELPER: Fuzzy name matching against scheduled map
//
// ************************************************************

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


// ************************************************************
//
//   HELPER: Fuzzy search against the needs list
//
// ************************************************************

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


// ************************************************************
//
//   HELPER: Training picker prompt
//
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


// ************************************************************
//
//   UPDATED createMenu — add the new item
//
// ************************************************************
// Add this line inside your createMenu() function in Code.gs,
// after the "Generate Class Rosters" line:
//
//   .addItem("Manual Class Assignment", "manualClassAssignment")
//
// And add this line at the end of generateClassRosters(),
// right BEFORE the final ui.alert(summary):
//
//   offerManualAssignment(ui, ss);
//
// ************************************************************
