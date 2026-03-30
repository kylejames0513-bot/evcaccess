// ============================================================
// EVC Class Roster Generator + Scheduled Sync — v5
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
//
// NOTE: Constants, date parsing, and utilities are in Shared.gs
//   (SCHEDULED_SHEET_NAME, OVERVIEW_SHEET_NAME, CLASS_ROSTER_CONFIG,
//    SEAT_PRIORITY, SCHEDULED_TYPE_MAP, REMOVAL_LOG_SHEET,
//    REMOVAL_REASONS, formatClassDate, parseClassDate, parseDateList,
//    parseFuzzyDate_, escapeRegex)
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
//   .addItem("Install Overview Sync Trigger (run once)", "installOverviewSyncTrigger")
//
// ============================================================
// v5 CHANGES:
//   - Moved constants and date helpers to Shared.gs
//   - Unified removal workflow via executeRemoval_()
//   - Added removeFromScheduledSheet_() and removeFromOverview_()
//   - Added offerBackfill_() for post-removal backfill prompts
//   - Replaced Logger.log in catch blocks with logError_()
//   - JSDoc on key functions
// ============================================================


// ************************************************************
//
//   SHEET WRITER — Batch formatting helper
//
// ************************************************************

/**
 * SheetWriter accumulates rows of data + formatting,
 * then writes everything to the sheet in one batch.
 * Much faster than cell-by-cell formatting.
 *
 * @constructor
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to write to
 */
function SheetWriter(sheet) {
  this.sheet = sheet;
  this.values = [];
  this.backgrounds = [];
  this.fontColors = [];
  this.fontWeights = [];
  this.fontSizes = [];
  this.fontFamilies = [];
  this.merges = [];        // [{row, cols}]  (0-indexed row)
  this.colCount = 7;       // default columns
  this.startRow = 1;       // 1-indexed start
}

SheetWriter.prototype.setColCount = function(n) { this.colCount = n; return this; };
SheetWriter.prototype.setStartRow = function(r) { this.startRow = r; return this; };

/**
 * addRow(values, opts)
 *   values: array of cell values (auto-padded to colCount)
 *   opts: { bg, fontColor, fontWeight, fontSize, merge,
 *           cellBgs: [], cellColors: [], cellWeights: [], cellSizes: [] }
 */
SheetWriter.prototype.addRow = function(vals, opts) {
  opts = opts || {};
  var row = [];
  var bgs = [], colors = [], weights = [], sizes = [], families = [];

  for (var c = 0; c < this.colCount; c++) {
    row.push(c < vals.length ? vals[c] : "");

    // Cell-level overrides beat row-level defaults
    bgs.push((opts.cellBgs && opts.cellBgs[c]) || opts.bg || "#FFFFFF");
    colors.push((opts.cellColors && opts.cellColors[c]) || opts.fontColor || "#000000");
    weights.push((opts.cellWeights && opts.cellWeights[c]) || opts.fontWeight || "normal");
    sizes.push((opts.cellSizes && opts.cellSizes[c]) || opts.fontSize || 10);
    families.push("Arial");
  }

  this.values.push(row);
  this.backgrounds.push(bgs);
  this.fontColors.push(colors);
  this.fontWeights.push(weights);
  this.fontSizes.push(sizes);
  this.fontFamilies.push(families);

  if (opts.merge) {
    this.merges.push({ row: this.values.length - 1, cols: this.colCount });
  }

  return this;
};

/**
 * flush() — writes everything to the sheet at once
 * @return {number} The next available row (1-indexed)
 */
SheetWriter.prototype.flush = function() {
  if (this.values.length === 0) return this.startRow;

  var range = this.sheet.getRange(this.startRow, 1, this.values.length, this.colCount);
  range.setValues(this.values);
  range.setBackgrounds(this.backgrounds);
  range.setFontColors(this.fontColors);
  range.setFontWeights(this.fontWeights);
  range.setFontSizes(this.fontSizes);
  range.setFontFamilies(this.fontFamilies);

  // Apply merges
  for (var m = 0; m < this.merges.length; m++) {
    var mr = this.merges[m];
    this.sheet.getRange(this.startRow + mr.row, 1, 1, mr.cols).merge();
  }

  return this.startRow + this.values.length;
};

/**
 * Reset for next section, starting at a new row
 */
SheetWriter.prototype.reset = function(newStartRow) {
  this.values = [];
  this.backgrounds = [];
  this.fontColors = [];
  this.fontWeights = [];
  this.fontSizes = [];
  this.fontFamilies = [];
  this.merges = [];
  this.startRow = newStartRow;
  return this;
};


// ************************************************************
//
//   SYNC SCHEDULED TRAININGS  (the main new feature)
//
// ************************************************************

/**
 * Sync the Scheduled sheet with current training needs.
 * Removes people who are current, backfills with those who still
 * need training, rebuilds the Overview, and refreshes rosters.
 */
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

  var NAVY = "#1F3864", RED = "#C00000", ORANGE = "#E65100", GREEN = "#2E7D32", BLUE = "#1565C0";
  var LGRAY = "#F2F2F2", LGREEN = "#C6EFCE", LRED = "#FFC7CE", WHITE = "#FFFFFF", ALT_BLUE = "#EBF0F7";
  var COLS = 6;

  // ---- HEADER ----
  var w = new SheetWriter(sheet).setColCount(COLS);

  w.addRow(["EVC Scheduled Training — Control Center"], { bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 16, merge: true });
  w.addRow(["Generated: " + Utilities.formatDate(today, Session.getScriptTimeZone(), "EEEE, MMMM d, yyyy 'at' h:mm a")], { bg: NAVY, fontColor: "#999999", fontSize: 9, merge: true });
  w.addRow(["Enrolled (need it): " + result.totalNeedIt + "   |   Removed (current): " + result.totalCurrent + "   |   Select a row → Menu → Remove from Class Roster"], {
    bg: "#2E75B6", fontColor: WHITE, fontWeight: "bold", fontSize: 10, merge: true
  });
  w.addRow([]);

  // ---- SESSION-BY-SESSION ----
  w.addRow(["SESSION-BY-SESSION BREAKDOWN"], { fontColor: NAVY, fontWeight: "bold", fontSize: 13, merge: true });
  w.addRow([]);

  var headerEnd = w.flush();
  var row = headerEnd;

  // Build snapshot for onChange detection
  // Each session's enrollees are stored with a marker in col F (hidden)
  var snapshot = [];

  for (var s = 0; s < result.sessions.length; s++) {
    var session = result.sessions[s];
    var hdr = session.type;
    if (session.dateDisplay) hdr += "  —  " + session.dateDisplay;

    var sw = new SheetWriter(sheet).setColCount(COLS).setStartRow(row);

    // Session header row — store session index in col 6 as metadata
    sw.addRow([hdr, "", "", "", "", "SESSION:" + s], {
      bg: "#2E75B6", fontColor: WHITE, fontWeight: "bold", fontSize: 12, merge: false,
      cellColors: [WHITE, WHITE, WHITE, WHITE, WHITE, "#2E75B6"]
    });

    if (session.time || session.location) {
      var det = [];
      if (session.time) det.push("Time: " + session.time);
      if (session.location) det.push("Location: " + session.location);
      sw.addRow([det.join("   |   ")], { fontColor: "#666666", fontSize: 9, merge: true });
    }

    sw.addRow(["#", "Person", "Action", "Detail", "Training", ""], {
      bg: LGRAY, fontColor: NAVY, fontWeight: "bold", fontSize: 9
    });

    var sessionSnap = {
      sessionType: session.type,
      dateDisplay: session.dateDisplay || "",
      enrollees: []
    };

    var ae = session.annotatedEnrollees || [];
    for (var e = 0; e < ae.length; e++) {
      var p = ae[e];
      var altFill = (e % 2 === 0) ? WHITE : ALT_BLUE;

      var actionLabel = "KEPT", actionBg = LGREEN, actionColor = GREEN, detailColor = GREEN;
      if (p.bucket === "removed") {
        actionLabel = "REMOVED"; actionBg = LRED; actionColor = RED; detailColor = "#999999";
      } else if (p.bucket === "backfilled") {
        actionLabel = "BACKFILLED"; actionBg = BLUE; actionColor = WHITE; detailColor = BLUE;
      }

      // Store enrollee metadata in col 6 for sync detection
      var enrolleeMeta = "ENROLLEE:" + s + ":" + p.name;

      sw.addRow([e + 1, p.name, actionLabel, p.detail || "", session.type, enrolleeMeta], {
        cellBgs: [altFill, altFill, actionBg, altFill, altFill, altFill],
        cellColors: ["#000000", "#000000", actionColor, detailColor, "#666666", altFill],
        cellWeights: ["normal", "normal", "bold", "normal", "normal", "normal"],
        cellSizes: [10, 10, 10, 10, 9, 9]
      });

      // Only snapshot active enrollees (not removed)
      if (p.bucket !== "removed") {
        sessionSnap.enrollees.push(p.name);
      }
    }

    sw.addRow([]);
    row = sw.flush();
    snapshot.push(sessionSnap);
  }

  // ---- GAP ANALYSIS ----
  var gw = new SheetWriter(sheet).setColCount(COLS).setStartRow(row);
  gw.addRow([]);
  gw.addRow(["GAP ANALYSIS — WHO STILL NEEDS SCHEDULING"], { fontColor: NAVY, fontWeight: "bold", fontSize: 13, merge: true });
  gw.addRow([]);
  gw.addRow(["Training Type", "Total Need", "Scheduled", "Unscheduled", "Coverage %", ""], {
    bg: NAVY, fontColor: WHITE, fontWeight: "bold"
  });

  for (var g = 0; g < result.gaps.length; g++) {
    var gap = result.gaps[g];
    var pct = gap.totalNeed > 0 ? Math.round((gap.scheduled / gap.totalNeed) * 100) : 100;
    var pctColor = pct >= 80 ? GREEN : (pct >= 40 ? ORANGE : RED);
    var gapBg = (g % 2 === 0) ? WHITE : ALT_BLUE;

    gw.addRow([gap.training, gap.totalNeed, gap.scheduled, gap.unscheduled.length, pct + "%", ""], {
      bg: gapBg,
      cellWeights: ["bold", "normal", "normal", gap.unscheduled.length > 0 ? "bold" : "normal", "bold", "normal"],
      cellColors: ["#000000", "#000000", "#000000", gap.unscheduled.length > 0 ? RED : "#000000", pctColor, "#000000"]
    });
  }

  gw.addRow([]);
  row = gw.flush();

  // ---- UNSCHEDULED LISTS ----
  for (var g = 0; g < result.gaps.length; g++) {
    var gap = result.gaps[g];
    if (gap.unscheduled.length === 0) continue;

    var uw = new SheetWriter(sheet).setColCount(COLS).setStartRow(row);
    uw.addRow([gap.training + " — " + gap.unscheduled.length + " STILL UNSCHEDULED"], {
      bg: RED, fontColor: WHITE, fontWeight: "bold", fontSize: 11, merge: true
    });
    uw.addRow(["#", "Name", "Status", "Expiration", "", ""], {
      bg: LGRAY, fontWeight: "bold", fontSize: 9
    });

    var showCount = Math.min(gap.unscheduled.length, 50);
    for (var u = 0; u < showCount; u++) {
      var person = gap.unscheduled[u];
      var uBg = (u % 2 === 0) ? WHITE : ALT_BLUE;
      var uColor = "#000000";
      if (person.status.indexOf("Expired") > -1) uColor = RED;
      else if (person.status.indexOf("Expires") > -1) uColor = ORANGE;

      uw.addRow([u + 1, person.name, person.status, person.expDate, "", ""], {
        bg: uBg,
        cellColors: ["#000000", uColor, uColor, uColor, "#000000", "#000000"]
      });
    }
    if (gap.unscheduled.length > 50) {
      uw.addRow(["... and " + (gap.unscheduled.length - 50) + " more"], { fontColor: "#999999", merge: true });
    }
    uw.addRow([]);
    row = uw.flush();
  }

  // ---- COLUMN SIZING ----
  sheet.setColumnWidth(1, 40);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 250);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 10);   // Hidden metadata column — very narrow
  sheet.setFrozenRows(3);

  // Position next to Scheduled sheet
  try {
    var schedSheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
    if (schedSheet) { ss.setActiveSheet(sheet); ss.moveActiveSheet(schedSheet.getIndex() + 1); }
  } catch (e) {}

  // ---- SAVE SNAPSHOT for onChange detection ----
  saveOverviewSnapshot_(snapshot);
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
  } catch (e) { logError_("scanScheduledSheet", e); }
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

