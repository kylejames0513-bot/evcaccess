// ============================================================
// EVC Training Attendance - Google Apps Script Backend (v8.2)
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
// COMBINED: Training Records + Training Access + Roster Generator
//
// When a training record is added (form, backfill, or batch),
// the Training sheet AND Training Rosters tab auto-update.
//
// Staff scan QR > enter name > arrival time auto-captured
// Management sets session end time + length via EVC Tools menu
// ============================================================
// v8.2 CHANGES:
//   - Section 5 (Roster Generator) restored
//   - writeRosterSheet moved to ClassRosters.gs (has Scheduled col)
//   - Menu updated with "Generate Class Rosters"
// ============================================================
// PASTE THIS INTO: Extensions > Apps Script > Code.gs
// Run setupSheet ONCE (only if starting fresh)
// Deploy > New deployment > Web app > Execute as Me > Anyone
// Copy the NEW URL into the HTML form
// ============================================================

// ============================================================
// CONFIGURATION
// ============================================================

// Training Access tracker lives on Sheet 2 ("Training") in THIS workbook
var TRAINING_ACCESS_SHEET_NAME = "Training";

// Name of the output roster tab (created or overwritten each run)
var ROSTER_SHEET_NAME = "Training Rosters";

// ============================================================
// Mapping: form dropdown values -> Training Access column headers
// Values are ARRAYS so a session can write to multiple columns
// ============================================================
var SESSION_TO_COLUMN = {
  // ---- QR form values (original) ----
  "CPR":                          ["CPR", "FIRSTAID"],
  "Ukeru":                        ["Ukeru"],
  "Initial Med Training (4 Days)":["MED_TRAIN"],
  "Post Med":                     ["POST MED"],
  "POMs Training":                ["POM"],
  "Mealtime":                     ["Mealtime"],
  "Person Centered Thinking":     ["Pers Cent Thnk"],
  "Van Lyft Training":            ["VR"],

  // ---- Alternate / pasted names ----
  "CPR/FA":                       ["CPR", "FIRSTAID"],
  "UKERU":                        ["Ukeru"],
  "Initial Med Class":            ["MED_TRAIN"],
  "Med Recert":                   ["MED_TRAIN"],
  "Med Cert":                     ["MED_TRAIN"],
  "Person Centered":              ["Pers Cent Thnk"],
  "Personal Outcome Measures":    ["POM"]
};

// ============================================================
// ROSTER GENERATOR CONFIG
// ============================================================

/**
 * TRAINING_CONFIG
 *
 *   name:         Display name on the roster output
 *   column:       Exact header text on the Training sheet
 *   renewalYears: Number of years before expiration
 *                 Set to 0 for "indefinite" (one and done,
 *                 never expires once completed)
 *   required:     If true, EVERYONE must have this training
 *                 regardless of excusal codes. If false, any
 *                 non-date text in the cell means they are
 *                 excused from that training.
 *   prerequisite: (optional) Column header of another training
 *                 that must be completed before this one applies.
 *                 If set, only people with a valid date in the
 *                 prerequisite column will be checked.
 *
 * Add, remove, or edit entries as needed.
 */
var TRAINING_CONFIG = [
  { name: "CPR/FA",             column: "CPR",            renewalYears: 2, required: true },
  { name: "Ukeru",              column: "Ukeru",          renewalYears: 0, required: false },
  { name: "Mealtime",           column: "Mealtime",       renewalYears: 0, required: false },
  { name: "Med Recert",           column: "MED_TRAIN",      renewalYears: 3, required: false, onlyExpired: true },
  { name: "Initial Med Training", column: "MED_TRAIN",      renewalYears: 0, required: false, onlyNeeded: true },
  { name: "Post Med",           column: "POST MED",       renewalYears: 0, required: false, prerequisite: "MED_TRAIN" },
  { name: "POMs",               column: "POM",            renewalYears: 0, required: false },
  { name: "Person Centered",    column: "Pers Cent Thnk", renewalYears: 0, required: false },
  { name: "Van/Lift Training",  column: "VR",             renewalYears: 0, required: false }
];

// How many days before expiration to flag someone as "Expiring Soon"
var EXPIRING_SOON_DAYS = 60;

