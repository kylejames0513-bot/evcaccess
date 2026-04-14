import { TRAINING_DEFINITIONS } from "@/config/trainings";

/**
 * Build a lookup map from all possible training names/aliases to the canonical name.
 * e.g., "cpr" -> "CPR/FA", "med training" -> "Med Recert", etc.
 */
const aliasMap = new Map<string, string>();

for (const def of TRAINING_DEFINITIONS) {
  aliasMap.set(def.name.toLowerCase(), def.name);
  aliasMap.set(def.columnKey.toLowerCase(), def.name);
  if (def.rulesName) aliasMap.set(def.rulesName.toLowerCase(), def.name);
  if (def.aliases) {
    for (const alias of def.aliases) {
      aliasMap.set(alias.toLowerCase(), def.name);
    }
  }
}

// Add common variations that might appear on the Scheduled sheet
aliasMap.set("med training", "Initial Med Training");
aliasMap.set("med train", "Initial Med Training");
aliasMap.set("initial med", "Initial Med Training");
aliasMap.set("med test out", "Med Recert");
aliasMap.set("med recert", "Med Recert");
aliasMap.set("van lyft training", "Van/Lift Training");
aliasMap.set("van lyft", "Van/Lift Training");
aliasMap.set("van/lift", "Van/Lift Training");
aliasMap.set("van lift training", "Van/Lift Training");

/**
 * Get the canonical training name for any input.
 * Returns the input as-is if no match found.
 */
export function canonicalTrainingName(input: string): string {
  return aliasMap.get(input.toLowerCase()) || input;
}

/**
 * Check if two training names refer to the same training.
 * Handles all aliases: "CPR" matches "CPR/FA", "Med Training" matches "Med Recert", etc.
 */
export function trainingsMatch(a: string, b: string): boolean {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const canonA = canonicalTrainingName(a);
  const canonB = canonicalTrainingName(b);
  return canonA === canonB;
}

/**
 * Check if a training name matches any in a list of training names.
 * Also checks if trainings share the same column key (e.g., Med Recert and Initial Med Training both use MED_TRAIN).
 */
export function trainingMatchesAny(needle: string, haystack: string): boolean {
  if (trainingsMatch(needle, haystack)) return true;

  // Check if they share the same column key
  const needleDef = TRAINING_DEFINITIONS.find(
    (d) => d.name.toLowerCase() === canonicalTrainingName(needle).toLowerCase()
  );
  const haystackDef = TRAINING_DEFINITIONS.find(
    (d) => d.name.toLowerCase() === canonicalTrainingName(haystack).toLowerCase()
  );
  if (needleDef && haystackDef && needleDef.columnKey === haystackDef.columnKey) {
    return true;
  }

  return false;
}