// ************************************************************
//
//   QUICK BUILD — One prompt to build class rosters
//
//   1. Pick training type
//   2. Enter dates
//   3. Auto-fills by priority, creates tabs, refreshes everything
//
// ************************************************************

/**
 * Quick Build — single-dialog class roster builder.
 * Picks training, enters dates, auto-assigns by priority,
 * creates tabs, and refreshes everything.
 */
function quickBuildRosters() {
  var ui = SpreadsheetApp.getUi();

  // Load data
  var rosterResult = buildRosterData(true);
  if (!rosterResult) { ui.alert("Could not read Training sheet."); return; }
  var ss = rosterResult.ss, today = rosterResult.today, allRosters = rosterResult.allRosters;
  var alreadyScheduled = buildFullScheduledMap_(ss);

  // Step 1: Pick training — show pool sizes so you know what needs attention
  var msg = "Which training?\n\n";
  for (var i = 0; i < CLASS_ROSTER_CONFIG.length; i++) {
    var config = CLASS_ROSTER_CONFIG[i];
    // Find matching roster data for pool count
    var poolCount = 0;
    for (var r = 0; r < allRosters.length; r++) {
      if (allRosters[r].name === config.name && !allRosters[r].error) {
        var tempPool = buildPriorityPool(allRosters[r], alreadyScheduled, config.name);
        poolCount = tempPool.length;
        break;
      }
    }
    var poolLabel = poolCount > 0 ? " — " + poolCount + " need it" : " — all current";
    msg += (i + 1) + ".  " + config.name + " (cap " + config.classCapacity + ")" + poolLabel + "\n";
  }
  msg += "\nEnter a number:";

  var choice = ui.prompt("Quick Build — Pick Training", msg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;

  var idx = parseInt(choice.getResponseText().trim()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= CLASS_ROSTER_CONFIG.length) {
    ui.alert("Invalid selection.");
    return;
  }

  var config = CLASS_ROSTER_CONFIG[idx];
  var capacity = config.classCapacity;

  // Find roster data
  var rosterData = null;
  for (var r = 0; r < allRosters.length; r++) {
    if (allRosters[r].name === config.name) { rosterData = allRosters[r]; break; }
  }
  if (!rosterData || rosterData.error) {
    ui.alert("Could not load roster data for " + config.name + ".");
    return;
  }

  var pool = buildPriorityPool(rosterData, alreadyScheduled, config.name);
  if (pool.length === 0) {
    ui.alert(config.name + ": Everyone is already scheduled or current!");
    return;
  }

  // Build priority breakdown for display
  var expCount = 0, needCount = 0, esCount = 0;
  for (var p = 0; p < pool.length; p++) {
    if (pool[p].bucket === "expired") expCount++;
    else if (pool[p].bucket === "needed") needCount++;
    else if (pool[p].bucket === "expiringSoon") esCount++;
  }

  // Pre-fill with suggested dates
  var suggestedDates = generateUpcomingDates(config, today);
  var prefill = "";
  for (var d = 0; d < suggestedDates.length; d++) prefill += formatClassDate(suggestedDates[d]) + "\n";

  // Calculate how many classes needed
  var classesNeeded = Math.ceil(pool.length / capacity);

  // Step 2: Enter dates — one prompt with all the info
  var dateMsg = config.name + "\n\n";
  dateMsg += "POOL: " + pool.length + " people need this training\n";
  dateMsg += "  Expired: " + expCount + "  |  Never completed: " + needCount + "  |  Expiring soon: " + esCount + "\n\n";
  dateMsg += "CAPACITY: " + capacity + " per class\n";
  dateMsg += "CLASSES NEEDED: " + classesNeeded + " (to cover everyone)\n\n";
  dateMsg += "Enter class dates below (M/D/YYYY, one per line).\n";
  dateMsg += "People will be auto-assigned by priority:\n";
  dateMsg += "  1st: Expired  →  2nd: Never completed  →  3rd: Expiring soon\n";

  var dateResponse = ui.prompt(config.name + " — Enter Dates", dateMsg, ui.ButtonSet.OK_CANCEL);
  if (dateResponse.getSelectedButton() !== ui.Button.OK) return;

  var dateInput = dateResponse.getResponseText().trim();
  if (!dateInput) { ui.alert("No dates entered."); return; }

  var finalDates = parseDateList(dateInput);
  if (finalDates.length === 0) { ui.alert("No valid dates found. Use M/D/YYYY format."); return; }

  // Build class rosters
  var assignments = assignToClasses(pool, finalDates, capacity);
  var tabsCreated = 0;
  var totalAssigned = 0;

  for (var a = 0; a < assignments.length; a++) {
    var classInfo = assignments[a];
    var tabName = buildTabName(config.name, classInfo.date);

    var existing = ss.getSheetByName(tabName);
    if (existing) ss.deleteSheet(existing);

    var tab = ss.insertSheet(tabName);
    writeClassRosterTab(tab, config.name, classInfo, capacity, today);
    tabsCreated++;
    totalAssigned += classInfo.people.length;

    // Track as scheduled
    var tk = config.name.toLowerCase();
    if (!alreadyScheduled[tk]) alreadyScheduled[tk] = {};
    for (var ap = 0; ap < classInfo.people.length; ap++) {
      alreadyScheduled[tk][classInfo.people[ap].name.toLowerCase().trim()] = formatClassDate(classInfo.date);
    }
  }

  // Refresh everything
  generateRostersSilent();
  orderClassRosterTabs(ss);

  // Summary
  var leftover = pool.length - totalAssigned;
  var summary = config.name + " — Quick Build Complete!\n\n";
  summary += "Classes created: " + tabsCreated + "\n";
  summary += "People assigned: " + totalAssigned + " / " + pool.length + "\n";

  if (leftover > 0) {
    summary += "\n" + leftover + " people still unassigned (not enough class dates).\n";
    summary += "Run Quick Build again to schedule more classes.\n";
  } else {
    summary += "\nEveryone who needs " + config.name + " is now scheduled!\n";
  }

  summary += "\nClass roster tabs created:\n";
  for (var a = 0; a < assignments.length; a++) {
    var ci = assignments[a];
    summary += "  " + buildTabName(config.name, ci.date) + " (" + ci.people.length + "/" + capacity + ")\n";
  }

  summary += "\nTraining Rosters refreshed.";
  ui.alert(summary);
}


// ************************************************************
//
//   LEGACY: Generate Class Rosters (multi-prompt version)
//   Kept for backward compatibility. Use Quick Build instead.
//
// ************************************************************

/**
 * Generate Class Rosters — multi-prompt version.
 * Prompts for training type(s), dates, and capacity.
 * Creates class roster tabs and refreshes rosters.
 */
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

/**
 * Build a priority-sorted pool of people who need a training
 * and are not already scheduled or exempt.
 *
 * @param {Object} rosterData - Roster data for one training type
 * @param {Object} alreadyScheduled - Map of training -> name -> date
 * @param {string} trainingName - The training type name
 * @return {Array<{name:string, status:string, bucket:string, lastDate:string, expDate:string}>}
 */
function buildPriorityPool(rosterData, alreadyScheduled, trainingName) {
  var pool = [], trainKey = trainingName.toLowerCase(), scheduledMap = alreadyScheduled[trainKey] || {};
  var exemptions = loadExemptions_();
  for (var p = 0; p < SEAT_PRIORITY.length; p++) {
    var bd = rosterData[SEAT_PRIORITY[p].bucket] || [];
    for (var i = 0; i < bd.length; i++) {
      var nameLower = bd[i].name.toLowerCase().trim();
      if (scheduledMap[nameLower]) continue;
      if (isExempt_(exemptions, nameLower, trainKey)) continue;
      pool.push({ name: bd[i].name, status: bd[i].status, bucket: SEAT_PRIORITY[p].bucket, lastDate: bd[i].lastDate || "", expDate: bd[i].expDate || "" });
    }
  }
  return pool;
}

/**
 * Assign people from a priority pool to class dates.
 *
 * @param {Array} pool - Priority-sorted pool from buildPriorityPool
 * @param {Date[]} dates - Class dates
 * @param {number} capacity - Max seats per class
 * @return {Array<{date:Date, people:Array}>}
 */
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

/**
 * Write a class roster tab with header, people rows, and open seats.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The tab to write to
 * @param {string} trainingName - Training type name
 * @param {Object} classInfo - { date: Date, people: Array }
 * @param {number} capacity - Max seats
 * @param {Date} today - Current date for timestamp
 */
function writeClassRosterTab(sheet, trainingName, classInfo, capacity, today) {
  var NAVY = "#1F3864", RED = "#C00000", ORANGE = "#E65100", GREEN = "#2E7D32";
  var LGRAY = "#F2F2F2", WHITE = "#FFFFFF", ALT_BLUE = "#EBF0F7";
  var COLS = 7;

  // Day-of-week label
  var dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var dateLabel = dayNames[classInfo.date.getDay()] + ", " + formatClassDate(classInfo.date);

  var w = new SheetWriter(sheet).setColCount(COLS);

  // Row 1: Title banner
  w.addRow([trainingName + " — Class Roster"], { bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 14, merge: true });

  // Row 2: Class Date
  w.addRow(["Class Date:", dateLabel], {
    cellWeights: ["bold", "normal"],
    cellSizes: [10, 11]
  });

  // Row 3: Time / Location (editable blanks)
  w.addRow(["Time:", "", "Location:", ""], {
    cellWeights: ["bold", "normal", "bold", "normal"],
    cellColors: ["#000000", "#666666", "#000000", "#666666"]
  });

  // Row 4: Trainer (editable blank)
  w.addRow(["Trainer:", ""], {
    cellWeights: ["bold", "normal"],
    cellColors: ["#000000", "#666666"]
  });

  // Row 5: Capacity
  w.addRow(["Capacity:", classInfo.people.length + " / " + capacity], {
    cellWeights: ["bold", "bold"],
    cellColors: ["#000000", classInfo.people.length >= capacity ? ORANGE : GREEN]
  });

  // Row 6: Coordinator + timestamp
  w.addRow(["HR Program Coordinator: Kyle Mahoney", "", "", "Generated: " + Utilities.formatDate(today, Session.getScriptTimeZone(), "M/d/yyyy h:mm a")], {
    fontColor: "#666666", fontSize: 9
  });

  // Row 7: spacer
  w.addRow([]);

  // Row 8: Column headers
  w.addRow(["#", "Name", "Status", "Last Completed", "Priority", "Attended", "Notes"], {
    bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 10
  });

  // Data rows
  var dataStartRow = 9; // 1-indexed
  for (var i = 0; i < classInfo.people.length; i++) {
    var p = classInfo.people[i];
    var pl = "", priBg = NAVY, db = p.effectiveBucket || p.bucket;
    if (db === "expired") { pl = p.bucket === "expired" ? "EXPIRED" : "EXPIRES BEFORE CLASS"; priBg = RED; }
    else if (db === "needed") { pl = "NEVER COMPLETED"; priBg = NAVY; }
    else if (db === "expiringSoon") { pl = "EXPIRING SOON"; priBg = ORANGE; }

    var rowBg = (i % 2 === 0) ? WHITE : ALT_BLUE;

    w.addRow([i + 1, p.name, p.status, p.lastDate, pl, false, ""], {
      bg: rowBg,
      cellColors: [
        "#000000", "#000000",
        priBg !== NAVY ? priBg : "#000000",
        "#000000",
        WHITE,
        "#000000", "#000000"
      ],
      cellBgs: [rowBg, rowBg, rowBg, rowBg, priBg, rowBg, rowBg],
      cellWeights: ["normal", "normal", "normal", "normal", "bold", "normal", "normal"]
    });
  }

  // Open seat rows
  var openSeats = capacity - classInfo.people.length;
  for (var s = 0; s < openSeats; s++) {
    var seatIdx = classInfo.people.length + s;
    var seatBg = (seatIdx % 2 === 0) ? WHITE : ALT_BLUE;
    w.addRow([seatIdx + 1, "— open —", "", "", "", false, ""], {
      fontColor: "#AAAAAA",
      bg: seatBg,
      cellWeights: ["normal", "normal", "normal", "normal", "normal", "normal", "normal"]
    });
  }

  // Flush all data
  var endRow = w.flush();

  // Insert checkboxes in the Attended column (col 6)
  var totalPeople = classInfo.people.length + openSeats;
  if (totalPeople > 0) {
    sheet.getRange(dataStartRow, 6, totalPeople, 1).insertCheckboxes();
  }

  // Borders on data area
  if (totalPeople > 0) {
    sheet.getRange(dataStartRow, 1, totalPeople, COLS)
      .setBorder(true, true, true, true, true, true, "#CCCCCC", SpreadsheetApp.BorderStyle.SOLID);
  }
  // Header row border
  sheet.getRange(8, 1, 1, COLS)
    .setBorder(true, true, true, true, true, true, NAVY, SpreadsheetApp.BorderStyle.SOLID);

  // Column widths
  sheet.setColumnWidth(1, 35);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 150);
  sheet.setColumnWidth(6, 80);
  sheet.setColumnWidth(7, 160);
  sheet.setFrozenRows(8);
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

/**
 * Write the Training Rosters summary sheet with compliance
 * dashboard and per-training breakdowns.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Active spreadsheet
 * @param {Array} allRosters - Array of roster data objects from buildRosterData
 * @param {Date} today - Current date for timestamps
 */
function writeRosterSheet(ss, allRosters, today) {
  var existing = ss.getSheetByName(ROSTER_SHEET_NAME);
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet(ROSTER_SHEET_NAME);
  var NAVY = "#1F3864", RED = "#C00000", ORANGE = "#E65100", GREEN = "#2E7D32";
  var BLUE = "#1565C0", LGRAY = "#F2F2F2", WHITE = "#FFFFFF", ALT_BLUE = "#EBF0F7";
  var COLS = 7;
  var alreadyScheduled = buildFullScheduledMap_(ss);

  // ---- HEADER ----
  var w = new SheetWriter(sheet).setColCount(COLS);
  w.addRow(["EVC Training Rosters"], { bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 16, merge: true });
  w.addRow(["Generated: " + Utilities.formatDate(today, Session.getScriptTimeZone(), "EEEE, MMMM d, yyyy 'at' h:mm a")], { fontColor: "#666666", fontSize: 10, merge: true });
  w.addRow(["HR Program Coordinator: Kyle Mahoney"], { fontColor: "#666666", fontSize: 10, merge: true });
  w.addRow([]);

  // ---- DASHBOARD SUMMARY TABLE ----
  w.addRow(["COMPLIANCE DASHBOARD"], { bg: "#2E75B6", fontColor: WHITE, fontWeight: "bold", fontSize: 12, merge: true });
  w.addRow(["Training", "Expired", "Expiring", "Needs", "Excused", "Total Flagged", "Coverage %"], {
    bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 10
  });

  for (var t = 0; t < allRosters.length; t++) {
    var r = allRosters[t];
    if (r.error) {
      w.addRow([r.name, "ERROR", "", "", "", "", ""], { fontColor: RED });
      continue;
    }
    var expCt = r.expired.length, esCt = r.expiringSoon.length, ndCt = r.needed.length;
    var exCt = r.excused ? r.excused.length : 0;
    var total = expCt + esCt + ndCt;
    var tk = r.name.toLowerCase(), sm = alreadyScheduled[tk] || {};
    var schedCt = 0;
    var allPeople = [].concat(r.expired, r.expiringSoon, r.needed);
    for (var p = 0; p < allPeople.length; p++) {
      if (sm[allPeople[p].name.toLowerCase().trim()]) schedCt++;
    }
    var pct = total > 0 ? Math.round((schedCt / total) * 100) : 100;
    var pctColor = pct >= 80 ? GREEN : (pct >= 40 ? ORANGE : RED);
    var rowBg = (t % 2 === 0) ? WHITE : ALT_BLUE;

    w.addRow([r.name, expCt || "", esCt || "", ndCt || "", exCt || "", total, pct + "% scheduled"], {
      bg: rowBg,
      cellColors: [
        "#000000",
        expCt > 0 ? RED : "#666666",
        esCt > 0 ? ORANGE : "#666666",
        ndCt > 0 ? NAVY : "#666666",
        exCt > 0 ? "#666666" : "#666666",
        total > 0 ? "#000000" : GREEN,
        pctColor
      ],
      cellWeights: ["bold", "normal", "normal", "normal", "normal", "bold", "bold"]
    });
  }

  w.addRow([]);
  var dashEnd = w.flush();

  // ---- PER-TRAINING SECTIONS ----
  var row = dashEnd;

  for (var t = 0; t < allRosters.length; t++) {
    var roster = allRosters[t];
    var rl = roster.renewalYears === 0 ? "Indefinite" : roster.renewalYears + " Year Renewal";
    if (roster.error) rl = "ERROR";
    var rq = roster.required ? " | REQUIRED FOR ALL" : " | Excusable";

    var sw = new SheetWriter(sheet).setColCount(COLS).setStartRow(row);

    sw.addRow([roster.name + "  (" + rl + rq + ")"], { bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 13, merge: true });

    if (roster.error) {
      sw.addRow([roster.error], { fontColor: RED });
      sw.addRow([]);
      row = sw.flush();
      continue;
    }

    var tf = roster.expired.length + roster.expiringSoon.length + roster.needed.length;
    if (tf === 0) {
      sw.addRow(["All staff are current."], { fontColor: GREEN, fontWeight: "bold" });
      sw.addRow([]);
      row = sw.flush();
      continue;
    }

    sw.addRow(["Name", "Status", "Last Completed", "Expiration Date", "Priority", "Scheduled", ""], {
      bg: LGRAY, fontWeight: "bold"
    });

    var tk = roster.name.toLowerCase(), sm = alreadyScheduled[tk] || {};
    var all = [];
    for (var e = 0; e < roster.expired.length; e++) all.push({ emp: roster.expired[e], pri: "EXPIRED", col: RED, sortPri: 1 });
    for (var es = 0; es < roster.expiringSoon.length; es++) all.push({ emp: roster.expiringSoon[es], pri: "EXPIRING SOON", col: ORANGE, sortPri: 3 });
    for (var n = 0; n < roster.needed.length; n++) {
      var isF = roster.needed[n].status && roster.needed[n].status.toLowerCase().indexOf("failed") > -1;
      all.push({ emp: roster.needed[n], pri: "NEEDS TRAINING", col: NAVY, sortPri: isF ? 8 : 2 });
    }

    all.sort(function(a, b) {
      var aS = sm[a.emp.name.toLowerCase().trim()] ? 0 : 1;
      var bS = sm[b.emp.name.toLowerCase().trim()] ? 0 : 1;
      if (aS !== bS) return aS - bS;
      return a.sortPri - b.sortPri;
    });

    var hasScheduled = false, scheduledCount = 0;
    for (var ch = 0; ch < all.length; ch++) { if (sm[all[ch].emp.name.toLowerCase().trim()]) { hasScheduled = true; scheduledCount++; } }
    var wroteUnschedHeader = false;

    for (var a = 0; a < all.length; a++) {
      var item = all[a], emp = item.emp;
      var pl = emp.name.toLowerCase().trim();
      var sd = sm[pl] || "", sl = sd ? "Scheduled (" + sd + ")" : "";

      if (hasScheduled && a === 0) {
        sw.addRow(["▸ SCHEDULED (" + scheduledCount + ")"], { bg: "#D6E4F0", fontColor: BLUE, fontWeight: "bold", fontSize: 9, merge: true });
      }
      if (hasScheduled && !sd && !wroteUnschedHeader) {
        wroteUnschedHeader = true;
        sw.addRow(["▸ NOT YET SCHEDULED (" + (all.length - scheduledCount) + ")"], { bg: "#FCE4EC", fontColor: RED, fontWeight: "bold", fontSize: 9, merge: true });
      }

      var dataBg = (a % 2 === 0) ? WHITE : ALT_BLUE;
      sw.addRow([emp.name, emp.status, emp.lastDate || "", emp.expDate || "", item.pri, sl, ""], {
        bg: dataBg,
        cellBgs: [dataBg, dataBg, dataBg, dataBg, item.col, sd ? BLUE : dataBg, dataBg],
        cellColors: [
          item.col !== NAVY ? item.col : "#000000",
          item.col !== NAVY ? item.col : "#000000",
          item.col !== NAVY ? item.col : "#000000",
          item.col !== NAVY ? item.col : "#000000",
          WHITE,
          sd ? WHITE : "#000000",
          "#000000"
        ],
        cellWeights: ["normal", "normal", "normal", "normal", "bold", sd ? "bold" : "normal", "normal"]
      });
    }

    // Section subtotal
    var unschedCount = all.length - scheduledCount;
    var subtotal = tf + " staff flagged — " + scheduledCount + " scheduled, " + unschedCount + " unscheduled";
    sw.addRow([subtotal], { fontColor: "#666666", fontSize: 9, merge: true });

    // Excused section — show who is exempt and why
    var excusedList = roster.excused || [];
    if (excusedList.length > 0) {
      // Group by reason
      var byReason = {};
      for (var ex = 0; ex < excusedList.length; ex++) {
        var reason = excusedList[ex].reason || "UNKNOWN";
        if (!byReason[reason]) byReason[reason] = [];
        byReason[reason].push(excusedList[ex].name);
      }

      sw.addRow(["▸ EXCUSED (" + excusedList.length + ")"], {
        bg: "#E8E8E8", fontColor: "#666666", fontWeight: "bold", fontSize: 9, merge: true
      });

      var reasonKeys = Object.keys(byReason).sort();
      var exIdx = 0;
      for (var rk = 0; rk < reasonKeys.length; rk++) {
        var rNames = byReason[reasonKeys[rk]];
        for (var rn = 0; rn < rNames.length; rn++) {
          var exBg = (exIdx % 2 === 0) ? "#F5F5F5" : "#EBEBEB";
          sw.addRow([rNames[rn], "Excused: " + reasonKeys[rk], "", "", "", ""], {
            bg: exBg, fontColor: "#999999", fontSize: 9
          });
          exIdx++;
        }
      }
    }

    sw.addRow([]);
    row = sw.flush();
  }

  sheet.setColumnWidth(1, 200); sheet.setColumnWidth(2, 200); sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 140); sheet.setColumnWidth(5, 100); sheet.setColumnWidth(6, 140);
  sheet.setColumnWidth(7, 200);
  sheet.setFrozenRows(4);
}