// ============================================================
// Common nickname mappings (shared across all functions)
// ============================================================
var NICKNAMES = {
  "mike": ["michael", "micheal"], "michael": ["mike"], "micheal": ["mike"],
  "bob": ["robert"], "robert": ["bob", "bobby"], "bobby": ["robert", "bob"],
  "bill": ["william"], "william": ["bill", "will", "billy"], "will": ["william"],
  "jim": ["james"], "james": ["jim", "jimmy"], "jimmy": ["james"],
  "joe": ["joseph"], "joseph": ["joe", "joey"],
  "tom": ["thomas"], "thomas": ["tom", "tommy"],
  "dick": ["richard"], "richard": ["dick", "rick", "rich"],
  "rick": ["richard"], "rich": ["richard"],
  "dan": ["daniel"], "daniel": ["dan", "danny"], "danny": ["daniel"],
  "dave": ["david"], "david": ["dave"],
  "steve": ["steven", "stephen"], "steven": ["steve"], "stephen": ["steve"],
  "matt": ["matthew", "mathew"], "matthew": ["matt"], "mathew": ["matt"],
  "chris": ["christopher", "christian"], "christopher": ["chris"], "christian": ["chris"],
  "pat": ["patricia", "patrick"], "patricia": ["pat", "patty"], "patrick": ["pat"],
  "jen": ["jennifer"], "jennifer": ["jen", "jenny"], "jenny": ["jennifer"],
  "liz": ["elizabeth"], "elizabeth": ["liz", "beth", "betsy"],
  "beth": ["elizabeth"], "betsy": ["elizabeth"],
  "kate": ["katherine", "kathryn", "kathy"], "kathy": ["katherine", "kathryn", "katharine"],
  "katie": ["katherine", "kathryn"],
  "sue": ["susan"], "susan": ["sue", "susie"], "susie": ["susan"],
  "meg": ["megan", "meghan"], "megan": ["meg"], "meghan": ["meg"],
  "sam": ["samantha", "samuel"], "samantha": ["sam"], "samuel": ["sam"],
  "tony": ["anthony", "antonio"], "anthony": ["tony"], "antonio": ["tony"],
  "nick": ["nicholas"], "nicholas": ["nick"],
  "alex": ["alexander", "alexandra", "alexis"], "alexander": ["alex"], "alexandra": ["alex"],
  "ed": ["edward", "edgar"], "edward": ["ed", "eddie"], "edgar": ["ed"],
  "josh": ["joshua"], "joshua": ["josh"],
  "jon": ["jonathan", "jonathon"], "jonathan": ["jon"],
  "tim": ["timothy"], "timothy": ["tim"],
  "larry": ["lawrence"], "lawrence": ["larry"],
  "cindy": ["cynthia"], "cynthia": ["cindy"],
  "sandy": ["sandra", "sandi"], "sandra": ["sandy", "sandi"], "sandi": ["sandra", "sandy"],
  "barb": ["barbara"], "barbara": ["barb"],
  "deb": ["deborah", "debra"], "deborah": ["deb", "debbie"], "debra": ["deb", "debbie"],
  "debbie": ["deborah", "debra"],
  "brent": ["brenton"], "brenton": ["brent"],
  "tina": ["christina", "christine"], "christina": ["tina", "chris"], "christine": ["tina", "chris"],
  "don": ["donald"], "donald": ["don", "donny"],
  "jeff": ["jeffrey", "jeffery"], "jeffrey": ["jeff"], "jeffery": ["jeff"],
  "ted": ["theodore", "edward"], "theodore": ["ted"],
  "ray": ["raymond"], "raymond": ["ray"],
  "ron": ["ronald"], "ronald": ["ron", "ronnie"],
  "phil": ["phillip", "philip"], "phillip": ["phil"], "philip": ["phil"],
  "frankie": ["niyonyishu"], "niyonyishu": ["frankie"],
  "jamie": ["everette"], "everette": ["jamie"],
  "hope": ["samantha"],
  "austin": ["robert"],
  "elise": ["elisete"], "elisete": ["elise"],
  "leah": ["raeleah"], "raeleah": ["leah"],
  "abbi": ["abbigayle", "abigail"], "abbigayle": ["abbi"], "abigail": ["abbey", "abbi"], "abbey": ["abigail"],
  "zachary": ["zachery"], "zachery": ["zachary"],
  "mel": ["melanie"], "melanie": ["mel"],
  "cassie": ["cassandra"], "cassandra": ["cassie"],
  "kim": ["kimberly"], "kimberly": ["kim"],
  "annette": ["carol"],
  "lani": ["iolani"], "iolani": ["lani"],
  "bimbor": ["abimbola"], "abimbola": ["bimbor"],
  "madilynn": ["madison"],
  "nichole": ["randi"],
  "aaron": ["richard"],
  "ravyn": ["jonni"], "jonni": ["ravyn"],
  "rasshad": ["ikee"], "ikee": ["rasshad"],
  "kay": ["deborah"]
};


// ************************************************************
//
//   SECTION 1: FORM SUBMISSION & WEB APP
//
// ************************************************************

// ============================================================
// doPost — handles form submissions from QR sign-in
// ============================================================
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
        // Auto-refresh rosters after updating Training sheet
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

// ============================================================
// doGet — handles VBA calls (addEmployee, checkName)
// ============================================================
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

      // Auto-refresh rosters after adding a new employee
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
//   SECTION 2: NAME MATCHING & DUPLICATE DETECTION
//
// ************************************************************

// ============================================================
// checkNameInTraining — scans Training sheet for matches
// Returns: "EXACT|Name" or "CLOSE|Name" or "NONE"
// ============================================================
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

// ============================================================
// stringSimilarity — Dice coefficient for fuzzy matching
// ============================================================
function stringSimilarity(a, b) {
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0.0;

  var bigrams = {};
  for (var i = 0; i < a.length - 1; i++) {
    var bg = a.substring(i, i + 2);
    bigrams[bg] = (bigrams[bg] || 0) + 1;
  }

  var intersect = 0;
  for (var j = 0; j < b.length - 1; j++) {
    var bg2 = b.substring(j, j + 2);
    if (bigrams[bg2] && bigrams[bg2] > 0) {
      intersect++;
      bigrams[bg2]--;
    }
  }

  return (2.0 * intersect) / (a.length + b.length - 2);
}

