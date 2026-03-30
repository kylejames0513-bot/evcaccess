// ============================================================
// EVC Training System — Configuration
// ============================================================
// HR Program Coordinator: Kyle Mahoney
// Emory Valley Center
// ============================================================
//
// ALL configuration lives here. Every other file reads from
// these constants. To change a column mapping, excusal code,
// nickname, schedule, or sheet name — edit THIS file only.
//
// ============================================================


// ************************************************************
//
//   SHEET NAMES
//
// ************************************************************

var TRAINING_ACCESS_SHEET_NAME = "Training";
var ROSTER_SHEET_NAME          = "Training Rosters";
var SCHEDULED_SHEET_NAME       = "Scheduled";
var OVERVIEW_SHEET_NAME        = "Scheduled Overview";
var REMOVAL_LOG_SHEET          = "Removal Log";


// ************************************************************
//
//   SESSION → COLUMN MAPPING
//
//   Maps form dropdown values (from the HTML sign-in form
//   and Training Records sheet) to column headers on the
//   Training sheet. Values are ARRAYS so a session can
//   write to multiple columns (e.g., CPR → CPR + FIRSTAID).
//
// ************************************************************

var SESSION_TO_COLUMN = {
  // ── QR form values (original dropdown) ──
  "CPR":                          ["CPR", "FIRSTAID"],
  "Ukeru":                        ["Ukeru"],
  "Initial Med Training (4 Days)":["MED_TRAIN"],
  "Post Med":                     ["POST MED"],
  "POMs Training":                ["POM"],
  "Mealtime":                     ["Mealtime"],
  "Person Centered Thinking":     ["Pers Cent Thnk"],
  "Van Lyft Training":            ["VR"],

  // ── Alternate / pasted names ──
  "CPR/FA":                       ["CPR", "FIRSTAID"],
  "UKERU":                        ["Ukeru"],
  "Initial Med Class":            ["MED_TRAIN"],
  "Med Recert":                   ["MED_TRAIN"],
  "Med Cert":                     ["MED_TRAIN"],
  "Person Centered":              ["Pers Cent Thnk"],
  "Personal Outcome Measures":    ["POM"]
};


// ************************************************************
//
//   TRAINING CONFIG — Roster Generator
//
//   name:         Display name on the roster output
//   column:       Exact header text on the Training sheet
//   renewalYears: Years before expiration (0 = one and done)
//   required:     If true, EVERYONE must have this training
//   prerequisite: Column header that must be completed first
//   onlyExpired:  Only show expired/expiring (not "needed")
//   onlyNeeded:   Only show "needed" (not expired/expiring)
//
// ************************************************************

var TRAINING_CONFIG = [
  { name: "CPR/FA",                column: "CPR",            renewalYears: 2, required: true },
  { name: "Ukeru",                 column: "Ukeru",          renewalYears: 0, required: false },
  { name: "Mealtime",             column: "Mealtime",       renewalYears: 0, required: false },
  { name: "Med Recert",           column: "MED_TRAIN",      renewalYears: 3, required: false, onlyExpired: true },
  { name: "Initial Med Training", column: "MED_TRAIN",      renewalYears: 0, required: false, onlyNeeded: true },
  { name: "Post Med",             column: "POST MED",       renewalYears: 0, required: false, prerequisite: "MED_TRAIN" },
  { name: "POMs",                 column: "POM",            renewalYears: 0, required: false },
  { name: "Person Centered",      column: "Pers Cent Thnk", renewalYears: 0, required: false },
  { name: "Van/Lift Training",    column: "VR",             renewalYears: 0, required: false }
];

// Days before expiration to flag as "Expiring Soon"
var EXPIRING_SOON_DAYS = 60;


// ************************************************************
//
//   CLASS ROSTER CONFIG — Class scheduling & capacity
//
// ************************************************************

var CLASS_ROSTER_CONFIG = [
  {
    name: "CPR/FA",
    classCapacity: 10,
    schedule: { recurring: [{ weekday: "Thursday" }] },
    weeksOut: 4
  },
  {
    name: "Ukeru",
    classCapacity: 12,
    schedule: {
      recurring: [
        { weekday: "Monday", nthWeek: [2] },
        { weekday: "Friday", nthWeek: [4] }
      ],
      dates: []
    },
    weeksOut: 6
  },
  {
    name: "Mealtime",
    classCapacity: 15,
    schedule: { recurring: [{ weekday: "Wednesday", nthWeek: [3] }] },
    weeksOut: 8
  },
  { name: "Med Recert",           classCapacity: 4,  schedule: { dates: [] }, weeksOut: 4 },
  { name: "Initial Med Training", classCapacity: 4,  schedule: { dates: [] }, weeksOut: 4 },
  { name: "Post Med",             classCapacity: 8,  schedule: { dates: [] }, weeksOut: 4 },
  { name: "POMs",                 classCapacity: 15, schedule: { dates: [] }, weeksOut: 4 },
  { name: "Person Centered",      classCapacity: 15, schedule: { dates: [] }, weeksOut: 4 },
  { name: "Van/Lift Training",    classCapacity: 10, schedule: { dates: [] }, weeksOut: 4 }
];

