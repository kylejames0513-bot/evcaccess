// ============================================================
// EVC Class Roster Generator + Scheduled Sync — v3
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
//
// PASTE THIS INTO: Extensions > Apps Script as a NEW file
//   (click the + next to Files, name it "ClassRosters")
//   DELETE your old ClassRosters.gs first.
//   Do NOT replace Code.gs — this runs alongside it.
//
// MENU ITEMS (add to createMenu() in Code.gs):
//   .addItem("Generate Class Rosters", "generateClassRosters")
//   .addItem("Manual Class Assignment", "manualClassAssignment")
//   .addItem("Sync Scheduled Trainings", "syncScheduledTrainings")
//
// ============================================================
// WHAT "Sync Scheduled Trainings" DOES:
//
//   1. Reads your Scheduled sheet (your manually maintained
//      calendar with comma-separated enrollee names)
//
//   2. For each session, checks every enrollee against the
//      Training Rosters needs data (buildRosterData)
//
//   3. REMOVES anyone who does NOT need the training
//      (they're already current or excused)
//
//   4. BACKFILLS freed seats with people who DO need it,
//      prioritized: Expired > Never Completed > Expiring Soon
//
//   5. Rewrites the Scheduled sheet with corrected enrollments
//
//   6. Rebuilds a "Scheduled Overview" tab showing the full
//      picture + gap analysis of who's still unscheduled
//
//   7. Refreshes Training Rosters so the Scheduled column
//      is up to date
//
// ============================================================


// ************************************************************
//
//   CONFIGURATION
//
// ************************************************************

var SCHEDULED_SHEET_NAME = "Scheduled";
var OVERVIEW_SHEET_NAME  = "Scheduled Overview";

var CLASS_ROSTER_CONFIG = [
  {
    name: "CPR/FA",
    classCapacity: 10,
    schedule: { recurring: [{ weekday: "Thursday" }] },
    weeksOut: 4
  },
  {
    name: "Ukeru",
    classCapacity: 12,
    schedule: {
      recurring: [
        { weekday: "Monday", nthWeek: [2] },
        { weekday: "Friday", nthWeek: [4] }
      ],
      dates: []
    },
    weeksOut: 6
  },
  {
    name: "Mealtime",
    classCapacity: 15,
    schedule: { recurring: [{ weekday: "Wednesday", nthWeek: [3] }] },
    weeksOut: 8
  },
  { name: "Med Recert",       classCapacity: 4,  schedule: { dates: [] }, weeksOut: 4 },
  { name: "Initial Med Training", classCapacity: 4, schedule: { dates: [] }, weeksOut: 4 },
  { name: "Post Med",         classCapacity: 8,  schedule: { dates: [] }, weeksOut: 4 },
  { name: "POMs",             classCapacity: 15, schedule: { dates: [] }, weeksOut: 4 },
  { name: "Person Centered",  classCapacity: 15, schedule: { dates: [] }, weeksOut: 4 },
  { name: "Van/Lift Training",classCapacity: 10, schedule: { dates: [] }, weeksOut: 4 }
];

var SEAT_PRIORITY = [
  { bucket: "expired",      priority: 1 },
  { bucket: "needed",       priority: 2 },
  { bucket: "expiringSoon", priority: 3 }
];
SEAT_PRIORITY.sort(function(a, b) { return a.priority - b.priority; });

// Scheduled-sheet type string → TRAINING_CONFIG name
var SCHEDULED_TYPE_MAP = {
  "cpr":              "CPR/FA",
  "cpr/fa":           "CPR/FA",
  "ukeru":            "Ukeru",
  "mealtime":         "Mealtime",
  "med training":     null,        // manually managed
  "med recert":       null,        // manually managed
  "med cert":         null,        // manually managed
  "initial med training": null,    // manually managed
  "med test out":     "Med Recert", // test-out = recert path
  "post med":         null,        // manually managed — mirrors med training
  "poms":             "POMs",
  "poms training":    "POMs",
  "person centered":  "Person Centered",
  "pct training":     "Person Centered",
  "van/lift training":"Van/Lift Training",
  "van lyft":         "Van/Lift Training",
  "rising leaders":   null,
  "safety care":      null
};


// ************************************************************
//
//   SYNC SCHEDULED TRAININGS  (the main new feature)
//
// ************************************************************

function syncScheduledTrainings() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Build needs data
  var rosterResult = buildRosterData(true);
  if (!rosterResult) { ui.alert("Could not read Training sheet data."); return; }
  var allRosters = rosterResult.allRosters;
  var today = rosterResult.today;

  // 2. Build needs lookup
  var needsLookup = buildNeedsLookup_(allRosters);

  // 3. Parse the Scheduled sheet
  var sessions = parseScheduledSheet_(ss);
  if (!sessions || sessions.length === 0) { ui.alert("No sessions found on the Scheduled sheet."); return; }

  // 4. For each session: remove non-needing, backfill with needs-first
  //    Only process sessions on or after the cutoff date.
  //    Sessions before the cutoff are kept exactly as they are.
  var SYNC_CUTOFF = new Date(2026, 3, 1); // April 1, 2026 (month is 0-indexed)
  SYNC_CUTOFF.setHours(0, 0, 0, 0);

  var globalAssigned = {};
  var summaryLines = [];
  var totalRemoved = 0, totalBackfilled = 0, totalKept = 0;
  var totalSkipped = 0;

  for (var s = 0; s < sessions.length; s++) {
    var session = sessions[s];
    var configName = resolveTrainingName_(session.type);
    session.configName = configName;

    // Skip sessions before the cutoff — keep enrollment as-is
    if (session.sortDate && session.sortDate < SYNC_CUTOFF) {
      session.finalEnrollees = session.enrollees.slice();
      session.keptEnrollees = session.enrollees.slice();
      session.removedEnrollees = [];
      session.backfilledEnrollees = [];
      session.placeholders = [];
      session.skippedCutoff = true;
      totalSkipped++;
      summaryLines.push(session.type + " (" + session.dateDisplay + "): Skipped (before " + formatClassDate(SYNC_CUTOFF) + ")");
      continue;
    }

    // Skip untracked types (Rising Leaders, etc.) — keep as-is
    if (configName === null) {
      session.finalEnrollees = session.enrollees.slice();
      session.keptEnrollees = session.enrollees.slice();
      session.removedEnrollees = [];
      session.backfilledEnrollees = [];
      session.placeholders = [];
      continue;
    }

    var needsMap = needsLookup[configName.toLowerCase()] || {};
    if (!globalAssigned[configName.toLowerCase()]) globalAssigned[configName.toLowerCase()] = {};
    var assignedMap = globalAssigned[configName.toLowerCase()];
    var capacity = getCapacityForTraining_(configName);

    // STEP A: Evaluate current enrollees
    var kept = [];
    var removed = [];
    var placeholders = [];

    for (var e = 0; e < session.enrollees.length; e++) {
      var name = session.enrollees[e];
      var nameLower = name.toLowerCase().trim();

      if (nameLower === "tbd" || nameLower === "new hires") {
        placeholders.push(name);
        continue;
      }

      var info = needsMap[nameLower];
      if (!info) info = fuzzyMatchNeeds_(nameLower, needsMap);

      if (info) {
        kept.push(name);
        assignedMap[nameLower] = true;
      } else {
        removed.push(name);
      }
    }

    // STEP B: Backfill freed seats
    var openSeats = capacity - kept.length;
    if (openSeats < 0) openSeats = 0;

    var backfilled = [];
    if (openSeats > 0) {
      var pool = buildBackfillPool_(needsMap, assignedMap);
      pool.sort(function(a, b) { return getPriorityNumber_(a) - getPriorityNumber_(b); });

      for (var f = 0; f < pool.length && backfilled.length < openSeats; f++) {
        var pLower = pool[f].name.toLowerCase().trim();
        if (assignedMap[pLower]) continue;
        backfilled.push(pool[f].name);
        assignedMap[pLower] = true;
      }
    }

    // STEP C: Build final enrollee list
    session.finalEnrollees = kept.concat(backfilled);
    session.removedEnrollees = removed;
    session.backfilledEnrollees = backfilled;
    session.keptEnrollees = kept;
    session.placeholders = placeholders;

    totalRemoved += removed.length + placeholders.length;
    totalBackfilled += backfilled.length;
    totalKept += kept.length;

    var line = session.type + " (" + session.dateDisplay + "): ";
    line += "Kept " + kept.length;
    if (removed.length > 0) line += ", removed " + removed.length + " (already current)";
    if (placeholders.length > 0) line += ", replaced " + placeholders.length + " placeholder(s)";
    if (backfilled.length > 0) line += ", backfilled +" + backfilled.length;
    var remaining = capacity - session.finalEnrollees.length;
    if (remaining > 0) line += " | " + remaining + " open seat(s)";
    summaryLines.push(line);
  }

  // 5. Rewrite the Scheduled sheet
  rewriteScheduledSheet_(ss, sessions);

  // 6. Build + write overview
  var overviewResult = buildOverviewFromSyncedSessions_(sessions, allRosters, ss);
  writeScheduledOverviewSheet_(overviewResult, ss, today);

  // 7. Refresh Training Rosters
  generateRostersSilent();

  // 8. Summary
  var summary = "Sync Complete!\n\n";
  summary += "Cutoff date: " + formatClassDate(SYNC_CUTOFF) + " (sessions before this left alone)\n";
  summary += "Sessions skipped (before cutoff): " + totalSkipped + "\n\n";
  summary += "Kept (still need training): " + totalKept + "\n";
  summary += "Removed/Archived (passed or already current): " + totalRemoved + "\n";
  summary += "Backfilled (from needs list): " + totalBackfilled + "\n\n";
  for (var sl = 0; sl < summaryLines.length; sl++) summary += summaryLines[sl] + "\n";
  summary += "\nScheduled sheet updated.\nOverview tab rebuilt.\nTraining Rosters refreshed.";
  ui.alert(summary);
}


