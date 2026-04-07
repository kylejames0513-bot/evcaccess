import { readRange } from "@/lib/google-sheets";
import { namesMatch } from "@/lib/name-utils";
import {
  normalizeDate,
  parseToTimestamp,
  datesEqual,
  loadNameMappings,
  applyFixes,
  FixEntry,
} from "@/lib/import-utils";
import { PAYLOCITY_SKILL_MAP } from "@/app/api/paylocity-audit/route";

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
  "post med": "POST MED",
  "pom": "POM",
  "person centered": "Pers Cent Thnk",
  "person centered thinking": "Pers Cent Thnk",
  "meaningful day": "Meaningful Day",
  "rights training": "Rights Training",
  "rights": "Rights Training",
  "title vi": "Title VI",
  "active shooter": "Active Shooter",
  "skills system": "Skills System",
  "cpm": "CPM",
  "pfh/didd": "PFH/DIDD",
  "basic vcrm": "Basic VCRM",
  "advanced vcrm": "Adv VCRM",
  "trn": "TRN",
  "asl": "ASL",
  "shift": "SHIFT",
  "van/lift": "VR",
  "gerd": "GERD",
  "dysphagia": "Dysphagia",
  "diabetes": "Diabetes",
  "falls": "Falls",
  "health passport": "Health Passport",
  "hco": "HCO",
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

// All tracked training columns (union of Paylocity + PHS maps)
// FIRSTAID is always included because it mirrors CPR (CPR/FA is one combined cert)
const ALL_TRAINING_COLS = new Set<string>([
  ...Object.values(PAYLOCITY_SKILL_MAP),
  ...Object.values(PHS_CATEGORY_MAP).filter(Boolean),
  ...Object.values(PHS_ADDITIONAL_MAP).filter((v): v is string => !!v),
  "FIRSTAID",
]);

export interface SyncRow {
  employee: string;
  training: string;
  trainingDate: string;   // current value in Training sheet
  paylocityDate: string;  // best from Paylocity Import (empty string if none)
  phsDate: string;        // best from PHS Import (empty string if none)
  winner: string;         // the most recent non-empty date
  winnerSource: "training" | "paylocity" | "phs";
  needsUpdate: boolean;   // winner differs from trainingDate
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

