// ============================================================
// EVC Shared — Constants, Utilities & Date Parsing
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
// Centralized configuration, date parsing, formatting, and
// helper functions used across all EVC script files.
//
// PASTE INTO: Extensions > Apps Script as a new file
//   (click + next to Files, name it "Shared")
// ============================================================


// ************************************************************
//
//   SHEET NAME CONSTANTS
//
// ************************************************************

var TRAINING_ACCESS_SHEET_NAME = "Training";
var ROSTER_SHEET_NAME          = "Training Rosters";
var SCHEDULED_SHEET_NAME       = "Scheduled";
var OVERVIEW_SHEET_NAME        = "Scheduled Overview";
var REMOVAL_LOG_SHEET          = "Removal Log";
var ACRONYM_CONFIG_SHEET       = "Acronym Config";


// ************************************************************
//
//   COLOR PALETTE
//
// ************************************************************

var COLORS = {
  NAVY:      "#1F3864",
  RED:       "#C00000",
  ORANGE:    "#E65100",
  GREEN:     "#2E7D32",
  BLUE:      "#1565C0",
  LGRAY:     "#F2F2F2",
  WHITE:     "#FFFFFF",
  ALT_BLUE:  "#EBF0F7",
  LGREEN:    "#C6EFCE",
  LRED:      "#FFC7CE",
  MED_BLUE:  "#2E75B6",
  BLACK:     "#000000"
};


// ************************************************************
//
//   TRAINING CONFIGURATION
//
// ************************************************************

/**
 * TRAINING_CONFIG — defines each training type tracked on the
 * Training sheet. Used by roster generator, class rosters,
 * manual assignment, and data integrity.
 *
 * @type {Array<{name: string, column: string, renewalYears: number,
 *   required: boolean, prerequisite?: string, onlyExpired?: boolean,
 *   onlyNeeded?: boolean}>}
 */
var TRAINING_CONFIG = [
  { name: "CPR/FA",             column: "CPR",            renewalYears: 2, required: true },
  { name: "Ukeru",              column: "Ukeru",          renewalYears: 0, required: false },
  { name: "Mealtime",           column: "Mealtime",       renewalYears: 0, required: false },
  { name: "Med Recert",         column: "MED_TRAIN",      renewalYears: 3, required: false, onlyExpired: true },
  { name: "Initial Med Training", column: "MED_TRAIN",    renewalYears: 0, required: false, onlyNeeded: true },
  { name: "Post Med",           column: "POST MED",       renewalYears: 0, required: false, prerequisite: "MED_TRAIN" },
  { name: "POMs",               column: "POM",            renewalYears: 0, required: false },
  { name: "Person Centered",    column: "Pers Cent Thnk", renewalYears: 0, required: false },
  { name: "Van/Lift Training",  column: "VR",             renewalYears: 0, required: false }
];

/** Days before expiration to flag as "Expiring Soon" */
var EXPIRING_SOON_DAYS = 60;

/**
 * SESSION_TO_COLUMN — maps form dropdown values to Training
 * sheet column headers. Values are arrays so a session can
 * write to multiple columns.
 * @type {Object<string, string[]>}
 */
var SESSION_TO_COLUMN = {
  "CPR":                          ["CPR", "FIRSTAID"],
  "Ukeru":                        ["Ukeru"],
  "Initial Med Training (4 Days)":["MED_TRAIN"],
  "Post Med":                     ["POST MED"],
  "POMs Training":                ["POM"],
  "Mealtime":                     ["Mealtime"],
  "Person Centered Thinking":     ["Pers Cent Thnk"],
  "Van Lyft Training":            ["VR"],
  "CPR/FA":                       ["CPR", "FIRSTAID"],
  "UKERU":                        ["Ukeru"],
  "Initial Med Class":            ["MED_TRAIN"],
  "Med Recert":                   ["MED_TRAIN"],
  "Med Cert":                     ["MED_TRAIN"],
  "Person Centered":              ["Pers Cent Thnk"],
  "Personal Outcome Measures":    ["POM"]
};

/**
 * AUTO_FILL_RULES — when a date is written to one column,
 * automatically fill linked columns.
 * @type {Array<{source: string, target: string, offset: number}>}
 */
