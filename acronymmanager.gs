// ============================================================
// EVC Acronym Manager
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
// Scans the Training sheet for acronyms (2+ consecutive
// uppercase letters), shows you what it found, and creates
// a config tab where you can choose to bold, replace, or
// delete each acronym across the entire sheet.
//
// PASTE THIS INTO: Extensions > Apps Script as a new file
//   (click + next to Files, name it "AcronymManager")
//
// Then add this to your createMenu() in Code.gs:
//   .addItem("Scan for Acronyms", "scanAcronyms")
//   .addItem("Apply Acronym Changes", "applyAcronymChanges")
//
// Or run scanAcronyms directly from the script editor.
// ============================================================

var ACRONYM_CONFIG_SHEET = "Acronym Config";

// ============================================================
// SCAN: Find all acronyms on the Training sheet
// ============================================================
function scanAcronyms() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Training");

  if (!sheet) {
    ui.alert("Error: Could not find a sheet named \"Training\".");
    return;
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  // Regex: 2 or more consecutive uppercase letters, optionally
  // separated by slashes, underscores, or periods
  // Matches: CPR, N/A, MED_TRAIN, FIRSTAID, U.S., etc.
  var acronymRegex = /\b[A-Z][A-Z\/_.]{0,20}[A-Z]\b/g;

  // Also catch standalone 2-letter uppercase combos
  var twoLetterRegex = /\b[A-Z]{2}\b/g;

  var acronymMap = {}; // { acronym: { count, locations[] } }

  for (var r = 0; r < data.length; r++) {
    for (var c = 0; c < data[r].length; c++) {
      var cellVal = String(data[r][c] || "").trim();
      if (!cellVal) continue;

      var found = {};

      // Run both regexes
      var matches = cellVal.match(acronymRegex) || [];
      var twoMatches = cellVal.match(twoLetterRegex) || [];

      // Combine and dedupe within this cell
      var allMatches = matches.concat(twoMatches);
      for (var m = 0; m < allMatches.length; m++) {
        var acr = allMatches[m].trim();
        if (acr.length < 2) continue;
        if (found[acr]) continue;
        found[acr] = true;

        var location = "";
        if (r === 0) {
          location = "Header row, col " + (c + 1);
        } else {
          var personName = "";
          if (data[r][1]) personName = String(data[r][1]).trim();
          if (data[r][0]) personName = String(data[r][0]).trim() + (personName ? ", " + personName : "");
          var colHeader = headers[c] ? String(headers[c]).trim() : "Col " + (c + 1);
          location = "Row " + (r + 1) + " (" + personName + ") | " + colHeader;
        }

        if (!acronymMap[acr]) {
          acronymMap[acr] = { count: 0, locations: [] };
        }
        acronymMap[acr].count++;
        if (acronymMap[acr].locations.length < 10) {
          acronymMap[acr].locations.push(location);
        }
      }
    }
  }

  var acronyms = Object.keys(acronymMap);
  if (acronyms.length === 0) {
    ui.alert("No acronyms found on the Training sheet.");
    return;
  }

  // Sort by count descending
  acronyms.sort(function(a, b) {
    return acronymMap[b].count - acronymMap[a].count;
  });

  // Create/overwrite the Acronym Config tab
  var configSheet = ss.getSheetByName(ACRONYM_CONFIG_SHEET);
  if (configSheet) ss.deleteSheet(configSheet);
  configSheet = ss.insertSheet(ACRONYM_CONFIG_SHEET);

  writeAcronymConfigSheet(configSheet, acronyms, acronymMap);

  // Show summary
  var summary = "Acronym Scan Complete!\n\n";
  summary += "Found " + acronyms.length + " unique acronyms on the Training sheet.\n\n";

  var showCount = Math.min(acronyms.length, 20);
  for (var i = 0; i < showCount; i++) {
    summary += "  " + acronyms[i] + "  (" + acronymMap[acronyms[i]].count + " occurrences)\n";
  }
  if (acronyms.length > 20) {
    summary += "  ...and " + (acronyms.length - 20) + " more\n";
  }

  summary += "\nCheck the \"" + ACRONYM_CONFIG_SHEET + "\" tab to configure actions.\n";
  summary += "\nFor each acronym you can:\n";
  summary += "  • Set Action to \"Bold\" — bolds every occurrence\n";
  summary += "  • Set Action to \"Replace\" — replaces with your text in column D\n";
  summary += "  • Set Action to \"Delete\" — removes the acronym from cells\n";
  summary += "  • Leave Action as \"Skip\" — no changes\n";
  summary += "\nWhen ready, run: EVC Tools > Apply Acronym Changes";

  ui.alert(summary);
}


