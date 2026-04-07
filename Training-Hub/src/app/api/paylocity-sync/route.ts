import { readRange } from "@/lib/google-sheets";
import { namesMatch } from "@/lib/name-utils";
import { normalizeDate, datesEqual, applyFixes, loadNameMappings } from "@/lib/import-utils";
import { addSyncLogEntry } from "@/lib/hub-settings";
import { PAYLOCITY_SKILL_MAP } from "@/app/api/paylocity-audit/route";

export async function POST() {
  try {
    let trainingRows: string[][] = [];
    let paylocityRows: string[][] = [];
    let settingsRows: string[][] = [];

    [trainingRows, paylocityRows, settingsRows] = await Promise.all([
      readRange("Training"),
      readRange("Paylocity Import"),
      readRange("'Hub Settings'").catch(() => [] as string[][]),
    ]);

    if (trainingRows.length < 2 || paylocityRows.length < 2) {
      return Response.json({ error: "Training or Paylocity Import sheet is empty" }, { status: 400 });
    }

    const nameMappings = loadNameMappings(settingsRows);

    // Parse Training sheet
    const tHeaders = trainingRows[0];
    const tHdr = (label: string) => tHeaders.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());
    const tLName = tHdr("L NAME");
    const tFName = tHdr("F NAME");
    const tActive = tHdr("ACTIVE");

    // Parse Paylocity Import
    const pHeaders = paylocityRows[0];
    const pHdr = (label: string) => pHeaders.findIndex((h) => h.trim().toLowerCase() === label.toLowerCase());
    const pLast = pHdr("last name");
    const pFirst = pHdr("first name");
    const pPref = pHdr("preferred/first name") >= 0 ? pHdr("preferred/first name") : pHdr("preferred name");
    const pSkill = pHdr("skill");
    const pDate = pHdr("effective/issue date") >= 0 ? pHdr("effective/issue date") : (pHdr("effective date") >= 0 ? pHdr("effective date") : pHdr("issue date"));

    if (tLName < 0 || tFName < 0 || pLast < 0 || pFirst < 0 || pSkill < 0 || pDate < 0) {
      return Response.json({ error: "Required columns not found" }, { status: 400 });
    }

    // Build Training sheet lookup
    const trainingLookup: Array<{ name: string; values: Record<string, string> }> = [];
    for (let i = 1; i < trainingRows.length; i++) {
      const last = (trainingRows[i][tLName] || "").trim();
      const first = (trainingRows[i][tFName] || "").trim();
      if (!last) continue;
      const active = tActive >= 0 ? (trainingRows[i][tActive] || "").toString().trim().toUpperCase() : "Y";
      if (active !== "Y") continue;

      const values: Record<string, string> = {};
      for (const colKey of Object.values(PAYLOCITY_SKILL_MAP)) {
        const colIdx = tHeaders.findIndex((h) => h.trim() === colKey);
        if (colIdx >= 0) values[colKey] = (trainingRows[i][colIdx] || "").toString().trim();
      }
      trainingLookup.push({ name: first ? `${last}, ${first}` : last, values });
    }

    // Process: only auto-apply safe fixes (missing_on_training)
    const fixes: Array<{ employee: string; training: string; date: string }> = [];
    let skippedMismatches = 0;
    let skippedNA = 0;
    let noMatchCount = 0;
    const seen = new Set<string>();

    for (let i = 1; i < paylocityRows.length; i++) {
      const pLastName = (paylocityRows[i][pLast] || "").trim();
      const pFirstName = (paylocityRows[i][pFirst] || "").trim();
      const pPrefName = pPref >= 0 ? (paylocityRows[i][pPref] || "").trim() : "";
      const skill = (paylocityRows[i][pSkill] || "").trim();
      const dateVal = (paylocityRows[i][pDate] || "").toString().trim();

      if (!pLastName || !pFirstName || !skill || !dateVal) continue;

      const targetCol = PAYLOCITY_SKILL_MAP[skill.toLowerCase()];
      if (!targetCol) continue;

      const payDate = normalizeDate(dateVal);
      if (!payDate) continue;

      const displayFirst = pPrefName || pFirstName;
      const payName = `${pLastName}, ${displayFirst}`;
      const dedupeKey = `${pLastName.toLowerCase()}|${displayFirst.toLowerCase()}|${targetCol}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const mappedName = nameMappings.get(payName.toLowerCase()) || nameMappings.get(`${pLastName}, ${pFirstName}`.toLowerCase());
      let match = mappedName ? trainingLookup.find((t) => namesMatch(t.name, mappedName)) : null;
      if (!match) match = trainingLookup.find((t) => namesMatch(t.name, payName) || namesMatch(t.name, `${pLastName}, ${pFirstName}`));

      if (!match) { noMatchCount++; continue; }

      const trainingVal = match.values[targetCol] || "";
      const trainingDate = trainingVal ? normalizeDate(trainingVal) : "";

      if (!trainingVal) {
        // Safe to auto-apply: empty cell on Training sheet, has date on Paylocity
        fixes.push({ employee: match.name, training: targetCol, date: payDate });
      } else if (trainingVal.toUpperCase() === "NA" || trainingVal.toUpperCase() === "N/A") {
        skippedNA++;
      } else if (trainingDate && payDate && !datesEqual(trainingDate, payDate)) {
        skippedMismatches++;
      }
    }

    // Apply fixes
    let applied = 0;
    const errors: string[] = [];
    if (fixes.length > 0) {
      const result = await applyFixes(fixes);
      applied = result.matched;
      errors.push(...result.errors);
    }

    // Log the sync
    await addSyncLogEntry({
      timestamp: new Date().toISOString(),
      source: "paylocity",
      applied,
      skipped: skippedMismatches + skippedNA,
      errors: errors.length,
    });

    return Response.json({
      applied,
      skippedMismatches,
      skippedNA,
      noMatchCount,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
