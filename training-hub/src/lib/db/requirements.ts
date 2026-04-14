// ============================================================
// required_trainings data access. Server-only.
// ============================================================
// CRUD plus a per-employee matcher that returns the set of training_types
// each employee is required to complete based on the universal /
// department / department+position rules.
//
// Most-specific rule wins (mirrors the precedence in the
// employee_compliance view):
//   position match > department match > universal
//
// The matcher is exposed for the resolver and the dashboard CSV export.
// The compliance view stays the canonical source for displayed status;
// this matcher is for "what does this one employee need" lookups.
// ============================================================

import { createServerClient, type DbClient } from "@/lib/supabase";
import type {
  RequiredTraining,
  RequiredTrainingInsert,
  RequiredTrainingUpdate,
} from "@/types/database";

function db(): DbClient {
  return createServerClient();
}

// ────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────

export async function listRequiredTrainings(): Promise<RequiredTraining[]> {
  const { data, error } = await db()
    .from("required_trainings")
    .select("*")
    .order("is_universal", { ascending: false })
    .order("department", { nullsFirst: false })
    .order("position", { nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export async function getRequiredTrainingById(id: number): Promise<RequiredTraining | null> {
  const { data, error } = await db()
    .from("required_trainings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listRequiredTrainingsForDepartment(
  department: string
): Promise<RequiredTraining[]> {
  const { data, error } = await db()
    .from("required_trainings")
    .select("*")
    .or(`is_universal.eq.true,department.ilike.${escapeIlike(department)}`);
  if (error) throw error;
  return data ?? [];
}

/**
 * Return the set of training_type_ids the given employee is required
 * to complete. Applies the position > department > universal precedence:
 * if a position-scoped rule and a department-scoped rule both exist for
 * the same training_type, the position-scoped rule wins.
 *
 * Returns a Map keyed by training_type_id so callers can look up the
 * winning rule that applied (e.g. to show "required by Residential dept rule"
 * in the UI).
 *
 * `required_trainings.department` is seeded with DIVISION names
 * (Residential, Executive, Board, etc.), not sub-unit names. It joins
 * against `employees.division` — with a fallback to `employees.department`
 * so historical rows that never got a division value still match. This
 * mirrors the compliance view after migration 20260414000100.
 */
export async function getRequiredTrainingsForEmployee(
  employee: { department?: string | null; division?: string | null; position?: string | null }
): Promise<Map<number, RequiredTraining>> {
  const client = db();
  const candidates: RequiredTraining[] = [];

  // Canonical division name: prefer division, fall back to department
  // for pre-division-column rows.
  const canonicalDivision = (employee.division ?? employee.department ?? "").trim();

  // Universal rules apply to every division except Board. Board members
  // are in the employees table for roster display but are not subject
  // to staff-wide training requirements. Board-scoped division rules
  // still apply via the explicit department='Board' match below.
  const isBoard = canonicalDivision.toLowerCase() === "board";
  if (!isBoard) {
    const { data: universal, error: uErr } = await client
      .from("required_trainings")
      .select("*")
      .eq("is_universal", true);
    if (uErr) throw uErr;
    candidates.push(...(universal ?? []));
  }

  // Division-scoped rules apply if the canonical division matches
  // required_trainings.department (which stores the division name).
  if (canonicalDivision.length > 0) {
    const { data: deptRules, error: dErr } = await client
      .from("required_trainings")
      .select("*")
      .eq("is_universal", false)
      .ilike("department", canonicalDivision);
    if (dErr) throw dErr;
    candidates.push(...(deptRules ?? []));
  }

  // Resolve precedence: position > department-only > universal.
  // For each training_type_id, pick the rule with the highest specificity.
  const winning = new Map<number, RequiredTraining>();
  for (const rule of candidates) {
    if (!rule.is_required) continue;

    // Skip position-scoped rules that don't match this employee's position.
    if (rule.position != null) {
      if (
        employee.position == null ||
        employee.position.toLowerCase() !== rule.position.toLowerCase()
      ) {
        continue;
      }
    }

    const existing = winning.get(rule.training_type_id);
    if (!existing || ruleSpecificity(rule) > ruleSpecificity(existing)) {
      winning.set(rule.training_type_id, rule);
    }
  }
  return winning;
}

// ────────────────────────────────────────────────────────────
// Writes
// ────────────────────────────────────────────────────────────

export async function insertRequiredTraining(
  row: RequiredTrainingInsert
): Promise<RequiredTraining> {
  const { data, error } = await db()
    .from("required_trainings")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateRequiredTraining(
  id: number,
  patch: RequiredTrainingUpdate
): Promise<RequiredTraining> {
  const { data, error } = await db()
    .from("required_trainings")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRequiredTraining(id: number): Promise<void> {
  const { error } = await db().from("required_trainings").delete().eq("id", id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function ruleSpecificity(rule: RequiredTraining): number {
  if (rule.position != null) return 3;
  if (rule.department != null) return 2;
  if (rule.is_universal) return 1;
  return 0;
}

/**
 * Escape ilike pattern characters in a value so dynamic strings can be
 * passed to .or() without triggering wildcard expansion.
 */
function escapeIlike(value: string): string {
  return value.replace(/[%,]/g, (match) => `\\${match}`);
}
