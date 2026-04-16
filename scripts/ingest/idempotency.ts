/**
 * Idempotency utilities for ingestion.
 * Every row that creates a completion computes a deterministic hash.
 * Re-runs produce zero inserts when nothing changed.
 */

import { createHash } from "crypto";

/**
 * Deterministic hash for completion dedup.
 * Stored as completions.source_row_hash.
 */
export function hashCompletion(
  employeeId: string,
  trainingCode: string,
  completedOnISO: string,
  source: string
): string {
  const input = [employeeId, trainingCode, completedOnISO, source]
    .map((s) => s.trim().toLowerCase())
    .join("|");
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Deterministic key for new hire dedup.
 */
export function hashNewHire(
  legalName: string,
  hireDate: string
): string {
  const input = [legalName.trim().toLowerCase(), hireDate].join("|");
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Deterministic key for separation dedup.
 */
export function hashSeparation(
  legalName: string,
  separationDate: string
): string {
  const input = [legalName.trim().toLowerCase(), separationDate].join("|");
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Deterministic key for employee upsert (by paylocity/employee_id).
 */
export function hashEmployee(employeeId: string): string {
  return employeeId.trim().toLowerCase();
}
