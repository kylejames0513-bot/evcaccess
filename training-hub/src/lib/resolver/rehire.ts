// ============================================================
// Rehire detection: link a fresh Paylocity row back to an orphaned
// former-employee profile.
// ============================================================
// Per Kyle's rule: when a former employee is rehired, Paylocity issues
// them a new ID. The resolver should NOT create a brand new employees
// row. Instead it should reactivate the orphaned profile (the row that
// has the old training history attached) and write the new ID onto it.
//
// Detection rules:
//   1. Incoming row has a paylocity_id that does not match any active
//      employee.
//   2. There exists exactly one orphan row matching the incoming
//      (last_name, first_name) where is_active=false AND
//      paylocity_id IS NULL.
//   3. The orphan's name is a strong match (case-insensitive equality
//      after diacritic stripping).
//
// If all three are true, return the orphan id and the resolver will
// call db/employees.reactivateEmployee() to flip the row.
// ============================================================

import { findOrphanForRehire } from "@/lib/db/employees";
import { normalizeNameComponent } from "./name-match";
import type { Employee } from "@/types/database";

export interface RehireCandidateInput {
  paylocityId: string;
  lastName: string;
  firstName: string;
}

export interface RehireMatch {
  orphan: Employee;
  newPaylocityId: string;
}

/**
 * Look for a single rehire candidate. Returns null if zero or more than
 * one orphan match (the resolver routes the latter to unresolved_people
 * with reason='ambiguous').
 */
export async function findRehireCandidate(
  input: RehireCandidateInput
): Promise<RehireMatch | null> {
  if (!input.paylocityId || !input.lastName || !input.firstName) return null;

  const orphan = await findOrphanForRehire(input.lastName, input.firstName);
  if (!orphan) return null;

  // Defense in depth: confirm the name actually matches under
  // normalization. findOrphanForRehire already does ilike, this catches
  // edge cases like " Smith " vs "Smith".
  if (
    normalizeNameComponent(orphan.last_name) !== normalizeNameComponent(input.lastName) ||
    normalizeNameComponent(orphan.first_name) !== normalizeNameComponent(input.firstName)
  ) {
    return null;
  }

  return { orphan, newPaylocityId: input.paylocityId };
}