// ============================================================
// Write the Acronym Config tab
// ============================================================
function writeAcronymConfigSheet(sheet, acronyms, acronymMap) {
  var NAVY = "#1F3864";
  var LIGHT_GRAY = "#F2F2F2";
  var WHITE = "#FFFFFF";

  var row = 1;

  // Title
  sheet.getRange(row, 1, 1, 5).merge();
  sheet.getRange(row, 1).setValue("EVC Acronym Manager");
  sheet.getRange(row, 1).setFontSize(14).setFontWeight("bold")
    .setFontColor(WHITE).setBackground(NAVY).setFontFamily("Arial");
  row++;

  // Instructions
  sheet.getRange(row, 1, 1, 5).merge();
  sheet.getRange(row, 1).setValue(
    "Set the Action for each acronym, then run EVC Tools > Apply Acronym Changes"
  );
  sheet.getRange(row, 1).setFontSize(10).setFontColor("#666666")
    .setFontFamily("Arial").setFontStyle("italic");
  row++;
  row++;

  // Column headers
  var headers = ["Acronym", "Occurrences", "Action", "Replace With", "Sample Locations"];
  sheet.getRange(row, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(row, 1, 1, headers.length)
    .setFontWeight("bold").setBackground(LIGHT_GRAY)
    .setFontFamily("Arial").setFontSize(10);
  row++;

  // Data rows
  for (var i = 0; i < acronyms.length; i++) {
    var acr = acronyms[i];
    var info = acronymMap[acr];

    var sampleLocs = info.locations.join("\n");

    sheet.getRange(row, 1).setValue(acr);
    sheet.getRange(row, 1).setFontWeight("bold").setFontFamily("Courier New").setFontSize(11);

    sheet.getRange(row, 2).setValue(info.count);
    sheet.getRange(row, 2).setHorizontalAlignment("center");

    sheet.getRange(row, 3).setValue("Skip");

    sheet.getRange(row, 4).setValue("");

    sheet.getRange(row, 5).setValue(sampleLocs);
    sheet.getRange(row, 5).setFontSize(9).setFontColor("#888888").setWrap(true);

    row++;
  }

  // Add data validation dropdown for Action column
  var actionRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Skip", "Bold", "Replace", "Delete"])
    .setAllowInvalid(false)
    .build();
  sheet.getRange(5, 3, acronyms.length, 1).setDataValidation(actionRule);

  // Column widths
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(5, 400);

  sheet.setFrozenRows(4);
}


// ============================================================
// APPLY: Process the Acronym Config tab actions
// ============================================================
function applyAcronymChanges() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var configSheet = ss.getSheetByName(ACRONYM_CONFIG_SHEET);
  if (!configSheet) {
    ui.alert("Error: No \"" + ACRONYM_CONFIG_SHEET + "\" tab found.\n\nRun \"Scan for Acronyms\" first.");
    return;
  }

  var trainingSheet = ss.getSheetByName("Training");
  if (!trainingSheet) {
    ui.alert("Error: Could not find a sheet named \"Training\".");
    return;
  }

  // Read the config
  var configData = configSheet.getDataRange().getValues();
  var actions = [];

  for (var r = 4; r < configData.length; r++) {
    var acronym = String(configData[r][0] || "").trim();
    var action = String(configData[r][2] || "").trim();
    var replaceWith = String(configData[r][3] || "").trim();

    if (!acronym || action === "Skip" || !action) continue;

    actions.push({
      acronym: acronym,
      action: action,
      replaceWith: replaceWith
    });
  }

  if (actions.length === 0) {
    ui.alert("No actions configured.\n\nSet the Action column to Bold, Replace, or Delete for the acronyms you want to change, then run this again.");
    return;
  }

  // Confirm
  var confirmMsg = "About to apply these changes to the Training sheet:\n\n";
  for (var a = 0; a < actions.length; a++) {
    var act = actions[a];
    if (act.action === "Bold") {
      confirmMsg += "  BOLD: \"" + act.acronym + "\"\n";
    } else if (act.action === "Replace") {
      confirmMsg += "  REPLACE: \"" + act.acronym + "\" → \"" + act.replaceWith + "\"\n";
    } else if (act.action === "Delete") {
      confirmMsg += "  DELETE: \"" + act.acronym + "\"\n";
    }
  }
  confirmMsg += "\nThis will modify cells on the Training sheet. Continue?";

  var confirm = ui.alert("Confirm Acronym Changes", confirmMsg, ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  // Process the Training sheet
  var data = trainingSheet.getDataRange().getValues();
  var numRows = data.length;
  var numCols = data[0].length;

  var bolded = 0;
  var replaced = 0;
  var deleted = 0;

  for (var r = 0; r < numRows; r++) {
    for (var c = 0; c < numCols; c++) {
      var cellVal = String(data[r][c] || "").trim();
      if (!cellVal) continue;

      var cell = trainingSheet.getRange(r + 1, c + 1);
      var modified = false;
      var newVal = cellVal;

      for (var a = 0; a < actions.length; a++) {
        var act = actions[a];

        if (newVal.indexOf(act.acronym) === -1) continue;

        if (act.action === "Bold") {
          // Bold the entire cell if it contains the acronym
          // (Google Sheets rich text bolding of substrings is
          //  complex, so we bold the whole cell for reliability)
          cell.setFontWeight("bold");
          bolded++;
          modified = true;

        } else if (act.action === "Replace") {
          // Replace all occurrences of the acronym
          var regex = new RegExp(escapeRegex(act.acronym), "g");
          newVal = newVal.replace(regex, act.replaceWith);
          replaced++;
          modified = true;

        } else if (act.action === "Delete") {
          // Remove the acronym and clean up extra spaces
          var regex = new RegExp(escapeRegex(act.acronym), "g");
          newVal = newVal.replace(regex, "").replace(/\s{2,}/g, " ").trim();
          deleted++;
          modified = true;
        }
      }

      if (modified && newVal !== cellVal) {
        cell.setValue(newVal);
      }
    }
  }

  var summary = "Acronym Changes Applied!\n\n";
  summary += "Cells bolded: " + bolded + "\n";
  summary += "Replacements made: " + replaced + "\n";
  summary += "Deletions made: " + deleted + "\n";
  summary += "\nReview the Training sheet to verify changes.";
  summary += "\nIf anything looks wrong, use Ctrl+Z to undo.";

  ui.alert(summary);
}


// ============================================================
// Helper: escape special regex characters
// ============================================================
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