// ************************************************************
//
//   TAB ORDERING & MONITORING
//
// ************************************************************

// ************************************************************
//
//   OVERVIEW SYNC — onChange trigger + snapshot helpers
//
// ************************************************************

/**
 * Save the Overview snapshot to PropertiesService so we can
 * detect deletions later.
 */
function saveOverviewSnapshot_(snapshot) {
  try {
    PropertiesService.getDocumentProperties()
      .setProperty("OVERVIEW_SNAPSHOT", JSON.stringify(snapshot));
  } catch (e) {
    logError_("saveOverviewSnapshot_", e);
  }
}

/**
 * Load the saved Overview snapshot.
 */
function loadOverviewSnapshot_() {
  try {
    var raw = PropertiesService.getDocumentProperties()
      .getProperty("OVERVIEW_SNAPSHOT");
    if (raw) return JSON.parse(raw);
  } catch (e) {
    logError_("loadOverviewSnapshot_", e);
  }
  return null;
}

/**
 * Read the current state of the Overview sheet by scanning
 * the metadata column (col 6) for ENROLLEE: markers.
 * Returns an array matching snapshot shape:
 *   [ { sessionType, dateDisplay, enrollees: [name, ...] } ]
 */
function readCurrentOverviewState_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(OVERVIEW_SHEET_NAME);
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  var sessions = {};  // sessionIdx -> { type, dateDisplay, enrollees }
  var sessionOrder = [];

  for (var r = 0; r < data.length; r++) {
    var meta = data[r][5] ? data[r][5].toString().trim() : "";

    // Session header: "SESSION:0", "SESSION:1", etc.
    if (meta.indexOf("SESSION:") === 0) {
      var idx = meta.substring(8);
      var headerText = data[r][0] ? data[r][0].toString().trim() : "";
      // Parse "CPR/FA  —  4/15/2026" format
      var parts = headerText.split("  —  ");
      sessions[idx] = {
        sessionType: parts[0] ? parts[0].trim() : "",
        dateDisplay: parts[1] ? parts[1].trim() : "",
        enrollees: []
      };
      sessionOrder.push(idx);
    }

    // Enrollee: "ENROLLEE:0:John Smith"
    if (meta.indexOf("ENROLLEE:") === 0) {
      var colonParts = meta.split(":");
      if (colonParts.length >= 3) {
        var sessIdx = colonParts[1];
        var enrolleeName = colonParts.slice(2).join(":");  // Handle names with colons
        if (sessions[sessIdx]) {
          // Check that this person's row still has their name visible (col B)
          var nameInCell = data[r][1] ? data[r][1].toString().trim() : "";
          if (nameInCell) {
            sessions[sessIdx].enrollees.push(nameInCell);
          }
        }
      }
    }
  }

  var result = [];
  for (var i = 0; i < sessionOrder.length; i++) {
    result.push(sessions[sessionOrder[i]]);
  }
  return result;
}

