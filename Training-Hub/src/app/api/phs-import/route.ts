import { readRange } from "@/lib/google-sheets";
import { namesMatch } from "@/lib/name-utils";
import { normalizeDate, parseCSV, loadNameMappings } from "@/lib/import-utils";

// PHS skill/column mapping — maps PHS export column headers to Training sheet columns
const PHS_SKILL_MAP: Record<string, string> = {
  "cpr": "CPR",
  "cpr/fa": "CPR",
  "cpr/first aid": "CPR",
  "first aid": "CPR",
  "ukeru": "Ukeru",
  "mealtime": "Mealtime",
  "mealtime instructions": "Mealtime",
  "med training": "MED_TRAIN",
  "medication training": "MED_TRAIN",
  "med cert": "MED_TRAIN",
  "post med": "POST MED",
  "pom": "POM",
  "person centered": "Pers Cent Thnk",
  "person centered thinking": "Pers Cent Thnk",
  "safety care": "Safety Care",
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
  "van": "VR",
  "gerd": "GERD",
  "dysphagia": "Dysphagia",
  "diabetes": "Diabetes",
  "falls": "Falls",
  "health passport": "Health Passport",
  "hco": "HCO",
};

function matchTraining(header: string): string | null {
  const lower = header.toLowerCase().trim();
  if (PHS_SKILL_MAP[lower]) return PHS_SKILL_MAP[lower];
  // Partial match
  for (const [key, val] of Object.entries(PHS_SKILL_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return val;
  }
  return null;
}

interface ParsedRow {
  name: string;
  skill: string;
  date: string;
  matchedEmployee: string | null;
  matchedTraining: string | null;
  status: "matched" | "no_employee" | "no_training" | "no_date";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Parse file content
    let fileRows: string[][];
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".csv")) {
      const text = await file.text();
      fileRows = parseCSV(text);
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      // Dynamic import for xlsx
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, raw: false });
      fileRows = data.map((row) => row.map((cell) => String(cell ?? "")));
    } else {
      return Response.json({ error: "Unsupported file type. Upload a .csv or .xlsx file." }, { status: 400 });
    }

    if (fileRows.length < 2) {
      return Response.json({ error: "File is empty or has no data rows" }, { status: 400 });
    }

    // Load Training sheet for employee matching
    let trainingRows: string[][] = [];
    let settingsRows: string[][] = [];
    [trainingRows, settingsRows] = await Promise.all([
      readRange("Training"),
      readRange("'Hub Settings'").catch(() => [] as string[][]),
    ]);

    const nameMappings = loadNameMappings(settingsRows);

    // Build employee lookup from Training sheet
    const tHeaders = trainingRows[0] || [];
    const tHdr = (label: string) => tHeaders.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());
    const tLName = tHdr("L NAME");
    const tFName = tHdr("F NAME");
    const tActive = tHdr("ACTIVE");

    const employees: Array<{ name: string; row: number }> = [];
    if (tLName >= 0 && tFName >= 0) {
      for (let i = 1; i < trainingRows.length; i++) {
        const last = (trainingRows[i][tLName] || "").trim();
        const first = (trainingRows[i][tFName] || "").trim();
        if (!last) continue;
        const active = tActive >= 0 ? (trainingRows[i][tActive] || "").toString().trim().toUpperCase() : "Y";
        if (active !== "Y") continue;
        const name = first ? `${last}, ${first}` : last;
        employees.push({ name, row: i + 1 });
      }
    }

    // Parse PHS file headers — detect name and training columns
    const headers = fileRows[0].map((h) => h.trim());

    // Try to find name columns
    const lastNameIdx = headers.findIndex((h) => /^last\s*name$/i.test(h));
    const firstNameIdx = headers.findIndex((h) => /^first\s*name$/i.test(h));
    const fullNameIdx = headers.findIndex((h) => /^(name|employee|full\s*name)$/i.test(h));

    // Map header columns to training types
    const trainingColumns: Array<{ colIdx: number; header: string; trainingKey: string }> = [];
    const dateColumns: Array<{ colIdx: number; header: string }> = [];

    for (let c = 0; c < headers.length; c++) {
      if (c === lastNameIdx || c === firstNameIdx || c === fullNameIdx) continue;
      const matched = matchTraining(headers[c]);
      if (matched) {
        trainingColumns.push({ colIdx: c, header: headers[c], trainingKey: matched });
      }
    }

    // If no training columns found, try date column detection (skill + date columns)
    const skillIdx = headers.findIndex((h) => /^(skill|training|course|type)$/i.test(h));
    const dateIdx = headers.findIndex((h) => /^(date|effective|completion|completed|issue\s*date|effective.*(date|issue))$/i.test(h));

    const parsedRows: ParsedRow[] = [];

    if (trainingColumns.length > 0) {
      // Wide format: each training is a column with date values
      for (let r = 1; r < fileRows.length; r++) {
        const row = fileRows[r];
        let name = "";
        if (lastNameIdx >= 0 && firstNameIdx >= 0) {
          const last = (row[lastNameIdx] || "").trim();
          const first = (row[firstNameIdx] || "").trim();
          name = last && first ? `${last}, ${first}` : last || first;
        } else if (fullNameIdx >= 0) {
          name = (row[fullNameIdx] || "").trim();
        }
        if (!name) continue;

        for (const tc of trainingColumns) {
          const dateVal = (row[tc.colIdx] || "").toString().trim();
          if (!dateVal) continue;

          const normalizedDate = normalizeDate(dateVal);

          // Try to match employee
          const mappedName = nameMappings.get(name.toLowerCase());
          let matchedEmp = mappedName ? employees.find((e) => namesMatch(e.name, mappedName)) : null;
          if (!matchedEmp) {
            matchedEmp = employees.find((e) => namesMatch(e.name, name));
          }

          parsedRows.push({
            name,
            skill: tc.header,
            date: normalizedDate,
            matchedEmployee: matchedEmp?.name || null,
            matchedTraining: tc.trainingKey,
            status: matchedEmp ? "matched" : "no_employee",
          });
        }
      }
    } else if (skillIdx >= 0 && dateIdx >= 0) {
      // Long format: each row has a skill and date
      for (let r = 1; r < fileRows.length; r++) {
        const row = fileRows[r];
        let name = "";
        if (lastNameIdx >= 0 && firstNameIdx >= 0) {
          const last = (row[lastNameIdx] || "").trim();
          const first = (row[firstNameIdx] || "").trim();
          name = last && first ? `${last}, ${first}` : last || first;
        } else if (fullNameIdx >= 0) {
          name = (row[fullNameIdx] || "").trim();
        }
        if (!name) continue;

        const skill = (row[skillIdx] || "").trim();
        const dateVal = (row[dateIdx] || "").toString().trim();
        if (!skill) continue;

        const trainingKey = matchTraining(skill);
        const normalizedDate = dateVal ? normalizeDate(dateVal) : "";

        const mappedName = nameMappings.get(name.toLowerCase());
        let matchedEmp = mappedName ? employees.find((e) => namesMatch(e.name, mappedName)) : null;
        if (!matchedEmp) {
          matchedEmp = employees.find((e) => namesMatch(e.name, name));
        }

        let status: ParsedRow["status"] = "matched";
        if (!matchedEmp) status = "no_employee";
        else if (!trainingKey) status = "no_training";
        else if (!normalizedDate) status = "no_date";

        parsedRows.push({
          name,
          skill,
          date: normalizedDate,
          matchedEmployee: matchedEmp?.name || null,
          matchedTraining: trainingKey,
          status,
        });
      }
    } else {
      return Response.json({
        error: "Could not detect file format. Expected columns: Last Name + First Name (or Name), and either training columns (CPR, Ukeru, etc.) or Skill + Date columns.",
        rows: [],
        summary: { total: 0, matched: 0, unmatched: 0 },
      }, { status: 400 });
    }

    const matched = parsedRows.filter((r) => r.status === "matched").length;

    return Response.json({
      rows: parsedRows,
      headers: headers,
      trainingColumns: trainingColumns.map((tc) => ({ header: tc.header, trainingKey: tc.trainingKey })),
      summary: {
        total: parsedRows.length,
        matched,
        noEmployee: parsedRows.filter((r) => r.status === "no_employee").length,
        noTraining: parsedRows.filter((r) => r.status === "no_training").length,
        noDate: parsedRows.filter((r) => r.status === "no_date").length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
