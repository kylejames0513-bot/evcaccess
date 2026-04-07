import { readRange, writeRange, appendRows, getSheetNames } from "./google-sheets";
import { getSheets, getSpreadsheetId } from "./google-sheets";
import { invalidateAll } from "@/lib/cache";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

// ============================================================
// Hub Settings — stored in a "Hub Settings" tab on the spreadsheet
// ============================================================
// Row 1: Headers — "Type", "Key", "Value"
// Rows 2+:
//   Type="exclude", Key=employee name, Value=""
//   Type="capacity", Key=training name, Value=number
// ============================================================

const SETTINGS_SHEET = "Hub Settings";

/**
 * Ensure the Hub Settings tab exists. Creates it if missing.
 */
async function ensureSettingsSheet(): Promise<void> {
  const names = await getSheetNames();
  if (names.includes(SETTINGS_SHEET)) return;

  // Create the sheet
  const sheets = getSheets();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSpreadsheetId(),
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: { title: SETTINGS_SHEET },
          },
        },
      ],
    },
  });

  // Write headers
  await writeRange(`'${SETTINGS_SHEET}'!A1:C1`, [["Type", "Key", "Value"]]);
}

/**
 * Read all settings rows.
 */
async function readSettings(): Promise<Array<{ type: string; key: string; value: string }>> {
  await ensureSettingsSheet();
  const rows = await readRange(`'${SETTINGS_SHEET}'`);
  if (rows.length < 2) return [];
  return rows.slice(1).map((row) => ({
    type: (row[0] || "").trim(),
    key: (row[1] || "").trim(),
    value: (row[2] || "").trim(),
  })).filter((r) => r.type && r.key);
}

/**
 * Rewrite all settings (full replace).
 */
async function writeSettings(settings: Array<{ type: string; key: string; value: string }>): Promise<void> {
  await ensureSettingsSheet();
  const rows: (string | number)[][] = [["Type", "Key", "Value"]];
  for (const s of settings) {
    rows.push([s.type, s.key, s.value]);
  }

  // Clear the sheet first
  const sheets = getSheets();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: getSpreadsheetId(),
    range: `'${SETTINGS_SHEET}'`,
  });

  // Write all rows
  await writeRange(`'${SETTINGS_SHEET}'!A1`, rows);

  // Clear cache so next read gets fresh data
  invalidateAll();
}

// ────────────────────────────────────────────────────────────
// Excluded employees
// ────────────────────────────────────────────────────────────

export async function getExcludedEmployees(): Promise<string[]> {
  const settings = await readSettings();
  return settings.filter((s) => s.type === "exclude").map((s) => s.key);
}

export async function addExcludedEmployee(name: string): Promise<string[]> {
  const settings = await readSettings();
  const normalized = name.trim();
  if (!settings.some((s) => s.type === "exclude" && s.key.toLowerCase() === normalized.toLowerCase())) {
    settings.push({ type: "exclude", key: normalized, value: "" });
    await writeSettings(settings);
  }
  return settings.filter((s) => s.type === "exclude").map((s) => s.key);
}

export async function removeExcludedEmployee(name: string): Promise<string[]> {
  let settings = await readSettings();
  settings = settings.filter(
    (s) => !(s.type === "exclude" && s.key.toLowerCase() === name.trim().toLowerCase())
  );
  await writeSettings(settings);
  return settings.filter((s) => s.type === "exclude").map((s) => s.key);
}

export function isExcluded(name: string, excludedList: string[]): boolean {
  return excludedList.some((n) => n.toLowerCase() === name.trim().toLowerCase());
}

// ────────────────────────────────────────────────────────────
// Capacity overrides
// ────────────────────────────────────────────────────────────

export async function getCapacityOverrides(): Promise<Record<string, number>> {
  const settings = await readSettings();
  const overrides: Record<string, number> = {};
  for (const s of settings) {
    if (s.type === "capacity" && s.value) {
      const num = parseInt(s.value);
      if (!isNaN(num)) overrides[s.key] = num;
    }
  }
  return overrides;
}

export async function setCapacityOverride(trainingName: string, capacity: number): Promise<Record<string, number>> {
  const settings = await readSettings();
  const existing = settings.findIndex(
    (s) => s.type === "capacity" && s.key.toLowerCase() === trainingName.toLowerCase()
  );
  if (existing >= 0) {
    settings[existing].value = capacity.toString();
  } else {
    settings.push({ type: "capacity", key: trainingName, value: capacity.toString() });
  }
  await writeSettings(settings);
  return getCapacityOverridesSync(settings);
}

