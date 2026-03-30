// ============================================================
// EVC Training System — Utilities
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
//
// Shared helper functions used by every other file.
// No business logic here — just tools.
//
// CONTENTS:
//   - Date parsing & formatting
//   - Column lookup
//   - String similarity (Dice coefficient)
//   - Excusal code checking
//   - Failure code detection & standardization
//   - Time parsing
//   - SheetWriter (batch formatting helper)
//   - List/CSV parsing helpers
//
// ============================================================


// ************************************************************
//
//   DATE PARSING
//
// ************************************************************

/**
 * parseToDate — tries to parse a cell value into a Date.
 * Handles Date objects, M/D/YY, M/D/YYYY, and standard strings.
 * Returns null if unparseable or year outside 2000-2099.
 */
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

/**
 * parseTrainingDate — for roster generator.
 * Handles: Date objects, M/D/YY, M/D/YYYY, M-D-YY, M-D-YYYY.
 * More permissive than parseToDate (accepts dash format).
 */
function parseTrainingDate(val) {
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val;
  }

  var str = String(val).trim();
  if (!str) return null;

  // Slash format: M/D/YY or M/D/YYYY
  var parts = str.split("/");
  if (parts.length === 3) {
    var month = parseInt(parts[0]) - 1;
    var day = parseInt(parts[1]);
    var year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    var d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Dash format: M-D-YY or M-D-YYYY
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

/**
 * parseClassDate — parses date strings from class roster tab names.
 * Handles: M/D/YYYY, M/D/YY, and standard Date.parse formats.
 */
function parseClassDate(str) {
  if (!str) return null;
  var parts = str.split("/");
  if (parts.length === 3) {
    var m = parseInt(parts[0]) - 1;
    var d = parseInt(parts[1]);
    var y = parseInt(parts[2]);
    if (y < 100) y += 2000;
    var dt = new Date(y, m, d);
    if (!isNaN(dt.getTime())) return dt;
  }
  var dt2 = new Date(str);
  if (!isNaN(dt2.getTime())) return dt2;
  return null;
}

/**
 * parseFuzzyDate — parses flexible date strings from the
 * Scheduled sheet (e.g., "March 30 – APR 2", "April 6 – April 9").
 * Returns the START date only.
 */
function parseFuzzyDate_(str) {
  if (!str) return null;

  // Already a Date object
  if (str instanceof Date && !isNaN(str.getTime())) return str;

  var s = str.toString().trim();

  // Try standard parse first
  var d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) return d;

  // Range format: "March 30 – APR 2" → take the first part
  var rangeSep = s.indexOf("–");
  if (rangeSep === -1) rangeSep = s.indexOf("-");
  if (rangeSep > 0) {
    var firstPart = s.substring(0, rangeSep).trim();
    d = new Date(firstPart + " " + new Date().getFullYear());
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * parseDateList — parses comma-separated or newline-separated
 * date strings into an array of Date objects.
 */
function parseDateList(input) {
  if (!input) return [];
  var parts = input.toString().split(/[,\n]+/);
  var dates = [];
  for (var i = 0; i < parts.length; i++) {
    var s = parts[i].trim();
    if (!s) continue;
    var d = parseClassDate(s);
    if (d) dates.push(d);
  }
  return dates;
}


// ************************************************************
//
//   DATE FORMATTING
//
// ************************************************************

/**
 * formatBackfillDate — Date objects and strings → M/D/YY
 * Used when writing dates to the Training sheet.
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

  var mo = d.getMonth() + 1;
  var da = d.getDate();
  var yr = d.getFullYear().toString().slice(-2);
  return mo + "/" + da + "/" + yr;
}

/**
 * formatDate — M/D/YYYY (full year) for roster output.
 */
function formatDate(d) {
  if (!d) return "";
  return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
}

/**
 * formatClassDate — M/D/YYYY for class roster tab names.
 */
function formatClassDate(d) {
  if (!d) return "";
  return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
}


// ************************************************************
//
//   COLUMN & VALUE LOOKUP
//
// ************************************************************

/**
 * findColumnIndex — find a column by trying multiple header names.
 * Returns 0-based index or -1 if not found.
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
 * getExcusalCode — check if a cell value is an excusal code.
 * Returns the matched code (for display) or null.
 */
function getExcusalCode(str) {
  if (!str) return null;
  var upper = str.toString().trim().toUpperCase();
  if (EXCUSAL_MAP_[upper]) return upper;
  return null;
}


// ************************************************************
//
//   FAILURE CODE DETECTION & STANDARDIZATION
//
//   Old formats: FX1, FX2, F X 2, FX 1, FX1/NS, FX1*, FS
//   Standard:    FAILED, FAILED X1, FAILED X2, FAILED X3
//
// ************************************************************

/**
 * isFailureCode — returns true if the string is any failure code.
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
 * standardizeFailureCode — returns the standardized form,
 * or null if already standard.
 */
function standardizeFailureCode(str) {
  var u = str.toString().trim().toUpperCase();
  if (u === "FAILED" || /^FAILED X\d$/.test(u)) return null; // Already standard
  if (u === "FS" || u === "FAIL") return "FAILED";
  var fxMatch = u.match(/^F\s*X\s*(\d)/);
  if (fxMatch) return "FAILED X" + fxMatch[1];
  return null;
}


// ************************************************************
//
//   STRING SIMILARITY — Dice coefficient
//
//   Used for fuzzy name matching across all modules.
//
// ************************************************************

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


// ************************************************************
//
//   TIME PARSING
//
// ************************************************************

/**
 * parseTimeToMinutes — "9:00 AM" → total minutes from midnight.
 * Returns -1 if unparseable.
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
//   OPEN SEAT DETECTION
//
// ************************************************************

/**
 * isOpenSeatMarker — returns true if the name is any variant
 * of an open seat placeholder.
 */
function isOpenSeatMarker(name) {
  if (!name) return true;
  var lower = name.toString().trim().toLowerCase();
  if (!lower) return true;
  if (lower === OPEN_SEAT_MARKER) return true;
  if (lower.indexOf("open seat") > -1) return true;
  if (lower === "— open —" || lower === "- open -") return true;
  if (lower === "\u2014 open \u2014") return true;
  return false;
}


// ************************************************************
//
//   LIST / ENROLLEE PARSING
//
// ************************************************************

/**
 * parseEnrolleeList_ — splits a comma-separated enrollee
 * string into an array of trimmed names.
 */
function parseEnrolleeList_(text) {
  if (!text) return [];
  var parts = text.toString().split(",");
  var result = [];
  for (var i = 0; i < parts.length; i++) {
    var name = parts[i].trim();
    if (name) result.push(name);
  }
  return result;
}


// ************************************************************
//
//   SHEET WRITER — Batch formatting helper
//
//   Builds up rows with values + formatting in memory,
//   then flushes everything to the sheet in one batch.
//   Used by writeRosterSheet and writeScheduledOverviewSheet.
//
// ************************************************************

function SheetWriter(sheet) {
  this.sheet = sheet;
  this.values = [];
  this.backgrounds = [];
  this.fontColors = [];
  this.fontWeights = [];
  this.fontSizes = [];
  this.fontFamilies = [];
  this.merges = [];
  this.colCount = 7;
  this.startRow = 1;
}

SheetWriter.prototype.setColCount = function(n) { this.colCount = n; return this; };
SheetWriter.prototype.setStartRow = function(r) { this.startRow = r; return this; };

SheetWriter.prototype.addRow = function(vals, opts) {
  opts = opts || {};
  var row = [];
  var bgs = [], colors = [], weights = [], sizes = [], families = [];

  for (var c = 0; c < this.colCount; c++) {
    row.push(c < vals.length ? vals[c] : "");
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

SheetWriter.prototype.flush = function() {
  if (this.values.length === 0) return this.startRow;

  var range = this.sheet.getRange(this.startRow, 1, this.values.length, this.colCount);
  range.setValues(this.values);
  range.setBackgrounds(this.backgrounds);
  range.setFontColors(this.fontColors);
  range.setFontWeights(this.fontWeights);
  range.setFontSizes(this.fontSizes);
  range.setFontFamilies(this.fontFamilies);

  for (var m = 0; m < this.merges.length; m++) {
    var mr = this.merges[m];
    this.sheet.getRange(this.startRow + mr.row, 1, 1, mr.cols).merge();
  }

  return this.startRow + this.values.length;
};

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
