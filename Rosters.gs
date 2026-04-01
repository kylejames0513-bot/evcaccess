// ============================================================
// EVC Training System — Rosters, Classes & Scheduling
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
//
// CONTENTS:
//   1. Roster data building & generation
//   2. writeRosterSheet (Training Rosters tab)
//   3. Scheduled sheet sync & parsing
//   4. Overview building & writing
//   5. Class roster building (Quick Build, Advanced, from Overview)
//   6. Pool building, assignment, date generation
//   7. Class roster tab output
//   8. Scanning (class tabs, scheduled sheet)
//   9. Overview sync (snapshots, onChange, additions/removals)
//  10. Tab ordering & monitoring
//  11. Trigger installers (class roster tabs)
//  12. Refresh All (manual)
//  13. Removal & move (from class roster / overview)
//  14. Training memo
//  15. Logging, exemptions, removal log
//  16. Smart Remove (merged from Classmanagement.gs)
//  17. Upload Roster Results
//  18. Smart Remove helpers
//  19. Manual Class Assignment
//  20. Manual Assignment helpers
//  21. Create a Class
//  22. Add to Rescheduled
//  23. View Rescheduled List
//  24. Rescheduled sheet management
//  25. Rescheduled display helpers
//
// DEPENDS ON: Config.gs, Utilities.gs, Core.gs
//
// NOTE: Rosters never auto-refresh. Use EVC Tools >
//       5a. Refresh All when you are ready.
//
// ============================================================

// ************************************************************
//   1. ROSTER DATA BUILDING & GENERATION
// ************************************************************
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
  var jobTitleCol = findColumnIndex(headers, ["JOB TITLE", "JOB_TITLE", "POSITION", "TITLE"]);

  // Load Training Rules for filtering (job title → training → Y/N)
  var rulesMap = {};
  var rulesSheet = ss.getSheetByName(TRAINING_RULES_SHEET);
  if (rulesSheet) {
    var rulesData = rulesSheet.getDataRange().getValues();
    var rulesHeaders = rulesData[0];
    for (var rr = 1; rr < rulesData.length; rr++) {
      var role = rulesData[rr][0] ? rulesData[rr][0].toString().trim() : "";
      if (!role) continue;
      rulesMap[role.toLowerCase()] = {};
      for (var rc = 1; rc < rulesHeaders.length; rc++) {
        var rTraining = rulesHeaders[rc] ? rulesHeaders[rc].toString().trim() : "";
        var rVal = rulesData[rr][rc] ? rulesData[rr][rc].toString().trim().toUpperCase() : "Y";
        rulesMap[role.toLowerCase()][rTraining] = rVal;
      }
    }
  }

  var allRosters = [];

  for (var t = 0; t < TRAINING_CONFIG.length; t++) {
    var config = TRAINING_CONFIG[t];
    var colIdx = findColumnIndex(headers, [config.column]);
    if (colIdx === -1 && config.columnAlt) {
      colIdx = findColumnIndex(headers, config.columnAlt);
    }

    if (colIdx === -1) {
      allRosters.push({
        name: config.name,
        showOnRoster: config.showOnRoster || false,
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
    var excused = [];
    var totalActive = 0;
    var completedCount = 0;

    var prereqColIdx = -1;
    if (config.prerequisite) {
      prereqColIdx = findColumnIndex(headers, [config.prerequisite]);
    }

    var seenNames = {};

    for (var r = 1; r < data.length; r++) {
      var lastName = String(data[r][lNameCol] || "").trim();
      var firstName = String(data[r][fNameCol] || "").trim();

      if (!lastName && !firstName) continue;

      var nameKey = (firstName + " " + lastName).toLowerCase();
      if (seenNames[nameKey]) continue;
      seenNames[nameKey] = true;

      if (activeCol !== -1) {
        var activeVal = String(data[r][activeCol] || "").trim().toUpperCase();
        if (activeVal === "NO" || activeVal === "INACTIVE" || activeVal === "TERMINATED" || activeVal === "N") continue;
      }

      // Check Training Rules — skip if job title says N for this training
      if (jobTitleCol !== -1 && Object.keys(rulesMap).length > 0) {
        var jobTitle = String(data[r][jobTitleCol] || "").trim();
        if (jobTitle) {
          var titleRules = rulesMap[jobTitle.toLowerCase()];
          if (titleRules) {
            var rulesName = config.rulesName || config.name;
            if (titleRules[rulesName] === "N") continue;
          }
        }
      }

      if (prereqColIdx !== -1) {
        var prereqVal = data[r][prereqColIdx];
        var prereqDate = parseTrainingDate(prereqVal);
        if (!prereqDate) continue;
      }

      totalActive++;
      var fullName = firstName + " " + lastName;
      var dateVal = data[r][colIdx];
      var cellStr = String(dateVal || "").trim();

      // Check for excusal codes — person doesn't need this training
      var cellUpper = cellStr.toUpperCase();
      var excusalCode = getExcusalCode(cellStr);
      if (excusalCode) {
        excused.push({ name: fullName, reason: excusalCode });
        continue;
      }

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
        // For non-required trainings, non-date text (like VP, ELC, FACILITIES, etc.) means excused
        if (config.required) {
          needed.push({ name: fullName, status: "No valid date (" + cellStr + ")", lastDate: cellStr });
        }
        // else: non-required + non-date text = excused (e.g., VP, FACILITIES, LLL)
        excused.push({ name: fullName, reason: cellStr.toUpperCase() });
        continue;
      }

      if (config.renewalYears === 0) { completedCount++; continue; }

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
      } else {
        completedCount++;
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
      showOnRoster: config.showOnRoster || false,
      needed: needed,
      expiringSoon: expiringSoon,
      expired: expired,
      excused: excused,
      totalActive: totalActive,
      completedCount: completedCount
    });
  }
  return { ss: ss, allRosters: allRosters, today: today };
}

function generateRosters() {
  var result = buildRosterData();
  if (!result) return; // buildRosterData showed an error alert

  writeRosterSheet(result.ss, result.allRosters, result.today);

  // Summary alert (roster trainings only)
  var rosterItems = [];
  for (var ri = 0; ri < result.allRosters.length; ri++) {
    if (result.allRosters[ri].showOnRoster) rosterItems.push(result.allRosters[ri]);
  }
  if (rosterItems.length === 0) rosterItems = result.allRosters;
  var summary = "Rosters generated!\n\n";
  for (var i = 0; i < rosterItems.length; i++) {
    var r = rosterItems[i];
    if (r.error) {
      summary += r.name + ": " + r.error + "\n";
    } else {
      var compPct = r.totalActive > 0 ? Math.round((r.completedCount / r.totalActive) * 100) : 100;
      summary += r.name + ": " + r.completedCount + "/" + r.totalActive + " completed (" + compPct + "%)";
      if (r.expired.length > 0) summary += " | " + r.expired.length + " expired";
      if (r.expiringSoon.length > 0) summary += " | " + r.expiringSoon.length + " expiring";
      if (r.needed.length > 0) summary += " | " + r.needed.length + " needed";
      summary += "\n";
    }
  }
  // Grand totals
  var gComp = 0, gTotal = 0, gExp = 0, gNeed = 0, gExpiring = 0;
  for (var g = 0; g < rosterItems.length; g++) {
    var gr = rosterItems[g];
    if (!gr.error) {
      gComp += gr.completedCount || 0; gTotal += gr.totalActive || 0;
      gExp += gr.expired.length; gNeed += gr.needed.length; gExpiring += gr.expiringSoon.length;
    }
  }
  var gPct = gTotal > 0 ? Math.round((gComp / gTotal) * 100) : 100;
  summary += "\n── TOTALS ──\n";
  summary += gComp + "/" + gTotal + " completed (" + gPct + "%)";
  if (gExp > 0) summary += " | " + gExp + " expired";
  if (gExpiring > 0) summary += " | " + gExpiring + " expiring";
  if (gNeed > 0) summary += " | " + gNeed + " needed";
  summary += "\n\nCheck the \"" + ROSTER_SHEET_NAME + "\" tab for details.";
  SpreadsheetApp.getUi().alert(summary);
}

function generateRostersSilent() {
  try {
    // Ensure all pending writes are committed before reading data
    SpreadsheetApp.flush();

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // If user is viewing the Training Rosters tab, switch away first
    // so the sheet can be safely deleted and recreated
    var activeSheet = ss.getActiveSheet();
    if (activeSheet && activeSheet.getName() === ROSTER_SHEET_NAME) {
      var trainingSheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);
      if (trainingSheet) ss.setActiveSheet(trainingSheet);
    }

    // Clean garbled dates before building rosters
    cleanGarbledDates();

    var result = buildRosterData(true); // silent = true
    if (!result) return;
    writeRosterSheet(result.ss, result.allRosters, result.today);
    Logger.log("Training Rosters refreshed at " + new Date().toString());
  } catch (err) {
    Logger.log("Roster refresh error: " + err.toString());
  }
}

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


// ************************************************************
//   2. TRAINING ROSTERS TAB OUTPUT
// ************************************************************

