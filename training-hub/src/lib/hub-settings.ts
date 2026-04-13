import { createServerClient } from "./supabase";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

// ============================================================
// Hub Settings -- Supabase (PostgreSQL)
// ============================================================
// Migrated from Google Sheets "Hub Settings" tab to Supabase
// hub_settings table. Same type/key/value structure.
// ============================================================

/**
 * Read all settings rows of a given type.
 */
async function readSettings(type?: string): Promise<Array<{ type: string; key: string; value: string }>> {
  const supabase = createServerClient();
  let query = supabase.from("hub_settings").select("type, key, value");
  if (type) query = query.eq("type", type);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to read settings: ${error.message}`);
  return (data || []).map((r) => ({ type: r.type, key: r.key, value: r.value }));
}

/**
 * Upsert a single setting.
 */
async function upsertSetting(type: string, key: string, value: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("hub_settings")
    .upsert({ type, key, value }, { onConflict: "type,key" });
  if (error) throw new Error(`Failed to upsert setting: ${error.message}`);
}

/**
 * Delete a setting.
 */
async function deleteSetting(type: string, key: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("hub_settings")
    .delete()
    .eq("type", type)
    .eq("key", key);
  if (error) throw new Error(`Failed to delete setting: ${error.message}`);
}

/**
 * Delete all settings of a given type.
 */
async function deleteSettingsByType(type: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("hub_settings")
    .delete()
    .eq("type", type);
  if (error) throw new Error(`Failed to delete settings: ${error.message}`);
}

// ────────────────────────────────────────────────────────────
// Excluded employees
// ────────────────────────────────────────────────────────────

export async function getExcludedEmployees(): Promise<string[]> {
  const settings = await readSettings("exclude");
  return settings.map((s) => s.key);
}

export async function addExcludedEmployee(name: string): Promise<string[]> {
  const normalized = name.trim();
  await upsertSetting("exclude", normalized, "");
  return getExcludedEmployees();
}

export async function removeExcludedEmployee(name: string): Promise<string[]> {
  await deleteSetting("exclude", name.trim());
  return getExcludedEmployees();
}

export function isExcluded(name: string, excludedList: string[]): boolean {
  return excludedList.some((n) => n.toLowerCase() === name.trim().toLowerCase());
}

// ────────────────────────────────────────────────────────────
// Capacity overrides
// ────────────────────────────────────────────────────────────

export async function getCapacityOverrides(): Promise<Record<string, number>> {
  const settings = await readSettings("capacity");
  const overrides: Record<string, number> = {};
  for (const s of settings) {
    const num = parseInt(s.value);
    if (!isNaN(num)) overrides[s.key] = num;
  }
  return overrides;
}

export async function setCapacityOverride(trainingName: string, capacity: number): Promise<Record<string, number>> {
  await upsertSetting("capacity", trainingName, capacity.toString());
  return getCapacityOverrides();
}

/**
 * Get capacity for a training, checking overrides first.
 */
export async function getCapacity(trainingName: string, defaultCapacity: number): Promise<number> {
  const overrides = await getCapacityOverrides();
  if (overrides[trainingName] !== undefined) return overrides[trainingName];

  const def = TRAINING_DEFINITIONS.find(
    (d) => d.name.toLowerCase() === trainingName.toLowerCase() ||
      d.columnKey.toLowerCase() === trainingName.toLowerCase() ||
      d.aliases?.some((a) => a.toLowerCase() === trainingName.toLowerCase())
  );
  if (def && overrides[def.name] !== undefined) return overrides[def.name];

  return defaultCapacity;
}

// ────────────────────────────────────────────────────────────
// Expiration thresholds
// ────────────────────────────────────────────────────────────

export interface ExpirationThresholds {
  notice: number;
  warning: number;
  critical: number;
}

const DEFAULT_THRESHOLDS: ExpirationThresholds = { notice: 90, warning: 60, critical: 30 };

export async function getExpirationThresholds(): Promise<ExpirationThresholds> {
  const settings = await readSettings("expiration_threshold");
  const thresholds = { ...DEFAULT_THRESHOLDS };
  for (const s of settings) {
    const val = parseInt(s.value);
    if (!isNaN(val) && val > 0) {
      if (s.key === "notice") thresholds.notice = val;
      else if (s.key === "warning") thresholds.warning = val;
      else if (s.key === "critical") thresholds.critical = val;
    }
  }
  return thresholds;
}

export async function setExpirationThresholds(thresholds: ExpirationThresholds): Promise<ExpirationThresholds> {
  await upsertSetting("expiration_threshold", "notice", thresholds.notice.toString());
  await upsertSetting("expiration_threshold", "warning", thresholds.warning.toString());
  await upsertSetting("expiration_threshold", "critical", thresholds.critical.toString());
  return thresholds;
}

// ────────────────────────────────────────────────────────────
// Sync log
// ────────────────────────────────────────────────────────────

export interface SyncLogEntry {
  timestamp: string;
  source: string;
  applied: number;
  skipped: number;
  errors: number;
}

export async function getSyncLog(): Promise<SyncLogEntry[]> {
  const settings = await readSettings("sync_log");
  return settings
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
  await upsertSetting("sync_log", entry.timestamp, JSON.stringify(entry));

  // Keep only last 50 sync log entries
  const all = await readSettings("sync_log");
  if (all.length > 50) {
    const sorted = all.sort((a, b) => a.key.localeCompare(b.key));
    const toDelete = sorted.slice(0, sorted.length - 50);
    for (const s of toDelete) {
      await deleteSetting("sync_log", s.key);
    }
  }
}

// ────────────────────────────────────────────────────────────
// Compliance tracks
// ────────────────────────────────────────────────────────────

const DEFAULT_COMPLIANCE_KEYS = [...new Set(TRAINING_DEFINITIONS.map(d => d.columnKey))];

export async function getComplianceTracks(): Promise<string[]> {
  const settings = await readSettings("compliance");
  const tracks = settings.map((s) => s.key);
  return tracks.length > 0 ? tracks : DEFAULT_COMPLIANCE_KEYS;
}

export async function setComplianceTracks(columnKeys: string[]): Promise<string[]> {
  await deleteSettingsByType("compliance");
  for (const key of columnKeys) {
    await upsertSetting("compliance", key, "");
  }
  return columnKeys;
}

// ────────────────────────────────────────────────────────────
// No-show tracking
// ────────────────────────────────────────────────────────────

export interface NoShowRecord {
  name: string;
  incidents: Array<{ training: string; date: string }>;
}

export async function getNoShows(): Promise<NoShowRecord[]> {
  const settings = await readSettings("no_show");
  return settings.map((s) => ({
    name: s.key,
    incidents: s.value.split(";").filter(Boolean).map((entry) => {
      const [training, date] = entry.split("|");
      return { training: training || "", date: date || "" };
    }),
  }));
}

export async function addNoShow(employeeName: string, training: string, date: string): Promise<void> {
  const settings = await readSettings("no_show");
  const existing = settings.find(
    (s) => s.key.toLowerCase() === employeeName.toLowerCase()
  );
  const entry = `${training}|${date}`;
  const newValue = existing?.value ? existing.value + ";" + entry : entry;
  await upsertSetting("no_show", existing?.key || employeeName, newValue);
}

export async function clearNoShows(employeeName: string): Promise<void> {
  // Find the actual key (case-insensitive)
  const settings = await readSettings("no_show");
  const match = settings.find(
    (s) => s.key.toLowerCase() === employeeName.toLowerCase()
  );
  if (match) {
    await deleteSetting("no_show", match.key);
  }
}

// Department training rules were migrated to the `required_trainings`
// table — see /api/required-trainings and the compliance view. The
// legacy helpers that used to live here (getDeptRules / setDeptRule /
// removeDeptRule, backed by hub_settings type="dept_rule") have been
// removed in favour of that single source of truth.