// ************************************************************
//
//   SYNC HELPERS
//
// ************************************************************

function buildNeedsLookup_(allRosters) {
  var lookup = {};
  for (var t = 0; t < allRosters.length; t++) {
    var roster = allRosters[t];
    var key = roster.name.toLowerCase();
    lookup[key] = {};
    if (roster.error) continue;
    var buckets = [
      { data: roster.expired, label: "expired" },
      { data: roster.expiringSoon, label: "expiringSoon" },
      { data: roster.needed, label: "needed" }
    ];
    for (var b = 0; b < buckets.length; b++) {
      for (var i = 0; i < buckets[b].data.length; i++) {
        var p = buckets[b].data[i];
        lookup[key][p.name.toLowerCase().trim()] = {
          name: p.name, status: p.status, bucket: buckets[b].label,
          lastDate: p.lastDate || "", expDate: p.expDate || ""
        };
      }
    }
  }
  return lookup;
}

function buildBackfillPool_(needsMap, assignedMap) {
  var pool = [];
  var keys = Object.keys(needsMap);
  for (var k = 0; k < keys.length; k++) {
    if (assignedMap[keys[k]]) continue;
    pool.push(needsMap[keys[k]]);
  }
  return pool;
}

function getPriorityNumber_(person) {
  // Failed people always go LAST regardless of bucket
  if (person.status && person.status.toLowerCase().indexOf("failed") > -1) return 8;
  if (person.bucket === "expired") return 1;
  if (person.bucket === "needed") return 2;
  if (person.bucket === "expiringSoon") return 3;
  return 9;
}

function getCapacityForTraining_(configName) {
  for (var i = 0; i < CLASS_ROSTER_CONFIG.length; i++) {
    if (CLASS_ROSTER_CONFIG[i].name === configName) return CLASS_ROSTER_CONFIG[i].classCapacity;
  }
  return 15;
}

function resolveTrainingName_(typeStr) {
  if (!typeStr) return null;
  var lower = typeStr.toLowerCase().trim();
  var mapped = SCHEDULED_TYPE_MAP[lower];
  if (mapped !== undefined) return mapped;
  for (var i = 0; i < TRAINING_CONFIG.length; i++) {
    if (TRAINING_CONFIG[i].name.toLowerCase() === lower) return TRAINING_CONFIG[i].name;
  }
  return null;
}

function fuzzyMatchNeeds_(nameLower, needsMap) {
  var parts = nameLower.split(/\s+/);
  if (parts.length < 2) return null;
  var eFirst = parts[0], eLast = parts[parts.length - 1];
  var keys = Object.keys(needsMap);
  for (var k = 0; k < keys.length; k++) {
    var kParts = keys[k].split(/\s+/);
    if (kParts.length < 2) continue;
    var kFirst = kParts[0], kLast = kParts[kParts.length - 1];
    if (eFirst === kFirst && eLast === kLast) return needsMap[keys[k]];
    if (eLast === kLast) {
      var nicks = NICKNAMES[eFirst] || [];
      if (nicks.indexOf(kFirst) > -1) return needsMap[keys[k]];
      var kNicks = NICKNAMES[kFirst] || [];
      if (kNicks.indexOf(eFirst) > -1) return needsMap[keys[k]];
      if (eFirst.length >= 4 && kFirst.length >= 4 && eFirst.substring(0,4) === kFirst.substring(0,4)) return needsMap[keys[k]];
    }
  }
  return null;
}


// ************************************************************
//
//   REWRITE THE SCHEDULED SHEET
//
// ************************************************************

function rewriteScheduledSheet_(ss, sessions) {
  var sheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
  if (!sheet) return;

  var rows = [];
  rows.push(["a. Upcoming Training", "", "", "", ""]);
  rows.push(["Type", "Dates", "Time", "Location", "Enrollment"]);

  for (var s = 0; s < sessions.length; s++) {
    var session = sessions[s];
    var enrollStr = session.finalEnrollees.join(", ");
    if (!enrollStr) enrollStr = "TBD";
    rows.push([session.type, session.rawDate || session.dateDisplay || "", session.time, session.location, enrollStr]);
  }

  rows.push(["", "", "", "", ""]);
  rows.push(["a. Upcoming Training", "", "", "", ""]);
  rows.push(["Type", "Dates", "Time", "Location", "Enrollment"]);

  sheet.clear();
  sheet.getRange(1, 1, rows.length, 5).setValues(rows);

  sheet.getRange(1, 1, 1, 5).merge();
  sheet.getRange(1, 1).setFontSize(13).setFontWeight("bold").setFontColor("#FFFFFF").setBackground("#1F3864").setFontFamily("Arial");
  sheet.getRange(2, 1, 1, 5).setFontWeight("bold").setBackground("#F2F2F2").setFontFamily("Arial");
  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 160);
  sheet.setColumnWidth(3, 160);
  sheet.setColumnWidth(4, 180);
  sheet.setColumnWidth(5, 500);
}


