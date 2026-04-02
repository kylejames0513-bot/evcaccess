import { readRange, writeRange, appendRows, getSheetNames } from "./google-sheets";
import { getSheets, getSpreadsheetId } from "./google-sheets";
import { invalidateAll } from "@/lib/cache";

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
// Compliance tracks — which trainings to track on compliance page
// ────────────────────────────────────────────────────────────

// Default tracks if none configured
const DEFAULT_COMPLIANCE_KEYS = ["CPR", "Ukeru", "Mealtime", "MED_TRAIN", "POST MED", "VR"];

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
// Department training rules — which trainings each department needs
// ────────────────────────────────────────────────────────────

// Type="dept_rule", Key=department name, Value="ALL" or comma-separated columnKeys
// e.g. { type: "dept_rule", key: "Facilities", value: "CPR" }
// e.g. { type: "dept_rule", key: "100-Residential", value: "ALL" }

export interface DeptRule {
  department: string;
  trainings: string[]; // column keys, or ["ALL"]
}

export async function getDeptRules(): Promise<DeptRule[]> {
  const settings = await readSettings();
  return settings
    .filter((s) => s.type === "dept_rule")
    .map((s) => ({
      department: s.key,
      trainings: s.value === "ALL" ? ["ALL"] : s.value.split(",").map((t) => t.trim()).filter(Boolean),
    }));
}

export async function setDeptRule(department: string, trainings: string[]): Promise<DeptRule[]> {
  const settings = await readSettings();
  const idx = settings.findIndex(
    (s) => s.type === "dept_rule" && s.key.toLowerCase() === department.toLowerCase()
  );
  const value = trainings.includes("ALL") ? "ALL" : trainings.join(", ");
  if (idx >= 0) {
    settings[idx].value = value;
    settings[idx].key = department; // preserve original casing
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
    .map((s) => ({
      department: s.key,
      trainings: s.value === "ALL" ? ["ALL"] : s.value.split(",").map((t) => t.trim()).filter(Boolean),
    }));
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
