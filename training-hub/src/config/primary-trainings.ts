import { TRAINING_DEFINITIONS } from "./trainings";

// Primary trainings — the ones HR actively manages and tracks
const PRIMARY_COLUMN_KEYS = new Set([
  "CPR",        // CPR/FA
  "Ukeru",      // Ukeru
  "Mealtime",   // Mealtime
  "MED_TRAIN",  // Med Recert + Initial Med Training
  "POST MED",   // Post Med
  "VR",         // Van/Lift Training
]);

export const PRIMARY_TRAININGS = TRAINING_DEFINITIONS.filter(
  (d) => PRIMARY_COLUMN_KEYS.has(d.columnKey)
);
