// ============================================================
// Resolver training matching.
// ============================================================
// Translates a raw training name from any source into a canonical
// training_types row, or routes the row to unknown_trainings.
//
// Each source has its own quirks:
//   - Paylocity uses (Skill, Code) and CPR comes through as 'CPR.FA'
//   - PHS uses (Upload Category, Upload Type) and there are several
//     "Additional Training" rows that need source-specific routing
//   - Access uses fixed wide column names that match training_types.column_key
//   - Sign-in form sends the canonical training_types.name
//
// The shared resolveTrainingByAlias() in db/trainings handles the
// generic case (alias dictionary then direct name match). This module
// adds source-aware preprocessing on top.
// ============================================================

import { resolveTrainingByAlias, getTrainingTypeByColumnKey, listTrainingTypes } from "@/lib/db/trainings";
import { createServerClient } from "@/lib/supabase";
import type { TrainingType, ImportSource } from "@/types/database";

export type TrainingMatchOutcome =
  | { kind: "matched"; trainingType: TrainingType }
  | { kind: "skip"; reason: "non_training" }
  | { kind: "unknown"; rawName: string };

/**
 * Per-source preprocessing rules. Returns either a canonicalized name
 * to look up via the alias dictionary, or a "skip" decision (for known
 * non-training rows like Driver's License) before any DB hit.
 */
function preprocess(source: ImportSource, rawName: string): string | { skip: true } | null {
  const trimmed = rawName.trim();
  if (trimmed.length === 0) return null;

  if (source === "paylocity") {
    // Skip non-training Paylocity rows wholesale.
    const skipList = new Set([
      "DL",
      "MVR",
      "Insurance",
      "Background",
      "Veh Ins Declination",
      "Driver's License",
      "Vehicle Insurance Declination Page",
    ]);
    if (skipList.has(trimmed)) return { skip: true };

    // Paylocity uses 'CPR.FA' for the CPR/FA training.
    if (trimmed.toUpperCase() === "CPR.FA") return "CPR/FA";
    if (trimmed.toUpperCase() === "UKERU") return "Ukeru";
    return trimmed;
  }

  if (source === "phs") {
    if (trimmed === "Driver's License") return { skip: true };
    return trimmed;
  }

  if (source === "access") {
    // Access uses column_key-style names directly. The handleAccessRow
    // helper below resolves these via getTrainingTypeByColumnKey instead
    // of the alias dictionary.
    return trimmed;
  }

  return trimmed;
}

/**
 * Resolve a single (source, raw_name) into a TrainingType, or one of
 * the non-match outcomes. Caller decides whether to drop the row, log
 * to unknown_trainings, or proceed.
 */
export async function matchTraining(
  source: ImportSource,
  rawName: string
): Promise<TrainingMatchOutcome> {
  const pre = preprocess(source, rawName);
  if (pre == null) return { kind: "unknown", rawName };
  if (typeof pre === "object") {
    return { kind: "skip", reason: "non_training" };
  }
  // Narrowed: pre is a string from here on.

  // Access goes via column_key first.
  if (source === "access") {
    const byKey = await getTrainingTypeByColumnKey(pre);
    if (byKey) return { kind: "matched", trainingType: byKey };
  }

  const matched = await resolveTrainingByAlias(pre);
  if (matched) return { kind: "matched", trainingType: matched };
  return { kind: "unknown", rawName };
}

/**
 * Combine Paylocity's two cells (Skill, Code) into a single name to
 * resolve. Paylocity exports both columns and either may be the
 * canonical identifier depending on the row vintage. Code wins if
 * present and non-empty.
 */
export function paylocityRawName(skill: string | null | undefined, code: string | null | undefined): string {
  const c = (code ?? "").trim();
  if (c.length > 0) return c;
  return (skill ?? "").trim();
}

/**
 * Combine PHS's two cells (Upload Category, Upload Type) into a single
 * name to resolve. The pair is much more meaningful than either alone:
 * 'Med Admin | Certification' must map to 'Med Recert', but
 * 'Med Admin | No Show' is not a completion at all.
 *
 * Returns null when the pair indicates a non-completion (No Show, Fail).
 * Caller should drop those rows or route to unresolved_people with
 * reason='special_status'.
 */
export function phsRawName(
  uploadCategory: string | null | undefined,
  uploadType: string | null | undefined
): { name: string } | { specialStatus: "no_show" | "fail" } | null {
  const cat = (uploadCategory ?? "").trim();
  const typ = (uploadType ?? "").trim();
  if (cat.length === 0 && typ.length === 0) return null;

  if (cat === "Med Admin" && typ === "No Show") return { specialStatus: "no_show" };
  if (cat === "Med Admin" && typ === "Fail") return { specialStatus: "fail" };

  if (cat === "Med Admin" && typ === "Certification") return { name: "Med Recert" };
  if (cat === "CPR/FA") return { name: "CPR/FA" };
  if (cat === "Additional Training") {
    // The Type column carries the specific training name in this case.
    return { name: typ };
  }

  // Fallback: combine.
  return { name: typ.length > 0 ? typ : cat };
}

// ────────────────────────────────────────────────────────────
// Initial → Recert upgrade helper
// ────────────────────────────────────────────────────────────
// When importing a completion under a "one-and-done" training type
// (renewal_years=0), check if the employee already has any completion
// under a sibling type sharing the same column_key with a higher
// renewal_years. If so, upgrade the record to the renewable type.
//
// Example: Paylocity sends "Med Training" which resolves to Initial
// Med Training (id=5, MED_TRAIN, renewal_years=0). If the employee
// already has any prior MED_TRAIN completion, upgrade it to Med Recert
// (id=4, MED_TRAIN, renewal_years=3) so compliance tracks the 3-year
// cycle instead of treating it as yet another initial training.
// ────────────────────────────────────────────────────────────

let _upgradeCache: { initialTypeId: number; recertTypeId: number }[] | null = null;

async function getUpgradeMap(): Promise<{ initialTypeId: number; recertTypeId: number }[]> {
  if (_upgradeCache) return _upgradeCache;
  const types = await listTrainingTypes();
  const byKey = new Map<string, TrainingType[]>();
  for (const t of types) {
    if (!t.is_active) continue;
    if (!byKey.has(t.column_key)) byKey.set(t.column_key, []);
    byKey.get(t.column_key)!.push(t);
  }
  _upgradeCache = [];
  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    const initial = group.find((t) => t.renewal_years === 0);
    const recert = group
      .filter((t) => t.renewal_years > 0)
      .sort((a, b) => b.renewal_years - a.renewal_years)[0];
    if (initial && recert) {
      _upgradeCache.push({ initialTypeId: initial.id, recertTypeId: recert.id });
    }
  }
  return _upgradeCache;
}

/**
 * Upgrade an Initial → Recert training_type_id for an employee who
 * already has a prior completion in the same column_key group.
 * Returns the (possibly upgraded) training_type_id.
 */
export async function upgradeInitialToRecert(
  employeeId: string,
  trainingTypeId: number
): Promise<number> {
  const upgradeMap = await getUpgradeMap();
  const pair = upgradeMap.find((p) => p.initialTypeId === trainingTypeId);
  if (!pair) return trainingTypeId; // not an upgradeable type

  // Check if the employee has any prior completion in this column_key group
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("training_records")
    .select("id")
    .eq("employee_id", employeeId)
    .in("training_type_id", [pair.initialTypeId, pair.recertTypeId])
    .limit(1);
  if (error) return trainingTypeId; // fail safe
  if (data && data.length > 0) {
    return pair.recertTypeId;
  }
  return trainingTypeId;
}
