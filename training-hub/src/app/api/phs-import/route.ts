import { readRange } from "@/lib/google-sheets";
import { namesMatch, suggestNameMatches, type NameSuggestion } from "@/lib/name-utils";
import { normalizeDate, datesEqual, loadNameMappings } from "@/lib/import-utils";

// All known Training column keys from PHS data
// Maps (Upload Category, Upload Type) → Training sheet column key
// For "Additional Training", Upload Type itself is the training name — use keyword matching below
const CATEGORY_TYPE_MAP: Record<string, string> = {
  "med admin": "MED_TRAIN",
  "cpr/fa": "CPR",
};

// For "Additional Training" rows, match the Upload Type against known training names
const ADDITIONAL_TRAINING_MAP: Record<string, string | null> = {
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
  "advanced vcrm": "Advanced VCRM",
  "trn": "TRN",
  "asl": "ASL",
  "shift": "SHIFT",
  "gerd": "GERD",
  "dysphagia": "Dysphagia Overview",
  "dysphagia overview": "Dysphagia Overview",
  "diabetes": "Diabetes",
  "falls": "Falls",
  "health passport": "Health Passport",
  "hco": "HCO Training",
  "hco training": "HCO Training",
  "in-service": null, // too generic — skip unless matched by keyword below
  "general training": null, // too generic
};

function resolveTrainingColumn(category: string, uploadType: string): string | null {
  const catLower = category.toLowerCase().trim();
  const typeLower = uploadType.toLowerCase().trim();

  // Direct category mapping (non-Additional Training)
  if (CATEGORY_TYPE_MAP[catLower]) return CATEGORY_TYPE_MAP[catLower];

  // Additional Training: match on Upload Type value
  if (catLower === "additional training") {
    if (ADDITIONAL_TRAINING_MAP[typeLower] !== undefined) {
      return ADDITIONAL_TRAINING_MAP[typeLower]; // may be null for generic types
    }
    // Partial match
    for (const [key, val] of Object.entries(ADDITIONAL_TRAINING_MAP)) {
      if (val && (typeLower.includes(key) || key.includes(typeLower))) return val;
    }
  }

  return null;
}

interface Discrepancy {
  employee: string;
  training: string;
  trainingSheetDate: string;
  phsDate: string;
  issue: "mismatch" | "missing_on_training" | "na_but_has_date";
}