/**
 * onOverviewChange — installable onChange trigger handler.
 * Detects when rows are deleted from the Scheduled Overview
 * and uses executeRemoval_ to process each removal.
 */
function onOverviewChange(e) {
  try {
    // Only process EDIT and OTHER change types (which include row deletions)
    if (e && e.changeType && e.changeType !== "EDIT" && e.changeType !== "OTHER"
        && e.changeType !== "REMOVE_ROW" && e.changeType !== "INSERT_ROW") {
      return;
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var activeSheet = ss.getActiveSheet();
    if (!activeSheet || activeSheet.getName() !== OVERVIEW_SHEET_NAME) return;

    var oldSnapshot = loadOverviewSnapshot_();
    if (!oldSnapshot) return;

    var currentState = readCurrentOverviewState_();
    if (!currentState) return;

    // Diff: find enrollees that were in the snapshot but are no longer present
    var removals = [];

    for (var s = 0; s < oldSnapshot.length; s++) {
      var oldSession = oldSnapshot[s];
      // Find matching session in current state
      var curSession = null;
      for (var c = 0; c < currentState.length; c++) {
        if (currentState[c].sessionType === oldSession.sessionType &&
            currentState[c].dateDisplay === oldSession.dateDisplay) {
          curSession = currentState[c];
          break;
        }
      }

      if (!curSession) {
        // Entire session was deleted — remove all enrollees
        for (var e2 = 0; e2 < oldSession.enrollees.length; e2++) {
          removals.push({
            sessionType: oldSession.sessionType,
            dateDisplay: oldSession.dateDisplay,
            removedName: oldSession.enrollees[e2]
          });
        }
        continue;
      }

      // Compare enrollee lists
      var curNames = {};
      for (var cn = 0; cn < curSession.enrollees.length; cn++) {
        curNames[curSession.enrollees[cn].toLowerCase().trim()] = true;
      }

      for (var oe = 0; oe < oldSession.enrollees.length; oe++) {
        var oldName = oldSession.enrollees[oe];
        if (!curNames[oldName.toLowerCase().trim()]) {
          removals.push({
            sessionType: oldSession.sessionType,
            dateDisplay: oldSession.dateDisplay,
            removedName: oldName
          });
        }
      }
    }

    if (removals.length === 0) {
      // No enrollee removals — just save updated snapshot
      saveOverviewSnapshot_(currentState);
      return;
    }

    // Apply removals via unified workflow (no backfill prompt for bulk silent operations)
    for (var i = 0; i < removals.length; i++) {
      var r = removals[i];
      var tabName = r.sessionType + " " + r.dateDisplay;
      executeRemoval_(ss, r.removedName, r.sessionType, tabName, "Deleted from Overview", tabName);
    }

    // Save updated snapshot
    saveOverviewSnapshot_(currentState);

  } catch (err) {
    logError_("onOverviewChange", err);
  }
}

/**
 * Apply removals from the Overview to the Scheduled sheet.
 * For each removal, finds the matching session row and removes
 * the person's name from the comma-separated enrollment string.
 */
function syncOverviewToScheduled_(ss, removals) {
  var sheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();

  // Group removals by session
  var bySession = {};
  for (var r = 0; r < removals.length; r++) {
    var key = removals[r].sessionType + "|" + removals[r].dateDisplay;
    if (!bySession[key]) bySession[key] = { type: removals[r].sessionType, date: removals[r].dateDisplay, names: [] };
    bySession[key].names.push(removals[r].removedName.toLowerCase().trim());
  }

  // Walk the Scheduled sheet and update enrollment cells
  var lastType = "";
  for (var row = 0; row < data.length; row++) {
    var colA = data[row][0] ? data[row][0].toString().trim() : "";
    var colB = data[row][1] ? data[row][1].toString().trim() : "";
    var colE = data[row][4] ? data[row][4].toString().trim() : "";

    if (colA === "Type" || colA === "a. Upcoming Training") continue;

    var sessionType = colA || lastType;
    if (colA) lastType = colA;

    if (!colE) continue;

    // Try to match this row to a removal group
    var dateDisplay = "";
    var colB_raw = data[row][1];
    if (colB_raw instanceof Date && !isNaN(colB_raw.getTime())) {
      dateDisplay = formatClassDate(colB_raw);
    } else if (colB) {
      dateDisplay = colB;
    }

    var matchKey = sessionType + "|" + dateDisplay;
    var removal = bySession[matchKey];
    if (!removal) continue;

    // Parse enrollment, remove names, write back
    var enrollees = colE.split(",").map(function(n) { return n.trim(); });
    var filtered = enrollees.filter(function(name) {
      return removal.names.indexOf(name.toLowerCase().trim()) === -1;
    });

    var newEnroll = filtered.join(", ");
    if (!newEnroll) newEnroll = "TBD";

    if (newEnroll !== colE) {
      sheet.getRange(row + 1, 5).setValue(newEnroll);
    }
  }
}

/**
 * Install the onChange trigger for Overview sync.
 * Run this ONCE from the EVC Tools menu.
 */
function installOverviewSyncTrigger() {
  var ui = SpreadsheetApp.getUi();

  // Remove any existing Overview triggers
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "onOverviewChange") {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }

  // Create installable onChange trigger
  ScriptApp.newTrigger("onOverviewChange")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange()
    .create();

  ui.alert(
    "Overview Sync Trigger Installed!\n\n" +
    (removed > 0 ? "Removed " + removed + " old trigger(s).\n" : "") +
    "When you delete a row from the Scheduled Overview tab,\n" +
    "the Scheduled sheet and Training Rosters will auto-update.\n\n" +
    "This only needs to be run once."
  );
}


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
        syncScheduledSilent_();
      }
      props.setProperty("scheduledEnrollHash", enrollHash);
    }
  } catch (e) { logError_("monitorClassRosterTabs", e); }
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
  } catch (e) {
    logError_("syncScheduledSilent_", e);
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
//   TRAINING MEMO — Print-ready memo from class roster tabs
//
//   Reads attendee list, date, time, and location from an
//   existing class roster tab and creates a clean memo tab.
//
// ************************************************************

function generateTrainingMemo() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var prefixes = getClassRosterPrefixes();
  var sheets = ss.getSheets();

  // Find all class roster tabs
  var rosterTabs = [];
  for (var s = 0; s < sheets.length; s++) {
    var name = sheets[s].getName();
    for (var p = 0; p < prefixes.length; p++) {
      if (name.indexOf(prefixes[p] + " ") === 0) {
        rosterTabs.push({ sheet: sheets[s], name: name, training: prefixes[p] });
        break;
      }
    }
  }

  if (rosterTabs.length === 0) {
    ui.alert("No class roster tabs found. Run Quick Build first to create class rosters.");
    return;
  }

  // Let user pick which tab(s) to generate memos for
  var msg = "Generate memo for which class?\n\n";
  msg += "0.  ALL (" + rosterTabs.length + " classes)\n";
  for (var i = 0; i < rosterTabs.length; i++) {
    msg += (i + 1) + ".  " + rosterTabs[i].name + "\n";
  }
  msg += "\nEnter a number:";

  var choice = ui.prompt("Training Memo", msg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;

  var input = choice.getResponseText().trim();
  var selectedTabs = [];
  if (input === "0") {
    selectedTabs = rosterTabs.slice();
  } else {
    var idx = parseInt(input) - 1;
    if (isNaN(idx) || idx < 0 || idx >= rosterTabs.length) {
      ui.alert("Invalid selection.");
      return;
    }
    selectedTabs = [rosterTabs[idx]];
  }

  var memosCreated = 0;
  for (var t = 0; t < selectedTabs.length; t++) {
    var tab = selectedTabs[t];
    var data = tab.sheet.getDataRange().getValues();

    // Read header info from the class roster tab
    var classDate = (data[1] && data[1][1]) ? data[1][1].toString().trim() : "";
    var classTime = (data[2] && data[2][1]) ? data[2][1].toString().trim() : "";
    var classLocation = (data[2] && data[2][3]) ? data[2][3].toString().trim() : "";
    var trainer = (data[3] && data[3][1]) ? data[3][1].toString().trim() : "";

    // Read attendees (row 8+ = index 7+, column B = index 1)
    var attendees = [];
    for (var r = 7; r < data.length; r++) {
      var nameVal = data[r][1] ? data[r][1].toString().trim() : "";
      if (!nameVal || nameVal.toLowerCase().indexOf("open seat") > -1) continue;
      attendees.push(nameVal);
    }

    if (attendees.length === 0) continue;

    // Create memo tab
    var memoName = "MEMO — " + tab.name;
    var existing = ss.getSheetByName(memoName);
    if (existing) ss.deleteSheet(existing);
    var memo = ss.insertSheet(memoName);

    writeMemoTab_(memo, tab.training, classDate, classTime, classLocation, trainer, attendees);
    memosCreated++;
  }

  if (memosCreated === 0) {
    ui.alert("No memos created — no attendees found on the selected rosters.");
  } else {
    ui.alert(memosCreated + " memo(s) created!\n\nLook for tabs starting with \"MEMO —\".\n\nTo print: File → Print → set to Fit to Width.");
  }
}


function writeMemoTab_(sheet, trainingName, classDate, classTime, classLocation, trainer, attendees) {
  var NAVY   = "#1F3864";
  var LGRAY  = "#F2F2F2";
  var WHITE  = "#FFFFFF";
  var ALT    = "#EBF0F7";
  var BLACK  = "#000000";
  var COLS   = 4;
  var today  = new Date();

  var w = new SheetWriter(sheet).setColCount(COLS);

  // ---- HEADER ----
  // Row 1: Organization banner
  w.addRow(["EMORY VALLEY CENTER"], {
    bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 16, merge: true, hAlign: "center"
  });

  // Row 2: Memo title
  w.addRow(["TRAINING MEMO"], {
    fontWeight: "bold", fontSize: 14, hAlign: "center", merge: true
  });

  // Row 3: spacer
  w.addRow([]);

  // Row 4-8: Memo fields
  w.addRow(["TO:", "All Listed Personnel"], {
    cellWeights: ["bold", "normal"], cellSizes: [11, 11]
  });
  w.addRow(["FROM:", "HR Program Coordinator — Kyle Mahoney"], {
    cellWeights: ["bold", "normal"]
  });
  w.addRow(["DATE:", Utilities.formatDate(today, Session.getScriptTimeZone(), "MMMM d, yyyy")], {
    cellWeights: ["bold", "normal"]
  });
  w.addRow(["RE:", trainingName + " Training"], {
    cellWeights: ["bold", "bold"], cellSizes: [11, 12]
  });

  // Row 8: separator line
  w.addRow([]);

  // Row 9: Body text
  w.addRow(["You are scheduled to attend the following training session. Attendance is mandatory."], {
    merge: true, fontSize: 10
  });
  w.addRow([]);

  // ---- TRAINING DETAILS BOX ----
  w.addRow(["TRAINING DETAILS"], {
    bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 11, merge: true
  });

  w.addRow(["Training:", trainingName], {
    bg: LGRAY, cellWeights: ["bold", "normal"], cellSizes: [10, 11]
  });
  w.addRow(["Date:", classDate || "(TBD)"], {
    cellWeights: ["bold", "normal"]
  });
  w.addRow(["Time:", classTime || "(TBD)"], {
    bg: LGRAY, cellWeights: ["bold", "normal"]
  });
  w.addRow(["Location:", classLocation || "(TBD)"], {
    cellWeights: ["bold", "normal"]
  });
  if (trainer) {
    w.addRow(["Trainer:", trainer], {
      bg: LGRAY, cellWeights: ["bold", "normal"]
    });
  }

  w.addRow([]);

  // ---- ATTENDEE LIST ----
  w.addRow(["ATTENDEES (" + attendees.length + ")"], {
    bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 11, merge: true
  });

  w.addRow(["#", "Name", "", ""], {
    bg: LGRAY, fontWeight: "bold", fontSize: 10
  });

  for (var i = 0; i < attendees.length; i++) {
    var rowBg = (i % 2 === 0) ? WHITE : ALT;
    w.addRow([i + 1, attendees[i], "", ""], { bg: rowBg });
  }

  w.addRow([]);

  // ---- FOOTER ----
  w.addRow(["If you have questions or conflicts, contact HR immediately."], {
    merge: true, fontSize: 9, fontColor: "#666666"
  });
  w.addRow(["Generated: " + Utilities.formatDate(today, Session.getScriptTimeZone(), "M/d/yyyy h:mm a")], {
    merge: true, fontSize: 8, fontColor: "#999999"
  });

  w.flush();

  // ---- COLUMN SIZING for clean print layout ----
  sheet.setColumnWidth(1, 100);  // Label column
  sheet.setColumnWidth(2, 300);  // Value column
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 100);
}