// ************************************************************
//
//   PARSE THE SCHEDULED SHEET
//
// ************************************************************

function parseScheduledSheet_(ss) {
  var sheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  var sessions = [], lastType = "";

  for (var r = 0; r < data.length; r++) {
    var colA = data[r][0] ? data[r][0].toString().trim() : "";
    var colB_raw = data[r][1];
    var colB = colB_raw ? colB_raw.toString().trim() : "";
    var colC = data[r][2] ? data[r][2].toString().trim() : "";
    var colD = data[r][3] ? data[r][3].toString().trim() : "";
    var colE = data[r][4] ? data[r][4].toString().trim() : "";

    if (colA === "Type" || colA === "a. Upcoming Training") continue;
    if (!colA && !colB && !colC && !colD && !colE) { if (colA) lastType = colA; continue; }
    if (colA && !colB && !colC && !colD && !colE) { lastType = colA; continue; }

    var sessionType = colA || lastType;
    if (colA) lastType = colA;

    var dateDisplay = "", sortDate = null;
    if (colB_raw instanceof Date && !isNaN(colB_raw.getTime())) {
      sortDate = colB_raw;
      dateDisplay = formatClassDate(colB_raw);
    } else if (colB) {
      dateDisplay = colB;
      sortDate = parseFuzzyDate_(colB);
    }

    sessions.push({
      type: sessionType, dateDisplay: dateDisplay, sortDate: sortDate,
      rawDate: colB_raw, time: colC, location: colD,
      enrollees: parseEnrolleeList_(colE), rawEnrolleeText: colE, sourceRow: r + 1
    });
  }

  sessions.sort(function(a, b) {
    if (a.sortDate && b.sortDate) return a.sortDate - b.sortDate;
    if (a.sortDate) return -1;
    if (b.sortDate) return 1;
    return 0;
  });
  return sessions;
}

function parseEnrolleeList_(text) {
  if (!text) return [];
  var parts = text.trim().replace(/;/g, ",").split(",");
  var names = [];
  for (var i = 0; i < parts.length; i++) { var n = parts[i].trim(); if (n) names.push(n); }
  return names;
}

function parseFuzzyDate_(str) {
  if (!str) return null;
  var d = parseClassDate(str.toString().trim());
  if (d) return d;
  var months = {"jan":0,"january":0,"feb":1,"february":1,"mar":2,"march":2,"apr":3,"april":3,"may":4,"jun":5,"june":5,"jul":6,"july":6,"aug":7,"august":7,"sep":8,"september":8,"oct":9,"october":9,"nov":10,"november":10,"dec":11,"december":11};
  var match = str.match(/^([A-Za-z]+)\s+(\d{1,2})/);
  if (match) {
    var mo = months[match[1].toLowerCase()], da = parseInt(match[2]);
    if (mo !== undefined && da >= 1 && da <= 31) {
      var yr = new Date().getFullYear();
      var dt = new Date(yr, mo, da);
      if (dt < new Date()) dt = new Date(yr + 1, mo, da);
      dt.setHours(0,0,0,0);
      return dt;
    }
  }
  return null;
}


// ************************************************************
//
//   OVERVIEW: Build from synced sessions
//
// ************************************************************

function buildOverviewFromSyncedSessions_(sessions, allRosters, ss) {
  var classRosterScheduled = {};
  try { classRosterScheduled = scanClassRosterTabs(ss); } catch (e) {}

  var totalEnrollees = 0, totalNeedIt = 0, totalRemoved = 0;
  var scheduledPeople = {};

  for (var s = 0; s < sessions.length; s++) {
    var session = sessions[s];
    var configName = session.configName;
    if (configName) { var tk = configName.toLowerCase(); if (!scheduledPeople[tk]) scheduledPeople[tk] = {}; }

    session.annotatedEnrollees = [];

    var keptList = session.keptEnrollees || [];
    var bfList = session.backfilledEnrollees || [];
    var rmList = session.removedEnrollees || [];

    for (var k = 0; k < keptList.length; k++) {
      if (configName) scheduledPeople[configName.toLowerCase()][keptList[k].toLowerCase().trim()] = true;
      session.annotatedEnrollees.push({ name: keptList[k], bucket: "kept", detail: "Kept — needs this training" });
      totalNeedIt++; totalEnrollees++;
    }
    for (var b = 0; b < bfList.length; b++) {
      if (configName) scheduledPeople[configName.toLowerCase()][bfList[b].toLowerCase().trim()] = true;
      session.annotatedEnrollees.push({ name: bfList[b], bucket: "backfilled", detail: "Added — needs this training" });
      totalNeedIt++; totalEnrollees++;
    }
    for (var r = 0; r < rmList.length; r++) {
      session.annotatedEnrollees.push({ name: rmList[r], bucket: "removed", detail: "Removed — already current" });
      totalRemoved++;
    }
  }

  // Gap analysis
  var gaps = [];
  for (var t = 0; t < allRosters.length; t++) {
    var roster = allRosters[t];
    if (roster.error) continue;
    var tk = roster.name.toLowerCase();
    var schedMap = scheduledPeople[tk] || {};
    var classMap = classRosterScheduled[tk] || {};
    var allPeople = [].concat(roster.expired || [], roster.expiringSoon || [], roster.needed || []);
    var unscheduled = [];
    for (var p = 0; p < allPeople.length; p++) {
      var pLow = allPeople[p].name.toLowerCase().trim();
      if (!schedMap[pLow] && !classMap[pLow]) unscheduled.push({ name: allPeople[p].name, status: allPeople[p].status, expDate: allPeople[p].expDate || "" });
    }
    if (allPeople.length > 0) gaps.push({ training: roster.name, totalNeed: allPeople.length, scheduled: allPeople.length - unscheduled.length, unscheduled: unscheduled });
  }

  return { sessions: sessions, gaps: gaps, totalEnrollees: totalEnrollees, totalNeedIt: totalNeedIt, totalCurrent: totalRemoved, totalTBD: 0 };
}


// ************************************************************
//
//   WRITE SCHEDULED OVERVIEW SHEET
//
// ************************************************************