var AUTO_FILL_RULES = [
  { source: "CPR",       target: "FIRSTAID",  offset: 0 },
  { source: "FIRSTAID",  target: "CPR",       offset: 0 },
  { source: "MED_TRAIN", target: "POST MED",  offset: 1 },
  { source: "POST MED",  target: "MED_TRAIN", offset: -1 }
];


// ************************************************************
//
//   CLASS ROSTER CONFIGURATION
//
// ************************************************************

/** @type {Array<{name: string, classCapacity: number, schedule: Object, weeksOut: number}>} */
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
  { name: "Med Recert",           classCapacity: 4,  schedule: { dates: [] }, weeksOut: 4 },
  { name: "Initial Med Training", classCapacity: 4,  schedule: { dates: [] }, weeksOut: 4 },
  { name: "Post Med",             classCapacity: 8,  schedule: { dates: [] }, weeksOut: 4 },
  { name: "POMs",                 classCapacity: 15, schedule: { dates: [] }, weeksOut: 4 },
  { name: "Person Centered",      classCapacity: 15, schedule: { dates: [] }, weeksOut: 4 },
  { name: "Van/Lift Training",    classCapacity: 10, schedule: { dates: [] }, weeksOut: 4 }
];

var SEAT_PRIORITY = [
  { bucket: "expired",      priority: 1 },
  { bucket: "needed",       priority: 2 },
  { bucket: "expiringSoon", priority: 3 }
];
SEAT_PRIORITY.sort(function(a, b) { return a.priority - b.priority; });

/**
 * SCHEDULED_TYPE_MAP — maps Scheduled sheet type strings to
 * TRAINING_CONFIG names. null = manually managed / untracked.
 * @type {Object<string, string|null>}
 */
var SCHEDULED_TYPE_MAP = {
  "cpr":                  "CPR/FA",
  "cpr/fa":               "CPR/FA",
  "ukeru":                "Ukeru",
  "mealtime":             "Mealtime",
  "med training":         null,
  "med recert":           "Med Recert",
  "med cert":             null,
  "initial med training": null,
  "med test out":         "Med Recert",
  "post med":             null,
  "poms":                 "POMs",
  "poms training":        "POMs",
  "person centered":      "Person Centered",
  "pct training":         "Person Centered",
  "van/lift training":    "Van/Lift Training",
  "van lyft":             "Van/Lift Training",
  "rising leaders":       null,
  "safety care":          null
};

/** Reasons offered when removing someone from a class roster */
var REMOVAL_REASONS = [
  "Promoted — no longer required",
  "Left organization",
  "Transferred — different program",
  "Exempt — management decision",
  "Scheduling conflict — reschedule later",
  "Completed elsewhere",
  "Other"
];


// ************************************************************
//
//   EXCUSAL CODES
//
// ************************************************************

/**
 * EXCUSAL_CODES — values in training columns that mean
 * "this person doesn't need this training."
 * @type {string[]}
 */
var EXCUSAL_CODES = [
  "NA", "N/A", "N/",
  "VP", "DIR", "DIRECTOR", "CEO", "CFO", "COO", "CMO",
  "AVP", "SVP", "EVP", "PRESIDENT",
  "MGR", "MANAGER", "SUPERVISOR", "SUPV",
  "ELC", "EI",
  "FACILITIES", "MAINT",
  "HR", "FINANCE", "FIN", "IT", "ADMIN",
  "NURSE", "LPN", "RN", "CNA",
  "BH", "PA", "BA", "QA", "TAC",
  "FX1", "FX2", "FX3", "FS",
  "F X 2", "FX 1",
  "FX1*", "FX1/NS", "FX1 - S", "FX1 - R",
  "TRAINER",
  "LP", "NS",
  "LLL"
];

/** @type {Object<string, boolean>} */
var EXCUSAL_MAP_ = {};
(function() {
  for (var i = 0; i < EXCUSAL_CODES.length; i++) {
    EXCUSAL_MAP_[EXCUSAL_CODES[i].toUpperCase()] = true;
  }
})();

/**
 * Check if a cell value is an excusal code.
 * @param {string} str - Cell value to check
 * @returns {string|null} The matched code or null
 */
function getExcusalCode(str) {
  if (!str) return null;
  var upper = str.toString().trim().toUpperCase();
  if (EXCUSAL_MAP_[upper]) return upper;
  return null;
}

/**
 * @param {string} str - Cell value to check
 * @returns {boolean}
 */
function isExcusal(str) {
  return getExcusalCode(str) !== null;
}