// ************************************************************
//
//   UNIFIED REMOVAL WORKFLOW
//
//   executeRemoval_ is the single source of truth for what
//   happens when someone is removed from a class roster.
//
// ************************************************************

/**
 * Single source of truth for removing a person from a training.
 * Logs the removal, updates the class tab, Scheduled sheet,
 * Overview sheet, and refreshes rosters.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Active spreadsheet
 * @param {string} name - Person's name
 * @param {string} trainingName - Training type (e.g., "CPR/FA")
 * @param {string} classTabName - Name of the class roster tab (e.g., "CPR/FA 4/10/2026")
 * @param {string} reason - Removal reason
 * @param {string} scope - Scope of removal (tab name for class-specific, training name for permanent)
 */
function executeRemoval_(ss, name, trainingName, classTabName, reason, scope) {
  // 1. Log the removal
  logRemoval_(ss, name, trainingName, classTabName, reason, scope);

  // 2. Remove from the class roster tab if it exists
  var classTab = ss.getSheetByName(classTabName);
  if (classTab) {
    removePersonFromClassTab_(classTab, name);
  }

  // 3. Remove from Scheduled sheet enrollment strings
  removeFromScheduledSheet_(ss, trainingName, name);

  // 4. Mark as REMOVED on Overview sheet
  removeFromOverview_(ss, trainingName, name);

  // 5. Refresh everything
  generateRostersSilent();
}