function writeScheduledOverviewSheet_(result, ss, today) {
  var existing = ss.getSheetByName(OVERVIEW_SHEET_NAME);
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet(OVERVIEW_SHEET_NAME);

  var NAVY="#1F3864",RED="#C00000",ORANGE="#E65100",GREEN="#2E7D32",BLUE="#1565C0";
  var LGRAY="#F2F2F2",LGREEN="#C6EFCE",LRED="#FFC7CE",WHITE="#FFFFFF";
  var row = 1;

  sheet.getRange(row, 1, 1, 6).merge();
  sheet.getRange(row, 1).setValue("EVC Scheduled Training — Synced Overview").setFontSize(16).setFontWeight("bold").setFontColor(WHITE).setBackground(NAVY).setFontFamily("Arial");
  sheet.setRowHeight(row, 36); row++;

  sheet.getRange(row, 1, 1, 6).merge();
  sheet.getRange(row, 1).setValue("Generated: " + Utilities.formatDate(today, Session.getScriptTimeZone(), "EEEE, MMMM d, yyyy 'at' h:mm a")).setFontSize(9).setFontColor("#999999").setBackground(NAVY).setFontFamily("Arial"); row++;

  sheet.getRange(row, 1, 1, 6).merge();
  sheet.getRange(row, 1).setValue("Enrolled (need it): " + result.totalNeedIt + "   |   Removed (current): " + result.totalCurrent)
    .setFontSize(10).setFontColor(WHITE).setFontWeight("bold").setBackground("#2E75B6").setFontFamily("Arial");
  sheet.setRowHeight(row, 28); row += 2;

  // Session-by-session
  sheet.getRange(row, 1, 1, 6).merge();
  sheet.getRange(row, 1).setValue("SESSION-BY-SESSION BREAKDOWN").setFontSize(13).setFontWeight("bold").setFontColor(NAVY).setFontFamily("Arial"); row += 2;

  for (var s = 0; s < result.sessions.length; s++) {
    var session = result.sessions[s];
    var hdr = session.type;
    if (session.dateDisplay) hdr += "  —  " + session.dateDisplay;

    sheet.getRange(row, 1, 1, 6).merge();
    sheet.getRange(row, 1).setValue(hdr).setFontSize(12).setFontWeight("bold").setFontColor(WHITE).setBackground("#2E75B6").setFontFamily("Arial"); row++;

    if (session.time || session.location) {
      var det = [];
      if (session.time) det.push("Time: " + session.time);
      if (session.location) det.push("Location: " + session.location);
      sheet.getRange(row, 1, 1, 6).merge();
      sheet.getRange(row, 1).setValue(det.join("   |   ")).setFontSize(9).setFontColor("#666666").setFontFamily("Arial"); row++;
    }

    sheet.getRange(row, 1, 1, 6).setValues([["#", "Person", "Action", "Detail", "", ""]]);
    sheet.getRange(row, 1, 1, 6).setFontWeight("bold").setFontSize(9).setFontColor(NAVY).setBackground(LGRAY).setFontFamily("Arial"); row++;

    var ae = session.annotatedEnrollees || [];
    for (var e = 0; e < ae.length; e++) {
      var p = ae[e];
      var altFill = (e % 2 === 0) ? WHITE : "#EBF0F7";
      sheet.getRange(row, 1).setValue(e + 1);
      sheet.getRange(row, 2).setValue(p.name);
      if (p.bucket === "removed") {
        sheet.getRange(row, 3).setValue("REMOVED").setFontColor(RED).setFontWeight("bold").setBackground(LRED);
        sheet.getRange(row, 4).setValue(p.detail).setFontColor("#999999");
      } else if (p.bucket === "backfilled") {
        sheet.getRange(row, 3).setValue("BACKFILLED").setFontColor(WHITE).setFontWeight("bold").setBackground(BLUE);
        sheet.getRange(row, 4).setValue(p.detail).setFontColor(BLUE);
      } else {
        sheet.getRange(row, 3).setValue("KEPT").setFontColor(GREEN).setFontWeight("bold").setBackground(LGREEN);
        sheet.getRange(row, 4).setValue(p.detail).setFontColor(GREEN);
      }
      sheet.getRange(row, 1, 1, 6).setFontFamily("Arial").setFontSize(10);
      for (var c = 1; c <= 6; c++) { var cell = sheet.getRange(row, c); if (!cell.getBackground() || cell.getBackground() === "#ffffff") cell.setBackground(altFill); }
      row++;
    }
    row++;
  }

  // Gap analysis
  row++;
  sheet.getRange(row, 1, 1, 6).merge();
  sheet.getRange(row, 1).setValue("GAP ANALYSIS — WHO STILL NEEDS SCHEDULING").setFontSize(13).setFontWeight("bold").setFontColor(NAVY).setFontFamily("Arial"); row += 2;

  sheet.getRange(row, 1, 1, 6).setValues([["Training Type", "Total Need", "Scheduled", "Unscheduled", "Coverage %", ""]]);
  sheet.getRange(row, 1, 1, 6).setFontWeight("bold").setBackground(NAVY).setFontColor(WHITE).setFontFamily("Arial"); row++;

  for (var g = 0; g < result.gaps.length; g++) {
    var gap = result.gaps[g];
    var pct = gap.totalNeed > 0 ? Math.round((gap.scheduled / gap.totalNeed) * 100) : 100;
    sheet.getRange(row, 1).setValue(gap.training).setFontWeight("bold");
    sheet.getRange(row, 2).setValue(gap.totalNeed);
    sheet.getRange(row, 3).setValue(gap.scheduled);
    sheet.getRange(row, 4).setValue(gap.unscheduled.length);
    var pctCell = sheet.getRange(row, 5); pctCell.setValue(pct + "%");
    if (pct >= 80) pctCell.setFontColor(GREEN).setFontWeight("bold");
    else if (pct >= 40) pctCell.setFontColor(ORANGE).setFontWeight("bold");
    else pctCell.setFontColor(RED).setFontWeight("bold");
    if (gap.unscheduled.length > 0) sheet.getRange(row, 4).setFontColor(RED).setFontWeight("bold");
    sheet.getRange(row, 1, 1, 6).setFontFamily("Arial").setFontSize(10); row++;
  }

  row += 2;

  for (var g = 0; g < result.gaps.length; g++) {
    var gap = result.gaps[g];
    if (gap.unscheduled.length === 0) continue;
    sheet.getRange(row, 1, 1, 6).merge();
    sheet.getRange(row, 1).setValue(gap.training + " — " + gap.unscheduled.length + " STILL UNSCHEDULED").setFontSize(11).setFontWeight("bold").setFontColor(WHITE).setBackground(RED).setFontFamily("Arial"); row++;
    sheet.getRange(row, 1, 1, 6).setValues([["#", "Name", "Status", "Expiration", "", ""]]);
    sheet.getRange(row, 1, 1, 6).setFontWeight("bold").setBackground(LGRAY).setFontSize(9).setFontFamily("Arial"); row++;

    var showCount = Math.min(gap.unscheduled.length, 50);
    for (var u = 0; u < showCount; u++) {
      var person = gap.unscheduled[u];
      sheet.getRange(row, 1).setValue(u + 1);
      sheet.getRange(row, 2).setValue(person.name);
      sheet.getRange(row, 3).setValue(person.status);
      sheet.getRange(row, 4).setValue(person.expDate);
      sheet.getRange(row, 1, 1, 6).setFontFamily("Arial").setFontSize(10);
      if (person.status.indexOf("Expired") > -1) sheet.getRange(row, 2, 1, 3).setFontColor(RED);
      else if (person.status.indexOf("Expires") > -1) sheet.getRange(row, 2, 1, 3).setFontColor(ORANGE);
      row++;
    }
    if (gap.unscheduled.length > 50) {
      sheet.getRange(row, 1, 1, 6).merge();
      sheet.getRange(row, 1).setValue("... and " + (gap.unscheduled.length - 50) + " more").setFontStyle("italic").setFontColor("#999999").setFontFamily("Arial"); row++;
    }
    row++;
  }

  sheet.setColumnWidth(1, 40); sheet.setColumnWidth(2, 220); sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 250); sheet.setColumnWidth(5, 120); sheet.setColumnWidth(6, 40);
  sheet.setFrozenRows(3);

  try { var schedSheet = ss.getSheetByName(SCHEDULED_SHEET_NAME); if (schedSheet) { ss.setActiveSheet(sheet); ss.moveActiveSheet(schedSheet.getIndex() + 1); } } catch (e) {}
}


// ************************************************************
//
//   SCANNING (for writeRosterSheet and buildPriorityPool)
//
// ************************************************************

function getClassRosterPrefixes() {
  var prefixes = [];
  for (var i = 0; i < CLASS_ROSTER_CONFIG.length; i++) prefixes.push(CLASS_ROSTER_CONFIG[i].name);
  return prefixes;
}