// ============================================================
// onEdit — SIMPLE trigger (name duplicate detection only)
// This runs automatically, no setup needed.
// Cannot call generateRostersSilent because simple triggers
// don't have permission to delete/insert sheets.
// ============================================================
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

// ============================================================
// onTrainingEdit — INSTALLABLE trigger (roster auto-refresh)
// This requires setup: run installEditTrigger() ONCE from the
// EVC Tools menu or the script editor.
//
// v8.1: Now also re-syncs to Training sheet when you edit
//   the date (col 4) or attendee name (col 3) on a Training
//   Records row that is already marked Pass.
// ============================================================
function onTrainingEdit(e) {
  try {
    var sheet = e.source.getActiveSheet();
    var sheetName = sheet.getName();

    // Refresh rosters when editing the Training sheet (date columns)
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
        // Auto-fill linked columns when a training date is manually edited
        var editedVal = e.range.getValue();
        var editedStr = editedVal ? editedVal.toString().trim() : "";
        if (editedStr) {
          applyAutoFillRules(sheet, row, headers, editedHeader, editedStr);
        }

        generateRostersSilent();
      }
    }

// ── Training Records: re-sync on Pass/Fail, date, or name edits ──
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

      // Case 1: Pass/Fail just changed to Pass
      if (col === 10) {
        var newVal = e.range.getValue().toString().trim();
        if (newVal === "Pass") shouldUpdate = true;
      }

      // Case 2: Date column (col 4) edited on a row already marked Pass
      if (col === 4 && passFail === "Pass") {
        shouldUpdate = true;
      }

      // Case 3: Attendee name (col 3) edited on a row already marked Pass
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

    // ── Scheduled sheet: instant sync when enrollment is edited ──
    if (sheetName === "Scheduled") {
      try { syncScheduledSilent_(); } catch (e) {
        Logger.log("Scheduled sync error: " + e.toString());
      }
    }

  } catch (err) {
    Logger.log("onTrainingEdit error: " + err.toString());
  }
}

// ============================================================
// installEditTrigger — RUN ONCE to enable auto-refresh
// Go to EVC Tools > Install Auto-Refresh Trigger
// ============================================================
function installEditTrigger() {
  var ui = SpreadsheetApp.getUi();

  // Remove any existing onTrainingEdit triggers to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "onTrainingEdit") {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }

  // Create the installable edit trigger
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

// ============================================================
// checkForDuplicateOnEdit — extracted from old onEdit
// ============================================================
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

    if (cleanExist === inputFirst || cleanExist.split(" ").indexOf(inputFirst) > -1) {
      sheet.getRange(row, fNameCol).setBackground("#FFEB9C");
      sheet.getRange(row, fNameCol).setNote(
        "DUPLICATE: This name already exists on row " + (r + 1) +
        " as " + data[r][fNameCol - 1] + " " + data[r][lNameCol - 1]
      );
      return;
    }

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

  sheet.getRange(row, fNameCol).setBackground(null);
  sheet.getRange(row, fNameCol).clearNote();
}


// ************************************************************
//
//   SECTION 3: TRAINING ACCESS UPDATES
//
// ************************************************************

// ============================================================
// Update Training Access Google Sheet (multi-column support)
// ============================================================
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
    // Never overwrite NA/N/A — it means they don't need this training
    var currentVal = data[matchRow][targetCols[tc]];
    var currentStr = currentVal ? currentVal.toString().trim().toUpperCase() : "";
    if (currentStr === "NA" || currentStr === "N/A") {
      Logger.log("Training Access: skipping " + lastName + ", " + firstName + " | column " + targetCols[tc] + " is NA (excused)");
      continue;
    }
    // Never overwrite failure codes (FAILED, FAILED X1, FAILED X2, etc.)
    if (currentStr === "FAILED" || currentStr === "FAIL" ||
        /^FAILED X\d$/.test(currentStr) ||
        /^FX\d/.test(currentStr) || /^F\s*X\s*\d/.test(currentStr) ||
        currentStr === "FS") {
      Logger.log("Training Access: skipping " + lastName + ", " + firstName + " | column " + targetCols[tc] + " is failure code (" + currentStr + ")");
      continue;
    }
    sheet.getRange(matchRow + 1, targetCols[tc] + 1).setValue(formattedDate);

    // Auto-fill linked columns (e.g., CPR → FIRSTAID, MED_TRAIN → POST MED)
    var writtenHeader = headers[targetCols[tc]] ? headers[targetCols[tc]].toString().trim() : "";
    applyAutoFillRules(sheet, matchRow + 1, headers, writtenHeader, formattedDate);
  }

  Logger.log("Training Access updated: " + lastName + ", " + firstName + " | " + session + " = " + formattedDate + " (" + targetCols.length + " columns)");
}

// ============================================================
// findTrainingRow — shared name-matching helper
// ============================================================
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

