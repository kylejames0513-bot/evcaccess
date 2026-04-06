import { readRange } from "@/lib/google-sheets";
import { namesMatch } from "@/lib/name-utils";

// Same mapping as Core.gs PAYLOCITY_SKILL_MAP
const SKILL_MAP: Record<string, string> = {
  "cpr.fa": "CPR",
  "cpr/fa": "CPR",
  "ukeru": "Ukeru",
  "mealtime instructions": "Mealtime",
  "med training": "MED_TRAIN",
  "post med": "POST MED",
  "pom": "POM",
  "pers cent thnk": "Pers Cent Thnk",
  "person centered thinking": "Pers Cent Thnk",
  "safety care": "Safety Care",
  "meaningful day": "Meaningful Day",
  "rights training": "Rights Training",
  "title vi": "Title VI",
  "active shooter": "Active Shooter",
  "skills system": "Skills System",
  "cpm": "CPM",
  "pfh/didd": "PFH/DIDD",
  "basic vcrm": "Basic VCRM",
  "trn": "TRN",
  "asl": "ASL",
  "shift": "SHIFT",
};

function normalizeDate(val: string): string {
  const s = val.trim();
  // M/D/YY → M/D/YYYY
  const short = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (short) {
    let yr = parseInt(short[3]);
    yr += yr < 50 ? 2000 : 1900;
    return `${parseInt(short[1])}/${parseInt(short[2])}/${yr}`;
  }
  // M/D/YYYY — strip leading zeros
  const full = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (full) return `${parseInt(full[1])}/${parseInt(full[2])}/${full[3]}`;
  // Try Date parse
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1990) {
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    }
  } catch {}
  return s;
}

interface Discrepancy {
  employee: string;
  training: string;
  trainingSheetDate: string;
  paylocityDate: string;
  issue: string; // "mismatch" | "missing_on_training" | "missing_on_paylocity" | "na_but_has_date"
}

