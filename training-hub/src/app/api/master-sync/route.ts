import { readRange } from "@/lib/google-sheets";
import { namesMatch, suggestNameMatches, type NameSuggestion } from "@/lib/name-utils";
import {
  normalizeDate,
  parseToTimestamp,
  datesEqual,
  loadNameMappings,
  applyFixes,
  FixEntry,
} from "@/lib/import-utils";
import { addSyncLogEntry } from "@/lib/hub-settings";
import { PAYLOCITY_SKILL_MAP } from "@/app/api/paylocity-audit/route";
import { TRAINING_DEFINITIONS, EXCUSAL_CODES } from "@/config/trainings";

// ── All training columns from TRAINING_DEFINITIONS + FIRSTAID ────────────────
const ALL_TRAINING_COLS = new Set<string>([
  ...TRAINING_DEFINITIONS.map((t) => t.columnKey),
  "FIRSTAID",
]);

// ── Excusal code set for fast lookup ─────────────────────────────────────────
const EXCUSAL_SET = new Set(EXCUSAL_CODES.map((c) => c.toUpperCase().trim()));
function isExcused(val: string): boolean {
  const v = val.trim().toUpperCase();
  if (!v) return false;
  if (EXCUSAL_SET.has(v)) return true;
  // Short alpha codes (≤4 chars, no digits) are likely excusal codes
  if (/^[A-Z]{1,4}$/.test(v)) return true;
  return false;
}

// ── PHS category/type → Training column ──────────────────────────────────────
const PHS_CATEGORY_MAP: Record<string, string> = {
  "med admin": "MED_TRAIN",
  "cpr/fa": "CPR",
  "drivers license": "VR",
  "driver's license": "VR",
  "drivers licence": "VR",
};

const PHS_ADDITIONAL_MAP: Record<string, string | null> = {
  "ukeru": "Ukeru",
  "safety care": "Safety Care",
  "behavior training": "Ukeru",
  "mealtime": "Mealtime",
  "mealtime instructions": "Mealtime",
  "med training": "MED_TRAIN",
  "medication training": "MED_TRAIN",
  "med cert": "MED_TRAIN",
  "post med": "POST MED",
  "pom": "POM",
  "poms": "POM",
  "person centered": "Pers Cent Thnk",
  "person centered thinking": "Pers Cent Thnk",
  "meaningful day": "Meaningful Day",
  "md refresh": "MD refresh",
  "rights training": "Rights Training",
  "rights": "Rights Training",
  "title vi": "Title VI",
  "active shooter": "Active Shooter",
  "skills system": "Skills System",
  "cpi": "CPI",
  "cpm": "CPM",
  "pfh/didd": "PFH/DIDD",
  "basic vcrm": "Basic VCRM",
  "advanced vcrm": "Advanced VCRM",
  "adv vcrm": "Advanced VCRM",
  "trn": "TRN",
  "asl": "ASL",
  "shift": "SHIFT",
  "advanced shift": "ADV SHIFT",
  "adv shift": "ADV SHIFT",
  "mc": "MC",
  "van/lift": "VR",
  "van": "VR",
  "gerd": "GERD",
  "dysphagia": "Dysphagia Overview",
  "dysphagia overview": "Dysphagia Overview",
  "diabetes": "Diabetes",
  "falls": "Falls",
  "health passport": "Health Passport",
  "hco": "HCO Training",
  "hco training": "HCO Training",
  "skills online": "Skills Online",
  "etis": "ETIS",
  "in-service": null,
  "general training": null,
};