function scanClassRosterTabs(ss) {
  var scheduled = {}, prefixes = getClassRosterPrefixes(), sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sheetName = sheets[s].getName(), matchedTraining = null;
    for (var p = 0; p < prefixes.length; p++) {
      if (sheetName.indexOf(prefixes[p] + " ") === 0) { if (!matchedTraining || prefixes[p].length > matchedTraining.length) matchedTraining = prefixes[p]; }
    }
    if (!matchedTraining) continue;
    var datePart = sheetName.substring(matchedTraining.length + 1).trim();
    var classDate = parseClassDate(datePart);
    var classDateStr = classDate ? formatClassDate(classDate) : datePart;
    var trainKey = matchedTraining.toLowerCase();
    if (!scheduled[trainKey]) scheduled[trainKey] = {};
    var data = sheets[s].getDataRange().getValues();
    for (var r = 7; r < data.length; r++) {
      var nameVal = data[r][1] ? data[r][1].toString().trim() : "";
      if (!nameVal || nameVal.toLowerCase().indexOf("open seat") > -1) continue;
      if (!scheduled[trainKey][nameVal.toLowerCase()]) scheduled[trainKey][nameVal.toLowerCase()] = classDateStr;
    }
  }
  return scheduled;
}

function scanScheduledSheet(ss) {
  var scheduled = {};
  try {
    var sessions = parseScheduledSheet_(ss);
    if (!sessions) return scheduled;
    for (var s = 0; s < sessions.length; s++) {
      var configName = resolveTrainingName_(sessions[s].type);
      if (!configName) continue;
      var trainKey = configName.toLowerCase();
      if (!scheduled[trainKey]) scheduled[trainKey] = {};
      for (var e = 0; e < sessions[s].enrollees.length; e++) {
        var name = sessions[s].enrollees[e].toLowerCase().trim();
        if (name === "tbd" || name === "new hires") continue;
        if (!scheduled[trainKey][name]) scheduled[trainKey][name] = sessions[s].dateDisplay || "Scheduled";
      }
    }
  } catch (e) { Logger.log("scanScheduledSheet error: " + e.toString()); }
  return scheduled;
}

function buildFullScheduledMap_(ss) {
  var merged = {};
  try { merged = scanClassRosterTabs(ss); } catch (e) {}
  try {
    var fromSched = scanScheduledSheet(ss);
    var keys = Object.keys(fromSched);
    for (var k = 0; k < keys.length; k++) {
      if (!merged[keys[k]]) merged[keys[k]] = {};
      var people = Object.keys(fromSched[keys[k]]);
      for (var p = 0; p < people.length; p++) { if (!merged[keys[k]][people[p]]) merged[keys[k]][people[p]] = fromSched[keys[k]][people[p]]; }
    }
  } catch (e) {}
  return merged;
}


// ************************************************************
//
//   GENERATE CLASS ROSTERS (original feature, preserved)
//
// ************************************************************

