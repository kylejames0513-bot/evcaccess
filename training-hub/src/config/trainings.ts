// ============================================================
// EVC Training Hub — Training Configuration
// ============================================================
// Migrated from Config.gs TRAINING_CONFIG
// This is the seed data + reference for all training types.
// ============================================================

export interface TrainingDef {
  name: string;
  columnKey: string;
  renewalYears: number;
  isRequired: boolean;
  classCapacity: number;
  onlyExpired?: boolean;
  onlyNeeded?: boolean;
  lookAheadDays?: number;     // include people expiring within this many days
  lookAheadNextQuarterEnd?: boolean; // quarterly training: look ahead to the end of the next calendar quarter (overrides lookAheadDays)
  postExpGraceDays?: number;  // also include people expired within this many days
  autoEnrollNext?: string;    // after completion, auto-enroll in this training's next session
  prerequisite?: string; // column_key of prerequisite
  aliases?: string[];
  rulesName?: string;
  schedule?: {
    recurring: Array<{
      weekday: string;
      nthWeek?: number[];
    }>;
  };
  weeksOut?: number;
}

// Direct migration from Config.gs TRAINING_CONFIG
export const TRAINING_DEFINITIONS: TrainingDef[] = [
  {
    name: "CPR/FA",
    columnKey: "CPR",
    renewalYears: 2,
    isRequired: true,
    classCapacity: 10,
    schedule: { recurring: [{ weekday: "Thursday" }] },
    weeksOut: 4,
    lookAheadDays: 90,       // show people expiring within 90 days
    postExpGraceDays: 30,    // also show people expired up to 30 days ago
    aliases: ["cpr"],
  },
  {
    name: "Ukeru",
    columnKey: "Ukeru",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 12,
    schedule: {
      recurring: [
        { weekday: "Monday", nthWeek: [2] },
        { weekday: "Friday", nthWeek: [4] },
      ],
    },
    weeksOut: 6,
  },
  {
    name: "Mealtime",
    columnKey: "Mealtime",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
    schedule: { recurring: [{ weekday: "Wednesday", nthWeek: [3] }] },
    weeksOut: 8,
  },
  {
    name: "Med Recert",
    columnKey: "MED_TRAIN",
    rulesName: "Med Training",
    renewalYears: 3,
    isRequired: false,
    onlyExpired: true,
    lookAheadDays: 90,              // fallback if quarterly flag is unset
    lookAheadNextQuarterEnd: true,  // Med Recert runs quarterly: enroll anyone whose cert expires before end of next calendar quarter
    postExpGraceDays: 30,           // also show people expired up to 30 days ago
    classCapacity: 8,
    aliases: ["med cert", "med test out"],
  },
  {
    name: "Initial Med Training",
    columnKey: "MED_TRAIN",
    rulesName: "Med Training",
    renewalYears: 0,
    isRequired: false,
    onlyNeeded: true,
    autoEnrollNext: "Post Med",  // after passing, auto-enroll in Post Med
    classCapacity: 4,
    aliases: ["med training"],
  },
  {
    name: "Post Med",
    columnKey: "POST MED",
    renewalYears: 0,
    isRequired: false,
    prerequisite: "MED_TRAIN",
    classCapacity: 8,
  },
  {
    name: "POMs",
    columnKey: "POM",
    rulesName: "POM",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
    aliases: ["poms training", "personal outcome measures"],
  },
  {
    name: "Person Centered",
    columnKey: "Pers Cent Thnk",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
    aliases: ["pct training", "person centered thinking"],
  },
  {
    name: "Safety Care",
    columnKey: "Safety Care",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "Meaningful Day",
    columnKey: "Meaningful Day",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
    aliases: ["meaningful day training"],
  },
  {
    name: "MD Refresh",
    columnKey: "MD refresh",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
    aliases: ["md refresh training"],
  },
  {
    name: "GERD",
    columnKey: "GERD",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "HCO Training",
    columnKey: "HCO Training",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
    aliases: ["hco"],
  },
  {
    name: "Health Passport",
    columnKey: "Health Passport",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "Diabetes",
    columnKey: "Diabetes",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "Falls",
    columnKey: "Falls",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "Dysphagia",
    columnKey: "Dysphagia Overview",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
    aliases: ["dysphagia overview", "dysphagia training"],
  },
  {
    name: "Rights Training",
    columnKey: "Rights Training",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "Title VI",
    columnKey: "Title VI",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "Active Shooter",
    columnKey: "Active Shooter",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "Skills System",
    columnKey: "Skills System",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
    aliases: ["skills system training"],
  },
  {
    name: "CPI",
    columnKey: "CPI",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "CPM",
    columnKey: "CPM",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "PFH/DIDD",
    columnKey: "PFH/DIDD",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "Basic VCRM",
    columnKey: "Basic VCRM",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
    aliases: ["basic vcrm training"],
  },
  {
    name: "Advanced VCRM",
    columnKey: "Advanced VCRM",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
    aliases: ["advanced vcrm training"],
  },
  {
    name: "TRN",
    columnKey: "TRN",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "ASL",
    columnKey: "ASL",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "Skills Online",
    columnKey: "Skills Online",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "ETIS",
    columnKey: "ETIS",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
  {
    name: "Shift",
    columnKey: "SHIFT",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
    aliases: ["shift training"],
  },
  {
    name: "Advanced Shift",
    columnKey: "ADV SHIFT",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
    aliases: ["adv shift"],
  },
  {
    name: "MC",
    columnKey: "MC",
    renewalYears: 0,
    isRequired: false,
    classCapacity: 15,
  },
];

// Auto-fill rules (migrated from Config.gs AUTO_FILL_RULES)
export const AUTO_FILL_RULES = [
  { source: "CPR", target: "FIRSTAID", offsetDays: 0 },
  { source: "FIRSTAID", target: "CPR", offsetDays: 0 },
  { source: "MED_TRAIN", target: "POST MED", offsetDays: 1 },
  { source: "POST MED", target: "MED_TRAIN", offsetDays: -1 },
];

// Excusal codes (migrated from Config.gs EXCUSAL_CODES)
export const EXCUSAL_CODES = [
  // Standard not-applicable
  "NA", "N/A", "N/",
  // Leadership / executive roles
  "VP", "DIR", "DIRECTOR", "CEO", "CFO", "COO", "CMO",
  "AVP", "SVP", "EVP", "PRESIDENT",
  // Management
  "MGR", "MANAGER", "SUPERVISOR", "SUPV",
  // Location/program excusals
  "ELC", "EI",
  // Department excusals
  "FACILITIES", "MAINT",
  "HR", "FINANCE", "FIN", "IT", "ADMIN",
  // Nursing credentials
  "NURSE", "LPN", "RN", "CNA",
  // Role codes
  "BH", "PA", "BA", "QA", "TAC",
  // Board of Directors
  "BOARD",
  // Facility/failure codes (tracked separately by data integrity)
  "FX1", "FX2", "FX3", "FS",
  "F X 2", "FX 1",
  "FX1*", "FX1/NS", "FX1 - S", "FX1 - R",
  // Other
  "TRAINER", "LP", "NS", "LLL",
] as const;

// expiring_soon = within 90 days. Matches the compliance view v3
// (migration 20260414000200_compliance_view_expiring_90_days). Used by
// the legacy lib/training-data.ts and the report generator. Keep this
// in sync with the view's CASE branch and the per-row TS computations.
export const EXPIRING_SOON_DAYS = 90;
