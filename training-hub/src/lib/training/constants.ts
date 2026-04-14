import type { RequiredTrainingKey } from "@/lib/training/types";

export const REQUIRED_LOOKBACK_DAYS = 90;

export const REQUIRED_TRAININGS: RequiredTrainingKey[] = [
  "cpi",
  "med",
  "cpr",
  "abuse",
  "hipaa",
];

export const PRIMARY_TRAININGS: Record<RequiredTrainingKey, string> = {
  cpi: "CPI",
  med: "Medication Administration",
  cpr: "CPR / First Aid",
  abuse: "Abuse and Neglect",
  hipaa: "HIPAA",
};