var SEAT_PRIORITY = [
  { bucket: "expired",      priority: 1 },
  { bucket: "needed",       priority: 2 },
  { bucket: "expiringSoon", priority: 3 }
];
SEAT_PRIORITY.sort(function(a, b) { return a.priority - b.priority; });


// ************************************************************
//
//   SCHEDULED TYPE MAP
//
//   Maps the "Type" column on the Scheduled sheet to
//   TRAINING_CONFIG names. null = not roster-managed.
//
// ************************************************************

var SCHEDULED_TYPE_MAP = {
  "cpr":                  "CPR/FA",
  "cpr/fa":               "CPR/FA",
  "ukeru":                "Ukeru",
  "mealtime":             "Mealtime",
  "med training":         null,
  "med recert":           "Med Recert",
  "med cert":             null,
  "initial med training": null,
  "med test out":         "Med Recert",
  "post med":             null,
  "poms":                 "POMs",
  "poms training":        "POMs",
  "person centered":      "Person Centered",
  "pct training":         "Person Centered",
  "van/lift training":    "Van/Lift Training",
  "van lyft":             "Van/Lift Training",
  "rising leaders":       null,
  "safety care":          null
};


// ************************************************************
//
//   AUTO-FILL RULES
//
//   When a date is written to one column, automatically fill
//   the linked column. offset = days to add (0 = same day).
//
// ************************************************************

var AUTO_FILL_RULES = [
  { source: "CPR",       target: "FIRSTAID",  offset: 0 },
  { source: "FIRSTAID",  target: "CPR",       offset: 0 },
  { source: "MED_TRAIN", target: "POST MED",  offset: 1 },
  { source: "POST MED",  target: "MED_TRAIN", offset: -1 }
];


// ************************************************************
//
//   EXCUSAL CODES
//
//   Values in training columns that mean "this person
//   doesn't need this training." Shown in the excused
//   list on rosters. Add new codes as needed.
//
// ************************************************************

var EXCUSAL_CODES = [
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

  // Facility/failure codes (tracked separately by data integrity)
  "FX1", "FX2", "FX3", "FS",
  "F X 2", "FX 1",
  "FX1*", "FX1/NS", "FX1 - S", "FX1 - R",

  // Other
  "TRAINER",
  "LP", "NS",
  "LLL"
];

// Lookup map for fast excusal checking (built once at load)
var EXCUSAL_MAP_ = {};
(function() {
  for (var i = 0; i < EXCUSAL_CODES.length; i++) {
    EXCUSAL_MAP_[EXCUSAL_CODES[i].toUpperCase()] = true;
  }
})();


// ************************************************************
//
//   NICKNAMES — Name matching dictionary
//
//   Used by: findTrainingRow, checkNameInTraining,
//   checkForDuplicateOnEdit, and all name-matching logic.
//
//   Standard nicknames + EVC-specific mappings at the bottom.
//
// ************************************************************

