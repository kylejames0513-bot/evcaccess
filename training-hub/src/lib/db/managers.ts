// ============================================================
// Manager/supervisor derivation helpers. Server-only.
// ============================================================
// The employees table doesn't have a manager_id field, so we derive
// the set of "managers" for a group of employees by matching
// job_title keywords against the same department. This is good
// enough for the class-memo feature, which wants a "please forward
// to" list per department. HR can edit the generated memo before
// sending it, so false positives/negatives are correctable.
//
// Keywords were chosen by inspecting the live job_title distribution
// and covering every layer of org structure except Lead Teacher.
// Lead Teacher is DSP-level at Children Services so it isn't
// included as a manager; if that's wrong, add "lead teacher" to
// MANAGER_KEYWORDS.
// ============================================================

import { createServerClient } from "@/lib/supabase";
import type { Employee } from "@/types/database";

const MANAGER_KEYWORDS = [
  "director",
  "manager",
  "supervisor",
  "coordinator",
];

export interface ManagerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  department: string | null;
}

/**
 * For a given set of departments, return the managers grouped by
 * department. A "manager" is any active employee whose job_title
 * case-insensitively contains one of MANAGER_KEYWORDS.
 *
 * Example: departments = ["Residential", "Children Services"]
 *   → Map {
 *       "Residential" => [Residential Director, Assistant Director, Residential Manager x5, Home Manager x17, ...],
 *       "Children Services" => [ELC Director, ELC Assistant Director, ...]
 *     }
 *
 * Deduped by employee id. Sorted by job_title seniority (Director >
 * Assistant Director > Manager > Supervisor > Coordinator) then by
 * last_name within each rank.
 */
export async function getManagersByDepartment(
  departments: string[]
): Promise<Map<string, ManagerRow[]>> {
  const result = new Map<string, ManagerRow[]>();
  if (departments.length === 0) return result;

  const uniqueDepts = Array.from(
    new Set(departments.filter((d): d is string => !!d && d.trim().length > 0))
  );
  if (uniqueDepts.length === 0) return result;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, job_title, department")
    .eq("is_active", true)
    .in("department", uniqueDepts);

  if (error) throw new Error(`Failed to load managers: ${error.message}`);

  // Filter in JS: case-insensitive keyword match on job_title.
  // Doing this in SQL would require building a large `or=(...)` clause
  // which PostgREST doesn't love, and department is already the main
  // selector so the result set is small.
  const managers = ((data ?? []) as Employee[])
    .filter((emp) => matchesManagerKeyword(emp.job_title))
    .map(
      (emp): ManagerRow => ({
        id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        email: emp.email,
        job_title: emp.job_title,
        department: emp.department,
      })
    );

  for (const dept of uniqueDepts) {
    const forDept = managers
      .filter((m) => m.department === dept)
      .sort(compareManagers);
    result.set(dept, forDept);
  }

  return result;
}

function matchesManagerKeyword(title: string | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return MANAGER_KEYWORDS.some((kw) => t.includes(kw));
}

function seniorityRank(title: string | null): number {
  if (!title) return 99;
  const t = title.toLowerCase();
  // Lower rank = more senior for stable sorting.
  if (t.includes("director") && !t.includes("assistant")) return 0;
  if (t.includes("assistant director")) return 1;
  if (t.includes("assistant residential director")) return 1;
  if (t.includes("manager") && !t.includes("assistant")) return 2;
  if (t.includes("assistant") && t.includes("manager")) return 3;
  if (t.includes("supervisor")) return 4;
  if (t.includes("coordinator")) return 5;
  return 99;
}

function compareManagers(a: ManagerRow, b: ManagerRow): number {
  const ra = seniorityRank(a.job_title);
  const rb = seniorityRank(b.job_title);
  if (ra !== rb) return ra - rb;
  const la = (a.last_name ?? "").toLowerCase();
  const lb = (b.last_name ?? "").toLowerCase();
  if (la !== lb) return la.localeCompare(lb);
  return (a.first_name ?? "").localeCompare(b.first_name ?? "");
}

export function formatManagerLine(m: ManagerRow): string {
  const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
  const title = m.job_title ? ` — ${m.job_title}` : "";
  const email = m.email ? ` <${m.email}>` : "";
  return `${name}${title}${email}`;
}