    const tHeaders = trainingRows[0];
    const tHdr = (label: string) =>
      tHeaders.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());
    const tLName = tHdr("L NAME");
    const tFName = tHdr("F NAME");
    const tActive = tHdr("ACTIVE");

    if (tLName < 0 || tFName < 0) {
      return Response.json({ error: "Training sheet missing L NAME / F NAME." }, { status: 400 });
    }

    // ── Build Training sheet lookup ──────────────────────────────────────────
    const trainingLookup: Array<{
      name: string;
      row: number;
      values: Record<string, string>;
    }> = [];

    for (let i = 1; i < trainingRows.length; i++) {
      const last = (trainingRows[i][tLName] || "").trim();
      const first = (trainingRows[i][tFName] || "").trim();
      if (!last) continue;
      const active =
        tActive >= 0
          ? (trainingRows[i][tActive] || "").toString().trim().toUpperCase()
          : "Y";
      if (active !== "Y") continue;

      const values: Record<string, string> = {};
      for (const col of ALL_TRAINING_COLS) {
        const idx = tHeaders.findIndex((h) => h.trim() === col);
        if (idx >= 0) values[col] = (trainingRows[i][idx] || "").toString().trim();
      }
      trainingLookup.push({ name: first ? `${last}, ${first}` : last, row: i + 1, values });
    }

    // ── Deduplicate Paylocity Import → best date per (name, trainingCol) ─────
    type BestRec = { name: string; date: string; ts: number };
    const bestPaylocity = new Map<string, BestRec>(); // key = "nameLower|col"

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

    // ── Deduplicate PHS Import → best date per (name, trainingCol) ───────────
    const bestPHS = new Map<string, BestRec>();

    if (phsRows.length >= 2) {
      const pH = phsRows[0];
      const pHdr = (l: string) => pH.findIndex((h) => h.trim().toLowerCase() === l.toLowerCase());
      const pName = pHdr("employee name");
      const pCat = pHdr("upload category");
      const pType = pHdr("upload type");
      const pEff = pHdr("effective date");
      const pTerm = pHdr("termination date");

      if (pName >= 0 && pCat >= 0 && pType >= 0 && pEff >= 0) {
        for (let i = 1; i < phsRows.length; i++) {
          const row = phsRows[i];
          const empName = (row[pName] || "").trim();
          const category = (row[pCat] || "").trim();
          const uploadType = (row[pType] || "").trim();
          const effRaw = (row[pEff] || "").toString().trim();
          const termRaw = pTerm >= 0 ? (row[pTerm] || "").toString().trim() : "";

          if (!empName || !category || !uploadType || !effRaw) continue;
          const typL = uploadType.toLowerCase();
          if (typL === "fail" || typL === "no show") continue;
          if (termRaw) continue;

          const col = resolvePHSColumn(category, uploadType);
          if (!col) continue;

          const date = normalizeDate(effRaw);
          if (!date) continue;
          const ts = parseToTimestamp(date);

          const key = `${empName.toLowerCase()}|${col}`;
          const existing = bestPHS.get(key);
          if (!existing || ts > existing.ts) {
            bestPHS.set(key, { name: empName, date, ts });
          }
        }
      }
    }

    // ── Build per-employee preview ────────────────────────────────────────────
    const rows: SyncRow[] = [];
    let fromPaylocity = 0;
    let fromPHS = 0;
    const employeesAffected = new Set<string>();

    for (const emp of trainingLookup) {
      for (const col of ALL_TRAINING_COLS) {
        const rawTraining = emp.values[col] || "";
        // Skip NA values entirely — don't auto-override manual NA flags
        if (rawTraining.toUpperCase() === "NA" || rawTraining.toUpperCase() === "N/A") continue;

        const trainingDate = rawTraining ? normalizeDate(rawTraining) : "";

        // Look up Paylocity best
        let payDate = "";
        for (const [k, v] of bestPaylocity) {
          if (!k.endsWith(`|${col}`)) continue;
          const payName = k.split("|").slice(0, -1).join("|");
          // Map to training sheet employee name
          const mappedName = nameMappings.get(payName) || payName;
          if (namesMatch(emp.name, mappedName) || namesMatch(emp.name, payName)) {
            payDate = v.date;
            break;
          }
        }

        // Look up PHS best
        let phsDate = "";
        for (const [k, v] of bestPHS) {
          if (!k.endsWith(`|${col}`)) continue;
          const phsName = k.split("|").slice(0, -1).join("|");
          const mappedName = nameMappings.get(phsName) || phsName;
          if (namesMatch(emp.name, mappedName) || namesMatch(emp.name, phsName)) {
            phsDate = v.date;
            break;
          }
        }

        // Skip if no external source has data for this employee+training
        if (!payDate && !phsDate && !trainingDate) continue;
        if (!payDate && !phsDate) continue; // nothing from external sources

        // Find winner: most recent across all three
        const candidates: Array<{ date: string; source: "training" | "paylocity" | "phs" }> = [];
        if (trainingDate) candidates.push({ date: trainingDate, source: "training" });
        if (payDate) candidates.push({ date: payDate, source: "paylocity" });
        if (phsDate) candidates.push({ date: phsDate, source: "phs" });

        candidates.sort((a, b) => parseToTimestamp(b.date) - parseToTimestamp(a.date));
        const best = candidates[0];

        const needsUpdate =
          !trainingDate ||
          (!datesEqual(trainingDate, best.date) && best.source !== "training");

        if (!needsUpdate) continue; // already up to date

        rows.push({
          employee: emp.name,
          training: col,
          trainingDate: trainingDate || "(empty)",
          paylocityDate: payDate,
          phsDate: phsDate,
          winner: best.date,
          winnerSource: best.source,
          needsUpdate: true,
        });

        employeesAffected.add(emp.name);
        if (best.source === "paylocity") fromPaylocity++;
        if (best.source === "phs") fromPHS++;
      }
    }

    // Sort by employee name then training column
    rows.sort((a, b) =>
      a.employee.localeCompare(b.employee) || a.training.localeCompare(b.training)
    );

    return Response.json({
      rows,
      summary: {
        total: rows.length,
        fromPaylocity,
        fromPHS,
        employeesAffected: employeesAffected.size,
        hasPaylocity: paylocityRows.length >= 2,
        hasPHS: phsRows.length >= 2,
      },
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
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
