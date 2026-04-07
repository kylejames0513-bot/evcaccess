import { TRAINING_DEFINITIONS } from "./trainings";

// All unique column keys from TRAINING_DEFINITIONS
const PRIMARY_COLUMN_KEYS = new Set(
  TRAINING_DEFINITIONS.map((d) => d.columnKey)
);

export const PRIMARY_TRAININGS = TRAINING_DEFINITIONS.filter(
  (d) => PRIMARY_COLUMN_KEYS.has(d.columnKey)
);