// ============================================================
// AUTO-FILL RULES
// ============================================================
// When a date is written to one column, automatically fill
// linked columns. Each rule has:
//   source:    Column header that triggers the rule
//   target:    Column header to auto-fill
//   offset:    Days to add to the source date (0 = same day)
//
// Add or edit rules as needed.
// ============================================================
var AUTO_FILL_RULES = [
  { source: "CPR",       target: "FIRSTAID",  offset: 0 },   // CPR date = First Aid date
  { source: "FIRSTAID",  target: "CPR",       offset: 0 },   // First Aid date = CPR date
  { source: "MED_TRAIN", target: "POST MED",  offset: 1 },   // Med Cert + 1 day = Post Med
  { source: "POST MED",  target: "MED_TRAIN", offset: -1 }   // Post Med - 1 day = Med Cert
];

// ============================================================
// applyAutoFillRules — checks if the column just written
// triggers an auto-fill, and writes the linked column.
// Respects NA/N/A in the target cell.
//
// Parameters:
//   sheet:       The Training sheet object
//   rowNum:      1-indexed row number
//   headers:     Array of header values from row 1
//   writtenCol:  The column header that was just written
//   dateStr:     The date string that was written
// ============================================================
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

    // Check if target cell is NA/N/A or FAILED — don't overwrite
    var targetVal = sheet.getRange(rowNum, targetColIdx + 1).getValue();
    var targetStr = targetVal ? targetVal.toString().trim() : "";
    var targetUpper = targetStr.toUpperCase();
    if (targetUpper === "NA" || targetUpper === "N/A") {
      Logger.log("Auto-fill: skipping " + rule.target + " row " + rowNum + " (NA)");
      continue;
    }
    // Don't overwrite failure tracking (FAILED, FAILED X1, FAILED X2, etc.)
    if (targetUpper === "FAILED" || targetUpper === "FAIL" ||
        /^FAILED X\d$/.test(targetUpper) ||
        /^FX\d/i.test(targetUpper) || /^F\s*X\s*\d/i.test(targetUpper) ||
        targetUpper === "FS") {
      Logger.log("Auto-fill: skipping " + rule.target + " row " + rowNum + " (failure code: " + targetStr + ")");
      continue;
    }

    // Calculate the target date
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

    // Skip if the target already has this date (prevents infinite loops
    // when reverse rules exist, e.g. CPR↔FIRSTAID)
    var existingFormatted = formatBackfillDate(targetVal);
    if (existingFormatted === formattedTarget) continue;

    sheet.getRange(rowNum, targetColIdx + 1).setValue(formattedTarget);
    Logger.log("Auto-fill: " + rule.source + " → " + rule.target + " = " + formattedTarget + " (row " + rowNum + ")");
  }
}


// ************************************************************
//
//   SECTION 4: BACKFILL
//
// ************************************************************

// ============================================================
// BACKFILL: Process all existing Sheet 1 rows into Sheet 2
// ============================================================
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

  var processed = 0;
  var matched = 0;
  var skippedNoMap = 0;
  var skippedNoMatch = 0;
  var skippedNewer = 0;
  var writtenEmpty = 0;
  var writtenOverWord = 0;
  var writtenOverOlder = 0;
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

      // Never overwrite NA/N/A — it means they don't need this training
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

    // Auto-fill linked columns for each column that was written
    for (var af = 0; af < targetCols.length; af++) {
      var writtenHeader = trainingHeaders[targetCols[af]] ? trainingHeaders[targetCols[af]].toString().trim() : "";
      applyAutoFillRules(trainingSheet, matchRow + 1, trainingHeaders, writtenHeader, formattedDate);
    }
  }

  var totalWritten = writtenEmpty + writtenOverWord + writtenOverOlder;

  // Auto-refresh rosters after backfill
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
//   SECTION 5: ROSTER GENERATOR
//
// ************************************************************

// ============================================================
// Generate rosters (interactive, with alerts)
// ============================================================
function generateRosters() {
  var result = buildRosterData();
  if (!result) return; // buildRosterData showed an error alert

  writeRosterSheet(result.ss, result.allRosters, result.today);

  // Summary alert
  var summary = "Rosters generated!\n\n";
  for (var i = 0; i < result.allRosters.length; i++) {
    var r = result.allRosters[i];
    if (r.error) {
      summary += r.name + ": " + r.error + "\n";
    } else {
      var total = r.needed.length + r.expiringSoon.length + r.expired.length;
      summary += r.name + ": " + total + " staff flagged";
      if (r.expired.length > 0) summary += " (" + r.expired.length + " expired)";
      if (r.expiringSoon.length > 0) summary += " (" + r.expiringSoon.length + " expiring soon)";
      if (r.needed.length > 0) summary += " (" + r.needed.length + " never completed)";
      summary += "\n";
    }
  }
  summary += "\nCheck the \"" + ROSTER_SHEET_NAME + "\" tab for details.";
  SpreadsheetApp.getUi().alert(summary);
}

// ============================================================
// Generate rosters SILENTLY (no alerts, for auto-refresh)
// Called after: doPost, batchPassFail, backfill, addEmployee
// ============================================================
function generateRostersSilent() {
  try {
    // Clean garbled dates before building rosters
    cleanGarbledDates();

    var result = buildRosterData(true); // silent = true
    if (!result) return;
    writeRosterSheet(result.ss, result.allRosters, result.today);
    Logger.log("Training Rosters auto-refreshed at " + new Date().toString());
  } catch (err) {
    Logger.log("Roster auto-refresh error: " + err.toString());
  }
}

