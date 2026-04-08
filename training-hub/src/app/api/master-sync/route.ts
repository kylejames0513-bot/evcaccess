import { createServerClient } from "@/lib/supabase";
import { namesMatch, suggestNameMatches, type NameSuggestion } from "@/lib/name-utils";
import {
  normalizeDate,
  parseToTimestamp,
  datesEqual,
  loadNameMappingsFromSupabase,
  applyFixesToSupabase,
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
  trainingDate: string;
  paylocityDate: string;
  phsDate: string;
  phsHasDoc: boolean;
  winner: string;
  winnerSource: "paylocity" | "phs";
  confidence: "high" | "medium" | "conflict";
  conflictNote: string;
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

/**
 * Build a lookup of employee training data from Supabase.
 */
async function buildTrainingLookup(supabase: ReturnType<typeof createServerClient>) {
  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name, is_active")
    .order("last_name");

  const { data: trainingTypes } = await supabase
    .from("training_types")
    .select("id, column_key");

  const typeIdToColKey = new Map<string, string>();
  for (const tt of trainingTypes || []) {
    typeIdToColKey.set(tt.id, tt.column_key);
  }

  const empIds = (employees || []).map((e: any) => e.id);
  const { data: records } = await supabase
    .from("training_records")
    .select("employee_id, training_type_id, completion_date")
    .in("employee_id", empIds);

  const { data: excusals } = await supabase
    .from("excusals")
    .select("employee_id, training_type_id, reason")
    .in("employee_id", empIds);

  const empTrainingMap = new Map<string, Record<string, string>>();

  for (const rec of records || []) {
    const colKey = typeIdToColKey.get(rec.training_type_id);
    if (!colKey) continue;
    if (!empTrainingMap.has(rec.employee_id)) empTrainingMap.set(rec.employee_id, {});
    const map = empTrainingMap.get(rec.employee_id)!;
    if (rec.completion_date) {
      const d = new Date(rec.completion_date);
      map[colKey] = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    }
  }

  for (const exc of excusals || []) {
    const colKey = typeIdToColKey.get(exc.training_type_id);
    if (!colKey) continue;
    if (!empTrainingMap.has(exc.employee_id)) empTrainingMap.set(exc.employee_id, {});
    const map = empTrainingMap.get(exc.employee_id)!;
    if (!map[colKey]) {
      map[colKey] = exc.reason || "NA";
    }
  }

  const trainingLookup: Array<{
    name: string;
    row: number;
    values: Record<string, string>;
  }> = [];
  const inactiveNames: string[] = [];

  for (let i = 0; i < (employees || []).length; i++) {
    const emp = employees![i];
    const last = (emp.last_name || "").trim();
    const first = (emp.first_name || "").trim();
    if (!last) continue;
    const name = first ? `${last}, ${first}` : last;

    if (!emp.is_active) {
      inactiveNames.push(name);
      continue;
    }

    trainingLookup.push({
      name,
      row: i + 2,
      values: empTrainingMap.get(emp.id) || {},
    });
  }

  return { trainingLookup, inactiveNames };
}

export async function GET() {
  try {
    const supabase = createServerClient();

    const { trainingLookup, inactiveNames } = await buildTrainingLookup(supabase);
    const allActiveNames = trainingLookup.map((t) => t.name);
    const nameMappings = await loadNameMappingsFromSupabase(supabase);

    if (trainingLookup.length === 0) {
      return Response.json({ error: "No active employees found." }, { status: 400 });
    }

    // ── Deduplicate Paylocity → best date per (name, col) ───────────────────
    const bestPaylocity = new Map<string, BestRec>();
    let hasPaylocity = false;

    const { data: paylocityRows } = await supabase
      .from("paylocity_imports")
      .select("last_name, first_name, preferred_name, skill, effective_date");

    if (paylocityRows && paylocityRows.length > 0) {
      hasPaylocity = true;
      for (const row of paylocityRows) {
        const lastName = (row.last_name || "").trim();
        const firstName = (row.first_name || "").trim();
        const prefName = (row.preferred_name || "").trim();
        const skill = (row.skill || "").trim();
        const dateRaw = (row.effective_date || "").toString().trim();
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

    // ── Deduplicate PHS → best date per (name, col) ──────────────────────────
    const bestPHS = new Map<string, BestRec>();
    const phsEventGroups = new Map<string, Set<string>>();
    let hasPHS = false;

    const { data: phsRows } = await supabase
      .from("phs_imports")
      .select("employee_name, upload_category, upload_type, effective_date, termination_date, view_file");

    if (phsRows && phsRows.length > 0) {
      hasPHS = true;
      for (const row of phsRows) {
        const empName = (row.employee_name || "").trim();
        const category = (row.upload_category || "").trim();
        const uploadType = (row.upload_type || "").trim();
        const effRaw = (row.effective_date || "").toString().trim();
        const termRaw = (row.termination_date || "").toString().trim();
        const fileUrl = (row.view_file || "").toString().trim();

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

        const eventKey = `${col}|${date}`;
        if (!phsEventGroups.has(eventKey)) phsEventGroups.set(eventKey, new Set());
        phsEventGroups.get(eventKey)!.add(empName);
      }
    }

    // ── Helper: resolve employee name ────────────────────────────────────────
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
        if (isExcused(rawTraining)) continue;

        const trainingDate = rawTraining ? normalizeDate(rawTraining) : "";

        // Find best Paylocity date
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

        // Find best PHS date
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

        void payKey;
        if (!payDate && !phsDate) continue;

        let confidence: SmartSyncRow["confidence"];
        let winner = "";
        let winnerSource: SmartSyncRow["winnerSource"] = "paylocity";
        let conflictNote = "";

        const payTs = payDate ? parseToTimestamp(payDate) : 0;
        const phsTs = phsDate ? parseToTimestamp(phsDate) : 0;
        const trainTs = trainingDate ? parseToTimestamp(trainingDate) : 0;

        if (payDate && phsDate) {
          if (datesEqual(payDate, phsDate)) {
            winner = payDate;
            winnerSource = "paylocity";
            confidence = "high";
          } else if (trainingDate && datesEqual(payDate, trainingDate)) {
            winner = payDate;
            winnerSource = "paylocity";
            confidence = "medium";
            conflictNote = `PHS has ${phsDate}`;
          } else if (trainingDate && datesEqual(phsDate, trainingDate)) {
            winner = phsDate;
            winnerSource = "phs";
            confidence = phsHasDoc ? "high" : "medium";
            conflictNote = `Paylocity has ${payDate}`;
          } else {
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

        if (trainingDate && trainTs >= parseToTimestamp(winner) && !datesEqual(trainingDate, "") && confidence !== "conflict") {
          continue;
        }

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

    // ── Roster gaps ──────────────────────────────────────────────────────────
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
      if (attendeeNames.size < 3) continue;
      const [col, date] = eventKey.split("|").reduce((acc, part, i) => {
        if (i === 0) return [part, ""];
        return [acc[0], (acc[1] ? acc[1] + "|" : "") + part];
      }, ["", ""]);

      const verifiedAttendees: string[] = [];
      for (const empName of attendeeNames) {
        const match = findEmployee(empName);
        if (match) verifiedAttendees.push(match.name);
      }
      if (verifiedAttendees.length < 3) continue;

      const possiblyMissing: string[] = [];
      for (const emp of trainingLookup) {
        const val = emp.values[col] || "";
        if (!val || val === "(empty)") {
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

    trainingEvents.sort((a, b) => b.attendees.length - a.attendees.length);

    // ── Last sync timestamp ──────────────────────────────────────────────────
    let lastSyncAt: string | null = null;
    const { data: syncLogs } = await supabase
      .from("hub_settings")
      .select("value")
      .eq("type", "sync_log")
      .order("key", { ascending: false })
      .limit(10);

    for (const log of syncLogs || []) {
      try {
        const entry = JSON.parse(log.value);
        if (entry.source === "master-sync" && entry.timestamp) {
          lastSyncAt = entry.timestamp;
          break;
        }
      } catch {}
    }

    // ── Documentation audit ──────────────────────────────────────────────────
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
    docAudit.sort((a, b) => (a.hasDoc === b.hasDoc ? 0 : a.hasDoc ? 1 : -1));

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
        hasPaylocity,
        hasPHS,
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
    const supabase = createServerClient();
    const body = await request.json();
    const fixes: Array<{ employee: string; training: string; date: string }> = (body.fixes || []).map(
      (f: { employee: string; training: string; date: string }) => ({
        employee: f.employee,
        training: f.training,
        date: f.date,
      })
    );

    if (fixes.length === 0) {
      return Response.json({ error: "No fixes provided." }, { status: 400 });
    }

    const result = await applyFixesToSupabase(supabase, fixes);

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