/**
 * Remove a person from the Scheduled sheet enrollment strings.
 * Finds all session rows matching this training type, parses
 * the comma-separated enrollment in column E, removes the
 * person's name (case-insensitive), and writes back.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Active spreadsheet
 * @param {string} trainingName - Training type name
 * @param {string} personName - Person to remove
 */
function removeFromScheduledSheet_(ss, trainingName, personName) {
  var sheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  var lastType = "";
  var personLower = personName.toLowerCase().trim();

  for (var row = 0; row < data.length; row++) {
    var colA = data[row][0] ? data[row][0].toString().trim() : "";
    var colE = data[row][4] ? data[row][4].toString().trim() : "";

    if (colA === "Type" || colA === "a. Upcoming Training") continue;

    var sessionType = colA || lastType;
    if (colA) lastType = colA;

    if (!colE) continue;

    // Check if this row's training type matches
    var resolvedName = resolveTrainingName_(sessionType);
    if (resolvedName !== trainingName) continue;

    // Parse enrollment, remove the person, write back
    var enrollees = colE.split(",").map(function(n) { return n.trim(); });
    var filtered = enrollees.filter(function(n) {
      return n.toLowerCase().trim() !== personLower;
    });

    if (filtered.length !== enrollees.length) {
      var newEnroll = filtered.join(", ");
      if (!newEnroll) newEnroll = "TBD";
      sheet.getRange(row + 1, 5).setValue(newEnroll);
    }
  }
}