function getCapacityOverridesSync(settings: Array<{ type: string; key: string; value: string }>): Record<string, number> {
  const overrides: Record<string, number> = {};
  for (const s of settings) {
    if (s.type === "capacity" && s.value) {
      const num = parseInt(s.value);
      if (!isNaN(num)) overrides[s.key] = num;
    }
  }
  return overrides;
}

// ────────────────────────────────────────────────────────────
// Expiration thresholds — configurable alert levels
// ────────────────────────────────────────────────────────────

export interface ExpirationThresholds {
  notice: number;   // days — e.g. 90
  warning: number;  // days — e.g. 60
  critical: number; // days — e.g. 30
}

const DEFAULT_THRESHOLDS: ExpirationThresholds = { notice: 90, warning: 60, critical: 30 };

export async function getExpirationThresholds(): Promise<ExpirationThresholds> {
  const settings = await readSettings();
  const thresholds = { ...DEFAULT_THRESHOLDS };
  for (const s of settings) {
    if (s.type === "expiration_threshold") {
      const val = parseInt(s.value);
      if (!isNaN(val) && val > 0) {
        if (s.key === "notice") thresholds.notice = val;
        else if (s.key === "warning") thresholds.warning = val;
        else if (s.key === "critical") thresholds.critical = val;
      }
    }
  }
  return thresholds;
}

export async function setExpirationThresholds(thresholds: ExpirationThresholds): Promise<ExpirationThresholds> {
  const settings = await readSettings();
  // Remove existing threshold entries
  const filtered = settings.filter((s) => s.type !== "expiration_threshold");
  filtered.push({ type: "expiration_threshold", key: "notice", value: thresholds.notice.toString() });
  filtered.push({ type: "expiration_threshold", key: "warning", value: thresholds.warning.toString() });
  filtered.push({ type: "expiration_threshold", key: "critical", value: thresholds.critical.toString() });
  await writeSettings(filtered);
  return thresholds;
}

// ────────────────────────────────────────────────────────────
// Sync log — track import/sync operations
// ────────────────────────────────────────────────────────────

export interface SyncLogEntry {
  timestamp: string;
  source: string;
  applied: number;
  skipped: number;
  errors: number;
}