function generateClassRosters() {
  var ui = SpreadsheetApp.getUi();
  var msg = "Which training?\n\n0.  ALL\n";
  for (var i = 0; i < CLASS_ROSTER_CONFIG.length; i++) msg += (i+1) + ".  " + CLASS_ROSTER_CONFIG[i].name + " (cap: " + CLASS_ROSTER_CONFIG[i].classCapacity + ")\n";
  msg += "\nEnter number(s):";

  var choice = ui.prompt("Generate Class Rosters", msg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;
  var input = choice.getResponseText().trim();
  var selectedConfigs = [];
  if (input === "0") selectedConfigs = CLASS_ROSTER_CONFIG.slice();
  else { var parts = input.split(","); for (var p = 0; p < parts.length; p++) { var idx = parseInt(parts[p].trim()) - 1; if (!isNaN(idx) && idx >= 0 && idx < CLASS_ROSTER_CONFIG.length) selectedConfigs.push(CLASS_ROSTER_CONFIG[idx]); } }
  if (selectedConfigs.length === 0) { ui.alert("No valid selection."); return; }

  var rosterResult = buildRosterData(true);
  if (!rosterResult) { ui.alert("Could not read Training sheet."); return; }
  var ss = rosterResult.ss, today = rosterResult.today, allRosters = rosterResult.allRosters;
  var alreadyScheduled = buildFullScheduledMap_(ss);
  var tabsCreated = 0, summaryLines = [];

  for (var s = 0; s < selectedConfigs.length; s++) {
    var config = selectedConfigs[s];
    var rosterData = null;
    for (var r = 0; r < allRosters.length; r++) { if (allRosters[r].name === config.name) { rosterData = allRosters[r]; break; } }
    if (!rosterData || rosterData.error) { summaryLines.push(config.name + ": Skipped"); continue; }

    var pool = buildPriorityPool(rosterData, alreadyScheduled, config.name);
    if (pool.length === 0) { summaryLines.push(config.name + ": Everyone scheduled!"); continue; }

    var dates = generateUpcomingDates(config, today);
    var dateStr = ""; for (var d = 0; d < dates.length; d++) dateStr += formatClassDate(dates[d]) + "\n";
    if (!dateStr) dateStr = "(none)\n";

    var dp = ui.prompt(config.name + " — Dates", "Dates:\n" + dateStr + "\nPool: " + pool.length + "\nCapacity: " + config.classCapacity + "/class\n\nEdit (M/D/YYYY, one per line):", ui.ButtonSet.OK_CANCEL);
    if (dp.getSelectedButton() !== ui.Button.OK) continue;
    var di = dp.getResponseText().trim();
    if (!di) { summaryLines.push(config.name + ": Skipped"); continue; }
    var finalDates = parseDateList(di);
    if (finalDates.length === 0) { summaryLines.push(config.name + ": No valid dates"); continue; }

    var cp = ui.prompt(config.name + " — Capacity", "Max seats? (Default: " + config.classCapacity + ")", ui.ButtonSet.OK_CANCEL);
    if (cp.getSelectedButton() !== ui.Button.OK) continue;
    var ci = cp.getResponseText().trim();
    var capacity = config.classCapacity;
    if (ci && !isNaN(parseInt(ci))) capacity = parseInt(ci);

    var assignments = assignToClasses(pool, finalDates, capacity);
    for (var a = 0; a < assignments.length; a++) {
      var classInfo = assignments[a];
      var tabName = buildTabName(config.name, classInfo.date);
      var et = ss.getSheetByName(tabName); if (et) ss.deleteSheet(et);
      var tab = ss.insertSheet(tabName);
      writeClassRosterTab(tab, config.name, classInfo, capacity, today);
      tabsCreated++;
      for (var ap = 0; ap < classInfo.people.length; ap++) {
        var tk = config.name.toLowerCase();
        if (!alreadyScheduled[tk]) alreadyScheduled[tk] = {};
        alreadyScheduled[tk][classInfo.people[ap].name.toLowerCase().trim()] = formatClassDate(classInfo.date);
      }
    }
    var ta = 0; for (var aa = 0; aa < assignments.length; aa++) ta += assignments[aa].people.length;
    var lo = pool.length - ta;
    summaryLines.push(config.name + ": " + ta + " assigned, " + finalDates.length + " class(es)" + (lo > 0 ? " | " + lo + " unassigned" : ""));
  }

  generateRostersSilent(); orderClassRosterTabs(ss);
  var summary = "Complete! Tabs: " + tabsCreated + "\n\n";
  for (var sl = 0; sl < summaryLines.length; sl++) summary += summaryLines[sl] + "\n";
  ui.alert(summary);
}


// ************************************************************
//
//   POOL BUILDING & ASSIGNMENT
//
// ************************************************************

function buildPriorityPool(rosterData, alreadyScheduled, trainingName) {
  var pool = [], trainKey = trainingName.toLowerCase(), scheduledMap = alreadyScheduled[trainKey] || {};
  for (var p = 0; p < SEAT_PRIORITY.length; p++) {
    var bd = rosterData[SEAT_PRIORITY[p].bucket] || [];
    for (var i = 0; i < bd.length; i++) {
      if (scheduledMap[bd[i].name.toLowerCase().trim()]) continue;
      pool.push({ name: bd[i].name, status: bd[i].status, bucket: SEAT_PRIORITY[p].bucket, lastDate: bd[i].lastDate || "", expDate: bd[i].expDate || "" });
    }
  }
  return pool;
}

function assignToClasses(pool, dates, capacity) {
  var assignments = [], assigned = {};
  for (var d = 0; d < dates.length; d++) {
    var cd = dates[d], cg = { date: cd, people: [] };
    var cands = [];
    for (var p = 0; p < pool.length; p++) { if (assigned[pool[p].name.toLowerCase()]) continue; cands.push({ person: pool[p], ep: getEffectivePriority(pool[p], cd), oi: p }); }
    cands.sort(function(a, b) { return a.ep !== b.ep ? a.ep - b.ep : a.oi - b.oi; });
    for (var c = 0; c < cands.length && cg.people.length < capacity; c++) {
      var cn = cands[c];
      var copy = { name: cn.person.name, status: cn.person.status, bucket: cn.person.bucket, lastDate: cn.person.lastDate, expDate: cn.person.expDate, effectiveBucket: cn.ep <= 2 ? "expired" : cn.person.bucket };
      if (cn.ep === 2 && cn.person.bucket === "expiringSoon") { copy.status = "Will expire before class (" + cn.person.expDate + ")"; copy.effectiveBucket = "expired"; }
      cg.people.push(copy); assigned[cn.person.name.toLowerCase()] = true;
    }
    assignments.push(cg);
  }
  return assignments;
}

function getEffectivePriority(person, classDate) {
  if (person.bucket === "expired") return 1;
  if (person.bucket === "expiringSoon" && person.expDate) { var exp = parseClassDate(person.expDate); if (exp && exp.getTime() < classDate.getTime()) return 2; return 4; }
  if (person.bucket === "needed") return 3;
  return 5;
}


// ************************************************************
//
//   DATE GENERATION
//
// ************************************************************

function generateUpcomingDates(config, today) {
  var dates = [], schedule = config.schedule || {}, weeksOut = config.weeksOut || 4;
  if (schedule.dates) { for (var d = 0; d < schedule.dates.length; d++) { var p = parseClassDate(schedule.dates[d]); if (p && p >= today) dates.push(p); } }
  var recurring = schedule.recurring || [];
  var dayMap = {"sunday":0,"monday":1,"tuesday":2,"wednesday":3,"thursday":4,"friday":5,"saturday":6};
  for (var rc = 0; rc < recurring.length; rc++) {
    var rule = recurring[rc]; if (!rule.weekday) continue;
    var td = dayMap[rule.weekday.toLowerCase()]; if (td === undefined) continue;
    var ed = new Date(today); ed.setDate(ed.getDate() + weeksOut * 7);
    var cursor = new Date(today); while (cursor.getDay() !== td) cursor.setDate(cursor.getDate() + 1);
    while (cursor <= ed) {
      var skip = false;
      if (rule.nthWeek && rule.nthWeek.length > 0) { var wn = Math.ceil(cursor.getDate() / 7); var ins = false; for (var w = 0; w < rule.nthWeek.length; w++) { if (rule.nthWeek[w] === wn) { ins = true; break; } } if (!ins) skip = true; }
      if (!skip) { var dup = false; for (var dd = 0; dd < dates.length; dd++) { if (dates[dd].getTime() === cursor.getTime()) { dup = true; break; } } if (!dup) dates.push(new Date(cursor)); }
      cursor.setDate(cursor.getDate() + 7);
    }
  }
  dates.sort(function(a, b) { return a - b; });
  return dates;
}


// ************************************************************
//
//   CLASS ROSTER TAB OUTPUT
//
// ************************************************************

function writeClassRosterTab(sheet, trainingName, classInfo, capacity, today) {
  var NAVY="#1F3864",RED="#C00000",ORANGE="#E65100",GREEN="#2E7D32",LGRAY="#F2F2F2",WHITE="#FFFFFF";
  var row = 1;
  sheet.getRange(row, 1, 1, 5).merge();
  sheet.getRange(row, 1).setValue(trainingName + " — Class Roster").setFontSize(14).setFontWeight("bold").setFontColor(WHITE).setBackground(NAVY).setFontFamily("Arial"); row++;
  sheet.getRange(row, 1).setValue("Class Date:").setFontWeight("bold").setFontFamily("Arial");
  sheet.getRange(row, 2).setValue(formatClassDate(classInfo.date)).setFontFamily("Arial"); row++;
  sheet.getRange(row, 1).setValue("Generated:").setFontWeight("bold").setFontFamily("Arial");
  sheet.getRange(row, 2).setValue(Utilities.formatDate(today, Session.getScriptTimeZone(), "M/d/yyyy h:mm a")).setFontSize(9).setFontColor("#666666").setFontFamily("Arial"); row++;
  sheet.getRange(row, 1).setValue("Capacity:").setFontWeight("bold").setFontFamily("Arial");
  sheet.getRange(row, 2).setValue(classInfo.people.length + " / " + capacity).setFontFamily("Arial"); row++;
  sheet.getRange(row, 1).setValue("HR Program Coordinator: Kyle Mahoney").setFontSize(9).setFontColor("#666666").setFontFamily("Arial"); row += 2;
  sheet.getRange(row, 1, 1, 5).setValues([["#", "Name", "Status", "Last Completed", "Priority"]]);
  sheet.getRange(row, 1, 1, 5).setFontWeight("bold").setBackground(LGRAY).setFontFamily("Arial").setFontSize(10); row++;
  for (var i = 0; i < classInfo.people.length; i++) {
    var p = classInfo.people[i], pl = "", lc = NAVY, db = p.effectiveBucket || p.bucket;
    if (db === "expired") { pl = p.bucket === "expired" ? "EXPIRED" : "EXPIRES BEFORE CLASS"; lc = RED; }
    else if (db === "needed") { pl = "NEVER COMPLETED"; }
    else if (db === "expiringSoon") { pl = "EXPIRING SOON"; lc = ORANGE; }
    sheet.getRange(row, 1, 1, 5).setValues([[i+1, p.name, p.status, p.lastDate, pl]]);
    sheet.getRange(row, 1, 1, 5).setFontFamily("Arial").setFontSize(10);
    sheet.getRange(row, 5).setFontColor(WHITE).setBackground(lc).setFontWeight("bold");
    sheet.getRange(row, 3).setFontColor(lc); row++;
  }
  var es = capacity - classInfo.people.length;
  if (es > 0) { row++; sheet.getRange(row, 1, 1, 5).merge(); sheet.getRange(row, 1).setValue(es + " open seat(s)").setFontColor(GREEN).setFontStyle("italic").setFontFamily("Arial"); }
  sheet.setColumnWidth(1, 40); sheet.setColumnWidth(2, 200); sheet.setColumnWidth(3, 220); sheet.setColumnWidth(4, 130); sheet.setColumnWidth(5, 160);
  sheet.setFrozenRows(7);
}

function buildTabName(trainingName, date) {
  var name = trainingName + " " + formatClassDate(date);
  name = name.replace(/[:\\\/?*\[\]]/g, "");
  return name.length > 100 ? name.substring(0, 100) : name;
}


// ************************************************************
//
//   writeRosterSheet (scans BOTH class tabs + Scheduled sheet)
//
// ************************************************************

function writeRosterSheet(ss, allRosters, today) {
  var existing = ss.getSheetByName(ROSTER_SHEET_NAME);
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet(ROSTER_SHEET_NAME);
  var NAVY="#1F3864",RED="#C00000",ORANGE="#E65100",GREEN="#2E7D32",BLUE="#1565C0",LGRAY="#F2F2F2",WHITE="#FFFFFF";
  var alreadyScheduled = buildFullScheduledMap_(ss);
  var row = 1;
  sheet.getRange(row, 1).setValue("EVC Training Rosters").setFontSize(16).setFontWeight("bold").setFontColor(NAVY).setFontFamily("Arial"); row++;
  sheet.getRange(row, 1).setValue("Generated: " + Utilities.formatDate(today, Session.getScriptTimeZone(), "EEEE, MMMM d, yyyy 'at' h:mm a")).setFontSize(10).setFontColor("#666666").setFontFamily("Arial"); row++;
  sheet.getRange(row, 1).setValue("HR Program Coordinator: Kyle Mahoney").setFontSize(10).setFontColor("#666666").setFontFamily("Arial"); row += 2;

  for (var t = 0; t < allRosters.length; t++) {
    var roster = allRosters[t];
    var rl = roster.renewalYears === 0 ? "Indefinite" : roster.renewalYears + " Year Renewal";
    if (roster.error) rl = "ERROR";
    var rq = roster.required ? " | REQUIRED FOR ALL" : " | Excusable";
    sheet.getRange(row, 1, 1, 6).merge();
    sheet.getRange(row, 1).setValue(roster.name + "  (" + rl + rq + ")").setFontSize(13).setFontWeight("bold").setFontColor(WHITE).setBackground(NAVY).setFontFamily("Arial"); row++;
    if (roster.error) { sheet.getRange(row, 1).setValue(roster.error).setFontColor(RED).setFontStyle("italic"); row += 2; continue; }
    var tf = roster.expired.length + roster.expiringSoon.length + roster.needed.length;
    if (tf === 0) { sheet.getRange(row, 1).setValue("All staff are current.").setFontColor(GREEN).setFontWeight("bold").setFontFamily("Arial"); row += 2; continue; }

    sheet.getRange(row, 1, 1, 6).setValues([["Name", "Status", "Last Completed", "Expiration Date", "Priority", "Scheduled"]]);
    sheet.getRange(row, 1, 1, 6).setFontWeight("bold").setBackground(LGRAY).setFontFamily("Arial"); row++;

    var tk = roster.name.toLowerCase(), sm = alreadyScheduled[tk] || {};
    var all = [];
    for (var e = 0; e < roster.expired.length; e++) all.push({ emp: roster.expired[e], pri: "EXPIRED", col: RED, sortPri: 1 });
    for (var es = 0; es < roster.expiringSoon.length; es++) all.push({ emp: roster.expiringSoon[es], pri: "EXPIRING SOON", col: ORANGE, sortPri: 3 });
    for (var n = 0; n < roster.needed.length; n++) {
      var isF = roster.needed[n].status && roster.needed[n].status.toLowerCase().indexOf("failed") > -1;
      all.push({ emp: roster.needed[n], pri: "NEEDS TRAINING", col: NAVY, sortPri: isF ? 8 : 2 });
    }

    // Sort: scheduled people first, then by priority within each group
    all.sort(function(a, b) {
      var aS = sm[a.emp.name.toLowerCase().trim()] ? 0 : 1;
      var bS = sm[b.emp.name.toLowerCase().trim()] ? 0 : 1;
      if (aS !== bS) return aS - bS;
      return a.sortPri - b.sortPri;
    });

    var hasScheduled = false;
    for (var ch = 0; ch < all.length; ch++) { if (sm[all[ch].emp.name.toLowerCase().trim()]) { hasScheduled = true; break; } }
    var wroteUnschedHeader = false;

    for (var a = 0; a < all.length; a++) {
      var item = all[a], emp = item.emp;
      var pl = emp.name.toLowerCase().trim();
      var sd = sm[pl] || "", sl = sd ? "Scheduled (" + sd + ")" : "";

      if (hasScheduled && a === 0) {
        sheet.getRange(row, 1, 1, 6).merge();
        sheet.getRange(row, 1).setValue("▸ SCHEDULED").setFontSize(9).setFontWeight("bold").setFontColor(BLUE).setBackground("#D6E4F0").setFontFamily("Arial");
        row++;
      }
      if (hasScheduled && !sd && !wroteUnschedHeader) {
        wroteUnschedHeader = true;
        sheet.getRange(row, 1, 1, 6).merge();
        sheet.getRange(row, 1).setValue("▸ NOT YET SCHEDULED").setFontSize(9).setFontWeight("bold").setFontColor(RED).setBackground("#FCE4EC").setFontFamily("Arial");
        row++;
      }

      sheet.getRange(row, 1, 1, 6).setValues([[emp.name, emp.status, emp.lastDate || "", emp.expDate || "", item.pri, sl]]);
      sheet.getRange(row, 5).setFontColor(WHITE).setBackground(item.col).setFontWeight("bold");
      if (item.col !== NAVY) sheet.getRange(row, 1, 1, 4).setFontColor(item.col);
      if (sd) sheet.getRange(row, 6).setFontColor(WHITE).setBackground(BLUE).setFontWeight("bold");
      row++;
    }
    row++;
  }
  sheet.setColumnWidth(1, 200); sheet.setColumnWidth(2, 200); sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 140); sheet.setColumnWidth(5, 150); sheet.setColumnWidth(6, 200);
  sheet.setFrozenRows(4);
}


