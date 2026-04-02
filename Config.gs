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
  "Personal Outcome Measures":    ["POM"],

  // ── New training types ──
  "Safety Care":                  ["Safety Care"],
  "Meaningful Day":               ["Meaningful Day"],
  "MD Refresh":                   ["MD refresh"],
  "GERD":                         ["GERD"],
  "HCO Training":                 ["HCO Training"],
  "HCO":                          ["HCO Training"],
  "Health Passport":              ["Health Passport"],
  "Diabetes":                     ["Diabetes"],
  "Falls":                        ["Falls"],
  "Dysphagia":                    ["Dysphagia Overview"],
  "Dysphagia Overview":           ["Dysphagia Overview"],
  "Rights Training":              ["Rights Training"],
  "Title VI":                     ["Title VI"],
  "Active Shooter":               ["Active Shooter"],
  "Skills System":                ["Skills System"],
  "CPI":                          ["CPI"],
  "CPM":                          ["CPM"],
  "PFH/DIDD":                     ["PFH/DIDD"],
  "Basic VCRM":                   ["Basic VCRM"],
  "Advanced VCRM":                ["Advanced VCRM"],
  "TRN":                          ["TRN"],
  "ASL":                          ["ASL"],
  "Skills Online":                ["Skills Online"],
  "ETIS":                         ["ETIS"],
  "Shift":                        ["SHIFT"],
  "ADV SHIFT":                    ["ADV SHIFT"],
  "Advanced Shift":               ["ADV SHIFT"],
  "MC":                           ["MC"]
};


// ************************************************************
//
//   TRAINING CONFIG — Single source of truth
//
//   TO ADD A NEW TRAINING: just add an entry here.
//   The system auto-generates CLASS_ROSTER_CONFIG and
//   SCHEDULED_TYPE_MAP from this array.
//
//   name:          Display name on the roster output
//   column:        Exact header text on the Training sheet
//   renewalYears:  Years before expiration (0 = one and done)
//   required:      If true, EVERYONE must have this training
//   prerequisite:  Column header that must be completed first
//   onlyExpired:   Only show expired/expiring (not "needed")
//   onlyNeeded:    Only show "needed" (not expired/expiring)
//   classCapacity: Max seats per class (default 15)
//   schedule:      Recurring schedule for date suggestions
//   weeksOut:      How many weeks ahead to suggest dates (default 4)
//   aliases:       Alternate names used on the Scheduled sheet
//                  (auto-added to SCHEDULED_TYPE_MAP)
//
// ************************************************************

var TRAINING_CONFIG = [
  {
    name: "CPR/FA",
    column: "CPR",
    renewalYears: 2,
    required: true,
    showOnRoster: true,
    classCapacity: 10,
    schedule: { recurring: [{ weekday: "Thursday" }] },
    weeksOut: 4,
    aliases: ["cpr"]
  },
  {
    name: "Ukeru",
    column: "Ukeru",
    renewalYears: 0,
    required: false,
    showOnRoster: true,
    classCapacity: 12,
    schedule: {
      recurring: [
        { weekday: "Monday", nthWeek: [2] },
        { weekday: "Friday", nthWeek: [4] }
      ]
    },
    weeksOut: 6
  },
  {
    name: "Mealtime",
    column: "Mealtime",
    renewalYears: 0,
    required: false,
    showOnRoster: true,
    classCapacity: 15,
    schedule: { recurring: [{ weekday: "Wednesday", nthWeek: [3] }] },
    weeksOut: 8
  },
  {
    name: "Med Recert",
    column: "MED_TRAIN",
    rulesName: "Med Training",
    renewalYears: 3,
    required: false,
    showOnRoster: true,
    onlyExpired: true,
    classCapacity: 4,
    aliases: ["med cert", "med test out"]
  },
  {
    name: "Initial Med Training",
    column: "MED_TRAIN",
    rulesName: "Med Training",
    renewalYears: 0,
    required: false,
    showOnRoster: true,
    onlyNeeded: true,
    classCapacity: 4
  },
  {
    name: "Post Med",
    column: "POST MED",
    rulesName: "Med Training",
    renewalYears: 0,
    required: false,
    showOnRoster: true,
    prerequisite: "MED_TRAIN",
    classCapacity: 8
  },
  {
    name: "POMs",
    column: "POM",
    rulesName: "POM",
    renewalYears: 0,
    required: false,
    classCapacity: 15,
    aliases: ["poms training", "personal outcome measures"]
  },
  {
    name: "Person Centered",
    column: "Pers Cent Thnk",
    renewalYears: 0,
    required: false,
    classCapacity: 15,
    aliases: ["pct training", "person centered thinking"]
  },
  {
    name: "Van/Lift Training",
    column: "VR",
    renewalYears: 0,
    required: false,
    classCapacity: 10,
    aliases: ["van lyft"]
  },
  {
    name: "Safety Care",
    column: "Safety Care",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "Meaningful Day",
    column: "Meaningful Day",
    renewalYears: 0,
    required: false,
    classCapacity: 15,
    aliases: ["meaningful day training"]
  },
  {
    name: "MD Refresh",
    column: "MD refresh",
    renewalYears: 0,
    required: false,
    classCapacity: 15,
    aliases: ["md refresh training"]
  },
  {
    name: "GERD",
    column: "GERD",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "HCO Training",
    column: "HCO Training",
    renewalYears: 0,
    required: false,
    classCapacity: 15,
    aliases: ["hco"]
  },
  {
    name: "Health Passport",
    column: "Health Passport",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "Diabetes",
    column: "Diabetes",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "Falls",
    column: "Falls",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "Dysphagia",
    column: "Dysphagia Overview",
    columnAlt: ["Dysphagia Oveview", "Dysphagia"],
    renewalYears: 0,
    required: false,
    classCapacity: 15,
    aliases: ["dysphagia overview", "dysphagia training"]
  },
  {
    name: "Rights Training",
    column: "Rights Training",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "Title VI",
    column: "Title VI",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "Active Shooter",
    column: "Active Shooter",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "Skills System",
    column: "Skills System",
    renewalYears: 0,
    required: false,
    classCapacity: 15,
    aliases: ["skills system training"]
  },
  {
    name: "CPI",
    column: "CPI",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "CPM",
    column: "CPM",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "PFH/DIDD",
    column: "PFH/DIDD",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "Basic VCRM",
    column: "Basic VCRM",
    renewalYears: 0,
    required: false,
    classCapacity: 15,
    aliases: ["basic vcrm training"]
  },
  {
    name: "Advanced VCRM",
    column: "Advanced VCRM",
    renewalYears: 0,
    required: false,
    classCapacity: 15,
    aliases: ["advanced vcrm training"]
  },
  {
    name: "TRN",
    column: "TRN",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "ASL",
    column: "ASL",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "Skills Online",
    column: "Skills Online",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "ETIS",
    column: "ETIS",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  },
  {
    name: "Shift",
    column: "SHIFT",
    renewalYears: 0,
    required: false,
    classCapacity: 15,
    aliases: ["shift training"]
  },
  {
    name: "Advanced Shift",
    column: "ADV SHIFT",
    renewalYears: 0,
    required: false,
    classCapacity: 15,
    aliases: ["adv shift"]
  },
  {
    name: "MC",
    column: "MC",
    renewalYears: 0,
    required: false,
    classCapacity: 15
  }
];

// Days before expiration to flag as "Expiring Soon"
var EXPIRING_SOON_DAYS = 60;


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