function resolvePHSColumn(category: string, uploadType: string): string | null {
  const cat = category.toLowerCase().trim();
  const typ = uploadType.toLowerCase().trim();
  if (PHS_CATEGORY_MAP[cat]) return PHS_CATEGORY_MAP[cat];
  if (cat === "additional training") {
    if (PHS_ADDITIONAL_MAP[typ] !== undefined) return PHS_ADDITIONAL_MAP[typ];
    for (const [key, val] of Object.entries(PHS_ADDITIONAL_MAP)) {
      if (val && (typ.includes(key) || key.includes(typ))) return val;
    }
  }
  return null;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SmartSyncRow {
  employee: string;
  training: string;
  trainingDate: string;       // current value in Training sheet ("(empty)" if blank)
  paylocityDate: string;      // best from Paylocity Import
  phsDate: string;            // best from PHS Import
  phsHasDoc: boolean;         // PHS View File column was non-empty
  winner: string;             // proposed new date
  winnerSource: "paylocity" | "phs";
  confidence: "high" | "medium" | "conflict";
  conflictNote: string;       // set when confidence="conflict"
}

interface RosterGap {
  name: string;
  recentTraining: string;
  recentDate: string;
  suggestions?: NameSuggestion[];
  occurrences: number;
}

interface TrainingEvent {
  training: string;
  trainingName: string;
  date: string;
  attendees: string[];
  possiblyMissing: string[];
  source: "phs" | "paylocity";
}

interface BestRec {
  name: string;
  date: string;
  ts: number;
  hasDoc?: boolean;
}

export async function GET() {
  try {
    let trainingRows: string[][] = [];
    let paylocityRows: string[][] = [];
    let phsRows: string[][] = [];
    let settingsRows: string[][] = [];

    try {
      [trainingRows, paylocityRows, phsRows, settingsRows] = await Promise.all([
        readRange("Training"),
        readRange("Paylocity Import").catch(() => [] as string[][]),
        readRange("PHS Import").catch(() => [] as string[][]),
        readRange("'Hub Settings'").catch(() => [] as string[][]),
      ]);
    } catch {
      return Response.json({ error: "Could not read sheets." }, { status: 500 });
    }

    const nameMappings = loadNameMappings(settingsRows);

    if (trainingRows.length < 2) {
      return Response.json({ error: "Training sheet is empty." }, { status: 400 });
    }

    // ── Parse Training sheet ─────────────────────────────────────────────────
    const tHeaders = trainingRows[0];
    const tHdr = (label: string) =>
      tHeaders.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());
    const tLName = tHdr("L NAME");
    const tFName = tHdr("F NAME");
    const tActive = tHdr("ACTIVE");

    if (tLName < 0 || tFName < 0) {
      return Response.json({ error: "Training sheet missing L NAME / F NAME." }, { status: 400 });
    }

    // Build Training sheet lookup
    const trainingLookup: Array<{
      name: string;
      row: number;
      values: Record<string, string>;
    }> = [];
    // Track inactive employee names so we don't flag them as roster gaps
    const inactiveNames: string[] = [];

    for (let i = 1; i < trainingRows.length; i++) {
      const last = (trainingRows[i][tLName] || "").trim();
      const first = (trainingRows[i][tFName] || "").trim();
      if (!last) continue;
      const active =
        tActive >= 0
          ? (trainingRows[i][tActive] || "").toString().trim().toUpperCase()
          : "Y";
      if (active !== "Y") {
        inactiveNames.push(first ? `${last}, ${first}` : last);
        continue;
      }

      const values: Record<string, string> = {};
      for (const col of ALL_TRAINING_COLS) {
        const idx = tHeaders.findIndex((h) => h.trim() === col);
        if (idx >= 0) values[col] = (trainingRows[i][idx] || "").toString().trim();
      }
      trainingLookup.push({ name: first ? `${last}, ${first}` : last, row: i + 1, values });
    }

    // All active Training sheet names — used for suggestion matching
    const allActiveNames = trainingLookup.map((t) => t.name);

    // ── Deduplicate Paylocity → best date per (name, col) ───────────────────
    const bestPaylocity = new Map<string, BestRec>();
    const paylocityNoMatch: Map<string, { name: string; skill: string; date: string; count: number }> = new Map();

    if (paylocityRows.length >= 2) {
      const pH = paylocityRows[0];
      const pHdr = (l: string) => pH.findIndex((h) => h.trim().toLowerCase() === l.toLowerCase());
      const pLast = pHdr("last name");
      const pFirst = pHdr("first name");
      const pPref = pHdr("preferred/first name") >= 0 ? pHdr("preferred/first name") : pHdr("preferred name");
      const pSkill = pHdr("skill");
      const pDate =
        pHdr("effective/issue date") >= 0
          ? pHdr("effective/issue date")
          : pHdr("effective date") >= 0
          ? pHdr("effective date")
          : pHdr("issue date");

      if (pLast >= 0 && pFirst >= 0 && pSkill >= 0 && pDate >= 0) {
        for (let i = 1; i < paylocityRows.length; i++) {
          const row = paylocityRows[i];
          const lastName = (row[pLast] || "").trim();
          const firstName = (row[pFirst] || "").trim();
          const prefName = pPref >= 0 ? (row[pPref] || "").trim() : "";
          const skill = (row[pSkill] || "").trim();
          const dateRaw = (row[pDate] || "").toString().trim();
          if (!lastName || !firstName || !skill || !dateRaw) continue;

          const col = PAYLOCITY_SKILL_MAP[skill.toLowerCase()];
          if (!col) continue;

          const date = normalizeDate(dateRaw);
          if (!date) continue;
          const ts = parseToTimestamp(date);
          const displayFirst = prefName || firstName;
          const name = `${lastName}, ${displayFirst}`;
          const key = `${name.toLowerCase()}|${col}`;
          const existing = bestPaylocity.get(key);
          if (!existing || ts > existing.ts) {
            bestPaylocity.set(key, { name, date, ts });
          }
        }
      }
    }

    // ── Deduplicate PHS → best date per (name, col) ──────────────────────────
    const bestPHS = new Map<string, BestRec>();
    const phsNoMatch: Map<string, { name: string; category: string; date: string; col: string; count: number }> = new Map();

    // Track all PHS records for event detection
    // key = "col|date" → list of names that have this
    const phsEventGroups = new Map<string, Set<string>>();

    if (phsRows.length >= 2) {
      const pH = phsRows[0];
      const pHdr2 = (l: string) => pH.findIndex((h) => h.trim().toLowerCase() === l.toLowerCase());
      const pName = pHdr2("employee name");
      const pCat = pHdr2("upload category");
      const pType = pHdr2("upload type");
      const pEff = pHdr2("effective date");
      const pTerm = pHdr2("termination date");
      const pFile = pHdr2("view file");

      if (pName >= 0 && pCat >= 0 && pType >= 0 && pEff >= 0) {
        for (let i = 1; i < phsRows.length; i++) {
          const row = phsRows[i];
          const empName = (row[pName] || "").trim();
          const category = (row[pCat] || "").trim();
          const uploadType = (row[pType] || "").trim();
          const effRaw = (row[pEff] || "").toString().trim();
          const termRaw = pTerm >= 0 ? (row[pTerm] || "").toString().trim() : "";
          const fileUrl = pFile >= 0 ? (row[pFile] || "").toString().trim() : "";

          if (!empName || !category || !uploadType || !effRaw) continue;
          const typL = uploadType.toLowerCase();
          if (typL === "fail" || typL === "no show") continue;
          if (termRaw) continue;

          const col = resolvePHSColumn(category, uploadType);
          if (!col) continue;

          const date = normalizeDate(effRaw);
          if (!date) continue;
          const ts = parseToTimestamp(date);
          const hasDoc = fileUrl.length > 0;

          const key = `${empName.toLowerCase()}|${col}`;
          const existing = bestPHS.get(key);
          if (!existing || ts > existing.ts) {
            bestPHS.set(key, { name: empName, date, ts, hasDoc });
          }

          // Track for event detection
          const eventKey = `${col}|${date}`;
          if (!phsEventGroups.has(eventKey)) phsEventGroups.set(eventKey, new Set());
          phsEventGroups.get(eventKey)!.add(empName);
        }
      }
    }

    // ── Helper: resolve employee name against Training sheet ─────────────────
    function findEmployee(rawName: string): typeof trainingLookup[number] | null {
      const mappedName = nameMappings.get(rawName.toLowerCase());
      if (mappedName) {
        const m = trainingLookup.find((t) => namesMatch(t.name, mappedName));
        if (m) return m;
      }
      return trainingLookup.find((t) => namesMatch(t.name, rawName)) || null;
    }

    // ── Build per-employee comparison rows ───────────────────────────────────
    const rows: SmartSyncRow[] = [];
    let fromPaylocity = 0;
    let fromPHS = 0;
    const employeesAffected = new Set<string>();

    for (const emp of trainingLookup) {
      for (const col of ALL_TRAINING_COLS) {
        const rawTraining = emp.values[col] || "";

        // Skip excused cells
        if (isExcused(rawTraining)) continue;

        const trainingDate = rawTraining ? normalizeDate(rawTraining) : "";

        // Find best Paylocity date for this employee+col
        let payDate = "";
        let payKey = "";
        for (const [k, v] of bestPaylocity) {
          if (!k.endsWith(`|${col}`)) continue;
          const pName = k.split("|").slice(0, -1).join("|");
          const mapped = nameMappings.get(pName) || pName;
          if (namesMatch(emp.name, mapped) || namesMatch(emp.name, pName)) {
            payDate = v.date;
            payKey = k;
            break;
          }
        }

        // Find best PHS date for this employee+col
        let phsDate = "";
        let phsHasDoc = false;
        for (const [k, v] of bestPHS) {
          if (!k.endsWith(`|${col}`)) continue;
          const pName = k.split("|").slice(0, -1).join("|");
          const mapped = nameMappings.get(pName) || pName;
          if (namesMatch(emp.name, mapped) || namesMatch(emp.name, pName)) {
            phsDate = v.date;
            phsHasDoc = v.hasDoc || false;
            break;
          }
        }

        void payKey; // used for lookup only

        // Skip if no external source has data for this employee+training
        if (!payDate && !phsDate) continue;

        // Determine confidence and winner
        let confidence: SmartSyncRow["confidence"];
        let winner = "";
        let winnerSource: SmartSyncRow["winnerSource"] = "paylocity";
        let conflictNote = "";

        const payTs = payDate ? parseToTimestamp(payDate) : 0;
        const phsTs = phsDate ? parseToTimestamp(phsDate) : 0;
        const trainTs = trainingDate ? parseToTimestamp(trainingDate) : 0;

        if (payDate && phsDate) {
          if (datesEqual(payDate, phsDate)) {
            // Both external sources agree — highest confidence regardless of Training sheet
            winner = payDate;
            winnerSource = "paylocity";
            confidence = "high";
          } else if (trainingDate && datesEqual(payDate, trainingDate)) {
            // Paylocity + Training sheet agree, PHS differs
            winner = payDate;
            winnerSource = "paylocity";
            confidence = "medium";
            conflictNote = `PHS has ${phsDate}`;
          } else if (trainingDate && datesEqual(phsDate, trainingDate)) {
            // PHS + Training sheet agree, Paylocity differs
            winner = phsDate;
            winnerSource = "phs";
            // Two agreeing sources — HIGH if PHS has documentation, MEDIUM otherwise
            confidence = phsHasDoc ? "high" : "medium";
            conflictNote = `Paylocity has ${payDate}`;
          } else {
            // All 3 differ (or Training sheet is empty) — true conflict, user must pick
            if (payTs >= phsTs) {
              winner = payDate;
              winnerSource = "paylocity";
            } else {
              winner = phsDate;
              winnerSource = "phs";
            }
            confidence = "conflict";
            conflictNote = `Paylocity: ${payDate} · PHS: ${phsDate}` +
              (trainingDate ? ` · Training: ${trainingDate}` : "");
          }
        } else if (phsDate) {
          winner = phsDate;
          winnerSource = "phs";
          confidence = phsHasDoc ? "high" : "medium";
        } else {
          winner = payDate;
          winnerSource = "paylocity";
          confidence = "medium";
        }

        // If training sheet is already at or ahead of the proposed winner — skip
        if (trainingDate && trainTs >= parseToTimestamp(winner) && !datesEqual(trainingDate, "") && confidence !== "conflict") {
          continue;
        }

        // If no actual change needed
        if (trainingDate && datesEqual(trainingDate, winner)) continue;

        rows.push({
          employee: emp.name,
          training: col,
          trainingDate: trainingDate || "(empty)",
          paylocityDate: payDate,
          phsDate,
          phsHasDoc,
          winner,
          winnerSource,
          confidence,
          conflictNote,
        });

        employeesAffected.add(emp.name);
        if (winnerSource === "paylocity") fromPaylocity++;
        else fromPHS++;
      }
    }

    rows.sort((a, b) => {
      const confOrder: Record<string, number> = { conflict: 0, high: 1, medium: 2 };
      const cDiff = (confOrder[a.confidence] ?? 3) - (confOrder[b.confidence] ?? 3);
      return cDiff || a.employee.localeCompare(b.employee) || a.training.localeCompare(b.training);
    });

    // ── Roster gaps: Paylocity names not on Training sheet ───────────────────
    // Helper: check if a name matches a known inactive employee (ACTIVE=N)
    function isInactiveEmployee(rawName: string): boolean {
      const mappedName = nameMappings.get(rawName.toLowerCase());
      const checkName = mappedName || rawName;
      return inactiveNames.some((n) => namesMatch(n, checkName));
    }

    const payRosterGaps = new Map<string, { name: string; skill: string; date: string; count: number }>();
    for (const [k, v] of bestPaylocity) {
      const col = k.split("|").slice(-1)[0];
      const rawName = k.split("|").slice(0, -1).join("|");
      const matched = findEmployee(v.name) || findEmployee(rawName);
      if (matched) continue;
      // Skip employees who are inactive on the Training sheet — they may still
      // appear in Paylocity/PHS until payroll removes them
      if (isInactiveEmployee(v.name) || isInactiveEmployee(rawName)) continue;
      const existingGap = payRosterGaps.get(v.name.toLowerCase());
      if (!existingGap || parseToTimestamp(v.date) > parseToTimestamp(existingGap.date)) {
        payRosterGaps.set(v.name.toLowerCase(), { name: v.name, skill: col, date: v.date, count: (existingGap?.count || 0) + 1 });
      } else {
        existingGap.count++;
      }
    }

    const phsRosterGaps = new Map<string, { name: string; category: string; date: string; count: number }>();
    for (const [k, v] of bestPHS) {
      const col = k.split("|").slice(-1)[0];
      const rawName = k.split("|").slice(0, -1).join("|");
      const matched = findEmployee(v.name) || findEmployee(rawName);
      if (matched) continue;
      if (isInactiveEmployee(v.name) || isInactiveEmployee(rawName)) continue;
      const existingGap = phsRosterGaps.get(v.name.toLowerCase());
      if (!existingGap || parseToTimestamp(v.date) > parseToTimestamp(existingGap.date)) {
        phsRosterGaps.set(v.name.toLowerCase(), { name: v.name, category: col, date: v.date, count: (existingGap?.count || 0) + 1 });
      } else {
        existingGap.count++;
      }
    }

    const rosterFromPaylocity: RosterGap[] = [...payRosterGaps.values()]
      .map((g) => ({
        name: g.name,
        recentTraining: g.skill,
        recentDate: g.date,
        occurrences: g.count,
        suggestions: suggestNameMatches(g.name, allActiveNames),
      }))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 50);

    const rosterFromPHS: RosterGap[] = [...phsRosterGaps.values()]
      .map((g) => ({
        name: g.name,
        recentTraining: g.category,
        recentDate: g.date,
        occurrences: g.count,
        suggestions: suggestNameMatches(g.name, allActiveNames),
      }))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 50);

    // ── Training event detection ─────────────────────────────────────────────
    const trainingEvents: TrainingEvent[] = [];
    const trainingNameMap = new Map(TRAINING_DEFINITIONS.map((t) => [t.columnKey, t.name]));

    for (const [eventKey, attendeeNames] of phsEventGroups) {
      if (attendeeNames.size < 3) continue; // only flag group events (3+ people)
      const [col, date] = eventKey.split("|").reduce((acc, part, i) => {
        // eventKey = "col|date" but col might contain |
        if (i === 0) return [part, ""];
        return [acc[0], (acc[1] ? acc[1] + "|" : "") + part];
      }, ["", ""]);

      // Find which Training sheet employees have this date
      const verifiedAttendees: string[] = [];
      for (const empName of attendeeNames) {
        const match = findEmployee(empName);
        if (match) verifiedAttendees.push(match.name);
      }
      if (verifiedAttendees.length < 3) continue;

      // Find active employees missing this training entirely
      const possiblyMissing: string[] = [];
      for (const emp of trainingLookup) {
        const val = emp.values[col] || "";
        if (!val || val === "(empty)") {
          // Not already attending verified list
          if (!verifiedAttendees.includes(emp.name)) {
            possiblyMissing.push(emp.name);
          }
        }
      }

      if (possiblyMissing.length === 0) continue;

      trainingEvents.push({
        training: col,
        trainingName: trainingNameMap.get(col) || col,
        date,
        attendees: verifiedAttendees,
        possiblyMissing: possiblyMissing.slice(0, 20),
        source: "phs",
      });
    }

    // Sort events by attendee count desc
    trainingEvents.sort((a, b) => b.attendees.length - a.attendees.length);

    // ── Last sync timestamp ───────────────────────────────────────────────────
    let lastSyncAt: string | null = null;
    for (let i = 1; i < settingsRows.length; i++) {
      if ((settingsRows[i][0] || "").trim() === "sync_log") {
        try {
          const entry = JSON.parse((settingsRows[i][2] || "").trim());
          if (entry.source === "master-sync" && entry.timestamp) {
            lastSyncAt = entry.timestamp;
            break; // rows are most-recent-first in Hub Settings
          }
        } catch {}
      }
    }

    // ── Documentation audit ───────────────────────────────────────────────────
    let phsWithDoc = 0;
    let phsWithoutDoc = 0;
    const docAudit: Array<{ employee: string; training: string; phsDate: string; hasDoc: boolean }> = [];
    for (const [k, v] of bestPHS) {
      const col = k.split("|").slice(-1)[0];
      const match = findEmployee(v.name);
      if (!match) continue;
      if (v.hasDoc) phsWithDoc++;
      else phsWithoutDoc++;
      docAudit.push({ employee: match.name, training: col, phsDate: v.date, hasDoc: v.hasDoc || false });
    }
    docAudit.sort((a, b) => (a.hasDoc === b.hasDoc ? 0 : a.hasDoc ? 1 : -1)); // missing docs first

    return Response.json({
      rows,
      summary: {
        total: rows.length,
        high: rows.filter((r) => r.confidence === "high").length,
        medium: rows.filter((r) => r.confidence === "medium").length,
        conflicts: rows.filter((r) => r.confidence === "conflict").length,
        employeesAffected: employeesAffected.size,
        fromPaylocity,
        fromPHS,
        hasPaylocity: paylocityRows.length >= 2,
        hasPHS: phsRows.length >= 2,
      },
      rosterGaps: {
        fromPaylocity: rosterFromPaylocity,
        fromPHS: rosterFromPHS,
      },
      trainingEvents: trainingEvents.slice(0, 20),
      docAudit: docAudit.slice(0, 200),
      docSummary: { withDoc: phsWithDoc, withoutDoc: phsWithoutDoc },
      lastSyncAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fixes: FixEntry[] = (body.fixes || []).map(
      (f: { employee: string; training: string; date: string }) => ({
        employee: f.employee,
        training: f.training,
        date: f.date,
      })
    );

    if (fixes.length === 0) {
      return Response.json({ error: "No fixes provided." }, { status: 400 });
    }

    const result = await applyFixes(fixes);

    // Log to Hub Settings
    try {
      await addSyncLogEntry({
        timestamp: new Date().toISOString(),
        source: "master-sync",
        applied: result.matched,
        skipped: 0,
        errors: result.errors.length,
      });
    } catch {}

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