// ************************************************************
//
//   TAB ORDERING & MONITORING
//
// ************************************************************

function orderClassRosterTabs(ss) {
  var sheets = ss.getSheets(), prefixes = getClassRosterPrefixes(), classSheets = [], coreCount = 0;
  for (var s = 0; s < sheets.length; s++) {
    var name = sheets[s].getName(), isClass = false;
    for (var p = 0; p < prefixes.length; p++) {
      if (name.indexOf(prefixes[p] + " ") === 0) {
        isClass = true;
        var dp = name.substring(prefixes[p].length + 1).trim(), pd = parseClassDate(dp);
        var ci = -1; for (var c = 0; c < CLASS_ROSTER_CONFIG.length; c++) { if (CLASS_ROSTER_CONFIG[c].name === prefixes[p]) { ci = c; break; } }
        classSheets.push({ sheet: sheets[s], ci: ci >= 0 ? ci : 999, dm: pd ? pd.getTime() : 0 });
        break;
      }
    }
    if (!isClass) coreCount++;
  }
  if (classSheets.length === 0) return;
  classSheets.sort(function(a, b) { return a.ci !== b.ci ? a.ci - b.ci : a.dm - b.dm; });
  for (var i = 0; i < classSheets.length; i++) { ss.setActiveSheet(classSheets[i].sheet); ss.moveActiveSheet(coreCount + i + 1); }
}

