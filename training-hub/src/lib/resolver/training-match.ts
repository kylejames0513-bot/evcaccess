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

import { resolveTrainingByAlias, getTrainingTypeByColumnKey } from "@/lib/db/trainings";
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
  if (typeof pre === "object" && pre.skip) return { kind: "skip", reason: "non_training" };

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