// ************************************************************
//
//   NICKNAMES
//
// ************************************************************

/** @type {Object<string, string[]>} */
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
//   UNIFIED DATE PARSER
//
// ************************************************************

/**
 * Parse any date value into a Date object. Handles:
 *   - Native Date objects (from Google Sheets)
 *   - Slash format: M/D/YY, M/D/YYYY
 *   - Dash format: M-D-YY, M-D-YYYY
 *   - new Date() fallback (ISO strings, etc.)
 *   - Fuzzy month names: "April 15", "Jan 3"
 *
 * @param {*} val - Cell value, Date object, or string
 * @returns {Date|null}
 */
function parseDate(val) {
  if (!val) return null;

  // Native Date object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val;
  }

  var str = val.toString().trim();
  if (!str) return null;

  // Slash format: M/D/YY or M/D/YYYY
  var slashParts = str.split("/");
  if (slashParts.length === 3) {
    var mo = parseInt(slashParts[0]);
    var da = parseInt(slashParts[1]);
    var yr = parseInt(slashParts[2]);
    if (yr < 100) yr += 2000;
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31 && yr >= 2000 && yr <= 2099) {
      var d = new Date(yr, mo - 1, da);
      d.setHours(0, 0, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Dash format: M-D-YY or M-D-YYYY
  var dashParts = str.split("-");
  if (dashParts.length === 3) {
    var mo2 = parseInt(dashParts[0]);
    var da2 = parseInt(dashParts[1]);
    var yr2 = parseInt(dashParts[2]);
    if (yr2 < 100) yr2 += 2000;
    if (mo2 >= 1 && mo2 <= 12 && da2 >= 1 && da2 <= 31 && yr2 >= 2000 && yr2 <= 2099) {
      var d2 = new Date(yr2, mo2 - 1, da2);
      d2.setHours(0, 0, 0, 0);
      if (!isNaN(d2.getTime())) return d2;
    }
  }

  // new Date() fallback — only accept years 2000-2099
  var d3 = new Date(str);
  if (!isNaN(d3.getTime()) && d3.getFullYear() >= 2000 && d3.getFullYear() <= 2099) {
    d3.setHours(0, 0, 0, 0);
    return d3;
  }

  // Fuzzy month name: "April 15", "Jan 3"
  var MONTHS = {
    "jan":0,"january":0,"feb":1,"february":1,"mar":2,"march":2,
    "apr":3,"april":3,"may":4,"jun":5,"june":5,"jul":6,"july":6,
    "aug":7,"august":7,"sep":8,"september":8,"oct":9,"october":9,
    "nov":10,"november":10,"dec":11,"december":11
  };
  var fuzzyMatch = str.match(/^([A-Za-z]+)\s+(\d{1,2})/);
  if (fuzzyMatch) {
    var fmo = MONTHS[fuzzyMatch[1].toLowerCase()];
    var fda = parseInt(fuzzyMatch[2]);
    if (fmo !== undefined && fda >= 1 && fda <= 31) {
      var fyr = new Date().getFullYear();
      var fd = new Date(fyr, fmo, fda);
      fd.setHours(0, 0, 0, 0);
      if (fd < new Date()) fd = new Date(fyr + 1, fmo, fda);
      fd.setHours(0, 0, 0, 0);
      return fd;
    }
  }

  return null;
}

// Backward-compatible wrappers
/** @param {*} val @returns {Date|null} */
function parseToDate(val)       { return parseDate(val); }
/** @param {*} val @returns {Date|null} */
function parseTrainingDate(val) { return parseDate(val); }
/** @param {string} str @returns {Date|null} */
function parseClassDate(str)    { return parseDate(str); }
/** @param {*} val @returns {Date|null} */
function parseCellDate(val)     { return parseDate(val); }
/** @param {string} str @returns {Date|null} */
function parseFuzzyDate_(str)   { return parseDate(str); }


// ************************************************************
//
//   DATE FORMATTERS
//
// ************************************************************

/**
 * Format date as M/D/YYYY (full year).
 * @param {Date} d
 * @returns {string}
 */
function formatDate(d) {
  if (!d) return "";
  return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
}

/**
 * Format date as M/D/YY (short year). Handles Date objects and strings.
 * @param {Date|string} dateVal
 * @returns {string}
 */
function formatBackfillDate(dateVal) {
  if (!dateVal) return "";
  var d;
  if (dateVal instanceof Date) {
    d = dateVal;
  } else {
    d = new Date(dateVal.toString() + "T12:00:00");
  }
  if (isNaN(d.getTime())) return dateVal.toString();
  return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear().toString().slice(-2);
}

/**
 * Format date as M/D/YYYY (alias for formatDate, used in class rosters).
 * @param {Date} d
 * @returns {string}
 */
function formatClassDate(d) {
  if (!d) return "";
  return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
}

/**
 * Format date for audit display (alias for formatDate).
 * @param {Date} d
 * @returns {string}
 */
function formatAuditDate(d) {
  return formatDate(d);
}

/**
 * Parse a comma/newline-separated list of date strings.
 * @param {string} input
 * @returns {Date[]}
 */
function parseDateList(input) {
  var lines = input.split(/[\n,]+/), dates = [];
  for (var i = 0; i < lines.length; i++) {
    var d = parseDate(lines[i].trim());
    if (d) dates.push(d);
  }
  dates.sort(function(a, b) { return a - b; });
  return dates;
}


// ************************************************************
//
//   SHARED HELPERS
//
// ************************************************************

/**
 * Find a column index by trying multiple possible header names.
 * @param {Array} headers - Header row values
 * @param {string[]} possibleNames - Names to try (case-insensitive)
 * @returns {number} 0-based index or -1
 */
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

/**
 * Dice coefficient string similarity (0.0 to 1.0).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
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

/**
 * Check if a cell value is a failure code (FAILED, FX1, FS, etc.).
 * @param {string} str
 * @returns {boolean}
 */
function isFailureCode(str) {
  var u = str.toString().trim().toUpperCase();
  if (u === "FAILED" || /^FAILED X\d$/.test(u)) return true;
  if (u === "FS" || u === "FAIL") return true;
  if (/^FX\d/.test(u)) return true;
  if (/^F\s*X\s*\d/.test(u)) return true;
  return false;
}

/**
 * Standardize a failure code to canonical form.
 * @param {string} str
 * @returns {string|null} Standardized form, or null if already standard
 */
function standardizeFailureCode(str) {
  var u = str.toString().trim().toUpperCase();
  if (u === "FAILED" || /^FAILED X\d$/.test(u)) return null;
  if (u === "FS" || u === "FAIL") return "FAILED";
  var fxMatch = u.match(/^F\s*X\s*(\d)/);
  if (fxMatch) return "FAILED X" + fxMatch[1];
  return null;
}

/**
 * Escape special regex characters in a string.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse "9:00 AM" to total minutes since midnight.
 * @param {string} str
 * @returns {number} Minutes, or -1 on failure
 */
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


// ************************************************************
//
//   ERROR LOGGING
//
// ************************************************************

/**
 * Log an error to a hidden "Error Log" sheet for visibility.
 * Falls back to Logger.log if the sheet can't be created.
 *
 * @param {string} context - Where the error occurred (e.g., "doPost", "syncScheduled")
 * @param {string|Error} error - The error message or Error object
 */
function logError_(context, error) {
  var msg = (error && error.toString) ? error.toString() : String(error);
  Logger.log("[" + context + "] " + msg);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var log = ss.getSheetByName("Error Log");
    if (!log) {
      log = ss.insertSheet("Error Log");
      log.getRange(1, 1, 1, 4).setValues([["Timestamp", "Context", "Error", "User"]]);
      log.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground(COLORS.NAVY).setFontColor(COLORS.WHITE);
      log.setColumnWidth(1, 160);
      log.setColumnWidth(2, 180);
      log.setColumnWidth(3, 500);
      log.setColumnWidth(4, 180);
      log.setFrozenRows(1);
      log.hideSheet();
    }
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "M/d/yyyy h:mm:ss a");
    var user = "";
    try { user = Session.getActiveUser().getEmail(); } catch (e) { user = "unknown"; }
    log.appendRow([now, context, msg, user]);
  } catch (e) {
    // Can't write to sheet — Logger.log is our only fallback (already called above)
  }
}


// ************************************************************
//
//   ROSTER DATA CACHE
//
// ************************************************************

var _rosterCache_ = { data: null, timestamp: 0 };

/**
 * Invalidate the roster data cache.
 * Call this after any operation that modifies the Training sheet.
 */
function invalidateRosterCache_() {
  _rosterCache_ = { data: null, timestamp: 0 };
}