/**
 * Mark a person as REMOVED on the Overview sheet.
 * Scans column F metadata (ENROLLEE:sessionIdx:name format)
 * to find the person. When found, sets column C to "REMOVED"
 * with red styling and column D to the reason.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Active spreadsheet
 * @param {string} trainingName - Training type name
 * @param {string} personName - Person to mark as removed
 */
function removeFromOverview_(ss, trainingName, personName) {
  var sheet = ss.getSheetByName(OVERVIEW_SHEET_NAME);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  var personLower = personName.toLowerCase().trim();
  var RED = "#C00000", LRED = "#FFC7CE";

  for (var r = 0; r < data.length; r++) {
    var meta = data[r][5] ? data[r][5].toString().trim() : "";

    if (meta.indexOf("ENROLLEE:") === 0) {
      var colonParts = meta.split(":");
      if (colonParts.length >= 3) {
        var enrolleeName = colonParts.slice(2).join(":");
        if (enrolleeName.toLowerCase().trim() === personLower) {
          // Verify this is the right training by checking training column (col E)
          var rowTraining = data[r][4] ? data[r][4].toString().trim() : "";
          if (rowTraining === trainingName || !rowTraining) {
            sheet.getRange(r + 1, 3).setValue("REMOVED");
            sheet.getRange(r + 1, 3).setBackground(LRED).setFontColor(RED).setFontWeight("bold");
            sheet.getRange(r + 1, 4).setValue("Removed").setFontColor("#999999");
          }
        }
      }
    }
  }
}


/**
 * After a removal, offer to backfill the open seat with the
 * next priority person. Only called from interactive (menu) context.
 *
 * @param {GoogleAppsScript.Spreadsheet.UI} ui - SpreadsheetApp UI
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Active spreadsheet
 * @param {string} trainingName - Training type name
 * @param {string} classTabName - Name of the class roster tab
 */
function offerBackfill_(ui, ss, trainingName, classTabName) {
  var answer = ui.alert(
    "Backfill Open Seat?",
    "Do you want to backfill this open seat with the next priority person?",
    ui.ButtonSet.YES_NO
  );

  if (answer !== ui.Button.YES) return;

  // 1. Get current needs data
  var rosterResult = buildRosterData(true);
  if (!rosterResult) { ui.alert("Could not read Training sheet data."); return; }

  var allRosters = rosterResult.allRosters;
  var alreadyScheduled = buildFullScheduledMap_(ss);

  // 2. Find the roster data for this training type
  var rosterData = null;
  for (var r = 0; r < allRosters.length; r++) {
    if (allRosters[r].name === trainingName) { rosterData = allRosters[r]; break; }
  }
  if (!rosterData || rosterData.error) {
    ui.alert("Could not load roster data for " + trainingName + ".");
    return;
  }

  // 3. Build priority pool
  var pool = buildPriorityPool(rosterData, alreadyScheduled, trainingName);
  if (pool.length === 0) {
    ui.alert("No one else needs " + trainingName + " right now. No backfill available.");
    return;
  }

  // 4. Find the first person not already on this tab
  var classTab = ss.getSheetByName(classTabName);
  var existingNames = {};
  if (classTab) {
    var tabData = classTab.getDataRange().getValues();
    for (var tr = 7; tr < tabData.length; tr++) {
      var n = tabData[tr][1] ? tabData[tr][1].toString().trim().toLowerCase() : "";
      if (n && n.indexOf("open") === -1) existingNames[n] = true;
    }
  }

  var candidate = null;
  for (var p = 0; p < pool.length; p++) {
    if (!existingNames[pool[p].name.toLowerCase().trim()]) {
      candidate = pool[p];
      break;
    }
  }

  if (!candidate) {
    ui.alert("All remaining candidates are already on this tab. No backfill available.");
    return;
  }

  // 5. Build personInfo and append to the tab
  var personInfo = {
    name: candidate.name,
    status: candidate.status,
    bucket: candidate.bucket,
    lastDate: candidate.lastDate || "",
    expDate: candidate.expDate || ""
  };

  try {
    appendToExistingTab_(ss, classTabName, personInfo, trainingName);
    // Refresh rosters after backfill
    generateRostersSilent();
    ui.alert("Backfilled: " + candidate.name + "\n\nStatus: " + candidate.status + "\nPriority: " + candidate.bucket.toUpperCase());
  } catch (e) {
    logError_("offerBackfill_", e);
    ui.alert("Error backfilling: " + e.toString());
  }
}


// ************************************************************
//
//   REMOVAL LOG & EXEMPTIONS
//
// ************************************************************

/**
 * Menu action: Remove someone from a class roster tab OR the Overview tab.
 * Click on the person's row, then run this from the menu.
 *
 * Works from:
 *   - Class roster tabs (e.g., "CPR/FA 4/10/2026")
 *   - Scheduled Overview tab (reads ENROLLEE metadata from col F)
 *
 * After collecting name, reason, and scope, delegates to
 * executeRemoval_ and offerBackfill_.
 *
 * @return {void}
 */