function monitorClassRosterTabs() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), props = PropertiesService.getScriptProperties();
    var prefixes = getClassRosterPrefixes(), sheets = ss.getSheets(), ct = [];
    for (var s = 0; s < sheets.length; s++) { var n = sheets[s].getName(); for (var p = 0; p < prefixes.length; p++) { if (n.indexOf(prefixes[p] + " ") === 0) { ct.push(n); break; } } }
    var ck = ct.sort().join("|"), pk = props.getProperty("classRosterTabs") || "";
    if (pk && ck !== pk) { var pt = pk.split("|"), rm = false; for (var i = 0; i < pt.length; i++) { if (pt[i] && ct.indexOf(pt[i]) === -1) { rm = true; break; } } if (rm) { generateRostersSilent(); orderClassRosterTabs(ss); } }
    props.setProperty("classRosterTabs", ck);

    // Monitor the Scheduled sheet — if enrollment data changed, run a full silent sync
    var schedSheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
    if (schedSheet) {
      var schedData = schedSheet.getDataRange().getValues();
      var enrollHash = "";
      for (var r = 0; r < schedData.length; r++) {
        var colE = schedData[r][4] ? schedData[r][4].toString().trim() : "";
        if (colE) enrollHash += r + ":" + colE + "|";
      }
      var prevHash = props.getProperty("scheduledEnrollHash") || "";
      if (prevHash && enrollHash !== prevHash) {
        Logger.log("Scheduled sheet changed — running silent sync");
        syncScheduledSilent_();
      }
      props.setProperty("scheduledEnrollHash", enrollHash);
    }
  } catch (e) { Logger.log("monitor error: " + e.toString()); }
}

// ============================================================
// syncScheduledSilent_ — same logic as syncScheduledTrainings
// but no UI prompts/alerts. Called by the monitor and by
// onScheduledSheetEdit.
// ============================================================
function syncScheduledSilent_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var rosterResult = buildRosterData(true);
    if (!rosterResult) return;
    var allRosters = rosterResult.allRosters;
    var today = rosterResult.today;
    var needsLookup = buildNeedsLookup_(allRosters);
    var sessions = parseScheduledSheet_(ss);
    if (!sessions || sessions.length === 0) return;

    var SYNC_CUTOFF = new Date(2026, 3, 1);
    SYNC_CUTOFF.setHours(0, 0, 0, 0);

    var globalAssigned = {};

    for (var s = 0; s < sessions.length; s++) {
      var session = sessions[s];
      var configName = resolveTrainingName_(session.type);
      session.configName = configName;

      // Skip sessions before cutoff or untracked types — keep as-is
      if ((session.sortDate && session.sortDate < SYNC_CUTOFF) || configName === null) {
        session.finalEnrollees = session.enrollees.slice();
        session.keptEnrollees = session.enrollees.slice();
        session.removedEnrollees = [];
        session.backfilledEnrollees = [];
        session.placeholders = [];
        continue;
      }

      var needsMap = needsLookup[configName.toLowerCase()] || {};
      if (!globalAssigned[configName.toLowerCase()]) globalAssigned[configName.toLowerCase()] = {};
      var assignedMap = globalAssigned[configName.toLowerCase()];
      var capacity = getCapacityForTraining_(configName);

      var kept = [], removed = [], placeholders = [];

      for (var e = 0; e < session.enrollees.length; e++) {
        var name = session.enrollees[e];
        var nameLower = name.toLowerCase().trim();
        if (nameLower === "tbd" || nameLower === "new hires") { placeholders.push(name); continue; }
        var info = needsMap[nameLower];
        if (!info) info = fuzzyMatchNeeds_(nameLower, needsMap);
        if (info) { kept.push(name); assignedMap[nameLower] = true; }
        else { removed.push(name); }
      }

      var openSeats = capacity - kept.length;
      if (openSeats < 0) openSeats = 0;
      var backfilled = [];
      if (openSeats > 0) {
        var pool = buildBackfillPool_(needsMap, assignedMap);
        pool.sort(function(a, b) { return getPriorityNumber_(a) - getPriorityNumber_(b); });
        for (var f = 0; f < pool.length && backfilled.length < openSeats; f++) {
          var pLower = pool[f].name.toLowerCase().trim();
          if (assignedMap[pLower]) continue;
          backfilled.push(pool[f].name);
          assignedMap[pLower] = true;
        }
      }

      session.finalEnrollees = kept.concat(backfilled);
      session.removedEnrollees = removed;
      session.backfilledEnrollees = backfilled;
      session.keptEnrollees = kept;
      session.placeholders = placeholders;
    }

    rewriteScheduledSheet_(ss, sessions);
    var overviewResult = buildOverviewFromSyncedSessions_(sessions, allRosters, ss);
    writeScheduledOverviewSheet_(overviewResult, ss, today);
    generateRostersSilent();
    Logger.log("Silent sync complete");
  } catch (e) {
    Logger.log("syncScheduledSilent_ error: " + e.toString());
  }
}

// ============================================================
// onScheduledSheetEdit — call this from onTrainingEdit in
// Code.gs for instant sync when the Scheduled sheet is edited.
//
// Add this block to onTrainingEdit in Code.gs, after the
// Training Records section:
//
//   if (sheetName === "Scheduled") {
//     try { syncScheduledSilent_(); } catch (e) {
//       Logger.log("Scheduled sync error: " + e.toString());
//     }
//   }
//
// ============================================================

function installClassRosterTriggers() {
  var ui = SpreadsheetApp.getUi();
  var triggers = ScriptApp.getProjectTriggers(), rm = 0;
  for (var i = 0; i < triggers.length; i++) { if (triggers[i].getHandlerFunction() === "monitorClassRosterTabs") { ScriptApp.deleteTrigger(triggers[i]); rm++; } }
  ScriptApp.newTrigger("monitorClassRosterTabs").timeBased().everyMinutes(1).create();
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), prefixes = getClassRosterPrefixes(), sheets = ss.getSheets(), ct = [];
    for (var s = 0; s < sheets.length; s++) { var n = sheets[s].getName(); for (var p = 0; p < prefixes.length; p++) { if (n.indexOf(prefixes[p] + " ") === 0) { ct.push(n); break; } } }
    PropertiesService.getScriptProperties().setProperty("classRosterTabs", ct.sort().join("|"));
  } catch (e) {}
  ui.alert("Triggers installed!" + (rm > 0 ? " Removed " + rm + " old." : "") + "\nMonitors tab deletions every minute.");
}


// ************************************************************
//
//   DATE HELPERS
//
// ************************************************************

function formatClassDate(d) { if (!d) return ""; return (d.getMonth()+1) + "/" + d.getDate() + "/" + d.getFullYear(); }

function parseClassDate(str) {
  if (!str) return null; str = str.toString().trim();
  var parts = str.split("/");
  if (parts.length === 3) { var mo = parseInt(parts[0])-1, da = parseInt(parts[1]), yr = parseInt(parts[2]); if (yr < 100) yr += 2000; var d = new Date(yr, mo, da); d.setHours(0,0,0,0); if (!isNaN(d.getTime())) return d; }
  var d2 = new Date(str); if (!isNaN(d2.getTime())) { d2.setHours(0,0,0,0); return d2; }
  return null;
}

function parseDateList(input) {
  var lines = input.split(/[\n,]+/), dates = [];
  for (var i = 0; i < lines.length; i++) { var d = parseClassDate(lines[i].trim()); if (d) dates.push(d); }
  dates.sort(function(a, b) { return a - b; });
  return dates;
}
