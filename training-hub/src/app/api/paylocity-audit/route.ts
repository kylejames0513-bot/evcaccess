import { readRange } from "@/lib/google-sheets";
import { namesMatch, suggestNameMatches, type NameSuggestion } from "@/lib/name-utils";
import { normalizeDate, datesEqual, loadNameMappings } from "@/lib/import-utils";

// Same mapping as Core.gs PAYLOCITY_SKILL_MAP
export const PAYLOCITY_SKILL_MAP: Record<string, string> = {
  // CPR / First Aid
  "cpr.fa": "CPR",
  "cpr/fa": "CPR",
  "cpr": "CPR",
  "first aid": "FIRSTAID",
  "firstaid": "FIRSTAID",
  "cpr/first aid": "CPR",
  // Med
  "med training": "MED_TRAIN",
  "med cert": "MED_TRAIN",
  "med recert": "MED_TRAIN",
  "medication training": "MED_TRAIN",
  "initial med training": "MED_TRAIN",
  "post med": "POST MED",
  // Core trainings
  "ukeru": "Ukeru",
  "safety care": "Safety Care",
  "mealtime instructions": "Mealtime",
  "mealtime": "Mealtime",
  "pom": "POM",
  "poms": "POM",
  "pers cent thnk": "Pers Cent Thnk",
  "person centered thinking": "Pers Cent Thnk",
  "person centered": "Pers Cent Thnk",
  "meaningful day": "Meaningful Day",
  "md refresh": "MD refresh",
  "rights training": "Rights Training",
  "title vi": "Title VI",
  "active shooter": "Active Shooter",
  "skills system": "Skills System",
  "cpi": "CPI",
  "cpm": "CPM",
  "pfh/didd": "PFH/DIDD",
  // VCRM
  "basic vcrm": "Basic VCRM",
  "advanced vcrm": "Advanced VCRM",
  "adv vcrm": "Advanced VCRM",
  // Other
  "trn": "TRN",
  "asl": "ASL",
  "shift": "SHIFT",
  "adv shift": "ADV SHIFT",
  "advanced shift": "ADV SHIFT",
  "mc": "MC",
  "skills online": "Skills Online",
  "etis": "ETIS",
  // Health / clinical
  "gerd": "GERD",
  "dysphagia": "Dysphagia Overview",
  "dysphagia overview": "Dysphagia Overview",
  "diabetes": "Diabetes",
  "falls": "Falls",
  "health passport": "Health Passport",
  "hco": "HCO Training",
  "hco training": "HCO Training",
  // Van / driving
  "van/lift": "VR",
  "van lift": "VR",
  "van": "VR",
  "drivers license": "VR",
  "driver's license": "VR",
};

interface Discrepancy {
  employee: string;
  training: string;
  trainingSheetDate: string;
  paylocityDate: string;
  issue: string; // "mismatch" | "missing_on_training" | "missing_on_paylocity" | "na_but_has_date"
}

export async function GET() {
  try {
    let trainingRows: string[][] = [];
    let paylocityRows: string[][] = [];
    let settingsRows: string[][] = [];
    try {
      [trainingRows, paylocityRows, settingsRows] = await Promise.all([
        readRange("Training"),
        readRange("Paylocity Import"),
        readRange("'Hub Settings'").catch(() => [] as string[][]),
      ]);
    } catch {
      return Response.json({
        error: "Could not read sheets. Make sure both 'Training' and 'Paylocity Import' tabs exist.",
        discrepancies: [], noMatch: [],
        summary: { total: 0, mismatches: 0, missingOnTraining: 0, naButHasDate: 0, noMatchCount: 0 },
      });
    }

    // Load name mappings from Hub Settings
    const nameMappings = loadNameMappings(settingsRows);

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

    const inactiveNames: string[] = [];

    for (let i = 1; i < trainingRows.length; i++) {
      const last = (trainingRows[i][tLName] || "").trim();
      const first = (trainingRows[i][tFName] || "").trim();
      if (!last) continue;
      const active = tActive >= 0 ? (trainingRows[i][tActive] || "").toString().trim().toUpperCase() : "Y";
      if (active !== "Y") {
        inactiveNames.push(first ? `${last}, ${first}` : last);
        continue;
      }

      const values: Record<string, string> = {};
      for (const colKey of Object.values(PAYLOCITY_SKILL_MAP)) {
        const colIdx = tHeaders.findIndex((h) => h.trim() === colKey);
        if (colIdx >= 0) {
          values[colKey] = (trainingRows[i][colIdx] || "").toString().trim();
        }
      }
      const name = first ? `${last}, ${first}` : last;
      trainingLookup.push({ name, row: i + 1, values });
    }

    // All active Training sheet names for suggestion matching
    const allActiveNames = trainingLookup.map((t) => t.name);

    // Process Paylocity Import — compare each entry
    const discrepancies: Discrepancy[] = [];
    const noMatch: Array<{ name: string; skill: string; date: string; suggestions: NameSuggestion[] }> = [];
    const seen = new Map<string, Set<string>>(); // track processed name+training combos

    for (let i = 1; i < paylocityRows.length; i++) {
      const pLastName = (paylocityRows[i][pLast] || "").trim();
      const pFirstName = (paylocityRows[i][pFirst] || "").trim();
      const pPrefName = pPref >= 0 ? (paylocityRows[i][pPref] || "").trim() : "";
      const skill = (paylocityRows[i][pSkill] || "").trim();
      const dateVal = (paylocityRows[i][pDate] || "").toString().trim();

      if (!pLastName || !pFirstName || !skill || !dateVal) continue;

      const skillLower = skill.toLowerCase();
      const targetCol = PAYLOCITY_SKILL_MAP[skillLower];
      if (!targetCol) continue; // Not a tracked training

      const payDate = normalizeDate(dateVal);
      if (!payDate) continue;

      const displayFirst = pPrefName || pFirstName;
      const payName = `${pLastName}, ${displayFirst}`;

      // Deduplicate: only check most recent date per person+training
      const dedupeKey = `${pLastName.toLowerCase()}|${displayFirst.toLowerCase()}|${targetCol}`;
      if (seen.has(dedupeKey)) continue;
      seen.set(dedupeKey, new Set());

      // Find on Training sheet — check name mapping first
      const mappedName = nameMappings.get(payName.toLowerCase()) || nameMappings.get(`${pLastName}, ${pFirstName}`.toLowerCase());
      let match = mappedName
        ? trainingLookup.find((t) => namesMatch(t.name, mappedName))
        : null;

      if (!match) {
        match = trainingLookup.find((t) => namesMatch(t.name, payName) || namesMatch(t.name, `${pLastName}, ${pFirstName}`));
      }

      if (!match) {
        // Skip inactive employees — they may still appear in Paylocity until payroll removes them
        const isInactive = inactiveNames.some((n) => namesMatch(n, payName) || namesMatch(n, `${pLastName}, ${pFirstName}`));
        if (!isInactive) {
          const suggestions = suggestNameMatches(payName, allActiveNames);
          noMatch.push({ name: payName, skill, date: payDate, suggestions });
        }
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
      } else if (trainingDate && payDate && !datesEqual(trainingDate, payDate)) {
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