function removeFromClassRoster() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var sheetName = sheet.getName();
  var row = ss.getActiveCell().getRow();

  var name = "", matchedTraining = "", sourceTab = "";

  // ---- DETECT: Are we on a class roster tab or the Overview? ----

  if (sheetName === OVERVIEW_SHEET_NAME) {
    // OVERVIEW TAB — read metadata from col F
    var rowData = sheet.getRange(row, 1, 1, 6).getValues()[0];
    var meta = rowData[5] ? rowData[5].toString().trim() : "";

    if (meta.indexOf("ENROLLEE:") !== 0) {
      ui.alert("Select a person's row in the Overview (one that has a name in the Person column), then run this again.");
      return;
    }

    name = rowData[1] ? rowData[1].toString().trim() : "";
    if (!name) { ui.alert("No name found on this row."); return; }

    // Parse the session header to get training type
    // Walk up from this row to find the SESSION header
    var allData = sheet.getDataRange().getValues();
    var sessionType = "", sessionDate = "";
    for (var r = row - 1; r >= 0; r--) {
      var cellMeta = allData[r][5] ? allData[r][5].toString().trim() : "";
      if (cellMeta.indexOf("SESSION:") === 0) {
        var headerText = allData[r][0] ? allData[r][0].toString().trim() : "";
        var parts = headerText.split("  —  ");
        sessionType = parts[0] ? parts[0].trim() : "";
        sessionDate = parts[1] ? parts[1].trim() : "";
        break;
      }
    }

    if (!sessionType) { ui.alert("Could not determine the training type for this row."); return; }

    matchedTraining = sessionType;
    sourceTab = sessionType + (sessionDate ? " " + sessionDate : "");

  } else {
    // CLASS ROSTER TAB — check if this is a valid class roster tab
    var prefixes = getClassRosterPrefixes();
    for (var p = 0; p < prefixes.length; p++) {
      if (sheetName.indexOf(prefixes[p] + " ") === 0) {
        matchedTraining = prefixes[p];
        break;
      }
    }

    if (!matchedTraining) {
      ui.alert("Not a class roster or Overview tab.\n\nNavigate to a class roster tab (e.g., \"CPR/FA 4/10/2026\") or the Scheduled Overview, click on a person's row, then run this.");
      return;
    }

    if (row < 9) {
      ui.alert("Select a person's row (row 9 or below), then run this again.");
      return;
    }

    var data = sheet.getRange(row, 1, 1, 7).getValues()[0];
    name = data[1] ? data[1].toString().trim() : "";
    sourceTab = sheetName;
  }

  if (!name || name.toLowerCase().indexOf("open seat") > -1 || name === "— open —") {
    ui.alert("That row doesn't have a person on it. Select a row with a name.");
    return;
  }

  // ---- ASK FOR REASON ----
  var reasonMsg = "Remove " + name + " from " + matchedTraining + "?\n\nReason:\n";
  for (var r = 0; r < REMOVAL_REASONS.length; r++) {
    reasonMsg += (r + 1) + ".  " + REMOVAL_REASONS[r] + "\n";
  }
  reasonMsg += "\nEnter number:";

  var choice = ui.prompt("Remove from Roster", reasonMsg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;

  var reasonIdx = parseInt(choice.getResponseText().trim()) - 1;
  var reason = "";
  if (isNaN(reasonIdx) || reasonIdx < 0 || reasonIdx >= REMOVAL_REASONS.length) {
    reason = choice.getResponseText().trim(); // treat free text as custom reason
  } else {
    reason = REMOVAL_REASONS[reasonIdx];
  }

  // If "Other", prompt for details
  if (reason === "Other") {
    var detail = ui.prompt("Reason Details", "Enter the reason for removing " + name + ":", ui.ButtonSet.OK_CANCEL);
    if (detail.getSelectedButton() !== ui.Button.OK) return;
    reason = "Other: " + detail.getResponseText().trim();
  }

  // ---- DETERMINE SCOPE ----
  var permanent = false;
  var permReasons = ["Promoted", "Left organization", "Transferred", "Exempt"];
  for (var pr = 0; pr < permReasons.length; pr++) {
    if (reason.indexOf(permReasons[pr]) > -1) { permanent = true; break; }
  }

  var scope = sourceTab; // default: just this class
  if (permanent) {
    var scopeChoice = ui.alert(
      "Permanent Exemption?",
      name + " — " + reason + "\n\nRemove from ALL future " + matchedTraining + " rosters?\n\n" +
      "YES = Exempt from all future " + matchedTraining + " classes\n" +
      "NO = Remove from this class only",
      ui.ButtonSet.YES_NO
    );
    if (scopeChoice === ui.Button.YES) {
      scope = matchedTraining; // exempt from the whole training type
    }
  }

  // ---- EXECUTE UNIFIED REMOVAL ----
  executeRemoval_(ss, name, matchedTraining, sourceTab, reason, scope);

  // ---- OFFER BACKFILL ----
  offerBackfill_(ui, ss, matchedTraining, sourceTab);

  var scopeMsg = (scope === matchedTraining) ? "All future " + matchedTraining + " classes" : "This class only";
  ui.alert("Removed " + name + "\n\nTraining: " + matchedTraining + "\nReason: " + reason + "\nScope: " + scopeMsg + "\n\nLogged to Removal Log.");
}


/**
 * Helper: Remove a person from a class roster tab by name.
 * Replaces their row with an open seat.
 */
function removePersonFromClassTab_(classTab, name) {
  var data = classTab.getDataRange().getValues();
  var WHITE = "#FFFFFF", ALT_BLUE = "#EBF0F7";
  for (var r = 7; r < data.length; r++) { // row 8+ = index 7+
    var cellName = data[r][1] ? data[r][1].toString().trim() : "";
    if (cellName.toLowerCase() === name.toLowerCase()) {
      var sheetRow = r + 1; // 1-indexed
      var idx = data[r][0];
      var rowBg = ((idx - 1) % 2 === 0) ? WHITE : ALT_BLUE;
      classTab.getRange(sheetRow, 1, 1, 7).setValues([[idx, "— open —", "", "", "", false, ""]]);
      classTab.getRange(sheetRow, 1, 1, 7).setFontColor("#AAAAAA").setBackground(rowBg);
      classTab.getRange(sheetRow, 6).insertCheckboxes();

      // Update capacity
      var capData = classTab.getRange(5, 1, 1, 2).getValues()[0];
      var capStr = capData[1] ? capData[1].toString() : "";
      var capMatch = capStr.match(/(\d+)\s*\/\s*(\d+)/);
      if (capMatch) {
        var filled = parseInt(capMatch[1]) - 1;
        var total = parseInt(capMatch[2]);
        classTab.getRange(5, 2).setValue(filled + " / " + total);
      }
      break;
    }
  }
}


/**
 * Log a removal to the Removal Log sheet.
 */
function logRemoval_(ss, name, trainingType, classTab, reason, scope) {
  var log = ss.getSheetByName(REMOVAL_LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(REMOVAL_LOG_SHEET);
    log.getRange(1, 1, 1, 7).setValues([["Date", "Name", "Training", "Class Tab", "Reason", "Scope", "Removed By"]]);
    log.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#1F3864").setFontColor("#FFFFFF");
    log.setColumnWidth(1, 130);
    log.setColumnWidth(2, 180);
    log.setColumnWidth(3, 140);
    log.setColumnWidth(4, 180);
    log.setColumnWidth(5, 250);
    log.setColumnWidth(6, 180);
    log.setColumnWidth(7, 150);
    log.setFrozenRows(1);
    // Hide the sheet so it doesn't clutter the tab bar
    log.hideSheet();
  }

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "M/d/yyyy h:mm a");
  var user = Session.getActiveUser().getEmail() || "unknown";
  log.appendRow([now, name, trainingType, classTab, reason, scope, user]);
}


/**
 * Load all active exemptions from the Removal Log.
 * Returns array of { name, training, scope, reason }.
 */
function loadExemptions_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = ss.getSheetByName(REMOVAL_LOG_SHEET);
  if (!log) return [];

  var data = log.getDataRange().getValues();
  var exemptions = [];
  for (var r = 1; r < data.length; r++) {
    var name = data[r][1] ? data[r][1].toString().toLowerCase().trim() : "";
    var training = data[r][2] ? data[r][2].toString().toLowerCase().trim() : "";
    var scope = data[r][5] ? data[r][5].toString().trim() : "";
    var reason = data[r][4] ? data[r][4].toString().trim() : "";
    if (name) {
      exemptions.push({ name: name, training: training, scope: scope, reason: reason });
    }
  }
  return exemptions;
}


/**
 * Check if a person is exempt from a training.
 * Permanent exemptions (scope = training name) block all future classes.
 * Class-specific exemptions (scope = tab name) only block that specific class.
 */
function isExempt_(exemptions, nameLower, trainKeyLower) {
  for (var i = 0; i < exemptions.length; i++) {
    var ex = exemptions[i];
    if (ex.name !== nameLower) continue;
    // Permanent exemption for this training type
    if (ex.scope.toLowerCase() === trainKeyLower) return true;
    // "Scheduling conflict" and class-specific removals don't block future classes
  }
  return false;
}


/**
 * View the Removal Log (unhide it temporarily).
 */
function viewRemovalLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = ss.getSheetByName(REMOVAL_LOG_SHEET);
  if (!log) {
    SpreadsheetApp.getUi().alert("No removals have been logged yet.");
    return;
  }
  log.showSheet();
  ss.setActiveSheet(log);
}


/**
 * Clear an exemption (restore someone to the priority pool).
 */
function clearExemption() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = ss.getSheetByName(REMOVAL_LOG_SHEET);
  if (!log) { ui.alert("No removal log found."); return; }

  var data = log.getDataRange().getValues();
  if (data.length <= 1) { ui.alert("No exemptions to clear."); return; }

  // Show permanent exemptions only
  var permanentRows = [];
  var msg = "Active exemptions:\n\n";
  for (var r = 1; r < data.length; r++) {
    var name = data[r][1] || "";
    var training = data[r][2] || "";
    var reason = data[r][4] || "";
    var scope = data[r][5] || "";
    // Only show training-wide (permanent) exemptions
    if (scope.toLowerCase() === training.toLowerCase()) {
      permanentRows.push(r);
      msg += permanentRows.length + ".  " + name + " — " + training + " (" + reason + ")\n";
    }
  }

  if (permanentRows.length === 0) {
    ui.alert("No permanent exemptions to clear. Only class-specific removals exist (these don't block future classes).");
    return;
  }

  msg += "\nEnter number to clear (person will be eligible for future classes again):";

  var choice = ui.prompt("Clear Exemption", msg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;

  var idx = parseInt(choice.getResponseText().trim()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= permanentRows.length) {
    ui.alert("Invalid selection.");
    return;
  }

  var rowToDelete = permanentRows[idx] + 1; // 1-indexed for sheet
  var removedName = data[permanentRows[idx]][1];
  log.deleteRow(rowToDelete);

  generateRostersSilent();
  ui.alert("Exemption cleared for " + removedName + ".\n\nThey will appear in the priority pool again on the next roster refresh.");
}