export async function GET() {
  try {
    const [trainingRows, paylocityRows] = await Promise.all([
      readRange("Training"),
      readRange("Paylocity Import"),
    ]);

    if (trainingRows.length < 2) return Response.json({ error: "Training sheet empty" }, { status: 400 });
    if (paylocityRows.length < 2) return Response.json({ error: "Paylocity Import tab empty" }, { status: 400 });

    // Parse Training sheet headers
    const tHeaders = trainingRows[0];
    const tHdr = (label: string) => tHeaders.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());
    const tLName = tHdr("L NAME");
    const tFName = tHdr("F NAME");
    const tActive = tHdr("ACTIVE");

    // Parse Paylocity Import headers
    const pHeaders = paylocityRows[0];
    const pHdr = (label: string) => {
      const idx = pHeaders.findIndex((h) => h.trim().toLowerCase() === label.toLowerCase());
      return idx;
    };
    const pLast = pHdr("last name");
    const pFirst = pHdr("first name");
    const pPref = pHdr("preferred/first name") >= 0 ? pHdr("preferred/first name") : pHdr("preferred name");
    const pSkill = pHdr("skill");
    const pDate = pHdr("effective/issue date") >= 0 ? pHdr("effective/issue date") : (pHdr("effective date") >= 0 ? pHdr("effective date") : pHdr("issue date"));

    if (tLName < 0 || tFName < 0) return Response.json({ error: "Training sheet missing L NAME/F NAME" }, { status: 400 });
    if (pLast < 0 || pFirst < 0 || pSkill < 0 || pDate < 0) return Response.json({ error: "Paylocity Import missing required columns" }, { status: 400 });

    // Build Training sheet lookup: "last|first" → { row, training values }
    const trainingLookup: Array<{
      name: string;
      row: number;
      values: Record<string, string>; // columnKey → date string
    }> = [];

    for (let i = 1; i < trainingRows.length; i++) {
      const last = (trainingRows[i][tLName] || "").trim();
      const first = (trainingRows[i][tFName] || "").trim();
      if (!last) continue;
      const active = tActive >= 0 ? (trainingRows[i][tActive] || "").toString().trim().toUpperCase() : "Y";
      if (active !== "Y") continue;

      const values: Record<string, string> = {};
      for (const colKey of Object.values(SKILL_MAP)) {
        const colIdx = tHeaders.findIndex((h) => h.trim() === colKey);
        if (colIdx >= 0) {
          values[colKey] = (trainingRows[i][colIdx] || "").toString().trim();
        }
      }
      const name = first ? `${last}, ${first}` : last;
      trainingLookup.push({ name, row: i + 1, values });
    }

    // Process Paylocity Import — compare each entry
    const discrepancies: Discrepancy[] = [];
    const noMatch: Array<{ name: string; skill: string; date: string }> = [];
    const seen = new Map<string, Set<string>>(); // track processed name+training combos

    for (let i = 1; i < paylocityRows.length; i++) {
      const pLastName = (paylocityRows[i][pLast] || "").trim();
      const pFirstName = (paylocityRows[i][pFirst] || "").trim();
      const pPrefName = pPref >= 0 ? (paylocityRows[i][pPref] || "").trim() : "";
      const skill = (paylocityRows[i][pSkill] || "").trim();
      const dateVal = (paylocityRows[i][pDate] || "").toString().trim();

      if (!pLastName || !pFirstName || !skill || !dateVal) continue;

      const skillLower = skill.toLowerCase();
      const targetCol = SKILL_MAP[skillLower];
      if (!targetCol) continue; // Not a tracked training

      const payDate = normalizeDate(dateVal);
      if (!payDate) continue;

      const displayFirst = pPrefName || pFirstName;
      const payName = `${pLastName}, ${displayFirst}`;

      // Deduplicate: only check most recent date per person+training
      const dedupeKey = `${pLastName.toLowerCase()}|${displayFirst.toLowerCase()}|${targetCol}`;
      if (seen.has(dedupeKey)) continue;
      seen.set(dedupeKey, new Set());

      // Find on Training sheet
      const match = trainingLookup.find((t) => namesMatch(t.name, payName) || namesMatch(t.name, `${pLastName}, ${pFirstName}`));

      if (!match) {
        noMatch.push({ name: payName, skill, date: payDate });
        continue;
      }

      const trainingVal = match.values[targetCol] || "";
      const trainingDate = trainingVal ? normalizeDate(trainingVal) : "";

      // Compare
      if (!trainingVal) {
        discrepancies.push({
          employee: match.name,
          training: targetCol,
          trainingSheetDate: "(empty)",
          paylocityDate: payDate,
          issue: "missing_on_training",
        });
      } else if (trainingVal.toUpperCase() === "NA" || trainingVal.toUpperCase() === "N/A") {
        discrepancies.push({
          employee: match.name,
          training: targetCol,
          trainingSheetDate: trainingVal,
          paylocityDate: payDate,
          issue: "na_but_has_date",
        });
      } else if (trainingDate && payDate && trainingDate !== payDate) {
        discrepancies.push({
          employee: match.name,
          training: targetCol,
          trainingSheetDate: trainingDate,
          paylocityDate: payDate,
          issue: "mismatch",
        });
      }
    }

    // Sort: mismatches first, then missing, then NA
    const priority: Record<string, number> = { mismatch: 0, na_but_has_date: 1, missing_on_training: 2 };
    discrepancies.sort((a, b) => (priority[a.issue] ?? 3) - (priority[b.issue] ?? 3));

    return Response.json({
      discrepancies,
      noMatch: noMatch.slice(0, 50),
      summary: {
        total: discrepancies.length,
        mismatches: discrepancies.filter((d) => d.issue === "mismatch").length,
        missingOnTraining: discrepancies.filter((d) => d.issue === "missing_on_training").length,
        naButHasDate: discrepancies.filter((d) => d.issue === "na_but_has_date").length,
        noMatchCount: noMatch.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
