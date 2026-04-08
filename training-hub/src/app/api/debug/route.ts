import { createServerClient } from "@/lib/supabase";
import { getExcludedEmployees } from "@/lib/hub-settings";

export async function GET() {
  try {
    const supabase = createServerClient();

    // Fetch all employees
    const { data: employees, error } = await supabase
      .from("employees")
      .select("id, first_name, last_name, department, is_active");

    if (error) throw new Error(`Failed to load employees: ${error.message}`);
    if (!employees || employees.length === 0) return Response.json({ error: "No data" });

    const excluded = await getExcludedEmployees();
    const excludedSet = new Set(excluded.map((n: string) => n.toLowerCase()));

    let totalRows = 0;
    let blankNames = 0;
    let activeY = 0;
    let activeN = 0;
    let activeOther = 0;
    let excludedCount = 0;
    let noDivision = 0;
    const activeValues: Record<string, number> = {};
    const divisionCounts: Record<string, number> = {};

    for (const emp of employees) {
      const lastName = (emp.last_name || "").trim();
      const firstName = (emp.first_name || "").trim();

      if (!lastName) {
        blankNames++;
        continue;
      }
      totalRows++;

      const isActive = emp.is_active;
      const activeLabel = isActive === true ? "Y" : isActive === false ? "N" : "(empty)";

      // Track all active values
      activeValues[activeLabel] = (activeValues[activeLabel] || 0) + 1;

      if (isActive === true) {
        activeY++;
        const name = firstName ? `${lastName}, ${firstName}` : lastName;
        if (excludedSet.has(name.toLowerCase())) {
          excludedCount++;
          continue;
        }

        const div = (emp.department || "").trim();
        if (!div) noDivision++;
        else divisionCounts[div] = (divisionCounts[div] || 0) + 1;
      } else if (isActive === false) {
        activeN++;
      } else {
        activeOther++;
      }
    }

    return Response.json({
      totalRows,
      blankNames,
      activeY,
      activeN,
      activeOther,
      excludedCount,
      noDivision,
      netTracked: activeY - excludedCount,
      activeValues,
      divisionCounts,
      columnPositions: { lNameCol: 0, fNameCol: 1, activeCol: 2, divCol: 3 },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