function writeRosterSheet(ss, allRosters, today) {
  // Filter to only show trainings flagged for roster display
  var filtered = [];
  for (var f = 0; f < allRosters.length; f++) {
    if (allRosters[f].showOnRoster) filtered.push(allRosters[f]);
  }
  if (filtered.length > 0) allRosters = filtered;

  var existing = ss.getSheetByName(ROSTER_SHEET_NAME);
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet(ROSTER_SHEET_NAME);
  var NAVY = "#1F3864", RED = "#C00000", ORANGE = "#E65100", GREEN = "#2E7D32";
  var BLUE = "#1565C0", LGRAY = "#F2F2F2", WHITE = "#FFFFFF", ALT_BLUE = "#EBF0F7";
  var COLS = 7;
  var alreadyScheduled = buildFullScheduledMap_(ss);
  var standbyMap = buildRescheduledMap_();

  var w = new SheetWriter(sheet).setColCount(COLS);
  w.addRow(["EVC Training Rosters"], { bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 16, merge: true });
  w.addRow(["Generated: " + Utilities.formatDate(today, Session.getScriptTimeZone(), "EEEE, MMMM d, yyyy 'at' h:mm a")], { fontColor: "#666666", fontSize: 10, merge: true });
  w.addRow(["HR Program Coordinator: Kyle Mahoney"], { fontColor: "#666666", fontSize: 10, merge: true });
  w.addRow([]);

  w.addRow(["COMPLIANCE DASHBOARD"], { bg: "#2E75B6", fontColor: WHITE, fontWeight: "bold", fontSize: 12, merge: true });
  w.addRow(["Training", "Completed", "Expired", "Expiring", "Needs", "Total Staff", "Completion %"], {
    bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 10
  });

  for (var t = 0; t < allRosters.length; t++) {
    var r = allRosters[t];
    if (r.error) {
      w.addRow([r.name, "ERROR", "", "", "", "", ""], { fontColor: RED });
      continue;
    }
    var expCt = r.expired.length, esCt = r.expiringSoon.length, ndCt = r.needed.length;
    var compCt = r.completedCount || 0;
    var totStaff = r.totalActive || 0;
    var compPct = totStaff > 0 ? Math.round((compCt / totStaff) * 100) : 100;
    var pctColor = compPct >= 80 ? GREEN : (compPct >= 50 ? ORANGE : RED);
    var rowBg = (t % 2 === 0) ? WHITE : ALT_BLUE;

    w.addRow([r.name, compCt, expCt || "", esCt || "", ndCt || "", totStaff, compPct + "%"], {
      bg: rowBg,
      cellColors: [
        "#000000",
        compCt > 0 ? GREEN : "#666666",
        expCt > 0 ? RED : "#666666",
        esCt > 0 ? ORANGE : "#666666",
        ndCt > 0 ? NAVY : "#666666",
        "#000000",
        pctColor
      ],
      cellWeights: ["bold", "bold", "normal", "normal", "normal", "bold", "bold"]
    });
  }

  // Grand totals row
  var grandCompleted = 0, grandExpired = 0, grandExpiring = 0, grandNeeded = 0, grandTotal = 0;
  for (var gt = 0; gt < allRosters.length; gt++) {
    var gr = allRosters[gt];
    if (gr.error) continue;
    grandCompleted += gr.completedCount || 0;
    grandExpired += gr.expired.length;
    grandExpiring += gr.expiringSoon.length;
    grandNeeded += gr.needed.length;
    grandTotal += gr.totalActive || 0;
  }
  var grandPct = grandTotal > 0 ? Math.round((grandCompleted / grandTotal) * 100) : 100;

  w.addRow(["TOTALS", grandCompleted, grandExpired || "", grandExpiring || "", grandNeeded || "", grandTotal, grandPct + "%"], {
    bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 10
  });

  w.addRow([]);
  var dashEnd = w.flush();

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
    var sbm = standbyMap[tk] || {};
    var all = [];
    for (var e = 0; e < roster.expired.length; e++) all.push({ emp: roster.expired[e], pri: "EXPIRED", col: RED, sortPri: 1 });
    for (var es = 0; es < roster.expiringSoon.length; es++) all.push({ emp: roster.expiringSoon[es], pri: "EXPIRING SOON", col: ORANGE, sortPri: 3 });
    for (var n = 0; n < roster.needed.length; n++) {
      var isF = roster.needed[n].status && roster.needed[n].status.toLowerCase().indexOf("failed") > -1;
      all.push({ emp: roster.needed[n], pri: "NEEDS TRAINING", col: NAVY, sortPri: isF ? 8 : 2 });
    }

    all.sort(function(a, b) {
      var apl = a.emp.name.toLowerCase().trim();
      var bpl = b.emp.name.toLowerCase().trim();
      var aS = sm[apl] ? 0 : (sbm[apl] ? 1 : 2);
      var bS = sm[bpl] ? 0 : (sbm[bpl] ? 1 : 2);
      if (aS !== bS) return aS - bS;
      return a.sortPri - b.sortPri;
    });

    var hasScheduled = false, scheduledCount = 0, standbyCount = 0;
    for (var ch = 0; ch < all.length; ch++) {
      var chpl = all[ch].emp.name.toLowerCase().trim();
      if (sm[chpl]) { hasScheduled = true; scheduledCount++; }
      else if (sbm[chpl]) { standbyCount++; }
    }
    var wroteUnschedHeader = false, wroteStandbyHeader = false;

    for (var a = 0; a < all.length; a++) {
      var item = all[a], emp = item.emp;
      var pl = emp.name.toLowerCase().trim();
      var sd = sm[pl] || "";
      var sbVal = sbm[pl] || "";
      var dataBg = (a % 2 === 0) ? WHITE : ALT_BLUE;
      var sl = "", slBg = dataBg, slColor = "#000000", slBold = "normal";

      if (sd) {
        sl = "Scheduled (" + sd + ")";
        slBg = BLUE; slColor = WHITE; slBold = "bold";
      } else if (sbVal) {
        sl = "Rescheduled (" + sbVal + ")";
        slBg = "#E65100"; slColor = WHITE; slBold = "bold";
      }

      if ((hasScheduled || standbyCount > 0) && a === 0 && scheduledCount > 0) {
        sw.addRow(["\u25b8 SCHEDULED (" + scheduledCount + ")"], { bg: "#D6E4F0", fontColor: BLUE, fontWeight: "bold", fontSize: 9, merge: true });
      }
      if (scheduledCount > 0 && !sd && sbVal && !wroteStandbyHeader) {
        wroteStandbyHeader = true;
        sw.addRow(["\u25b8 RESCHEDULED (" + standbyCount + ")"], { bg: "#FFF3CD", fontColor: "#E65100", fontWeight: "bold", fontSize: 9, merge: true });
      }
      if (!sd && !sbVal && !wroteUnschedHeader) {
        wroteUnschedHeader = true;
        sw.addRow(["\u25b8 NOT YET SCHEDULED (" + (all.length - scheduledCount - standbyCount) + ")"], { bg: "#FCE4EC", fontColor: RED, fontWeight: "bold", fontSize: 9, merge: true });
      }

      sw.addRow([emp.name, emp.status, emp.lastDate || "", emp.expDate || "", item.pri, sl, ""], {
        bg: dataBg,
        cellBgs: [dataBg, dataBg, dataBg, dataBg, item.col, sl ? slBg : dataBg, dataBg],
        cellColors: [
          item.col !== NAVY ? item.col : "#000000",
          item.col !== NAVY ? item.col : "#000000",
          item.col !== NAVY ? item.col : "#000000",
          item.col !== NAVY ? item.col : "#000000",
          WHITE,
          sl ? slColor : "#000000",
          "#000000"
        ],
        cellWeights: ["normal", "normal", "normal", "normal", "bold", slBold, "normal"]
      });
    }

    var unschedCount = all.length - scheduledCount - standbyCount;
    var subtotal = tf + " staff flagged \u2014 " + scheduledCount + " scheduled";
    if (standbyCount > 0) subtotal += ", " + standbyCount + " rescheduled";
    subtotal += ", " + unschedCount + " unscheduled";
    sw.addRow([subtotal], { fontColor: "#666666", fontSize: 9, merge: true });

    var excusedList = roster.excused || [];
    if (excusedList.length > 0) {
      var byReason = {};
      for (var ex = 0; ex < excusedList.length; ex++) {
        var reason = excusedList[ex].reason || "UNKNOWN";
        if (!byReason[reason]) byReason[reason] = [];
        byReason[reason].push(excusedList[ex].name);
      }

      sw.addRow(["\u25b8 EXCUSED (" + excusedList.length + ")"], {
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
//   3. SCHEDULED SHEET SYNC & PARSING
// ************************************************************

function syncScheduledTrainings() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var rosterResult = buildRosterData(true);
  if (!rosterResult) { ui.alert("Could not read Training sheet data."); return; }
  var allRosters = rosterResult.allRosters;
  var today = rosterResult.today;

  var needsLookup = buildNeedsLookup_(allRosters);

  var allSessions = parseScheduledSheet_(ss);
  if (!allSessions || allSessions.length === 0) { ui.alert("No sessions found on the Scheduled sheet."); return; }

  // Archive past sessions — remove from list
  var sessions = [];
  var archived = 0;
  for (var s = 0; s < allSessions.length; s++) {
    if (allSessions[s].sortDate && allSessions[s].sortDate < today) {
      archived++;
    } else {
      sessions.push(allSessions[s]);
    }
  }

  var globalAssigned = {};
  var summaryLines = [];
  var totalRemoved = 0, totalBackfilled = 0, totalKept = 0;

  for (var s = 0; s < sessions.length; s++) {
    var session = sessions[s];
    var configName = resolveTrainingName_(session.type);
    session.configName = configName;

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

    var kept = [];
    var removed = [];
    var placeholders = [];
    var seenInSession = {}; // deduplicate within a session

    for (var e = 0; e < session.enrollees.length; e++) {
      var name = session.enrollees[e];
      var nameLower = name.toLowerCase().trim();

      if (nameLower === "tbd" || nameLower === "new hires") {
        placeholders.push(name);
        continue;
      }

      // Skip duplicates within the same session
      if (seenInSession[nameLower]) continue;
      seenInSession[nameLower] = true;

      var info = needsMap[nameLower];
      if (!info) info = fuzzyMatchNeeds_(nameLower, needsMap);

      if (info) {
        kept.push(name);
        assignedMap[nameLower] = true;
      } else {
        removed.push(name);
      }
    }

    // Backfill disabled — use Create a Class to add people manually
    session.finalEnrollees = kept.slice();
    session.removedEnrollees = removed;
    session.backfilledEnrollees = [];
    session.keptEnrollees = kept;
    session.placeholders = placeholders;

    totalRemoved += removed.length + placeholders.length;
    totalKept += kept.length;

    var line = session.type + " (" + session.dateDisplay + "): ";
    line += "Kept " + kept.length;
    if (removed.length > 0) line += ", removed " + removed.length + " (already current)";
    if (placeholders.length > 0) line += ", replaced " + placeholders.length + " placeholder(s)";
    var remaining = capacity - session.finalEnrollees.length;
    if (remaining > 0) line += " | " + remaining + " open seat(s)";
    summaryLines.push(line);
  }

  rewriteScheduledSheet_(ss, sessions);

  // Clean class roster tabs for removed people (already current)
  var tabsCleaned = cleanClassTabsForRemovedEnrollees_(ss, sessions);

  var overviewResult = buildOverviewFromSyncedSessions_(sessions, allRosters, ss);
  writeScheduledOverviewSheet_(overviewResult, ss, today);

  var summary = "Sync Complete!\n\n";
  if (archived > 0) summary += "Archived: " + archived + " past session(s) removed\n";
  summary += "Kept (still need training): " + totalKept + "\n";
  summary += "Removed (already current): " + totalRemoved;
  if (tabsCleaned > 0) summary += " (" + tabsCleaned + " also removed from class tabs)";
  summary += "\n";
  summary += "Backfilled (from needs list): " + totalBackfilled + "\n\n";
  for (var sl = 0; sl < summaryLines.length; sl++) summary += summaryLines[sl] + "\n";

  // Refresh Training Rosters so everything is current
  generateRostersSilent();

  summary += "\nScheduled sheet updated.\nOverview tab rebuilt.\nTraining Rosters refreshed.";
  ui.alert(summary);
}

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

    var SYNC_CUTOFF = getSyncCutoffDate_();

    var globalAssigned = {};

    for (var s = 0; s < sessions.length; s++) {
      var session = sessions[s];
      var configName = resolveTrainingName_(session.type);
      session.configName = configName;

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

      // Backfill disabled — use Create a Class to add people manually
      session.finalEnrollees = kept.slice();
      session.removedEnrollees = removed;
      session.backfilledEnrollees = [];
      session.keptEnrollees = kept;
      session.placeholders = placeholders;
    }

    rewriteScheduledSheet_(ss, sessions);
    cleanClassTabsForRemovedEnrollees_(ss, sessions);
    var overviewResult = buildOverviewFromSyncedSessions_(sessions, allRosters, ss);
    writeScheduledOverviewSheet_(overviewResult, ss, today);
    Logger.log("Silent sync complete");
  } catch (e) {
    Logger.log("syncScheduledSilent_ error: " + e.toString());
  }
}

function parseScheduledSheet_(ss) {
  var sheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  var sessions = [], lastType = "";

  for (var r = 0; r < data.length; r++) {
    var colA     = data[r][0] ? data[r][0].toString().trim() : "";
    var colB_raw = data[r][1];
    var colB     = colB_raw ? colB_raw.toString().trim() : "";
    var colC     = data[r][2] ? data[r][2].toString().trim() : "";
    var colD     = data[r][3] ? data[r][3].toString().trim() : "";
    var colE     = data[r][4] ? data[r][4].toString().trim() : "";

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
//   4. OVERVIEW BUILDING & WRITING
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
    var bfList   = session.backfilledEnrollees || [];
    var rmList   = session.removedEnrollees || [];

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

function writeScheduledOverviewSheet_(result, ss, today) {
  var existing = ss.getSheetByName(OVERVIEW_SHEET_NAME);
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet(OVERVIEW_SHEET_NAME);

  var NAVY = "#1F3864", RED = "#C00000", ORANGE = "#E65100", GREEN = "#2E7D32", BLUE = "#1565C0";
  var LGRAY = "#F2F2F2", LGREEN = "#C6EFCE", LRED = "#FFC7CE", WHITE = "#FFFFFF", ALT_BLUE = "#EBF0F7";
  var COLS = 6;

  var w = new SheetWriter(sheet).setColCount(COLS);

  w.addRow(["EVC Scheduled Training \u2014 Control Center"], { bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 16, merge: true });
  w.addRow(["Generated: " + Utilities.formatDate(today, Session.getScriptTimeZone(), "EEEE, MMMM d, yyyy 'at' h:mm a")], { bg: NAVY, fontColor: "#999999", fontSize: 9, merge: true });
  w.addRow(["Enrolled (need it): " + result.totalNeedIt + "   |   Removed (current): " + result.totalCurrent + "   |   Select a row \u2192 Menu \u2192 Remove from Class Roster"], {
    bg: "#2E75B6", fontColor: WHITE, fontWeight: "bold", fontSize: 10, merge: true
  });
  w.addRow([]);

  w.addRow(["SESSION-BY-SESSION BREAKDOWN"], { fontColor: NAVY, fontWeight: "bold", fontSize: 13, merge: true });
  w.addRow([]);

  var headerEnd = w.flush();
  var row = headerEnd;

  var snapshot = [];

  for (var s = 0; s < result.sessions.length; s++) {
    var session = result.sessions[s];
    var hdr = session.type;
    if (session.dateDisplay) hdr += "  \u2014  " + session.dateDisplay;

    var sw = new SheetWriter(sheet).setColCount(COLS).setStartRow(row);

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

      var enrolleeMeta = "ENROLLEE:" + s + ":" + p.name;

      sw.addRow([e + 1, p.name, actionLabel, p.detail || "", session.type, enrolleeMeta], {
        cellBgs: [altFill, altFill, actionBg, altFill, altFill, altFill],
        cellColors: ["#000000", "#000000", actionColor, detailColor, "#666666", altFill],
        cellWeights: ["normal", "normal", "bold", "normal", "normal", "normal"],
        cellSizes: [10, 10, 10, 10, 9, 9]
      });

      if (p.bucket !== "removed") {
        sessionSnap.enrollees.push(p.name);
      }
    }

    sw.addRow([]);
    row = sw.flush();
    snapshot.push(sessionSnap);
  }

  var gw = new SheetWriter(sheet).setColCount(COLS).setStartRow(row);

  // ── RESCHEDULED SECTION ──
  var rescheduledList = readRescheduledList_();
  if (rescheduledList.length > 0) {
    gw.addRow([]);
    gw.addRow(["RESCHEDULED \u2014 WAITING FOR CLASS CREATION"], { fontColor: "#E65100", fontWeight: "bold", fontSize: 13, merge: true });
    gw.addRow([]);
    gw.addRow(["#", "Name", "Training", "Target Date", "Added", ""], {
      bg: "#E65100", fontColor: WHITE, fontWeight: "bold"
    });

    for (var sb = 0; sb < rescheduledList.length; sb++) {
      var sbEntry = rescheduledList[sb];
      var sbBg = (sb % 2 === 0) ? WHITE : ALT_BLUE;
      gw.addRow([sb + 1, sbEntry.name, sbEntry.training, sbEntry.targetDate, sbEntry.dateAdded, ""], {
        bg: sbBg
      });
    }
    gw.addRow([]);
  }

  gw.addRow([]);
  gw.addRow(["GAP ANALYSIS \u2014 WHO STILL NEEDS SCHEDULING"], { fontColor: NAVY, fontWeight: "bold", fontSize: 13, merge: true });
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

  for (var g = 0; g < result.gaps.length; g++) {
    var gap = result.gaps[g];
    if (gap.unscheduled.length === 0) continue;

    var uw = new SheetWriter(sheet).setColCount(COLS).setStartRow(row);
    uw.addRow([gap.training + " \u2014 " + gap.unscheduled.length + " STILL UNSCHEDULED"], {
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

  sheet.setColumnWidth(1, 40);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 250);
  sheet.setColumnWidth(5, 120);
  sheet.hideColumns(6);
  sheet.setFrozenRows(3);

  try {
    var schedSheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
    if (schedSheet) { ss.setActiveSheet(sheet); ss.moveActiveSheet(schedSheet.getIndex() + 1); }
  } catch (e) {}

  saveOverviewSnapshot_(snapshot);
}


// ************************************************************
//   5. CLASS ROSTER BUILDING
// ************************************************************

function quickBuildRosters() {
  var ui = SpreadsheetApp.getUi();

  var rosterResult = buildRosterData(true);
  if (!rosterResult) { ui.alert("Could not read Training sheet."); return; }
  var ss = rosterResult.ss, today = rosterResult.today, allRosters = rosterResult.allRosters;
  var alreadyScheduled = buildFullScheduledMap_(ss);

  var msg = "Which training?\n\n";
  for (var i = 0; i < CLASS_ROSTER_CONFIG.length; i++) {
    var config = CLASS_ROSTER_CONFIG[i];
    var poolCount = 0;
    for (var r = 0; r < allRosters.length; r++) {
      if (allRosters[r].name === config.name && !allRosters[r].error) {
        var tempPool = buildPriorityPool(allRosters[r], alreadyScheduled, config.name);
        poolCount = tempPool.length;
        break;
      }
    }
    var poolLabel = poolCount > 0 ? " \u2014 " + poolCount + " need it" : " \u2014 all current";
    msg += (i + 1) + ".  " + config.name + " (cap " + config.classCapacity + ")" + poolLabel + "\n";
  }
  msg += "\nEnter a number:";

  var choice = ui.prompt("Quick Build \u2014 Pick Training", msg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;

  var idx = parseInt(choice.getResponseText().trim()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= CLASS_ROSTER_CONFIG.length) {
    ui.alert("Invalid selection.");
    return;
  }

  var config = CLASS_ROSTER_CONFIG[idx];
  var capacity = config.classCapacity;

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

  var expCount = 0, needCount = 0, esCount = 0;
  for (var p = 0; p < pool.length; p++) {
    if (pool[p].bucket === "expired") expCount++;
    else if (pool[p].bucket === "needed") needCount++;
    else if (pool[p].bucket === "expiringSoon") esCount++;
  }

  var suggestedDates = generateUpcomingDates(config, today);
  var prefill = "";
  for (var d = 0; d < suggestedDates.length; d++) prefill += formatClassDate(suggestedDates[d]) + "\n";

  var classesNeeded = Math.ceil(pool.length / capacity);

  var dateMsg = config.name + "\n\n";
  dateMsg += "POOL: " + pool.length + " people need this training\n";
  dateMsg += "  Expired: " + expCount + "  |  Never completed: " + needCount + "  |  Expiring soon: " + esCount + "\n\n";
  dateMsg += "CAPACITY: " + capacity + " per class\n";
  dateMsg += "CLASSES NEEDED: " + classesNeeded + " (to cover everyone)\n\n";
  dateMsg += "Enter class dates below (M/D/YYYY, one per line).\n";
  dateMsg += "People will be auto-assigned by priority:\n";
  dateMsg += "  1st: Expired  \u2192  2nd: Never completed  \u2192  3rd: Expiring soon\n";

  var dateResponse = ui.prompt(config.name + " \u2014 Enter Dates", dateMsg, ui.ButtonSet.OK_CANCEL);
  if (dateResponse.getSelectedButton() !== ui.Button.OK) return;

  var dateInput = dateResponse.getResponseText().trim();
  if (!dateInput) { ui.alert("No dates entered."); return; }

  var finalDates = parseDateList(dateInput);
  if (finalDates.length === 0) { ui.alert("No valid dates found. Use M/D/YYYY format."); return; }

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

    var tk = config.name.toLowerCase();
    if (!alreadyScheduled[tk]) alreadyScheduled[tk] = {};
    for (var ap = 0; ap < classInfo.people.length; ap++) {
      alreadyScheduled[tk][classInfo.people[ap].name.toLowerCase().trim()] = formatClassDate(classInfo.date);
    }
  }

  orderClassRosterTabs(ss);

  var leftover = pool.length - totalAssigned;
  var summary = config.name + " \u2014 Quick Build Complete!\n\n";
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

  generateRostersSilent();
  rebuildScheduledOverview_(ss);
  summary += "\nTraining Rosters & Scheduled Overview updated.";
  ui.alert(summary);
}

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

    var dp = ui.prompt(config.name + " \u2014 Dates", "Dates:\n" + dateStr + "\nPool: " + pool.length + "\nCapacity: " + config.classCapacity + "/class\n\nEdit (M/D/YYYY, one per line):", ui.ButtonSet.OK_CANCEL);
    if (dp.getSelectedButton() !== ui.Button.OK) continue;
    var di = dp.getResponseText().trim();
    if (!di) { summaryLines.push(config.name + ": Skipped"); continue; }
    var finalDates = parseDateList(di);
    if (finalDates.length === 0) { summaryLines.push(config.name + ": No valid dates"); continue; }

    var cp = ui.prompt(config.name + " \u2014 Capacity", "Max seats? (Default: " + config.classCapacity + ")", ui.ButtonSet.OK_CANCEL);
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

  orderClassRosterTabs(ss);
  generateRostersSilent();
  rebuildScheduledOverview_(ss);
  var summary = "Complete! Tabs: " + tabsCreated + "\n\n";
  for (var sl = 0; sl < summaryLines.length; sl++) summary += summaryLines[sl] + "\n";
  summary += "\nTraining Rosters & Scheduled Overview updated.";
  ui.alert(summary);
}

function buildRostersFromOverview() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var activeSheet = ss.getActiveSheet();
  if (activeSheet.getName() !== OVERVIEW_SHEET_NAME) {
    ui.alert(
      "Navigate to the \"" + OVERVIEW_SHEET_NAME + "\" tab first,\n" +
      "then run this again.\n\n" +
      "This builds class roster tabs from the enrolled sessions\n" +
      "shown on the Overview."
    );
    return;
  }

  var overviewSessions = readOverviewSessionsForMemo_();
  if (!overviewSessions || overviewSessions.length === 0) {
    ui.alert(
      "No sessions with attendees found.\n\n" +
      "Run Sync Scheduled Trainings first to populate the Overview,\n" +
      "then come back here and try again."
    );
    return;
  }

  var rosterResult = buildRosterData(true);
  if (!rosterResult) { ui.alert("Could not read Training sheet."); return; }
  var allRosters = rosterResult.allRosters;
  var today = rosterResult.today;
  var needsLookup = buildNeedsLookup_(allRosters);

  var msg = "Create class roster tab for which session?\n\n";
  msg += "0.  ALL (" + overviewSessions.length + " sessions)\n";
  for (var i = 0; i < overviewSessions.length; i++) {
    var s = overviewSessions[i];
    msg += (i + 1) + ".  " + s.type;
    if (s.dateDisplay) msg += " \u2014 " + s.dateDisplay;
    msg += " (" + s.attendees.length + " enrolled)\n";
  }
  msg += "\nEnter a number (or comma-separated, e.g. 1,3,5):";

  var choice = ui.prompt("Build Class Rosters from Overview", msg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;

  var input = choice.getResponseText().trim();
  var selected = [];

  if (input === "0") {
    selected = overviewSessions.slice();
  } else {
    var parts = input.split(",");
    for (var p = 0; p < parts.length; p++) {
      var idx = parseInt(parts[p].trim()) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < overviewSessions.length) {
        selected.push(overviewSessions[idx]);
      }
    }
  }

  if (selected.length === 0) {
    ui.alert("No valid selection.");
    return;
  }

  var tabsCreated = 0;
  var summaryLines = [];

  for (var t = 0; t < selected.length; t++) {
    var sess = selected[t];
    if (sess.attendees.length === 0) continue;

    var configName = resolveTrainingName_(sess.type);
    var capacity = configName ? getCapacityForTraining_(configName) : 15;
    var needsMap = configName ? (needsLookup[configName.toLowerCase()] || {}) : {};

    var classDate = null;
    if (sess.dateDisplay) {
      classDate = parseFuzzyDate_(sess.dateDisplay);
      if (!classDate) classDate = parseClassDate(sess.dateDisplay);
    }
    if (!classDate) classDate = new Date();

    var people = [];
    for (var a = 0; a < sess.attendees.length; a++) {
      var name = sess.attendees[a];
      var nameLower = name.toLowerCase().trim();
      var info = needsMap[nameLower];
      if (!info) info = fuzzyMatchNeeds_(nameLower, needsMap);

      var bucket = info ? info.bucket : "needed";
      var effectiveBucket = bucket;
      if (bucket === "expiringSoon" && info && info.expDate) {
        var expD = parseClassDate(info.expDate);
        if (expD && expD.getTime() < classDate.getTime()) effectiveBucket = "expired";
      }

      people.push({
        name: name,
        status: info ? info.status : "Enrolled",
        bucket: bucket,
        lastDate: info ? (info.lastDate || "") : "",
        expDate: info ? (info.expDate || "") : "",
        effectiveBucket: effectiveBucket
      });
    }

    people.sort(function(a, b) {
      var prioMap = { "expired": 1, "needed": 2, "expiringSoon": 3 };
      return (prioMap[a.effectiveBucket] || 9) - (prioMap[b.effectiveBucket] || 9);
    });

    var classInfo = { date: classDate, people: people };
    var tabName = buildTabName(sess.type, classDate);

    var existing = ss.getSheetByName(tabName);
    if (existing) ss.deleteSheet(existing);

    var tab = ss.insertSheet(tabName);
    writeClassRosterTab(tab, sess.type, classInfo, capacity, today);

    if (sess.time) tab.getRange(3, 2).setValue(sess.time);
    if (sess.location) tab.getRange(3, 4).setValue(sess.location);

    tabsCreated++;
    var openSeats = Math.max(0, capacity - people.length);
    summaryLines.push(
      tabName + ": " + people.length + "/" + capacity +
      (openSeats > 0 ? " (" + openSeats + " open)" : " (full)")
    );
  }

  orderClassRosterTabs(ss);
  generateRostersSilent();
  rebuildScheduledOverview_(ss);

  if (tabsCreated === 0) {
    ui.alert("No class roster tabs created \u2014 no attendees found.");
  } else {
    var summary = tabsCreated + " class roster tab(s) created!\n\n";
    for (var sl = 0; sl < summaryLines.length; sl++) {
      summary += "  " + summaryLines[sl] + "\n";
    }
    summary += "\nTraining Rosters & Scheduled Overview updated.";
    ui.alert(summary);
  }
}


// ************************************************************
//   6. POOL BUILDING, ASSIGNMENT, DATE GENERATION
// ************************************************************

function buildPriorityPool(rosterData, alreadyScheduled, trainingName) {
  var pool = [], trainKey = trainingName.toLowerCase(), scheduledMap = alreadyScheduled[trainKey] || {};
  var exemptions = loadExemptions_();
  var standbyMap = buildRescheduledMap_();
  var standbyForTraining = standbyMap[trainKey] || {};
  for (var p = 0; p < SEAT_PRIORITY.length; p++) {
    var bd = rosterData[SEAT_PRIORITY[p].bucket] || [];
    for (var i = 0; i < bd.length; i++) {
      var nameLower = bd[i].name.toLowerCase().trim();
      if (scheduledMap[nameLower]) continue;
      if (isExempt_(exemptions, nameLower, trainKey)) continue;
      if (standbyForTraining[nameLower]) continue;
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
//   SYNC HELPERS
// ************************************************************

function buildNeedsLookup_(allRosters) {
  var lookup = {};
  for (var t = 0; t < allRosters.length; t++) {
    var roster = allRosters[t];
    var key = roster.name.toLowerCase();
    lookup[key] = {};
    if (roster.error) continue;
    var buckets = [
      { data: roster.expired,      label: "expired" },
      { data: roster.expiringSoon, label: "expiringSoon" },
      { data: roster.needed,       label: "needed" }
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
//   7. CLASS ROSTER TAB OUTPUT
// ************************************************************

function writeClassRosterTab(sheet, trainingName, classInfo, capacity, today) {
  var NAVY = "#1F3864", RED = "#C00000", ORANGE = "#E65100", GREEN = "#2E7D32";
  var LGRAY = "#F2F2F2", WHITE = "#FFFFFF", ALT_BLUE = "#EBF0F7";
  var COLS = 7;

  var dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var dateLabel = dayNames[classInfo.date.getDay()] + ", " + formatClassDate(classInfo.date);

  var w = new SheetWriter(sheet).setColCount(COLS);

  w.addRow([trainingName + " \u2014 Class Roster"], { bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 14, merge: true });
  w.addRow(["Class Date:", dateLabel], { cellWeights: ["bold", "normal"], cellSizes: [10, 11] });
  w.addRow(["Time:", "", "Location:", ""], { cellWeights: ["bold", "normal", "bold", "normal"], cellColors: ["#000000", "#666666", "#000000", "#666666"] });
  w.addRow(["Trainer:", ""], { cellWeights: ["bold", "normal"], cellColors: ["#000000", "#666666"] });
  w.addRow(["Capacity:", classInfo.people.length + " / " + capacity], { cellWeights: ["bold", "bold"], cellColors: ["#000000", classInfo.people.length >= capacity ? ORANGE : GREEN] });
  w.addRow(["HR Program Coordinator: Kyle Mahoney", "", "", "Generated: " + Utilities.formatDate(today, Session.getScriptTimeZone(), "M/d/yyyy h:mm a")], { fontColor: "#666666", fontSize: 9 });
  w.addRow([]);
  w.addRow(["#", "Name", "Status", "Last Completed", "Priority", "Attended", "Notes"], { bg: NAVY, fontColor: WHITE, fontWeight: "bold", fontSize: 10 });

  var dataStartRow = 9;
  for (var i = 0; i < classInfo.people.length; i++) {
    var p = classInfo.people[i];
    var pl = "", priBg = NAVY, db = p.effectiveBucket || p.bucket;
    if (db === "expired") { pl = p.bucket === "expired" ? "EXPIRED" : "EXPIRES BEFORE CLASS"; priBg = RED; }
    else if (db === "needed") { pl = "NEVER COMPLETED"; priBg = NAVY; }
    else if (db === "expiringSoon") { pl = "EXPIRING SOON"; priBg = ORANGE; }

    var rowBg = (i % 2 === 0) ? WHITE : ALT_BLUE;

    w.addRow([i + 1, p.name, p.status, p.lastDate, pl, false, ""], {
      bg: rowBg,
      cellColors: ["#000000", "#000000", priBg !== NAVY ? priBg : "#000000", "#000000", WHITE, "#000000", "#000000"],
      cellBgs: [rowBg, rowBg, rowBg, rowBg, priBg, rowBg, rowBg],
      cellWeights: ["normal", "normal", "normal", "normal", "bold", "normal", "normal"]
    });
  }

  var openSeats = capacity - classInfo.people.length;
  for (var s = 0; s < openSeats; s++) {
    var seatIdx = classInfo.people.length + s;
    var seatBg = (seatIdx % 2 === 0) ? WHITE : ALT_BLUE;
    w.addRow([seatIdx + 1, OPEN_SEAT_MARKER, "", "", "", false, ""], { fontColor: "#AAAAAA", bg: seatBg });
  }

  var endRow = w.flush();

  var totalPeople = classInfo.people.length + openSeats;
  if (totalPeople > 0) {
    sheet.getRange(dataStartRow, 6, totalPeople, 1).insertCheckboxes();
  }

  if (totalPeople > 0) {
    sheet.getRange(dataStartRow, 1, totalPeople, COLS)
      .setBorder(true, true, true, true, true, true, "#CCCCCC", SpreadsheetApp.BorderStyle.SOLID);
  }
  sheet.getRange(8, 1, 1, COLS)
    .setBorder(true, true, true, true, true, true, NAVY, SpreadsheetApp.BorderStyle.SOLID);

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
//   8. SCANNING (class tabs, scheduled sheet)
//   scanClassRosterTabs = V42 version (filters open seats)
// ************************************************************

function getClassRosterPrefixes() {
  var prefixes = [];
  for (var i = 0; i < CLASS_ROSTER_CONFIG.length; i++) prefixes.push(CLASS_ROSTER_CONFIG[i].name);
  return prefixes;
}

function scanClassRosterTabs(ss) {
  var scheduled = {}, prefixes = getClassRosterPrefixes(), sheets = ss.getSheets();

  // Build sanitized prefixes too (buildTabName strips special chars)
  var sanitizedPrefixes = [];
  for (var p = 0; p < prefixes.length; p++) {
    sanitizedPrefixes.push(prefixes[p].replace(/[:\\\/?*\[\]]/g, ""));
  }

  for (var s = 0; s < sheets.length; s++) {
    var sheetName = sheets[s].getName(), matchedTraining = null;
    for (var p = 0; p < prefixes.length; p++) {
      // Match either the original prefix or the sanitized one
      if (sheetName.indexOf(prefixes[p] + " ") === 0) {
        if (!matchedTraining || prefixes[p].length > matchedTraining.length) matchedTraining = prefixes[p];
      } else if (sanitizedPrefixes[p] !== prefixes[p] && sheetName.indexOf(sanitizedPrefixes[p] + " ") === 0) {
        if (!matchedTraining || prefixes[p].length > matchedTraining.length) matchedTraining = prefixes[p];
      }
    }
    if (!matchedTraining) continue;
    // Use whichever prefix actually matched for date extraction
    var sanitized = matchedTraining.replace(/[:\\\/?*\[\]]/g, "");
    var datePart = "";
    if (sheetName.indexOf(matchedTraining + " ") === 0) {
      datePart = sheetName.substring(matchedTraining.length + 1).trim();
    } else {
      datePart = sheetName.substring(sanitized.length + 1).trim();
    }
    var classDate = parseClassDate(datePart);
    var classDateStr = classDate ? formatClassDate(classDate) : datePart;
    var trainKey = matchedTraining.toLowerCase();
    if (!scheduled[trainKey]) scheduled[trainKey] = {};
    var data = sheets[s].getDataRange().getValues();
    for (var r = 7; r < data.length; r++) {
      var nameVal = data[r][1] ? data[r][1].toString().trim() : "";
      if (!nameVal) continue;
      if (isOpenSeatMarker(nameVal)) continue;
      if (nameVal.toLowerCase() === "tbd") continue;
      if (!scheduled[trainKey][nameVal.toLowerCase()]) {
        scheduled[trainKey][nameVal.toLowerCase()] = classDateStr;
      }
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
//   9. OVERVIEW SYNC (snapshots, onChange, additions/removals)
//   onOverviewChange = V42 version (row deletions only)
// ************************************************************

function saveOverviewSnapshot_(snapshot) {
  try {
    PropertiesService.getDocumentProperties()
      .setProperty("OVERVIEW_SNAPSHOT", JSON.stringify(snapshot));
  } catch (e) {
    Logger.log("saveOverviewSnapshot_ error: " + e.toString());
  }
}

function loadOverviewSnapshot_() {
  try {
    var raw = PropertiesService.getDocumentProperties()
      .getProperty("OVERVIEW_SNAPSHOT");
    if (raw) return JSON.parse(raw);
  } catch (e) {
    Logger.log("loadOverviewSnapshot_ error: " + e.toString());
  }
  return null;
}

function readCurrentOverviewState_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(OVERVIEW_SHEET_NAME);
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  var sessions = {};
  var sessionOrder = [];

  for (var r = 0; r < data.length; r++) {
    var meta = data[r][5] ? data[r][5].toString().trim() : "";

    if (meta.indexOf("SESSION:") === 0) {
      var idx = meta.substring(8);
      var headerText = data[r][0] ? data[r][0].toString().trim() : "";
      var parts = headerText.split("  \u2014  ");
      sessions[idx] = {
        sessionType: parts[0] ? parts[0].trim() : "",
        dateDisplay: parts[1] ? parts[1].trim() : "",
        enrollees: []
      };
      sessionOrder.push(idx);
    }

    if (meta.indexOf("ENROLLEE:") === 0) {
      var colonParts = meta.split(":");
      if (colonParts.length >= 3) {
        var sessIdx = colonParts[1];
        var enrolleeName = colonParts.slice(2).join(":");
        if (sessions[sessIdx]) {
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

function onOverviewChange(e) {
  try {
    // Only care about row deletions — cell edits are in onTrainingEdit
    if (e && e.changeType && e.changeType !== "REMOVE_ROW") {
      return;
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Don't check activeSheet — it's unreliable in onChange context.
    // Just check if the Overview sheet still exists and compare snapshots.
    var overviewSheet = ss.getSheetByName(OVERVIEW_SHEET_NAME);
    if (!overviewSheet) return;

    var oldSnapshot = loadOverviewSnapshot_();
    if (!oldSnapshot) return;

    var currentState = readCurrentOverviewState_();
    if (!currentState) return;

    var removals = [];

    for (var s = 0; s < oldSnapshot.length; s++) {
      var oldSession = oldSnapshot[s];
      var curSession = null;
      for (var c = 0; c < currentState.length; c++) {
        if (currentState[c].sessionType === oldSession.sessionType &&
            currentState[c].dateDisplay === oldSession.dateDisplay) {
          curSession = currentState[c];
          break;
        }
      }

      if (!curSession) {
        for (var oe = 0; oe < oldSession.enrollees.length; oe++) {
          removals.push({
            sessionType: oldSession.sessionType,
            dateDisplay: oldSession.dateDisplay,
            removedName: oldSession.enrollees[oe]
          });
        }
        continue;
      }

      var curNames = {};
      for (var cn = 0; cn < curSession.enrollees.length; cn++) {
        curNames[curSession.enrollees[cn].toLowerCase().trim()] = true;
      }

      for (var oe = 0; oe < oldSession.enrollees.length; oe++) {
        if (!curNames[oldSession.enrollees[oe].toLowerCase().trim()]) {
          removals.push({
            sessionType: oldSession.sessionType,
            dateDisplay: oldSession.dateDisplay,
            removedName: oldSession.enrollees[oe]
          });
        }
      }
    }

    if (removals.length === 0) {
      saveOverviewSnapshot_(currentState);
      return;
    }

    syncOverviewToScheduled_(ss, removals);
    saveOverviewSnapshot_(currentState);

    Logger.log("Overview row delete: removed " + removals.length + " enrollee(s) from Scheduled sheet");

  } catch (err) {
    Logger.log("onOverviewChange error: " + err.toString());
  }
}

function syncOverviewToScheduled_(ss, removals) {
  var sheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();

  var bySession = {};
  for (var r = 0; r < removals.length; r++) {
    var key = removals[r].sessionType + "|" + removals[r].dateDisplay;
    if (!bySession[key]) bySession[key] = { type: removals[r].sessionType, date: removals[r].dateDisplay, names: [] };
    bySession[key].names.push(removals[r].removedName.toLowerCase().trim());
  }

  var lastType = "";
  for (var row = 0; row < data.length; row++) {
    var colA = data[row][0] ? data[row][0].toString().trim() : "";
    var colB = data[row][1] ? data[row][1].toString().trim() : "";
    var colE = data[row][4] ? data[row][4].toString().trim() : "";

    if (colA === "Type" || colA === "a. Upcoming Training") continue;

    var sessionType = colA || lastType;
    if (colA) lastType = colA;

    if (!colE) continue;

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

function syncOverviewAdditionsToScheduled_(ss, additions) {
  var sheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();

  // Group additions by session
  var bySession = {};
  for (var a = 0; a < additions.length; a++) {
    var key = additions[a].sessionType + "|" + additions[a].dateDisplay;
    if (!bySession[key]) bySession[key] = { type: additions[a].sessionType, date: additions[a].dateDisplay, names: [] };
    bySession[key].names.push(additions[a].name);
  }

  var lastType = "";
  for (var row = 0; row < data.length; row++) {
    var colA = data[row][0] ? data[row][0].toString().trim() : "";
    var colB_raw = data[row][1];
    var colB = colB_raw ? colB_raw.toString().trim() : "";
    var colE = data[row][4] ? data[row][4].toString().trim() : "";

    if (colA === "Type" || colA === "a. Upcoming Training") continue;

    var sessionType = colA || lastType;
    if (colA) lastType = colA;

    var dateDisplay = "";
    if (colB_raw instanceof Date && !isNaN(colB_raw.getTime())) {
      dateDisplay = formatClassDate(colB_raw);
    } else if (colB) {
      dateDisplay = colB;
    }

    var matchKey = sessionType + "|" + dateDisplay;
    var addition = bySession[matchKey];
    if (!addition) continue;

    // Parse existing enrollment, add new names (skip duplicates)
    var existingNames = [];
    if (colE && colE.toLowerCase() !== "tbd") {
      existingNames = colE.split(",").map(function(n) { return n.trim(); });
    }

    var existingLower = {};
    for (var e = 0; e < existingNames.length; e++) {
      existingLower[existingNames[e].toLowerCase().trim()] = true;
    }

    for (var n = 0; n < addition.names.length; n++) {
      if (!existingLower[addition.names[n].toLowerCase().trim()]) {
        existingNames.push(addition.names[n]);
      }
    }

    var newEnroll = existingNames.join(", ");
    if (!newEnroll) newEnroll = "TBD";

    if (newEnroll !== colE) {
      sheet.getRange(row + 1, 5).setValue(newEnroll);
    }
  }
}


// ************************************************************
//   10. TAB ORDERING & MONITORING
//   monitorClassRosterTabs = V42 tamed version
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
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var props = PropertiesService.getScriptProperties();
    var prefixes = getClassRosterPrefixes();
    var sheets = ss.getSheets();
    var ct = [];

    for (var s = 0; s < sheets.length; s++) {
      var n = sheets[s].getName();
      for (var p = 0; p < prefixes.length; p++) {
        if (n.indexOf(prefixes[p] + " ") === 0) { ct.push(n); break; }
      }
    }

    // Just track — don't rebuild anything
    props.setProperty("classRosterTabs", ct.sort().join("|"));

  } catch (e) {
    Logger.log("monitor error: " + e.toString());
  }
}


// ************************************************************
//   11. TRIGGER INSTALLERS
// ************************************************************

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

function installOverviewSyncTrigger() {
  var ui = SpreadsheetApp.getUi();

  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "onOverviewChange") {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }

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


// ************************************************************
//   12. SCHEDULED SHEET & OVERVIEW HELPERS
//
//   rebuildScheduledOverview_  — rebuilds Overview from current
//       Scheduled sheet data (call after any class change).
//   addSessionToScheduledSheet_ — adds a new session row to the
//       Scheduled sheet (used by createClass).
//   cleanClassTabsForRemovedEnrollees_ — removes already-current
//       people from class tabs during sync.
// ************************************************************

/**
 * rebuildScheduledOverview_ — reads the current Scheduled sheet,
 * builds the overview, and writes it. Call after any change to
 * class tabs, Scheduled sheet, or enrollment.
 */
function rebuildScheduledOverview_(ss) {
  try {
    SpreadsheetApp.flush();

    // If user is viewing the Overview tab, switch away first
    // so the sheet can be safely deleted and recreated
    var activeSheet = ss.getActiveSheet();
    if (activeSheet && activeSheet.getName() === OVERVIEW_SHEET_NAME) {
      var trainingSheet = ss.getSheetByName(TRAINING_ACCESS_SHEET_NAME);
      if (trainingSheet) ss.setActiveSheet(trainingSheet);
    }

    var rosterResult = buildRosterData(true);
    if (!rosterResult) return;
    var allRosters = rosterResult.allRosters;
    var today = rosterResult.today;
    var needsLookup = buildNeedsLookup_(allRosters);
    var sessions = parseScheduledSheet_(ss);
    if (!sessions || sessions.length === 0) return;

    var globalAssigned = {};

    for (var s = 0; s < sessions.length; s++) {
      var session = sessions[s];
      var configName = resolveTrainingName_(session.type);
      session.configName = configName;

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

      var kept = [], removed = [], placeholders = [];
      var seenInSession = {};

      for (var e = 0; e < session.enrollees.length; e++) {
        var name = session.enrollees[e];
        var nameLower = name.toLowerCase().trim();
        if (nameLower === "tbd" || nameLower === "new hires") { placeholders.push(name); continue; }
        if (seenInSession[nameLower]) continue;
        seenInSession[nameLower] = true;
        var info = needsMap[nameLower];
        if (!info) info = fuzzyMatchNeeds_(nameLower, needsMap);
        if (info) { kept.push(name); assignedMap[nameLower] = true; }
        else { kept.push(name); } // Keep everyone — sync handles removal
      }

      session.finalEnrollees = kept.slice();
      session.keptEnrollees = kept.slice();
      session.removedEnrollees = [];
      session.backfilledEnrollees = [];
      session.placeholders = placeholders;
    }

    var overviewResult = buildOverviewFromSyncedSessions_(sessions, allRosters, ss);
    writeScheduledOverviewSheet_(overviewResult, ss, today);
  } catch (err) {
    Logger.log("rebuildScheduledOverview_ error: " + err.toString());
  }
}

/**
 * addSessionToScheduledSheet_ — adds a brand new session row
 * to the Scheduled sheet. Used by createClass when creating
 * a class that doesn't yet exist on the Scheduled sheet.
 */
function addSessionToScheduledSheet_(ss, trainingType, classDate, classTime, classLocation, enrolleeNames) {
  var sheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);

  // If no Scheduled sheet exists, create one
  if (!sheet) {
    sheet = ss.insertSheet(SCHEDULED_SHEET_NAME);
    sheet.getRange(1, 1, 1, 5).setValues([["a. Upcoming Training", "", "", "", ""]]);
    sheet.getRange(2, 1, 1, 5).setValues([["Type", "Dates", "Time", "Location", "Enrollment"]]);
    sheet.getRange(1, 1, 1, 5).merge();
    sheet.getRange(1, 1).setFontSize(13).setFontWeight("bold").setFontColor("#FFFFFF").setBackground("#1F3864");
    sheet.getRange(2, 1, 1, 5).setFontWeight("bold").setBackground("#F2F2F2");
  }

  // Check if this session already exists
  var dateDisplay = formatClassDate(classDate);
  var data = sheet.getDataRange().getValues();
  var lastType = "";

  for (var r = 0; r < data.length; r++) {
    var colA = data[r][0] ? data[r][0].toString().trim() : "";
    var colB_raw = data[r][1];
    var colB = colB_raw ? colB_raw.toString().trim() : "";
    if (colA === "Type" || colA === "a. Upcoming Training") continue;
    var sessionType = colA || lastType;
    if (colA) lastType = colA;
    if (sessionType.toLowerCase().trim() !== trainingType.toLowerCase().trim()) continue;

    var rowDate = "";
    if (colB_raw instanceof Date && !isNaN(colB_raw.getTime())) rowDate = formatClassDate(colB_raw);
    else if (colB) rowDate = colB;

    if (rowDate === dateDisplay) {
      // Session already exists — update enrollment
      var enrollStr = enrolleeNames.join(", ");
      if (!enrollStr) enrollStr = "TBD";
      sheet.getRange(r + 1, 5).setValue(enrollStr);
      if (classTime) sheet.getRange(r + 1, 3).setValue(classTime);
      if (classLocation) sheet.getRange(r + 1, 4).setValue(classLocation);
      return;
    }
  }

  // Add new row at the end (before any footer rows)
  var insertRow = sheet.getLastRow() + 1;
  var enrollStr = enrolleeNames.length > 0 ? enrolleeNames.join(", ") : "TBD";
  sheet.getRange(insertRow, 1, 1, 5).setValues([
    [trainingType, classDate, classTime || "", classLocation || "", enrollStr]
  ]);
}

function cleanClassTabsForRemovedEnrollees_(ss, sessions) {
  var cleaned = 0;
  var prefixes = getClassRosterPrefixes();

  for (var s = 0; s < sessions.length; s++) {
    var session = sessions[s];
    var removed = session.removedEnrollees || [];
    if (removed.length === 0) continue;

    var configName = session.configName;
    if (!configName) continue;

    // Find the class roster tab for this session
    var tabName = "";

    // Try building from configName + dateDisplay
    if (session.dateDisplay) {
      var tryDate = parseClassDate(session.dateDisplay);
      if (tryDate) {
        tabName = buildTabName(configName, tryDate);
      } else {
        // Fallback: try configName + " " + dateDisplay directly
        tabName = configName + " " + session.dateDisplay;
      }
    }

    // Also try session.type + dateDisplay (some tabs use the scheduled name)
    var altTabName = "";
    if (session.type && session.dateDisplay) {
      var tryDate2 = parseClassDate(session.dateDisplay);
      if (tryDate2) {
        altTabName = buildTabName(session.type, tryDate2);
      }
    }

    var classTab = ss.getSheetByName(tabName);
    if (!classTab && altTabName) classTab = ss.getSheetByName(altTabName);

    // Broader search: scan all sheets for a matching prefix + date
    if (!classTab) {
      var sheets = ss.getSheets();
      for (var sh = 0; sh < sheets.length; sh++) {
        var shName = sheets[sh].getName();
        // Check if tab name starts with any matching prefix and contains the date
        if (session.dateDisplay && shName.indexOf(session.dateDisplay) > -1) {
          for (var p = 0; p < prefixes.length; p++) {
            if (shName.indexOf(prefixes[p] + " ") === 0 &&
                prefixes[p].toLowerCase() === configName.toLowerCase()) {
              classTab = sheets[sh];
              break;
            }
          }
        }
        if (classTab) break;
      }
    }

    if (!classTab) continue;

    // Remove each person from the class tab
    for (var r = 0; r < removed.length; r++) {
      removePersonFromClassTab_(classTab, removed[r]);
      logRemoval_(ss, removed[r], configName, classTab.getName(),
                  "Auto-removed: already current (via sync)", classTab.getName());
      cleaned++;
    }
  }

  return cleaned;
}


// ************************************************************
//   13. REFRESH ALL (from V42)
// ************************************************************

function refreshAll() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ui.alert(
    "This will:\n\n" +
    "  1. Clean garbled dates on the Training sheet\n" +
    "  2. Rebuild Training Rosters tab\n" +
    "  3. Archive past sessions from Scheduled sheet\n" +
    "  4. Sync Scheduled sheet enrollments\n" +
    "  5. Rebuild Scheduled Overview\n" +
    "  6. Reorder class roster tabs\n\n" +
    "Nothing else will change until you run this again."
  );

  // Step 1+2: Clean and rebuild rosters
  generateRostersSilent();

  // Step 3+4+5: Sync scheduled if the sheet exists
  var schedSheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
  var archived = 0;
  if (schedSheet) {
    try {
      var rosterResult = buildRosterData(true);
      if (rosterResult) {
        var allRosters = rosterResult.allRosters;
        var today = rosterResult.today;
        var needsLookup = buildNeedsLookup_(allRosters);
        var sessions = parseScheduledSheet_(ss);

        if (sessions && sessions.length > 0) {
          var globalAssigned = {};

          // Filter out past sessions (archive them)
          var futureSessions = [];
          for (var s = 0; s < sessions.length; s++) {
            var session = sessions[s];
            if (session.sortDate && session.sortDate < today) {
              archived++;
              continue; // Skip past sessions — they're archived
            }
            futureSessions.push(session);
          }
          sessions = futureSessions;

          for (var s = 0; s < sessions.length; s++) {
            var session = sessions[s];
            var configName = resolveTrainingName_(session.type);
            session.configName = configName;

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

            var kept = [], removed = [], placeholders = [];
            var seenInSession = {};

            for (var e = 0; e < session.enrollees.length; e++) {
              var name = session.enrollees[e];
              var nameLower = name.toLowerCase().trim();
              if (nameLower === "tbd" || nameLower === "new hires") { placeholders.push(name); continue; }
              if (seenInSession[nameLower]) continue;
              seenInSession[nameLower] = true;
              var info = needsMap[nameLower];
              if (!info) info = fuzzyMatchNeeds_(nameLower, needsMap);
              if (info) { kept.push(name); assignedMap[nameLower] = true; }
              else { removed.push(name); }
            }

            session.finalEnrollees = kept.slice();
            session.removedEnrollees = removed;
            session.backfilledEnrollees = [];
            session.keptEnrollees = kept;
            session.placeholders = placeholders;
          }

          rewriteScheduledSheet_(ss, sessions);
          cleanClassTabsForRemovedEnrollees_(ss, sessions);
          var overviewResult = buildOverviewFromSyncedSessions_(sessions, allRosters, ss);
          writeScheduledOverviewSheet_(overviewResult, ss, today);
        }
      }
    } catch (err) {
      Logger.log("refreshAll sync error: " + err.toString());
    }
  }

  // Step 6: Reorder tabs
  orderClassRosterTabs(ss);

  // Final roster rebuild after sync
  generateRostersSilent();

  var doneMsg = "Refresh complete!\n\n";
  if (archived > 0) doneMsg += "Archived: " + archived + " past session(s) removed\n";
  doneMsg += "Training Rosters, Scheduled sheet, Overview, and class tabs are all up to date.";
  ui.alert(doneMsg);
}


// ************************************************************
//   13. REMOVAL & MOVE
//   removeFromClassRoster = V42 version (with reassignment)
// ************************************************************

var REMOVAL_REASONS = [
  "Promoted \u2014 no longer required",
  "Left organization",
  "Transferred \u2014 different program",
  "Exempt \u2014 management decision",
  "Scheduling conflict \u2014 reschedule later",
  "Completed elsewhere",
  "Other"
];

function removeFromClassRoster() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var sheetName = sheet.getName();
  var row = ss.getActiveCell().getRow();

  var name = "", matchedTraining = "", sourceTab = "";

  if (sheetName === OVERVIEW_SHEET_NAME) {
    var rowData = sheet.getRange(row, 1, 1, 6).getValues()[0];
    var meta = rowData[5] ? rowData[5].toString().trim() : "";

    if (meta.indexOf("ENROLLEE:") !== 0) {
      ui.alert("Select a person's row in the Overview (one that has a name in the Person column), then run this again.");
      return;
    }

    name = rowData[1] ? rowData[1].toString().trim() : "";
    if (!name) { ui.alert("No name found on this row."); return; }

    var allData = sheet.getDataRange().getValues();
    var sessionType = "", sessionDate = "";
    for (var r = row - 1; r >= 0; r--) {
      var cellMeta = allData[r][5] ? allData[r][5].toString().trim() : "";
      if (cellMeta.indexOf("SESSION:") === 0) {
        var headerText = allData[r][0] ? allData[r][0].toString().trim() : "";
        var parts = headerText.split("  \u2014  ");
        sessionType = parts[0] ? parts[0].trim() : "";
        sessionDate = parts[1] ? parts[1].trim() : "";
        break;
      }
    }

    if (!sessionType) { ui.alert("Could not determine the training type for this row."); return; }
    matchedTraining = sessionType;
    sourceTab = sessionType + (sessionDate ? " " + sessionDate : "");

  } else {
    var prefixes = getClassRosterPrefixes();
    for (var p = 0; p < prefixes.length; p++) {
      if (sheetName.indexOf(prefixes[p] + " ") === 0) {
        matchedTraining = prefixes[p];
        break;
      }
    }

    if (!matchedTraining) {
      ui.alert("Not a class roster or Overview tab.\n\nNavigate to a class roster tab or the Scheduled Overview, click on a person's row, then run this.");
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

  if (isOpenSeatMarker(name)) {
    ui.alert("That row doesn't have a person on it. Select a row with a name.");
    return;
  }

  // ---- REASON ----
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
    reason = choice.getResponseText().trim();
  } else {
    reason = REMOVAL_REASONS[reasonIdx];
  }

  if (reason === "Other") {
    var detail = ui.prompt("Reason Details", "Enter the reason for removing " + name + ":", ui.ButtonSet.OK_CANCEL);
    if (detail.getSelectedButton() !== ui.Button.OK) return;
    reason = "Other: " + detail.getResponseText().trim();
  }

  // ---- SCOPE ----
  var permanent = false;
  var permReasons = ["Promoted", "Left organization", "Transferred", "Exempt"];
  for (var pr = 0; pr < permReasons.length; pr++) {
    if (reason.indexOf(permReasons[pr]) > -1) { permanent = true; break; }
  }

  var scope = sourceTab;
  if (permanent) {
    var scopeChoice = ui.alert(
      "Permanent Exemption?",
      name + " \u2014 " + reason + "\n\nRemove from ALL future " + matchedTraining + " rosters?\n\n" +
      "YES = Exempt from all future " + matchedTraining + " classes\n" +
      "NO = Remove from this class only",
      ui.ButtonSet.YES_NO
    );
    if (scopeChoice === ui.Button.YES) scope = matchedTraining;
  }

  // ---- LOG ----
  logRemoval_(ss, name, matchedTraining, sourceTab, reason, scope);

  // ---- UPDATE SOURCE TAB ----
  if (sheetName === OVERVIEW_SHEET_NAME) {
    var RED = "#C00000", LRED = "#FFC7CE";
    sheet.getRange(row, 3).setValue("REMOVED");
    sheet.getRange(row, 3).setBackground(LRED).setFontColor(RED).setFontWeight("bold");
    sheet.getRange(row, 4).setValue(reason).setFontColor("#999999");

    var classTab = ss.getSheetByName(sourceTab);
    if (classTab) removePersonFromClassTab_(classTab, name);
    removeFromScheduledSheet_(ss, matchedTraining, sourceTab, name);

  } else {
    var NAVY = "#1F3864", WHITE = "#FFFFFF", ALT_BLUE = "#EBF0F7";
    var rowData = sheet.getRange(row, 1, 1, 7).getValues()[0];
    var idx = rowData[0];
    var rowBg = ((idx - 1) % 2 === 0) ? WHITE : ALT_BLUE;
    sheet.getRange(row, 1, 1, 7).setValues([[idx, OPEN_SEAT_MARKER, "", "", "", false, ""]]);
    sheet.getRange(row, 1, 1, 7).setFontColor("#AAAAAA").setBackground(rowBg);
    sheet.getRange(row, 6).insertCheckboxes();

    var capData = sheet.getRange(5, 1, 1, 2).getValues()[0];
    var capStr = capData[1] ? capData[1].toString() : "";
    var capMatch = capStr.match(/(\d+)\s*\/\s*(\d+)/);
    if (capMatch) {
      var filled = parseInt(capMatch[1]) - 1;
      var total  = parseInt(capMatch[2]);
      sheet.getRange(5, 2).setValue(filled + " / " + total);
    }

    removeFromScheduledSheet_(ss, matchedTraining, sheetName, name);
  }

  var scopeMsg = (scope === matchedTraining) ? "All future " + matchedTraining + " classes" : "This class only";

  generateRostersSilent();
  rebuildScheduledOverview_(ss);
  ui.alert("Removed " + name + "\n\nTraining: " + matchedTraining + "\nReason: " + reason + "\nScope: " + scopeMsg + "\n\nLogged to Removal Log.\nTraining Rosters & Scheduled Overview updated.");
}

function moveToClass() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var sheetName = sheet.getName();
  var row = ss.getActiveCell().getRow();

  var name = "", matchedTraining = "", sourceTab = "";

  // ---- DETECT: class roster tab or Overview ----

  if (sheetName === OVERVIEW_SHEET_NAME) {
    var rowData = sheet.getRange(row, 1, 1, 6).getValues()[0];
    var meta = rowData[5] ? rowData[5].toString().trim() : "";

    if (meta.indexOf("ENROLLEE:") !== 0) {
      ui.alert("Select a person's row in the Overview, then run this again.");
      return;
    }

    name = rowData[1] ? rowData[1].toString().trim() : "";
    if (!name) { ui.alert("No name found on this row."); return; }

    var allData = sheet.getDataRange().getValues();
    var sessionType = "", sessionDate = "";
    for (var r = row - 1; r >= 0; r--) {
      var cellMeta = allData[r][5] ? allData[r][5].toString().trim() : "";
      if (cellMeta.indexOf("SESSION:") === 0) {
        var headerText = allData[r][0] ? allData[r][0].toString().trim() : "";
        var parts = headerText.split("  \u2014  ");
        sessionType = parts[0] ? parts[0].trim() : "";
        sessionDate = parts[1] ? parts[1].trim() : "";
        break;
      }
    }

    if (!sessionType) { ui.alert("Could not determine the training type for this row."); return; }
    matchedTraining = sessionType;
    sourceTab = sessionType + (sessionDate ? " " + sessionDate : "");

  } else {
    var prefixes = getClassRosterPrefixes();
    for (var p = 0; p < prefixes.length; p++) {
      if (sheetName.indexOf(prefixes[p] + " ") === 0) {
        matchedTraining = prefixes[p];
        break;
      }
    }

    if (!matchedTraining) {
      ui.alert("Not a class roster or Overview tab.\n\nNavigate to a class roster tab or the Scheduled Overview, click on a person's row, then run this.");
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

  if (isOpenSeatMarker(name)) {
    ui.alert("That row doesn't have a person on it. Select a row with a name.");
    return;
  }

  // ---- FIND ALL CLASSES WITH OPEN SEATS ----
  var allClasses = findAllClassesWithOpenSeats_(ss, matchedTraining, sourceTab);

  if (allClasses.length === 0) {
    ui.alert(
      "No other " + matchedTraining + " classes with open seats found.\n\n" +
      "Use Quick Build or Build from Overview to create more classes first."
    );
    return;
  }

  var msg = "Move " + name + " from " + sourceTab + " to:\n\n";
  for (var i = 0; i < allClasses.length; i++) {
    var c = allClasses[i];
    msg += (i + 1) + ".  " + c.tabName + "  (" + c.openSeats + " open seat" + (c.openSeats === 1 ? "" : "s") + ")\n";
  }
  msg += "\nEnter a number:";

  var choice = ui.prompt("Move to Another Class", msg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;

  var idx = parseInt(choice.getResponseText().trim()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= allClasses.length) {
    ui.alert("Invalid selection.");
    return;
  }

  var targetClass = allClasses[idx];

  // ---- REMOVE FROM SOURCE ----
  if (sheetName === OVERVIEW_SHEET_NAME) {
    var BLUE = "#1565C0";
    sheet.getRange(row, 3).setValue("MOVED");
    sheet.getRange(row, 3).setBackground("#BDD7EE").setFontColor(BLUE).setFontWeight("bold");
    sheet.getRange(row, 4).setValue("Moved to " + targetClass.tabName).setFontColor("#666666");

    var classTab = ss.getSheetByName(sourceTab);
    if (classTab) removePersonFromClassTab_(classTab, name);
    removeFromScheduledSheet_(ss, matchedTraining, sourceTab, name);

  } else {
    var WHITE = "#FFFFFF", ALT_BLUE = "#EBF0F7";
    var rowData = sheet.getRange(row, 1, 1, 7).getValues()[0];
    var rowIdx = rowData[0];
    var rowBg = ((rowIdx - 1) % 2 === 0) ? WHITE : ALT_BLUE;
    sheet.getRange(row, 1, 1, 7).setValues([[rowIdx, OPEN_SEAT_MARKER, "", "", "", false, ""]]);
    sheet.getRange(row, 1, 1, 7).setFontColor("#AAAAAA").setBackground(rowBg);
    sheet.getRange(row, 6).insertCheckboxes();

    var capData = sheet.getRange(5, 1, 1, 2).getValues()[0];
    var capStr = capData[1] ? capData[1].toString() : "";
    var capMatch = capStr.match(/(\d+)\s*\/\s*(\d+)/);
    if (capMatch) {
      sheet.getRange(5, 2).setValue((parseInt(capMatch[1]) - 1) + " / " + capMatch[2]);
    }

    removeFromScheduledSheet_(ss, matchedTraining, sheetName, name);
  }

  // ---- ADD TO TARGET ----
  var added = addPersonToClassTab_(ss, targetClass.tabName, name);
  if (added) {
    addToScheduledSheet_(ss, matchedTraining, targetClass.tabName, name);
  }

  generateRostersSilent();
  rebuildScheduledOverview_(ss);
  ui.alert(
    "Moved " + name + "!\n\n" +
    "From: " + sourceTab + "\n" +
    "To: " + targetClass.tabName + "\n\n" +
    "Training Rosters & Scheduled Overview updated."
  );
}

function removePersonFromClassTab_(classTab, name) {
  var data = classTab.getDataRange().getValues();
  var WHITE = "#FFFFFF", ALT_BLUE = "#EBF0F7";
  for (var r = 7; r < data.length; r++) {
    var cellName = data[r][1] ? data[r][1].toString().trim() : "";
    if (cellName.toLowerCase() === name.toLowerCase()) {
      var sheetRow = r + 1;
      var idx = data[r][0];
      var rowBg = ((idx - 1) % 2 === 0) ? WHITE : ALT_BLUE;
      classTab.getRange(sheetRow, 1, 1, 7).setValues([[idx, OPEN_SEAT_MARKER, "", "", "", false, ""]]);
      classTab.getRange(sheetRow, 1, 1, 7).setFontColor("#AAAAAA").setBackground(rowBg);
      classTab.getRange(sheetRow, 6).insertCheckboxes();

      var capData = classTab.getRange(5, 1, 1, 2).getValues()[0];
      var capStr = capData[1] ? capData[1].toString() : "";
      var capMatch = capStr.match(/(\d+)\s*\/\s*(\d+)/);
      if (capMatch) {
        var filled = parseInt(capMatch[1]) - 1;
        var total  = parseInt(capMatch[2]);
        classTab.getRange(5, 2).setValue(filled + " / " + total);
      }
      break;
    }
  }
}

function removeFromScheduledSheet_(ss, trainingType, classTabName, personName) {
  var sheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
  if (!sheet) return;

  // Resolve training type
  var resolvedType = resolveTrainingName_(trainingType) || trainingType;

  // Extract date from tab name — try resolved, sanitized, and original prefix
  var sanitizedType = resolvedType.replace(/[:\\\/?*\[\]]/g, "");
  var datePart = "";
  if (classTabName.indexOf(resolvedType + " ") === 0) {
    datePart = classTabName.substring(resolvedType.length).trim();
  } else if (classTabName.indexOf(sanitizedType + " ") === 0) {
    datePart = classTabName.substring(sanitizedType.length).trim();
  } else if (classTabName.indexOf(trainingType + " ") === 0) {
    datePart = classTabName.substring(trainingType.length).trim();
  } else {
    var spIdx = classTabName.indexOf(" ");
    if (spIdx > -1) datePart = classTabName.substring(spIdx + 1).trim();
  }

  var data = sheet.getDataRange().getValues();
  var lastType = "";

  for (var r = 0; r < data.length; r++) {
    var colA     = data[r][0] ? data[r][0].toString().trim() : "";
    var colB_raw = data[r][1];
    var colB     = colB_raw ? colB_raw.toString().trim() : "";
    var colE     = data[r][4] ? data[r][4].toString().trim() : "";

    if (colA === "Type" || colA === "a. Upcoming Training") continue;

    var sessionType = colA || lastType;
    if (colA) lastType = colA;

    if (!colE) continue;
    var resolvedSession = resolveTrainingName_(sessionType) || sessionType;
    if (resolvedSession.toLowerCase() !== resolvedType.toLowerCase()) continue;

    var dateDisplay = "";
    if (colB_raw instanceof Date && !isNaN(colB_raw.getTime())) {
      dateDisplay = formatClassDate(colB_raw);
    } else if (colB) {
      dateDisplay = colB;
    }

    if (dateDisplay !== datePart) continue;

    var enrollees = colE.split(",").map(function(n) { return n.trim(); });
    var nameLower = personName.toLowerCase().trim();
    var filtered  = enrollees.filter(function(n) {
      return n.toLowerCase().trim() !== nameLower;
    });

    if (filtered.length !== enrollees.length) {
      sheet.getRange(r + 1, 5).setValue(filtered.length > 0 ? filtered.join(", ") : "TBD");
      Logger.log("removeFromScheduledSheet_: Removed " + personName +
                 " from " + sessionType + " on " + dateDisplay);
    }
    return;
  }
}

function addPersonToClassTab_(ss, tabName, personName) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) return false;

  var data = sheet.getDataRange().getValues();
  var WHITE = "#FFFFFF", ALT_BLUE = "#EBF0F7";
  var NAVY = "#1F3864";

  // First try to fill an open seat
  for (var r = 7; r < data.length; r++) {
    var cellName = data[r][1] ? data[r][1].toString().trim() : "";
    if (isOpenSeatMarker(cellName)) {
      var sheetRow = r + 1;
      var idx = data[r][0];
      var rowBg = ((idx - 1) % 2 === 0) ? WHITE : ALT_BLUE;

      sheet.getRange(sheetRow, 2).setValue(personName).setFontColor("#000000");
      sheet.getRange(sheetRow, 3).setValue("Reassigned").setFontColor("#000000");
      sheet.getRange(sheetRow, 5).setValue("REASSIGNED")
        .setBackground("#1565C0").setFontColor("#FFFFFF").setFontWeight("bold");
      sheet.getRange(sheetRow, 6).setValue(false);
      sheet.getRange(sheetRow, 1, 1, 7).setBackground(rowBg);
      sheet.getRange(sheetRow, 1).setFontColor("#000000");
      sheet.getRange(sheetRow, 4).setFontColor("#000000");
      sheet.getRange(sheetRow, 7).setFontColor("#000000");

      var capData = sheet.getRange(5, 1, 1, 2).getValues()[0];
      var capStr = capData[1] ? capData[1].toString() : "";
      var capMatch = capStr.match(/(\d+)\s*\/\s*(\d+)/);
      if (capMatch) {
        sheet.getRange(5, 2).setValue((parseInt(capMatch[1]) + 1) + " / " + capMatch[2]);
      }
      return true;
    }
  }

  // No open seat — append a new row at the end
  var lastDataRow = data.length;
  var nextNum = 1;
  for (var r = 7; r < data.length; r++) {
    var numVal = data[r][0];
    if (typeof numVal === "number" && numVal >= nextNum) {
      nextNum = numVal + 1;
    }
  }

  var insertRow = lastDataRow + 1;
  var rowBg = ((nextNum - 1) % 2 === 0) ? WHITE : ALT_BLUE;

  sheet.getRange(insertRow, 1, 1, 7).setValues([[nextNum, personName, "Added", "", "NEEDS TRAINING", false, ""]]);
  sheet.getRange(insertRow, 1, 1, 7).setFontFamily("Arial").setFontSize(10).setBackground(rowBg);
  sheet.getRange(insertRow, 5).setFontColor("#FFFFFF").setBackground(NAVY).setFontWeight("bold");
  sheet.getRange(insertRow, 6).insertCheckboxes();

  // Update capacity count
  var capData = sheet.getRange(5, 1, 1, 2).getValues()[0];
  var capStr = capData[1] ? capData[1].toString() : "";
  var capMatch = capStr.match(/(\d+)\s*\/\s*(\d+)/);
  if (capMatch) {
    sheet.getRange(5, 2).setValue((parseInt(capMatch[1]) + 1) + " / " + capMatch[2]);
  }
  return true;
}

function addToScheduledSheet_(ss, trainingType, classTabName, personName) {
  var sheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
  if (!sheet) return;

  // Resolve the passed training type to its config name
  var resolvedType = resolveTrainingName_(trainingType) || trainingType;

  // Extract date from the tab name — try resolved, sanitized, and original prefix
  var sanitizedType = resolvedType.replace(/[:\\\/?*\[\]]/g, "");
  var datePart = "";
  if (classTabName.indexOf(resolvedType + " ") === 0) {
    datePart = classTabName.substring(resolvedType.length).trim();
  } else if (classTabName.indexOf(sanitizedType + " ") === 0) {
    datePart = classTabName.substring(sanitizedType.length).trim();
  } else if (classTabName.indexOf(trainingType + " ") === 0) {
    datePart = classTabName.substring(trainingType.length).trim();
  } else {
    var spIdx = classTabName.indexOf(" ");
    if (spIdx > -1) datePart = classTabName.substring(spIdx + 1).trim();
  }
  // datePart might also have slashes stripped — restore for comparison
  // e.g. "492026" needs to become "4/9/2026"
  if (datePart && !datePart.match(/\//)) {
    // Try to parse it as a date directly
    var tryDate = parseClassDate(datePart);
    if (tryDate) datePart = formatClassDate(tryDate);
  }

  var data = sheet.getDataRange().getValues();
  var lastType = "";

  for (var r = 0; r < data.length; r++) {
    var colA     = data[r][0] ? data[r][0].toString().trim() : "";
    var colB_raw = data[r][1];
    var colB     = colB_raw ? colB_raw.toString().trim() : "";
    var colE     = data[r][4] ? data[r][4].toString().trim() : "";

    if (colA === "Type" || colA === "a. Upcoming Training") continue;
    var sessionType = colA || lastType;
    if (colA) lastType = colA;

    // Resolve the scheduled sheet type to config name, then compare
    var resolvedSession = resolveTrainingName_(sessionType) || sessionType;
    if (resolvedSession.toLowerCase() !== resolvedType.toLowerCase()) continue;

    var dateDisplay = "";
    if (colB_raw instanceof Date && !isNaN(colB_raw.getTime())) dateDisplay = formatClassDate(colB_raw);
    else if (colB) dateDisplay = colB;
    if (dateDisplay !== datePart) continue;

    if (!colE || colE.toLowerCase() === "tbd") {
      sheet.getRange(r + 1, 5).setValue(personName);
    } else {
      sheet.getRange(r + 1, 5).setValue(colE + ", " + personName);
    }
    return;
  }
}

function findAllClassesWithOpenSeats_(ss, trainingName, skipTabName) {
  var all = findAllFutureClasses_(ss, trainingName, skipTabName);
  return all.filter(function(c) { return c.openSeats > 0; });
}

/**
 * findAllFutureClasses_ — returns ALL future class roster tabs
 * for the given training, including full ones. Sorted by date.
 */
function findAllFutureClasses_(ss, trainingName, skipTabName) {
  var sheets = ss.getSheets();
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var candidates = [];

  // Resolve training name to config name (e.g. "CPR" → "CPR/FA")
  var resolved = resolveTrainingName_(trainingName) || trainingName;

  // Build the tab prefix the same way buildTabName does (strips special chars)
  var tabPrefix = resolved.replace(/[:\\\/?*\[\]]/g, "");
  var defaultCap = getCapacityForTraining_(resolved);

  for (var s = 0; s < sheets.length; s++) {
    var tabName = sheets[s].getName();
    if (tabName === skipTabName) continue;

    // Match using the sanitized prefix (same as buildTabName produces)
    if (tabName.indexOf(tabPrefix + " ") !== 0 && tabName.indexOf(resolved + " ") !== 0) continue;

    // Extract date part after the prefix
    var datePart = "";
    if (tabName.indexOf(resolved + " ") === 0) {
      datePart = tabName.substring(resolved.length + 1).trim();
    } else {
      datePart = tabName.substring(tabPrefix.length + 1).trim();
    }

    var classDate = parseClassDate(datePart);
    if (!classDate || classDate < today) continue;

    // Try to read capacity from row 5 (format: "X / Y")
    var filled = 0, total = defaultCap;
    try {
      var capData = sheets[s].getRange(5, 1, 1, 2).getValues()[0];
      var capStr = capData[1] ? capData[1].toString() : "";
      var capMatch = capStr.match(/(\d+)\s*\/\s*(\d+)/);
      if (capMatch) {
        filled = parseInt(capMatch[1]);
        total = parseInt(capMatch[2]);
      } else {
        // Count people on the tab instead (rows 8+ with names in col B)
        var data = sheets[s].getDataRange().getValues();
        for (var r = 7; r < data.length; r++) {
          var cellName = data[r][1] ? data[r][1].toString().trim() : "";
          if (cellName && !isOpenSeatMarker(cellName) && cellName.toLowerCase() !== "tbd") {
            filled++;
          }
        }
      }
    } catch (e) {
      // If we can't read capacity, still include the tab
    }

    var openSeats = total - filled;

    candidates.push({
      tabName: tabName,
      openSeats: openSeats > 0 ? openSeats : 0,
      filled: filled,
      capacity: total,
      classDate: classDate,
      isFull: openSeats <= 0
    });
  }

  candidates.sort(function(a, b) { return a.classDate - b.classDate; });
  return candidates;
}

function findNextClassWithOpenSeats_(ss, trainingName, skipTabName) {
  var sheets = ss.getSheets();
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var candidates = [];

  for (var s = 0; s < sheets.length; s++) {
    var tabName = sheets[s].getName();
    if (tabName === skipTabName) continue;
    if (tabName.indexOf(trainingName + " ") !== 0) continue;

    var datePart = tabName.substring(trainingName.length + 1).trim();
    var classDate = parseClassDate(datePart);
    if (!classDate || classDate < today) continue;

    var capData = sheets[s].getRange(5, 1, 1, 2).getValues()[0];
    var capStr = capData[1] ? capData[1].toString() : "";
    var capMatch = capStr.match(/(\d+)\s*\/\s*(\d+)/);
    if (!capMatch) continue;

    var filled = parseInt(capMatch[1]);
    var total = parseInt(capMatch[2]);
    if (total - filled > 0) {
      candidates.push({ tabName: tabName, openSeats: total - filled, classDate: classDate, sheet: sheets[s] });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort(function(a, b) { return a.classDate - b.classDate; });
  return candidates[0];
}


// ************************************************************
//   14. TRAINING MEMO (V42 copyable dialog version)
// ************************************************************

function generateTrainingMemo() {
  var ui          = SpreadsheetApp.getUi();
  var ss          = SpreadsheetApp.getActiveSpreadsheet();
  var activeSheet = ss.getActiveSheet();
  var isOnOverview = (activeSheet.getName() === OVERVIEW_SHEET_NAME);
  var sessions    = [];

  // ============================================================
  // PATH A: From Scheduled Overview
  // ============================================================
  if (isOnOverview) {
    var overviewSessions = readOverviewSessionsForMemo_();
    if (!overviewSessions || overviewSessions.length === 0) {
      ui.alert(
        "No sessions with attendees found on the Scheduled Overview.\n\n" +
        "Run Sync Scheduled Trainings first, then navigate back to\n" +
        "the Scheduled Overview tab and try again."
      );
      return;
    }

    var msg = "Generate memo for which session?\n\n";
    msg += "0.  ALL (" + overviewSessions.length + " sessions)\n";
    for (var i = 0; i < overviewSessions.length; i++) {
      var s = overviewSessions[i];
      msg += (i + 1) + ".  " + s.type +
             (s.dateDisplay ? " \u2014 " + s.dateDisplay : "") +
             " (" + s.attendees.length + " enrolled)\n";
    }
    msg += "\nEnter a number:";

    var choice = ui.prompt("Training Memo (from Overview)", msg, ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() !== ui.Button.OK) return;

    var input = choice.getResponseText().trim();
    if (input === "0") {
      sessions = overviewSessions.slice();
    } else {
      var idx = parseInt(input) - 1;
      if (isNaN(idx) || idx < 0 || idx >= overviewSessions.length) {
        ui.alert("Invalid selection.");
        return;
      }
      sessions = [overviewSessions[idx]];
    }

  // ============================================================
  // PATH B: From class roster tabs
  // ============================================================
  } else {
    var prefixes   = getClassRosterPrefixes();
    var sheets     = ss.getSheets();
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
      ui.alert(
        "No class roster tabs found.\n\n" +
        "Run Quick Build to create class roster tabs,\n" +
        "OR navigate to the Scheduled Overview tab first."
      );
      return;
    }

    var msg = "Generate memo for which class?\n\n";
    msg += "0.  ALL (" + rosterTabs.length + " classes)\n";
    for (var i = 0; i < rosterTabs.length; i++) {
      msg += (i + 1) + ".  " + rosterTabs[i].name + "\n";
    }
    msg += "\nEnter a number:";

    var choice = ui.prompt("Training Memo", msg, ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() !== ui.Button.OK) return;

    var input        = choice.getResponseText().trim();
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

    for (var t = 0; t < selectedTabs.length; t++) {
      var tab  = selectedTabs[t];
      var data = tab.sheet.getDataRange().getValues();

      var classDate     = (data[1] && data[1][1]) ? data[1][1].toString().trim() : "";
      var classTime     = (data[2] && data[2][1]) ? data[2][1].toString().trim() : "";
      var classLocation = (data[2] && data[2][3]) ? data[2][3].toString().trim() : "";

      var attendees = [];
      for (var r = 7; r < data.length; r++) {
        var nameVal = data[r][1] ? data[r][1].toString().trim() : "";
        if (isOpenSeatMarker(nameVal)) continue;
        attendees.push(nameVal);
      }

      if (attendees.length === 0) continue;

      sessions.push({
        type: tab.training,
        dateDisplay: classDate,
        time: classTime,
        location: classLocation,
        attendees: attendees
      });
    }
  }

  if (sessions.length === 0) {
    ui.alert("No sessions with attendees found.");
    return;
  }

  // ============================================================
  // BUILD THE PARAGRAPH MEMO TEXT
  // ============================================================
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM d, yyyy");
  var memoBlocks = [];

  for (var m = 0; m < sessions.length; m++) {
    var sess = sessions[m];

    // Build the detail line: date, time, location
    var details = [];
    if (sess.dateDisplay) details.push(sess.dateDisplay);
    if (sess.time)        details.push(sess.time);
    if (sess.location)    details.push(sess.location);
    var detailStr = details.length > 0 ? details.join(", ") : "TBD";

    // Build the name list as a natural sentence
    var nameList = "";
    if (sess.attendees.length === 1) {
      nameList = sess.attendees[0];
    } else if (sess.attendees.length === 2) {
      nameList = sess.attendees[0] + " and " + sess.attendees[1];
    } else {
      nameList = sess.attendees.slice(0, -1).join(", ") +
                 ", and " + sess.attendees[sess.attendees.length - 1];
    }

    var para = sess.type + " training is scheduled for " + detailStr + ". " +
               "The following " + sess.attendees.length + " staff " +
               (sess.attendees.length === 1 ? "member is" : "members are") +
               " enrolled and expected to attend: " + nameList + ". " +
               "Attendance is mandatory. If there are any scheduling conflicts, " +
               "please contact HR as soon as possible so we can make arrangements.";

    memoBlocks.push(para);
  }

  var fullMemo = "Training Memo \u2014 " + today + "\n\n" + memoBlocks.join("\n\n");

  // ============================================================
  // SHOW IN COPYABLE DIALOG
  // ============================================================
  showCopyableDialog_(fullMemo, "Training Memo");
}

function showCopyableDialog_(text, title) {
  var escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  var html = '<!DOCTYPE html><html><head>'
    + '<style>'
    + 'body { font-family: Arial, sans-serif; margin: 0; padding: 16px; background: #FAFAFA; }'
    + 'textarea { width: 100%; height: 320px; font-family: Arial, sans-serif; font-size: 13px; '
    + 'line-height: 1.6; padding: 12px; border: 1px solid #CCC; border-radius: 4px; '
    + 'resize: vertical; background: #FFFFFF; color: #333; }'
    + '.btn { background: #1F3864; color: white; border: none; padding: 10px 24px; '
    + 'border-radius: 4px; font-size: 13px; cursor: pointer; margin-top: 10px; }'
    + '.btn:hover { background: #2E75B6; }'
    + '.copied { color: #2E7D32; font-size: 12px; margin-left: 12px; display: none; }'
    + '</style>'
    + '</head><body>'
    + '<textarea id="memo">' + escaped + '</textarea>'
    + '<div style="display:flex; align-items:center;">'
    + '<button class="btn" onclick="copyMemo()">Copy to Clipboard</button>'
    + '<span class="copied" id="msg">Copied!</span>'
    + '</div>'
    + '<script>'
    + 'function copyMemo(){'
    + '  var t=document.getElementById("memo");'
    + '  t.select();t.setSelectionRange(0,99999);'
    + '  document.execCommand("copy");'
    + '  var m=document.getElementById("msg");'
    + '  m.style.display="inline";'
    + '  setTimeout(function(){m.style.display="none";},2000);'
    + '}'
    + '</script>'
    + '</body></html>';

  var output = HtmlService.createHtmlOutput(html)
    .setWidth(580)
    .setHeight(460);
  SpreadsheetApp.getUi().showModalDialog(output, title || "Memo");
}

function readOverviewSessionsForMemo_() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(OVERVIEW_SHEET_NAME);
  if (!sheet) return null;

  var data           = sheet.getDataRange().getValues();
  var sessions       = [];
  var currentSession = null;

  for (var r = 0; r < data.length; r++) {
    var meta = data[r][5] ? data[r][5].toString().trim() : "";
    var colA = data[r][0] !== null && data[r][0] !== undefined
                 ? data[r][0].toString().trim() : "";
    var colB = data[r][1] ? data[r][1].toString().trim() : "";
    var colC = data[r][2] ? data[r][2].toString().trim() : "";

    // ---- Session header row ----
    if (meta.indexOf("SESSION:") === 0) {
      if (currentSession) sessions.push(currentSession);
      // Header format: "CPR/FA  —  4/15/2026"
      var dashIdx = colA.indexOf("  \u2014  ");
      if (dashIdx === -1) dashIdx = colA.indexOf("  \u2013  ");
      if (dashIdx === -1) dashIdx = colA.indexOf("  -  ");
      currentSession = {
        type        : dashIdx > -1 ? colA.substring(0, dashIdx).trim() : colA.trim(),
        dateDisplay : dashIdx > -1 ? colA.substring(dashIdx + 5).trim() : "",
        time        : "",
        location    : "",
        attendees   : []
      };
      continue;
    }

    if (!currentSession) continue;

    // ---- Time / Location row ----
    if (colA.indexOf("Time:") > -1 || colA.indexOf("Location:") > -1) {
      var segs = colA.split("   |   ");
      for (var sg = 0; sg < segs.length; sg++) {
        var seg = segs[sg].trim();
        if (seg.indexOf("Time:")     === 0) currentSession.time     = seg.substring(5).trim();
        if (seg.indexOf("Location:") === 0) currentSession.location = seg.substring(9).trim();
      }
      continue;
    }

    // ---- Enrollee row — skip REMOVED entries ----
    if (meta.indexOf("ENROLLEE:") === 0 && colB && colC.toUpperCase() !== "REMOVED") {
      currentSession.attendees.push(colB);
    }
  }

  if (currentSession) sessions.push(currentSession);

  // Only return sessions that have at least one enrolled person
  return sessions.filter(function(s) {
    return s.type && s.attendees.length > 0;
  });
}


// ************************************************************
//   15. LOGGING, EXEMPTIONS, REMOVAL LOG
// ************************************************************

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
    log.hideSheet();
  }

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "M/d/yyyy h:mm a");
  var user = Session.getActiveUser().getEmail() || "unknown";
  log.appendRow([now, name, trainingType, classTab, reason, scope, user]);
}

function loadExemptions_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = ss.getSheetByName(REMOVAL_LOG_SHEET);
  if (!log) return [];

  var data = log.getDataRange().getValues();
  var exemptions = [];
  for (var r = 1; r < data.length; r++) {
    var name     = data[r][1] ? data[r][1].toString().toLowerCase().trim() : "";
    var training = data[r][2] ? data[r][2].toString().toLowerCase().trim() : "";
    var scope    = data[r][5] ? data[r][5].toString().trim() : "";
    var reason   = data[r][4] ? data[r][4].toString().trim() : "";
    if (name) {
      exemptions.push({ name: name, training: training, scope: scope, reason: reason });
    }
  }
  return exemptions;
}

function isExempt_(exemptions, nameLower, trainKeyLower) {
  for (var i = 0; i < exemptions.length; i++) {
    var ex = exemptions[i];
    if (ex.name !== nameLower) continue;
    if (ex.scope.toLowerCase() === trainKeyLower) return true;
  }
  return false;
}

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

function clearExemption() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = ss.getSheetByName(REMOVAL_LOG_SHEET);
  if (!log) { ui.alert("No removal log found."); return; }

  var data = log.getDataRange().getValues();
  if (data.length <= 1) { ui.alert("No exemptions to clear."); return; }

  var permanentRows = [];
  var msg = "Active exemptions:\n\n";
  for (var r = 1; r < data.length; r++) {
    var name     = data[r][1] || "";
    var training = data[r][2] || "";
    var reason   = data[r][4] || "";
    var scope    = data[r][5] || "";
    if (scope.toLowerCase() === training.toLowerCase()) {
      permanentRows.push(r);
      msg += permanentRows.length + ".  " + name + " \u2014 " + training + " (" + reason + ")\n";
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

  var rowToDelete = permanentRows[idx] + 1;
  var removedName = data[permanentRows[idx]][1];
  log.deleteRow(rowToDelete);

  ui.alert("Exemption cleared for " + removedName + ".\n\nThey will appear in the priority pool again on the next roster refresh.\nUse EVC Tools > 5a. Refresh All to update rosters.");
}


// ============================================================
//
//   CLASS MANAGEMENT (merged from Classmanagement.gs)
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
  var matchedTraining = resolveTrainingName_(info.trainingType) || info.trainingType;
  var sourceTab = info.sourceTab;

  // ── FROM TRAINING ROSTERS: Add to class flow ──
  if (sourceTab === ROSTER_SHEET_NAME) {
    addToClassFromRoster_(ui, ss, name, matchedTraining);
    return;
  }

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
    ui.alert("Removed " + name + "\n\nNot found on Training sheet.\nUse EVC Tools > 5a. Refresh All to update rosters.");
    return;
  }

  // ── BRANCH B: Inactive employee ──
  if (!status.active) {
    executeRemoval_(ss, sheet, sheetName, row, name, matchedTraining, sourceTab, "Inactive employee");
    ui.alert("Removed " + name + " (inactive).\n\nUse EVC Tools > 5a. Refresh All to update rosters.");
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
    ui.alert("Removed " + name + "\n\nAlready current — completed " + status.dateOnFile + "\nUse EVC Tools > 5a. Refresh All to update rosters.");
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
      ui.alert("Done!\n\n" + name + ":\n  Date uploaded: " + status.recordsDate + "\n  Removed from " + sourceTab + "\n\nUse EVC Tools > 5a. Refresh All to update rosters.");
    } else if (pick === "2") {
      executeRemoval_(ss, sheet, sheetName, row, name, matchedTraining, sourceTab, "Removed without uploading pass");
      ui.alert("Removed " + name + "\n\nPass date NOT uploaded.\nUse EVC Tools > 5a. Refresh All to update rosters.");
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
               (target.isFull ? " (over capacity)" : "") + "\n\nUse EVC Tools > 5a. Refresh All to update rosters.");
    } else if (pick === allClasses.length + 1) {
      executeRemoval_(ss, sheet, sheetName, row, name, matchedTraining, sourceTab, "Removed — still needs " + matchedTraining);
      ui.alert("Removed " + name + "\n\nStill needs " + matchedTraining + " — will appear on Training Rosters.\nUse EVC Tools > 5a. Refresh All to update rosters.");
    }
  } else {
    if (pick === 1) {
      executeRemoval_(ss, sheet, sheetName, row, name, matchedTraining, sourceTab, "Removed — still needs " + matchedTraining + " (no other classes)");
      ui.alert("Removed " + name + "\n\nStill needs " + matchedTraining + " — will appear on Training Rosters.\nUse EVC Tools > 5a. Refresh All to update rosters.");
    }
  }
}


/**
 * addToClassFromRoster_ — when Smart Remove/Move is run from
 * the Training Rosters tab, offers to add the selected person
 * to an existing class or create a new one.
 */
function addToClassFromRoster_(ui, ss, name, trainingType) {
  // Always use the resolved config name (e.g. "CPR" → "CPR/FA")
  var configName = resolveTrainingName_(trainingType) || trainingType;
  var capacity = getCapacityForTraining_(configName);

  var msg = name + "\n";
  msg += "Training: " + configName + "\n";
  msg += "───────────────────────\n\n";

  // Build options from TWO sources:
  // 1. Class roster tabs (actual tabs in the spreadsheet)
  // 2. Scheduled sheet sessions (may not have tabs yet)
  var options = [];

  // Source 1: Class roster tabs
  var classTabs = findAllFutureClasses_(ss, configName, "");
  var tabNames = {};
  for (var i = 0; i < classTabs.length; i++) {
    tabNames[classTabs[i].tabName] = true;
    options.push({
      source: "tab",
      label: classTabs[i].tabName,
      tabName: classTabs[i].tabName,
      filled: classTabs[i].filled,
      capacity: classTabs[i].capacity,
      openSeats: classTabs[i].openSeats,
      isFull: classTabs[i].isFull,
      sortDate: classTabs[i].classDate
    });
  }

  // Source 2: Scheduled sheet sessions
  var sessions = parseScheduledSheet_(ss);
  if (sessions) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    for (var s = 0; s < sessions.length; s++) {
      var sess = sessions[s];
      var sessResolved = resolveTrainingName_(sess.type);
      if (!sessResolved || sessResolved.toLowerCase() !== configName.toLowerCase()) continue;
      if (sess.sortDate && sess.sortDate < today) continue;

      // Skip if we already have this as a class tab
      var alreadyHasTab = false;
      if (sess.sortDate) {
        var possibleTab = buildTabName(configName, sess.sortDate);
        if (tabNames[possibleTab]) alreadyHasTab = true;
      }
      if (alreadyHasTab) continue;

      // Count real enrollees (not TBD)
      var realCount = 0;
      for (var e = 0; e < sess.enrollees.length; e++) {
        var eLower = sess.enrollees[e].toLowerCase().trim();
        if (eLower && eLower !== "tbd" && eLower !== "new hires") realCount++;
      }
      var open = capacity - realCount;

      options.push({
        source: "scheduled",
        label: sess.type + " — " + (sess.dateDisplay || "TBD"),
        sessionType: sess.type,
        dateDisplay: sess.dateDisplay,
        sortDate: sess.sortDate,
        filled: realCount,
        capacity: capacity,
        openSeats: open > 0 ? open : 0,
        isFull: open <= 0
      });
    }
  }

  // Sort by date
  options.sort(function(a, b) {
    if (a.sortDate && b.sortDate) return a.sortDate - b.sortDate;
    if (a.sortDate) return -1;
    if (b.sortDate) return 1;
    return 0;
  });

  if (options.length > 0) {
    msg += "Add to a class:\n";
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      var tag = o.source === "scheduled" ? " [Scheduled]" : "";
      if (o.isFull) {
        msg += "  " + (i + 1) + ".  " + o.label + " (FULL — " + o.filled + "/" + o.capacity + ")" + tag + "\n";
      } else {
        msg += "  " + (i + 1) + ".  " + o.label + " (" + o.filled + "/" + o.capacity + " filled, " + o.openSeats + " open)" + tag + "\n";
      }
    }
    msg += "\n  N.  Create a NEW class\n";
    msg += "  C.  Cancel\n";
  } else {
    msg += "No upcoming " + configName + " classes found.\n\n";
    msg += "  N.  Create a NEW class\n";
    msg += "  C.  Cancel\n";
  }

  var choice = ui.prompt("Add to Class", msg, ui.ButtonSet.OK_CANCEL);
  if (choice.getSelectedButton() !== ui.Button.OK) return;
  var input = choice.getResponseText().trim().toUpperCase();

  if (input === "C") return;

  // ── CREATE NEW CLASS ──
  if (input === "N") {
    var dateResp = ui.prompt("New Class — " + configName, "Enter the class date (M/D/YYYY):", ui.ButtonSet.OK_CANCEL);
    if (dateResp.getSelectedButton() !== ui.Button.OK) return;
    var classDate = parseClassDate(dateResp.getResponseText().trim());
    if (!classDate) { ui.alert("Invalid date."); return; }

    var config = null;
    for (var i = 0; i < CLASS_ROSTER_CONFIG.length; i++) {
      if (CLASS_ROSTER_CONFIG[i].name === configName) { config = CLASS_ROSTER_CONFIG[i]; break; }
    }
    if (!config) { ui.alert("Could not find config for " + configName); return; }

    var tabName = buildTabName(configName, classDate);
    var existingTab = ss.getSheetByName(tabName);

    if (existingTab) {
      var personInfo = { name: name, status: "Needs training", bucket: "needed", lastDate: "", expDate: "" };
      appendToExistingTab_(ss, tabName, personInfo, configName);
    } else {
      var today2 = new Date(); today2.setHours(0, 0, 0, 0);
      var personInfo = { name: name, status: "Needs training", bucket: "needed", lastDate: "", expDate: "" };
      createNewTabWithPerson_(ss, config, classDate, personInfo, today2);
    }
    addSessionToScheduledSheet_(ss, configName, classDate, "", "", [name]);
    SpreadsheetApp.flush();
    rebuildScheduledOverview_(ss);
    generateRostersSilent();
    orderClassRosterTabs(ss);
    ui.alert("Done!\n\n" + name + " added to " + tabName + "\nScheduled Overview & Training Rosters updated.");
    return;
  }

  // ── ADD TO EXISTING ──
  var idx = parseInt(input) - 1;
  if (isNaN(idx) || idx < 0 || idx >= options.length) { ui.alert("Invalid selection."); return; }

  var target = options[idx];

  if (target.isFull) {
    var override = ui.alert("Class is Full",
      target.label + " is at " + target.filled + "/" + target.capacity + ".\n\nAdd " + name + " anyway?",
      ui.ButtonSet.YES_NO);
    if (override !== ui.Button.YES) return;
  }

  if (target.source === "tab") {
    // Has a class roster tab — write directly
    var personInfo = { name: name, status: "Needs training", bucket: "needed", lastDate: "", expDate: "" };
    appendToExistingTab_(ss, target.tabName, personInfo, configName);
    addToScheduledSheet_(ss, configName, target.tabName, name);
  } else {
    // Scheduled sheet only — just add to Scheduled sheet enrollment
    var schedSheet = ss.getSheetByName(SCHEDULED_SHEET_NAME);
    if (schedSheet) {
      var data = schedSheet.getDataRange().getValues();
      var lastType = "";
      for (var r = 0; r < data.length; r++) {
        var colA = data[r][0] ? data[r][0].toString().trim() : "";
        var colB_raw = data[r][1];
        var colB = colB_raw ? colB_raw.toString().trim() : "";
        var colE = data[r][4] ? data[r][4].toString().trim() : "";
        if (colA === "Type" || colA === "a. Upcoming Training") continue;
        var sessionType = colA || lastType;
        if (colA) lastType = colA;
        var resolvedSession = resolveTrainingName_(sessionType) || sessionType;
        if (resolvedSession.toLowerCase() !== configName.toLowerCase()) continue;
        var dateDisplay = "";
        if (colB_raw instanceof Date && !isNaN(colB_raw.getTime())) dateDisplay = formatClassDate(colB_raw);
        else if (colB) dateDisplay = colB;
        if (dateDisplay !== target.dateDisplay && colB !== target.dateDisplay) continue;
        // Found the row — append the name
        if (!colE || colE.toLowerCase() === "tbd") {
          schedSheet.getRange(r + 1, 5).setValue(name);
        } else {
          schedSheet.getRange(r + 1, 5).setValue(colE + ", " + name);
        }
        break;
      }
    }
  }

  SpreadsheetApp.flush();
  rebuildScheduledOverview_(ss);
  generateRostersSilent();

  ui.alert("Done!\n\n" + name + " added to " + target.label +
           "\n\nScheduled Overview & Training Rosters updated.");
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
  ui.alert("Upload Complete!\n\n" + uploaded + " date(s) uploaded to the Training sheet.\n\nAuto-fill rules applied (CPR/FA sync, MedCert/PostMed sync).\nTraining Rosters updated.");
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

  } else if (sheetName === ROSTER_SHEET_NAME) {
    // ── Training Rosters tab: identify person and training ──
    var allData = sheet.getDataRange().getValues();
    var rowData = allData[row - 1]; // 0-indexed

    name = rowData[0] ? rowData[0].toString().trim() : "";
    if (!name) { ui.alert("No name found on this row. Select a person's row."); return null; }

    // Check it's not a header/section row
    var priority = rowData[4] ? rowData[4].toString().trim() : "";
    if (!priority || priority === "Priority") {
      ui.alert("Select a person's row (not a header), then run this again.");
      return null;
    }

    // Scan upward to find the training section header
    // Headers look like "CPR/FA  (2 Year Renewal | REQUIRED FOR ALL)"
    // Match against known training names to avoid hitting sub-headers like "▸ NOT YET SCHEDULED (5)"
    for (var r = row - 2; r >= 0; r--) {
      var cellA = allData[r][0] ? allData[r][0].toString().trim() : "";
      if (!cellA) continue;
      for (var tc = 0; tc < TRAINING_CONFIG.length; tc++) {
        if (cellA.indexOf(TRAINING_CONFIG[tc].name) === 0) {
          trainingType = TRAINING_CONFIG[tc].name;
          break;
        }
      }
      if (trainingType) break;
    }

    if (!trainingType) { ui.alert("Could not determine the training type. Select a row within a training section."); return null; }
    sourceTab = ROSTER_SHEET_NAME;

  } else {
    var prefixes = getClassRosterPrefixes();
    for (var p = 0; p < prefixes.length; p++) {
      var sanitizedPrefix = prefixes[p].replace(/[:\\\/?*\[\]]/g, "");
      if (sheetName.indexOf(prefixes[p] + " ") === 0 || sheetName.indexOf(sanitizedPrefix + " ") === 0) {
        if (!trainingType || prefixes[p].length > trainingType.length) trainingType = prefixes[p];
      }
    }

    if (!trainingType) {
      ui.alert("Not a class roster, Training Rosters, or Overview tab.\n\nNavigate to one of those tabs, click on a person's row, then run this.");
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

  if (isOpenSeatMarker(name) || name.toLowerCase() === "tbd") {
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

  // Flush writes, then rebuild Overview so removed person disappears cleanly
  SpreadsheetApp.flush();
  rebuildScheduledOverview_(ss);
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

  // Flush writes, then rebuild Overview so the move is reflected
  SpreadsheetApp.flush();
  rebuildScheduledOverview_(ss);
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
      // Update Scheduled sheet with the new person
      addToScheduledSheet_(ss, trainingConfig.name, destination.tabName, enteredName);
      ui.alert(
        "Assignment Complete",
        enteredName + " has been added to:\n" + destination.tabName
      );
    } else if (destination.type === "new") {
      createNewTabWithPerson_(ss, trainingConfig, destination.date, needsInfo, today);
      var newTabName = buildTabName(trainingConfig.name, destination.date);
      // Add new session to Scheduled sheet
      addSessionToScheduledSheet_(ss, trainingConfig.name, destination.date, "", "", [enteredName]);
      ui.alert(
        "Assignment Complete",
        enteredName + " has been added to new tab:\n" + newTabName
      );
    }

    // Rebuild Overview and reorder tabs after assignment
    try {
      rebuildScheduledOverview_(ss);
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
    if (val && !isOpenSeatMarker(val)) {
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
    if (isOpenSeatMarker(belowVal)) {
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
    if (val && !isOpenSeatMarker(val)) {
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


// ============================================================
//
//   RESCHEDULED & CLASS CREATION
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

  // ── Step 9: Add to Scheduled sheet & rebuild Overview ──

  var enrolleeNames = [];
  for (var i = 0; i < selectedPeople.length; i++) {
    enrolleeNames.push(selectedPeople[i].name);
  }
  addSessionToScheduledSheet_(ss, config.name, classDate, classTime, classLocation, enrolleeNames);
  SpreadsheetApp.flush();
  rebuildScheduledOverview_(ss);

  // Refresh rosters and reorder tabs
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
  summary += "\nScheduled Overview & Training Rosters updated.";

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

  generateRostersSilent();
  ui.alert("Added to rescheduled!\n\n" +
           "Name: " + name + "\n" +
           "Training: " + training + "\n" +
           "Target: " + targetDate +
           "\n\nTraining Rosters updated.");
}



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
              ui.alert("Added " + name + " to " + existingClass.tabName +
                       (existingClass.isFull ? " (over capacity)" : "") +
                       "!\n\nUse EVC Tools > 5a. Refresh All to update rosters.");
            } else {
              ui.alert("Could not add to " + existingClass.tabName + " — no open seat rows found.\nAdding to rescheduled instead.");
              writeRescheduledEntry_(ss, name, trainingType, targetDate, "Smart Remove");
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
          ui.alert("Added " + name + " to " + nextClass.tabName + "!\n\nUse EVC Tools > 5a. Refresh All to update rosters.");
        } else {
          ui.alert("Could not add — adding to rescheduled instead.");
          writeRescheduledEntry_(ss, name, trainingType, "next", "Smart Remove");
        }
        return;
      } else if (nextPick !== "2") {
        return;
      }
      // Fall through to write rescheduled
    }
  }

  writeRescheduledEntry_(ss, name, trainingType, targetDate, "Smart Remove");

  ui.alert("Added to rescheduled!\n\n" + name + " → " + trainingType + " (" + targetDate + ")");
}



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