var NICKNAMES = {
  // ── Standard nicknames ──
  "mike": ["michael", "micheal"], "michael": ["mike"], "micheal": ["mike"],
  "bob": ["robert"], "robert": ["bob", "bobby"], "bobby": ["robert", "bob"],
  "bill": ["william"], "william": ["bill", "will", "billy"], "will": ["william"],
  "jim": ["james"], "james": ["jim", "jimmy"], "jimmy": ["james"],
  "joe": ["joseph"], "joseph": ["joe", "joey"],
  "tom": ["thomas"], "thomas": ["tom", "tommy"],
  "dick": ["richard"], "richard": ["dick", "rick", "rich"],
  "rick": ["richard"], "rich": ["richard"],
  "dan": ["daniel"], "daniel": ["dan", "danny"], "danny": ["daniel"],
  "dave": ["david"], "david": ["dave"],
  "steve": ["steven", "stephen"], "steven": ["steve"], "stephen": ["steve"],
  "matt": ["matthew", "mathew"], "matthew": ["matt"], "mathew": ["matt"],
  "chris": ["christopher", "christian"], "christopher": ["chris"], "christian": ["chris"],
  "pat": ["patricia", "patrick"], "patricia": ["pat", "patty"], "patrick": ["pat"],
  "jen": ["jennifer"], "jennifer": ["jen", "jenny"], "jenny": ["jennifer"],
  "liz": ["elizabeth"], "elizabeth": ["liz", "beth", "betsy"],
  "beth": ["elizabeth"], "betsy": ["elizabeth"],
  "kate": ["katherine", "kathryn", "kathy"], "kathy": ["katherine", "kathryn", "katharine"],
  "katie": ["katherine", "kathryn"],
  "sue": ["susan"], "susan": ["sue", "susie"], "susie": ["susan"],
  "meg": ["megan", "meghan"], "megan": ["meg"], "meghan": ["meg"],
  "sam": ["samantha", "samuel"], "samantha": ["sam"], "samuel": ["sam"],
  "tony": ["anthony", "antonio"], "anthony": ["tony"], "antonio": ["tony"],
  "nick": ["nicholas"], "nicholas": ["nick"],
  "alex": ["alexander", "alexandra", "alexis"], "alexander": ["alex"], "alexandra": ["alex"],
  "ed": ["edward", "edgar"], "edward": ["ed", "eddie"], "edgar": ["ed"],
  "josh": ["joshua"], "joshua": ["josh"],
  "jon": ["jonathan", "jonathon"], "jonathan": ["jon"],
  "tim": ["timothy"], "timothy": ["tim"],
  "larry": ["lawrence"], "lawrence": ["larry"],
  "cindy": ["cynthia"], "cynthia": ["cindy"],
  "sandy": ["sandra", "sandi"], "sandra": ["sandy", "sandi"], "sandi": ["sandra", "sandy"],
  "barb": ["barbara"], "barbara": ["barb"],
  "deb": ["deborah", "debra"], "deborah": ["deb", "debbie"], "debra": ["deb", "debbie"],
  "debbie": ["deborah", "debra"],
  "brent": ["brenton"], "brenton": ["brent"],
  "tina": ["christina", "christine"], "christina": ["tina", "chris"], "christine": ["tina", "chris"],
  "don": ["donald"], "donald": ["don", "donny"],
  "jeff": ["jeffrey", "jeffery"], "jeffrey": ["jeff"], "jeffery": ["jeff"],
  "ted": ["theodore", "edward"], "theodore": ["ted"],
  "ray": ["raymond"], "raymond": ["ray"],
  "ron": ["ronald"], "ronald": ["ron", "ronnie"],
  "phil": ["phillip", "philip"], "phillip": ["phil"], "philip": ["phil"],
  "kim": ["kimberly"], "kimberly": ["kim"],
  "mel": ["melanie"], "melanie": ["mel"],
  "cassie": ["cassandra"], "cassandra": ["cassie"],

  // ── EVC-specific mappings ──
  "frankie": ["niyonyishu"], "niyonyishu": ["frankie"],
  "jamie": ["everette"], "everette": ["jamie"],
  "hope": ["samantha"],
  "austin": ["robert"],
  "elise": ["elisete"], "elisete": ["elise"],
  "leah": ["raeleah"], "raeleah": ["leah"],
  "abbi": ["abbigayle", "abigail"], "abbigayle": ["abbi"], "abigail": ["abbey", "abbi"], "abbey": ["abigail"],
  "zachary": ["zachery"], "zachery": ["zachary"],
  "annette": ["carol"],
  "lani": ["iolani"], "iolani": ["lani"],
  "bimbor": ["abimbola"], "abimbola": ["bimbor"],
  "madilynn": ["madison"],
  "nichole": ["randi"],
  "aaron": ["richard"],
  "ravyn": ["jonni"], "jonni": ["ravyn"],
  "rasshad": ["ikee"], "ikee": ["rasshad"],
  "kay": ["deborah"]
};


// ************************************************************
//
//   CLEAN GARBLED DATES — Known valid text values
//
//   Non-date text in training columns that should NOT be
//   cleared by cleanGarbledDates. Everything else with
//   digits that isn't a valid date gets wiped.
//
// ************************************************************

var KEEP_VALUES = [
  "NEEDS", "NEEDDS", "SCHED", "SCHEDULE",
  "FAILED", "FAIL", "COMPLETE", "COMPLETED",
  "NO SHOW", "NCNS 2026", "NEED CERTIF",
  "TERM", "HALF", "1 DAY ONLY", "1 DAY",
  "NA", "N/A",
  "ELC", "EI", "FACILITIES", "MAINT",
  "HR", "FINANCE", "FIN", "IT", "ADMIN",
  "NURSE", "LPN", "RN", "CNA",
  "BH", "PA", "BA", "QA", "TAC",
  "TRAINER", "LP",
  "LLL", "MASS", "WAIN", "WADS",
  "Y", "YES", "S", "R"
];
