// ============================================================
// Employees data access. Server-only.
// ============================================================
// Read and write helpers for the employees table. Used by API routes,
// the import resolver, and the resolution review UI.
//
// Lookup precedence everywhere in this file:
//   1. By internal UUID (id)
//   2. By paylocity_id (the canonical join key per Section 4 of the brief)
//   3. By case-insensitive (last_name, first_name)
//   4. By aliases array containment
//
// Names are display only and never used as a join key in writes; the
// reactivate flow is the one place a name lookup is allowed in production
// because it's how rehires find their orphaned profile.
// ============================================================

import { createServerClient, type DbClient } from "@/lib/supabase";
import type {
  Employee,
  EmployeeInsert,
  EmployeeUpdate,
} from "@/types/database";

function db(): DbClient {
  return createServerClient();
}

// ────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────

export async function getEmployeeById(id: string): Promise<Employee | null> {
  const { data, error } = await db()
    .from("employees")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getEmployeeByPaylocityId(
  paylocityId: string
): Promise<Employee | null> {
  const { data, error } = await db()
    .from("employees")
    .select("*")
    .eq("paylocity_id", paylocityId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface ListEmployeesOptions {
  activeOnly?: boolean;
  department?: string;
  position?: string;
  limit?: number;
  offset?: number;
}

export async function listEmployees(
  opts: ListEmployeesOptions = {}
): Promise<Employee[]> {
  let query = db().from("employees").select("*");

  if (opts.activeOnly) {
    query = query.eq("is_active", true);
  }
  if (opts.department) {
    query = query.ilike("department", opts.department);
  }
  if (opts.position) {
    query = query.ilike("position", opts.position);
  }
  query = query.order("last_name").order("first_name");
  if (opts.limit != null) {
    query = query.range(opts.offset ?? 0, (opts.offset ?? 0) + opts.limit - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Find an employee by case-insensitive (last_name, first_name).
 * Used by the resolver as a fallback when paylocity_id is missing.
 * Returns null if zero or more than one match (caller must handle ambiguity).
 */
export async function findEmployeeByName(
  lastName: string,
  firstName: string
): Promise<Employee | null> {
  const { data, error } = await db()
    .from("employees")
    .select("*")
    .ilike("last_name", lastName)
    .ilike("first_name", firstName);
  if (error) throw error;
  if (!data || data.length !== 1) return null;
  return data[0];
}

/**
 * Find candidates by (last_name, first_name) case-insensitive. Returns ALL
 * matches so the caller can decide what to do about ambiguity.
 */
export async function findEmployeeCandidatesByName(
  lastName: string,
  firstName: string
): Promise<Employee[]> {
  const { data, error } = await db()
    .from("employees")
    .select("*")
    .ilike("last_name", lastName)
    .ilike("first_name", firstName);
  if (error) throw error;
  return data ?? [];
}

/**
 * Pull a candidate set for fuzzy matching. Narrows by first letter of
 * last_name to keep the in-memory pool small (one of ~26 buckets, each
 * with ~85 rows for the EVC dataset). Caller computes Levenshtein
 * similarity client-side via the fuzzy module.
 *
 * Includes both active and inactive employees so the fuzzy matcher can
 * find an orphaned former-employee row to suggest.
 */
export async function findFuzzyCandidates(
  lastNamePrefix: string
): Promise<Employee[]> {
  const letter = lastNamePrefix.trim().charAt(0);
  if (!letter) return [];
  const { data, error } = await db()
    .from("employees")
    .select("*")
    .ilike("last_name", `${letter}%`);
  if (error) throw error;
  return data ?? [];
}

/**
 * Find an employee whose `aliases` array contains the given full-name string.
 * Uses the GIN index. Used by the resolver for PHS rows that come in as
 * "Last, First" or "First Last" strings.
 */
export async function findEmployeeByAlias(alias: string): Promise<Employee | null> {
  const { data, error } = await db()
    .from("employees")
    .select("*")
    .contains("aliases", [alias]);
  if (error) throw error;
  if (!data || data.length !== 1) return null;
  return data[0];
}

/**
 * Look for an orphaned former employee row (is_active=false AND
 * paylocity_id IS NULL) matching the given name. Used during ingest when
 * a fresh Paylocity row arrives and we want to reactivate an old profile
 * instead of creating a new row.
 */
export async function findOrphanForRehire(
  lastName: string,
  firstName: string
): Promise<Employee | null> {
  const { data, error } = await db()
    .from("employees")
    .select("*")
    .ilike("last_name", lastName)
    .ilike("first_name", firstName)
    .eq("is_active", false)
    .is("paylocity_id", null);
  if (error) throw error;
  if (!data || data.length !== 1) return null;
  return data[0];
}

// ────────────────────────────────────────────────────────────
// Writes
// ────────────────────────────────────────────────────────────

export async function insertEmployee(row: EmployeeInsert): Promise<Employee> {
  const { data, error } = await db()
    .from("employees")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployee(
  id: string,
  patch: EmployeeUpdate
): Promise<Employee> {
  const { data, error } = await db()
    .from("employees")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Mark an employee as terminated. Sets is_active=false and stamps
 * terminated_at. Idempotent: re-running on an already-terminated row
 * does not update terminated_at.
 */
export async function terminateEmployee(id: string): Promise<Employee> {
  const current = await getEmployeeById(id);
  if (!current) {
    throw new Error(`terminateEmployee: no employee with id ${id}`);
  }
  if (!current.is_active && current.terminated_at) {
    return current;
  }
  return updateEmployee(id, {
    is_active: false,
    terminated_at: new Date().toISOString(),
  });
}

/**
 * Reactivate an orphaned former employee profile and assign a new
 * Paylocity ID. Wraps the reactivate_employee_with_paylocity_id RPC
 * which has the safety checks built in.
 */
export async function reactivateEmployee(
  orphanId: string,
  newPaylocityId: string
): Promise<string> {
  const { data, error } = await db().rpc("reactivate_employee_with_paylocity_id", {
    orphan_id: orphanId,
    new_paylocity_id: newPaylocityId,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Append an alias string to an employee's aliases array. Wraps the
 * add_employee_alias RPC. Idempotent: a no-op if the alias is already there.
 */
export async function addEmployeeAlias(employeeId: string, alias: string): Promise<void> {
  const { error } = await db().rpc("add_employee_alias", {
    emp_id: employeeId,
    new_alias: alias,
  });
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Aggregate helpers used by the dashboard
// ────────────────────────────────────────────────────────────

export interface EmployeeCounts {
  active: number;
  inactive: number;
  with_paylocity_id: number;
  without_paylocity_id: number;
}

export async function getEmployeeCounts(): Promise<EmployeeCounts> {
  const client = db();
  const [active, inactive, withId, withoutId] = await Promise.all([
    client.from("employees").select("*", { count: "exact", head: true }).eq("is_active", true),
    client.from("employees").select("*", { count: "exact", head: true }).eq("is_active", false),
    client
      .from("employees")
      .select("*", { count: "exact", head: true })
      .not("paylocity_id", "is", null),
    client
      .from("employees")
      .select("*", { count: "exact", head: true })
      .is("paylocity_id", null),
  ]);
  if (active.error) throw active.error;
  if (inactive.error) throw inactive.error;
  if (withId.error) throw withId.error;
  if (withoutId.error) throw withoutId.error;
  return {
    active: active.count ?? 0,
    inactive: inactive.count ?? 0,
    with_paylocity_id: withId.count ?? 0,
    without_paylocity_id: withoutId.count ?? 0,
  };
}