// ============================================================
// cleanGarbledDates — scans Training sheet and clears any cell
// with bad data. Runs silently on every roster refresh.
//
// Clears:
//   - Garbled dates (digits+slashes that aren't valid dates)
//   - Month/Year only (11/2010 — missing day)
//   - Dates with impossible years (9/16/0256)
//   - Dates with trailing junk (10/26/11*, 11/2/22DSP)
//   - Junk characters (*, ., /, //, ---, ?)
//   - YES/NO values in training columns
//   - Bare letters that aren't known codes
//
// Preserves:
//   - Valid dates (M/D/YY, M/D/YYYY, M-D-YY)
//   - Known excusal codes (NA, N/A, ELC, FACILITIES, etc.)
//   - Status codes (NEEDS, SCHED, FAILED, COMPLETE, etc.)
//   - Schedule codes (S-11/7, S- 12/12, etc.)
// ============================================================
function cleanGarbledDates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var cleaned = 0;

  var activeCol = findColumnIndex(headers, ["ACTIVE", "STATUS", "ACTIVE?"]);

  // Known valid non-date text values to keep
  var KEEP_VALUES = [
    "NEEDS", "NEEDDS", "SCHED", "SCHEDULE",
    "FAILED", "FAIL", "COMPLETE", "COMPLETED",
    "NO SHOW", "NCNS 2026", "NEED CERTIF",
    "TERM", "HALF", "1 DAY ONLY", "1 DAY",
    "NA", "N/A",
    "ELC", "EI", "FACILITIES", "MAINT",
    "HR", "FINANCE", "FIN", "IT", "ADMIN",
    "NURSE", "LPN", "RN", "CNA",
    "BH", "PA", "BA", "QA", "TAC",
    "TRAINER", "LP",
    "LLL", "MASS", "WAIN", "WADS",
    "Y", "YES", "S", "R"
  ];

  // Patterns for failure codes — keep and standardize
  // Old formats: FX1, FX2, F X 2, FX 1, FX1/NS, FX1 - S, FX1 - R, FX1*, FS
  // New standard: FAILED, FAILED X1, FAILED X2, FAILED X3
  function isFailureCode(str) {
    var u = str.toUpperCase();
    if (u === "FAILED" || /^FAILED X\d$/.test(u)) return true;  // Already standardized
    if (u === "FS" || u === "FAIL") return true;
    if (/^FX\d/.test(u)) return true;
    if (/^F\s*X\s*\d/.test(u)) return true;
    return false;
  }

  function standardizeFailureCode(str) {
    var u = str.toUpperCase();
    if (u === "FAILED" || /^FAILED X\d$/.test(u)) return null;  // Already standard
    if (u === "FS" || u === "FAIL") return "FAILED";
    var fxMatch = u.match(/^F\s*X\s*(\d)/);
    if (fxMatch) return "FAILED X" + fxMatch[1];
    return null;
  }

  for (var r = 1; r < data.length; r++) {
    // Only clean active employees
    if (activeCol >= 0) {
      var activeStatus = data[r][activeCol] ? data[r][activeCol].toString().trim().toUpperCase() : "";
      if (activeStatus !== "Y") continue;
    }

    for (var c = 3; c < data[r].length; c++) {
      var val = data[r][c];
      if (val === null || val === undefined) continue;

      // Valid Date objects from Google Sheets — check year range
      if (val instanceof Date) {
        if (!isNaN(val.getTime())) {
          var yr = val.getFullYear();
          // Dates with nonsense years (like 0256, 0245) come through as Date objects
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

      // Failure codes (FX1, FX2, FS, etc.) — keep but standardize
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

      // Schedule codes (S-11/7, S- 12/12, S-DEC, etc.) — clear these
      if (/^S[\s-]/i.test(s)) {
        sheet.getRange(r + 1, c + 1).setValue("");
        cleaned++;
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c + 1);
        var name = (data[r][1] || "") + " " + (data[r][0] || "");
        Logger.log("Cleared schedule code: " + name.trim() + " | " + colName + " | was '" + s + "'");
        continue;
      }

      // Clean slash date (M/D/YY or M/D/YYYY) — validate year range
      var slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (slashMatch) {
        var yr = parseInt(slashMatch[3]);
        if (yr < 100) yr += 2000;
        if (yr >= 2000 && yr <= 2099) continue;  // Valid date, keep
        // Bad year — clear it
        sheet.getRange(r + 1, c + 1).setValue("");
        cleaned++;
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c + 1);
        var name = (data[r][1] || "") + " " + (data[r][0] || "");
        Logger.log("Cleared bad year: " + name.trim() + " | " + colName + " | was '" + s + "'");
        continue;
      }

      // Clean dash date (M-D-YY or M-D-YYYY) — validate year range
      var dashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
      if (dashMatch) {
        var yr = parseInt(dashMatch[3]);
        if (yr < 100) yr += 2000;
        if (yr >= 2000 && yr <= 2099) continue;  // Valid date, keep
        sheet.getRange(r + 1, c + 1).setValue("");
        cleaned++;
        var colName = headers[c] ? headers[c].toString().trim() : "Col " + (c + 1);
        var name = (data[r][1] || "") + " " + (data[r][0] || "");
        Logger.log("Cleared bad year: " + name.trim() + " | " + colName + " | was '" + s + "'");
        continue;
      }

      // Everything below here is NOT a valid date and NOT a known code.
      // If it has any digits or slashes or is junk punctuation, clear it.

      // Junk punctuation (*, ., /, //, ---, ?)
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

// ============================================================
// Build roster data (shared by interactive and silent modes)
// Returns { ss, allRosters, today } or null on error
// ============================================================
function buildRosterData(silent) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trainingSheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);

  if (!trainingSheet) {
    if (!silent) {
      SpreadsheetApp.getUi().alert("Error: Could not find a sheet named \"" + TRAINING_ACCESS_SHEET_NAME + "\".");
    }
    return null;
  }

  var data = trainingSheet.getDataRange().getValues();
  if (data.length < 2) {
    if (!silent) {
      SpreadsheetApp.getUi().alert("The Training sheet appears to be empty (no data rows found).");
    }
    return null;
  }

  var headers = data[0];
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var lNameCol = findColumnIndex(headers, ["L NAME", "LNAME", "LAST NAME", "LAST"]);
  var fNameCol = findColumnIndex(headers, ["F NAME", "FNAME", "FIRST NAME", "FIRST"]);

  if (lNameCol === -1 || fNameCol === -1) {
    if (!silent) {
      SpreadsheetApp.getUi().alert("Error: Could not find name columns.\n\nLooking for \"L NAME\" and \"F NAME\" in the header row.\n\nFound headers: " + headers.join(", "));
    }
    return null;
  }

  var activeCol = findColumnIndex(headers, ["ACTIVE", "STATUS", "ACTIVE?"]);

  var allRosters = [];

  for (var t = 0; t < TRAINING_CONFIG.length; t++) {
    var config = TRAINING_CONFIG[t];
    var colIdx = findColumnIndex(headers, [config.column]);

    if (colIdx === -1) {
      allRosters.push({
        name: config.name,
        error: "Column \"" + config.column + "\" not found on Training sheet",
        needed: [],
        expiringSoon: [],
        expired: []
      });
      continue;
    }

    var needed = [];
    var expiringSoon = [];
    var expired = [];

    var prereqColIdx = -1;
    if (config.prerequisite) {
      prereqColIdx = findColumnIndex(headers, [config.prerequisite]);
    }

    for (var r = 1; r < data.length; r++) {
      var lastName = String(data[r][lNameCol] || "").trim();
      var firstName = String(data[r][fNameCol] || "").trim();

      if (!lastName && !firstName) continue;

      if (activeCol !== -1) {
        var activeVal = String(data[r][activeCol] || "").trim().toUpperCase();
        if (activeVal === "NO" || activeVal === "INACTIVE" || activeVal === "TERMINATED" || activeVal === "N") continue;
      }

      if (prereqColIdx !== -1) {
        var prereqVal = data[r][prereqColIdx];
        var prereqDate = parseTrainingDate(prereqVal);
        if (!prereqDate) continue;
      }

      var fullName = firstName + " " + lastName;
      var dateVal = data[r][colIdx];
      var cellStr = String(dateVal || "").trim();

      // NA or N/A means this person doesn't need this training — skip entirely
      var cellUpper = cellStr.toUpperCase();
      if (cellUpper === "NA" || cellUpper === "N/A" || cellUpper === "N/") continue;

      // NEEDS, SCHED, SCHEDULE = person needs training
      if (cellUpper === "NEEDS" || cellUpper === "NEEDDS" || cellUpper === "SCHED" || 
          cellUpper === "SCHEDULE" || cellUpper === "NO SHOW") {
        var nStatus = (cellUpper === "NO SHOW") ? "No Show — Needs Reschedule" : "Never Completed";
        needed.push({ name: fullName, status: nStatus, lastDate: "" });
        continue;
      }

      // FAILED, FAIL, FAILED X1, FAILED X2, FAILED X3, FX1, FX2, FS etc.
      if (cellUpper === "FAILED" || cellUpper === "FAIL" || cellUpper === "FS" ||
          /^FAILED X\d$/.test(cellUpper) ||
          /^FX\d/i.test(cellUpper) || /^F\s*X\s*\d/i.test(cellUpper)) {
        var failCount = "";
        var fxMatch = cellUpper.match(/X\s*(\d)/);
        if (fxMatch) failCount = " (x" + fxMatch[1] + ")";
        needed.push({ name: fullName, status: "Failed" + failCount + " — Needs Retake", lastDate: "" });
        continue;
      }

      if (!cellStr) {
        needed.push({ name: fullName, status: "Never Completed", lastDate: "" });
        continue;
      }

      var trainDate = parseTrainingDate(dateVal);

      if (!trainDate) {
        // For required trainings, any non-date non-excusal text means they need it
        // For non-required trainings, non-date text (like ELC, FACILITIES, etc.) means excused
        if (config.required) {
          needed.push({ name: fullName, status: "No valid date (" + cellStr + ")", lastDate: cellStr });
        }
        continue;
      }

      if (config.renewalYears === 0) continue;

      var expDate = new Date(trainDate);
      expDate.setFullYear(expDate.getFullYear() + config.renewalYears);

      var daysUntilExp = Math.floor((expDate - today) / (1000 * 60 * 60 * 24));

      if (daysUntilExp < 0) {
        expired.push({
          name: fullName,
          status: "Expired " + Math.abs(daysUntilExp) + " days ago",
          lastDate: formatDate(trainDate),
          expDate: formatDate(expDate),
          sortKey: daysUntilExp
        });
      } else if (daysUntilExp <= EXPIRING_SOON_DAYS) {
        expiringSoon.push({
          name: fullName,
          status: "Expires in " + daysUntilExp + " days",
          lastDate: formatDate(trainDate),
          expDate: formatDate(expDate),
          sortKey: daysUntilExp
        });
      }
    }

    expired.sort(function(a, b) { return a.sortKey - b.sortKey; });
    expiringSoon.sort(function(a, b) { return a.sortKey - b.sortKey; });
    needed.sort(function(a, b) { return a.name.localeCompare(b.name); });

// Split med cert: recerts only get expired/expiring, initial only gets needed
    if (config.onlyExpired) { needed = []; }
    if (config.onlyNeeded) { expired = []; expiringSoon = []; }

    allRosters.push({
      name: config.name,
      renewalYears: config.renewalYears,
      required: config.required,
      needed: needed,
      expiringSoon: expiringSoon,
      expired: expired
    });
  }
  return { ss: ss, allRosters: allRosters, today: today };
}