export async function getSyncLog(): Promise<SyncLogEntry[]> {
  const settings = await readSettings();
  return settings
    .filter((s) => s.type === "sync_log")
    .map((s) => {
      try {
        return JSON.parse(s.value) as SyncLogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is SyncLogEntry => e !== null)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function addSyncLogEntry(entry: SyncLogEntry): Promise<void> {
  const settings = await readSettings();
  settings.push({ type: "sync_log", key: entry.timestamp, value: JSON.stringify(entry) });
  // Keep only last 50 sync log entries
  const nonLogSettings = settings.filter((s) => s.type !== "sync_log");
  const logSettings = settings.filter((s) => s.type === "sync_log").slice(-50);
  await writeSettings([...nonLogSettings, ...logSettings]);
}

// ────────────────────────────────────────────────────────────
// Compliance tracks — which trainings to track on compliance page
// ────────────────────────────────────────────────────────────

// Default tracks if none configured
const DEFAULT_COMPLIANCE_KEYS = [...new Set(TRAINING_DEFINITIONS.map(d => d.columnKey))];

export async function getComplianceTracks(): Promise<string[]> {
  const settings = await readSettings();
  const tracks = settings
    .filter((s) => s.type === "compliance")
    .map((s) => s.key);
  return tracks.length > 0 ? tracks : DEFAULT_COMPLIANCE_KEYS;
}

export async function setComplianceTracks(columnKeys: string[]): Promise<string[]> {
  const settings = await readSettings();
  // Remove old compliance entries
  const filtered = settings.filter((s) => s.type !== "compliance");
  // Add new ones
  for (const key of columnKeys) {
    filtered.push({ type: "compliance", key, value: "" });
  }
  await writeSettings(filtered);
  return columnKeys;
}

// ────────────────────────────────────────────────────────────
// No-show tracking
// ────────────────────────────────────────────────────────────

// Type="no_show", Key=employee name (Last, First), Value=training|date,training|date,...

export interface NoShowRecord {
  name: string;
  incidents: Array<{ training: string; date: string }>;
}

export async function getNoShows(): Promise<NoShowRecord[]> {
  const settings = await readSettings();
  return settings
    .filter((s) => s.type === "no_show")
    .map((s) => ({
      name: s.key,
      incidents: s.value.split(";").filter(Boolean).map((entry) => {
        const [training, date] = entry.split("|");
        return { training: training || "", date: date || "" };
      }),
    }));
}

export async function addNoShow(employeeName: string, training: string, date: string): Promise<void> {
  const settings = await readSettings();
  const entry = `${training}|${date}`;
  const idx = settings.findIndex(
    (s) => s.type === "no_show" && s.key.toLowerCase() === employeeName.toLowerCase()
  );
  if (idx >= 0) {
    // Append to existing incidents
    settings[idx].value = settings[idx].value ? settings[idx].value + ";" + entry : entry;
  } else {
    settings.push({ type: "no_show", key: employeeName, value: entry });
  }
  await writeSettings(settings);
}

export async function clearNoShows(employeeName: string): Promise<void> {
  let settings = await readSettings();
  settings = settings.filter(
    (s) => !(s.type === "no_show" && s.key.toLowerCase() === employeeName.toLowerCase())
  );
  await writeSettings(settings);
}

// ────────────────────────────────────────────────────────────
// Department training rules — which trainings each department needs
// ────────────────────────────────────────────────────────────

// Type="dept_rule", Key=department name
// Value format: "tracked_keys|required_keys"
//   tracked = trainings this division has (unchecked = NA auto-fill)
//   required = subset of tracked that are actively monitored for compliance
// Legacy format: "ALL" or "CPR,Ukeru" (treated as tracked=required=same list)

export interface DeptRule {
  department: string;
  tracked: string[];  // column keys this division has (not NA)
  required: string[]; // subset — actively monitored for compliance
}

function parseDeptRuleValue(value: string): { tracked: string[]; required: string[] } {
  if (value === "ALL") return { tracked: ["ALL"], required: ["ALL"] };
  if (value.includes("|")) {
    const [trackedStr, requiredStr] = value.split("|");
    return {
      tracked: trackedStr.split(",").map((t) => t.trim()).filter(Boolean),
      required: requiredStr.split(",").map((t) => t.trim()).filter(Boolean),
    };
  }
  // Legacy format: same list for both
  const keys = value.split(",").map((t) => t.trim()).filter(Boolean);
  return { tracked: keys, required: keys };
}

function encodeDeptRuleValue(tracked: string[], required: string[]): string {
  if (tracked.includes("ALL") && required.includes("ALL")) return "ALL";
  return tracked.join(", ") + "|" + required.join(", ");
}

export async function getDeptRules(): Promise<DeptRule[]> {
  const settings = await readSettings();
  return settings
    .filter((s) => s.type === "dept_rule")
    .map((s) => {
      const parsed = parseDeptRuleValue(s.value);
      return { department: s.key, ...parsed };
    });
}

export async function setDeptRule(department: string, tracked: string[], required: string[]): Promise<DeptRule[]> {
  const settings = await readSettings();
  const idx = settings.findIndex(
    (s) => s.type === "dept_rule" && s.key.toLowerCase() === department.toLowerCase()
  );
  const value = encodeDeptRuleValue(tracked, required);
  if (idx >= 0) {
    settings[idx].value = value;
    settings[idx].key = department;
  } else {
    settings.push({ type: "dept_rule", key: department, value });
  }
  await writeSettings(settings);
  return getDeptRulesSync(settings);
}

export async function removeDeptRule(department: string): Promise<DeptRule[]> {
  let settings = await readSettings();
  settings = settings.filter(
    (s) => !(s.type === "dept_rule" && s.key.toLowerCase() === department.toLowerCase())
  );
  await writeSettings(settings);
  return getDeptRulesSync(settings);
}

function getDeptRulesSync(settings: Array<{ type: string; key: string; value: string }>): DeptRule[] {
  return settings
    .filter((s) => s.type === "dept_rule")
    .map((s) => {
      const parsed = parseDeptRuleValue(s.value);
      return { department: s.key, ...parsed };
    });
}

/**
 * Get capacity for a training, checking overrides first.
 * Uses alias resolution to match "CPR" → "CPR/FA" etc.
 */
export async function getCapacity(trainingName: string, defaultCapacity: number): Promise<number> {
  const overrides = await getCapacityOverrides();
  if (overrides[trainingName] !== undefined) return overrides[trainingName];

  // Check canonical name
  const { TRAINING_DEFINITIONS } = await import("@/config/trainings");
  const def = TRAINING_DEFINITIONS.find(
    (d) => d.name.toLowerCase() === trainingName.toLowerCase() ||
      d.columnKey.toLowerCase() === trainingName.toLowerCase() ||
      d.aliases?.some((a) => a.toLowerCase() === trainingName.toLowerCase())
  );
  if (def && overrides[def.name] !== undefined) return overrides[def.name];

  return defaultCapacity;
}