export async function GET() {
  try {
    let trainingRows: string[][] = [];
    let phsRows: string[][] = [];
    let settingsRows: string[][] = [];

    try {
      [trainingRows, phsRows, settingsRows] = await Promise.all([
        readRange("Training"),
        readRange("PHS Import"),
        readRange("'Hub Settings'").catch(() => [] as string[][]),
      ]);
    } catch {
      return Response.json({
        error: "Could not read sheets. Make sure both 'Training' and 'PHS Import' tabs exist.",
        discrepancies: [],
        noMatch: [],
        summary: { total: 0, mismatches: 0, missingOnTraining: 0, naButHasDate: 0, noMatchCount: 0 },
      });
    }

    const nameMappings = loadNameMappings(settingsRows);

    if (trainingRows.length < 2) return Response.json({ error: "Training sheet is empty" }, { status: 400 });
    if (phsRows.length < 2) return Response.json({ error: "PHS Import tab is empty" }, { status: 400 });

    // Parse Training sheet
    const tHeaders = trainingRows[0];
    const tHdr = (label: string) => tHeaders.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());
    const tLName = tHdr("L NAME");
    const tFName = tHdr("F NAME");
    const tActive = tHdr("ACTIVE");

    if (tLName < 0 || tFName < 0) {
      return Response.json({ error: "Training sheet missing L NAME / F NAME columns" }, { status: 400 });
    }

    // Collect all known training column keys for lookup
    const allTrainingCols = new Set<string>([
      ...Object.values(CATEGORY_TYPE_MAP).filter(Boolean),
      ...Object.values(ADDITIONAL_TRAINING_MAP).filter((v): v is string => !!v),
    ]);

    // Build Training sheet lookup: active employees with their current training dates
    const trainingLookup: Array<{
      name: string;
      row: number;
      values: Record<string, string>;
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
      for (const colKey of allTrainingCols) {
        const colIdx = tHeaders.findIndex((h) => h.trim() === colKey);
        if (colIdx >= 0) {
          values[colKey] = (trainingRows[i][colIdx] || "").toString().trim();
        }
      }
      const name = first ? `${last}, ${first}` : last;
      trainingLookup.push({ name, row: i + 1, values });
    }

    const allActiveNames = trainingLookup.map((t) => t.name);

    // Parse PHS Import headers
    const pHeaders = phsRows[0];
    const pHdr = (label: string) => pHeaders.findIndex((h) => h.trim().toLowerCase() === label.toLowerCase());

    const pName = pHdr("employee name");
    const pCategory = pHdr("upload category");
    const pType = pHdr("upload type");
    const pEffective = pHdr("effective date");
    const pTermination = pHdr("termination date");

    if (pName < 0 || pCategory < 0 || pType < 0 || pEffective < 0) {
      return Response.json({
        error: "PHS Import tab missing required columns. Expected: Employee Name, Upload Category, Upload Type, Effective Date.",
      }, { status: 400 });
    }

    // Step 1: Deduplicate — for each (employee, training column), keep most recent valid record
    // Valid = not Fail/No Show, no Termination Date, with an Effective Date
    type BestRecord = { name: string; category: string; uploadType: string; date: string; timestamp: number };
    const bestRecords = new Map<string, BestRecord>(); // key = "name_lower|training_col"

    for (let i = 1; i < phsRows.length; i++) {
      const row = phsRows[i];
      const empName = (row[pName] || "").trim();
      const category = (row[pCategory] || "").trim();
      const uploadType = (row[pType] || "").trim();
      const effectiveDateRaw = (row[pEffective] || "").toString().trim();
      const terminationDateRaw = pTermination >= 0 ? (row[pTermination] || "").toString().trim() : "";

      if (!empName || !category || !uploadType || !effectiveDateRaw) continue;

      // Skip invalid records
      const typeLower = uploadType.toLowerCase();
      if (typeLower === "fail" || typeLower === "no show") continue;
      if (terminationDateRaw) continue; // terminated cert

      const trainingCol = resolveTrainingColumn(category, uploadType);
      if (!trainingCol) continue; // can't map to a Training column

      const normalizedDate = normalizeDate(effectiveDateRaw);
      if (!normalizedDate) continue;

      // Parse date to timestamp for comparison
      const parts = normalizedDate.split("/");
      let ts = 0;
      if (parts.length === 3) {
        const [m, d, y] = parts.map(Number);
        ts = new Date(y, m - 1, d).getTime();
      }

      const dedupeKey = `${empName.toLowerCase()}|${trainingCol}`;
      const existing = bestRecords.get(dedupeKey);
      if (!existing || ts > existing.timestamp) {
        bestRecords.set(dedupeKey, { name: empName, category, uploadType, date: normalizedDate, timestamp: ts });
      }
    }

    // Step 2: Compare each best record against Training sheet
    const discrepancies: Discrepancy[] = [];
    const noMatch: Array<{ name: string; category: string; date: string; suggestions: NameSuggestion[] }> = [];

    for (const [dedupeKey, record] of bestRecords) {
      const trainingCol = dedupeKey.split("|").slice(1).join("|"); // everything after first pipe

      // Find employee on Training sheet
      const mappedName = nameMappings.get(record.name.toLowerCase());
      let match = mappedName
        ? trainingLookup.find((t) => namesMatch(t.name, mappedName))
        : null;
      if (!match) {
        match = trainingLookup.find((t) => namesMatch(t.name, record.name));
      }

      if (!match) {
        // Skip inactive employees — still in PHS until payroll removes them
        const isInactive = inactiveNames.some((n) => namesMatch(n, record.name));
        if (!isInactive) {
          noMatch.push({
            name: record.name,
            category: `${record.category} / ${record.uploadType}`,
            date: record.date,
            suggestions: suggestNameMatches(record.name, allActiveNames),
          });
        }
        continue;
      }

      const trainingVal = match.values[trainingCol] || "";
      const trainingDate = trainingVal ? normalizeDate(trainingVal) : "";

      if (!trainingVal) {
        discrepancies.push({
          employee: match.name,
          training: trainingCol,
          trainingSheetDate: "(empty)",
          phsDate: record.date,
          issue: "missing_on_training",
        });
      } else if (trainingVal.toUpperCase() === "NA" || trainingVal.toUpperCase() === "N/A") {
        discrepancies.push({
          employee: match.name,
          training: trainingCol,
          trainingSheetDate: trainingVal,
          phsDate: record.date,
          issue: "na_but_has_date",
        });
      } else if (trainingDate && record.date && !datesEqual(trainingDate, record.date)) {
        discrepancies.push({
          employee: match.name,
          training: trainingCol,
          trainingSheetDate: trainingDate,
          phsDate: record.date,
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