// ============================================================
// Generate roster for a single training type (via prompt)
// ============================================================
function generateSingleRoster() {
  var ui = SpreadsheetApp.getUi();

  var msg = "Which training would you like to generate a roster for?\n\n";
  for (var i = 0; i < TRAINING_CONFIG.length; i++) {
    var renewal = TRAINING_CONFIG[i].renewalYears === 0 ? "indefinite" : TRAINING_CONFIG[i].renewalYears + " yr renewal";
    var req = TRAINING_CONFIG[i].required ? " [REQUIRED]" : "";
    msg += (i + 1) + ".  " + TRAINING_CONFIG[i].name + " (" + renewal + ")" + req + "\n";
  }

  var response = ui.prompt("Select Training Type", msg, ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;

  var idx = parseInt(response.getResponseText()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= TRAINING_CONFIG.length) {
    ui.alert("Invalid selection. Please enter a number between 1 and " + TRAINING_CONFIG.length + ".");
    return;
  }

  var originalConfig = TRAINING_CONFIG;
  TRAINING_CONFIG = [originalConfig[idx]];
  generateRosters();
  TRAINING_CONFIG = originalConfig;
}

// ============================================================
// Show current configuration
// ============================================================
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

// ============================================================
// NOTE: writeRosterSheet lives in ClassRosters.gs
// It includes the "Scheduled" column and scans class roster
// tabs. Do NOT define writeRosterSheet here.
// ============================================================


// ************************************************************
//
//   SECTION 6: MENU & BATCH TOOLS
//
// ************************************************************

// ============================================================
// Custom menu (combined EVC Tools + Roster Tools + Class Rosters)
// ============================================================
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
    .addItem("Generate Class Rosters", "generateClassRosters")
    .addItem("View Roster Config", "showConfig")
    .addSeparator()
    .addItem("Backfill Training Access from Records", "backfillTrainingAccess")
    .addSeparator()
    .addItem("Install Auto-Refresh Trigger (run once)", "installEditTrigger")
    .addItem("Install Class Roster Triggers (run once)", "installClassRosterTriggers")
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
    .addSeparator()
    .addItem("Sync Scheduled Trainings", "syncScheduledTrainings")
    .addToUi();
}

// ============================================================
// BATCH: Set Session End Time & Length for all attendees
// ============================================================
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

// ============================================================
// BATCH: Set Pass/Fail for all attendees in a session
// NOW auto-updates Training sheet + refreshes Rosters
// ============================================================
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

  // Re-read data since we need the row contents for Training updates
  data = sheet.getDataRange().getValues();

  var trainingUpdated = 0;
  var trainingErrors = [];

  for (var r = 0; r < selected.rows.length; r++) {
    var rowNum = selected.rows[r];
    sheet.getRange(rowNum, 10).setValue(pf);
    if (reviewerName) sheet.getRange(rowNum, 11).setValue(reviewerName);

    // If marked Pass AND this is a mapped session, update Training sheet
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

  // Auto-refresh rosters
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

// ============================================================
// FLAG: Highlight late arrivals
// ============================================================
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

// ============================================================
// FLAG: Highlight early departures
// ============================================================
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
//   SECTION 7: TEST & UTILITY FUNCTIONS
//
// ************************************************************

// ============================================================
// Manual test: verify training access connection
// ============================================================
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

// ============================================================
// Manual test: verify checkName works
// ============================================================
function testCheckName() {
  var ui = SpreadsheetApp.getUi();

  var lastInput = ui.prompt("Test Name Check", "Enter a last name:", ui.ButtonSet.OK_CANCEL);
  if (lastInput.getSelectedButton() !== ui.Button.OK) return;

  var firstInput = ui.prompt("Test Name Check", "Enter a first name:", ui.ButtonSet.OK_CANCEL);
  if (firstInput.getSelectedButton() !== ui.Button.OK) return;

  var result = checkNameInTraining(lastInput.getResponseText(), firstInput.getResponseText());
  ui.alert("Result: " + result);
}

// ============================================================
// Setup sheet (run ONCE for fresh workbooks only)
// ============================================================
function setupSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  sheet.clear();

  var headers = [
    "Arrival Time",
    "Training Session",
    "Attendee Name",
    "Date of Training",
    "Left Early",
    "Reason",
    "Notes / Issues",
    "Session End Time",
    "Session Length",
    "Pass / Fail",
    "Reviewed By"
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  var staffH = sheet.getRange(1, 1, 1, 7);
  staffH.setFontWeight("bold");
  staffH.setBackground("#1F3864");
  staffH.setFontColor("#FFFFFF");
  staffH.setFontFamily("Arial");

  var batchH = sheet.getRange(1, 8, 1, 2);
  batchH.setFontWeight("bold");
  batchH.setBackground("#E65100");
  batchH.setFontColor("#FFFFFF");
  batchH.setFontFamily("Arial");

  var mgmtH = sheet.getRange(1, 10, 1, 2);
  mgmtH.setFontWeight("bold");
  mgmtH.setBackground("#2E7D32");
  mgmtH.setFontColor("#FFFFFF");
  mgmtH.setFontFamily("Arial");

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
// Helper: parse "9:00 AM" to total minutes
// ============================================================
function parseTimeToMinutes(str) {
  if (!str) return -1;
  var match = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return -1;
  var h = parseInt(match[1]);
  var m = parseInt(match[2]);
  var ampm = match[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

function exportReminder() {
  SpreadsheetApp.getUi().alert("To export:\n\nFile > Download > Microsoft Excel (.xlsx)\n\nThis saves a local copy to your computer.");
}

// ============================================================
// Date utilities (shared across all sections)
// ============================================================

// formatBackfillDate — Date objects and strings -> M/D/YY
function formatBackfillDate(dateVal) {
  if (!dateVal) return "";

  var d;
  if (dateVal instanceof Date) {
    d = dateVal;
  } else {
    d = new Date(dateVal.toString() + "T12:00:00");
  }

  if (isNaN(d.getTime())) return dateVal.toString();

  var mo = d.getMonth() + 1;
  var da = d.getDate();
  var yr = d.getFullYear().toString().slice(-2);
  return mo + "/" + da + "/" + yr;
}

// parseToDate — tries to parse a cell value into a Date
function parseToDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;

  var str = val.toString().trim();
  if (!str) return null;

  var slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    var mo = parseInt(slashMatch[1]);
    var da = parseInt(slashMatch[2]);
    var yr = parseInt(slashMatch[3]);
    if (yr < 100) yr += 2000;
    var d = new Date(yr, mo - 1, da);
    if (!isNaN(d.getTime())) return d;
  }

  var d2 = new Date(str);
  if (!isNaN(d2.getTime())) {
    if (d2.getFullYear() >= 2000 && d2.getFullYear() <= 2099) return d2;
  }

  return null;
}

// parseTrainingDate — for roster generator
// Handles: Date objects, M/D/YY, M/D/YYYY, M-D-YY, M-D-YYYY
function parseTrainingDate(val) {
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val;
  }

  var str = String(val).trim();
  if (!str) return null;

  // Try slash format: M/D/YY or M/D/YYYY
  var parts = str.split("/");
  if (parts.length === 3) {
    var month = parseInt(parts[0]) - 1;
    var day = parseInt(parts[1]);
    var year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    var d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Try dash format: M-D-YY or M-D-YYYY
  var dashParts = str.split("-");
  if (dashParts.length === 3) {
    var month = parseInt(dashParts[0]) - 1;
    var day = parseInt(dashParts[1]);
    var year = parseInt(dashParts[2]);
    if (year < 100) year += 2000;
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      var d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  var d2 = new Date(str);
  if (!isNaN(d2.getTime())) return d2;

  return null;
}

// formatDate — for roster output (M/D/YYYY full year)
function formatDate(d) {
  if (!d) return "";
  return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
}

// findColumnIndex — find a column by trying multiple header names
function findColumnIndex(headers, possibleNames) {
  for (var h = 0; h < headers.length; h++) {
    var headerVal = String(headers[h] || "").trim().toUpperCase();
    for (var p = 0; p < possibleNames.length; p++) {
      if (headerVal === possibleNames[p].toUpperCase()) {
        return h;
      }
    }
  }
  return -1;
}

// ============================================================
// Test: run manually to confirm writing works
// ============================================================
function testWrite() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  sheet.appendRow([
    "9:05 AM", "TEST SESSION", "Test User", "2026-03-17",
    "No", "", "This is a test entry", "", "", "Pending", ""
  ]);
  SpreadsheetApp.getUi().alert("Test row added! Check the sheet, then delete it.");
}
