// ============================================================
// Resolver name matching.
// ============================================================
// Pure functions for parsing and normalizing person names plus a
// thin async wrapper that asks the db layer to find a matching
// employee using the precedence:
//
//   1. paylocity_id        (canonical)
//   2. case-insensitive (last_name, first_name)
//   3. aliases array containment
//   4. case-insensitive aliases match (parsed full name)
//
// The pure parsing helpers handle the messy real shapes:
//
//   - "Last, First"                            (PHS, name_map)
//   - 'Last, First "Preferred"'                (Training tab)
//   - "First Last"                             (signin form)
//   - "First Middle Last"                      (Paylocity Middle Name col)
//   - "Last (suffix), First"                   (rare)
// ============================================================

import {
  findEmployeeByAlias,
  findEmployeeByName,
  findEmployeeCandidatesByName,
  getEmployeeByPaylocityId,
} from "@/lib/db/employees";
import type { Employee } from "@/types/database";

export interface ParsedName {
  first: string;
  last: string;
  preferred: string | null; // the quoted nickname if present
}

/**
 * Parse a single string into (first, last, preferred). Handles all
 * the formats listed in the file header. Returns null if the input
 * doesn't look like a person name at all.
 */
export function parseName(raw: string): ParsedName | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // Pull out a quoted preferred name like 'Michael "Mike"'.
  const quoteMatch = trimmed.match(/"([^"]+)"/);
  const preferred = quoteMatch ? quoteMatch[1].trim() : null;
  const stripped = quoteMatch ? trimmed.replace(quoteMatch[0], "").trim() : trimmed;

  // "Last, First [Middle ...]"
  if (stripped.includes(",")) {
    const [lastRaw, firstRaw] = stripped.split(",", 2);
    const last = lastRaw.trim();
    const firstParts = (firstRaw ?? "").trim().split(/\s+/);
    const first = firstParts[0] ?? "";
    if (last.length > 0 && first.length > 0) {
      return { first, last, preferred };
    }
    return null;
  }

  // "First [Middle ...] Last" - assume the last token is the surname.
  const tokens = stripped.split(/\s+/);
  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    const first = tokens[0];
    return { first, last, preferred };
  }

  return null;
}

/**
 * Normalize a name component for case-insensitive comparison. Lowercases,
 * trims, collapses whitespace, strips diacritics, drops common
 * punctuation. NOT intended for storage, only for matching.
 */
export function normalizeNameComponent(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.\-']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesEqual(a: ParsedName, b: ParsedName): boolean {
  return (
    normalizeNameComponent(a.last) === normalizeNameComponent(b.last) &&
    normalizeNameComponent(a.first) === normalizeNameComponent(b.first)
  );
}

// ────────────────────────────────────────────────────────────
// Async employee lookups, server-only
// ────────────────────────────────────────────────────────────

export type ResolutionFailure =
  | { reason: "no_match" }
  | { reason: "ambiguous"; candidates: Employee[] }
  | { reason: "invalid_id"; paylocityId: string };

export type ResolutionResult =
  | { ok: true; employee: Employee; matchedBy: "paylocity_id" | "name" | "alias_array" | "alias_text" }
  | { ok: false; failure: ResolutionFailure };

export interface ResolveInput {
  paylocityId?: string | null;
  fullName?: string | null;
  lastName?: string | null;
  firstName?: string | null;
}

/**
 * The single entry point used by every per-source parser. Walks the
 * precedence ladder and returns either a matched employee with how it
 * was matched, or a failure reason that the parser can drop into
 * unresolved_people.
 */
export async function resolveEmployee(input: ResolveInput): Promise<ResolutionResult> {
  // 1. paylocity_id wins.
  if (input.paylocityId && input.paylocityId.trim().length > 0) {
    const byId = await getEmployeeByPaylocityId(input.paylocityId.trim());
    if (byId) {
      return { ok: true, employee: byId, matchedBy: "paylocity_id" };
    }
    // We were given an ID but the DB doesn't know about it. Caller
    // can either fall through to a name lookup (Paylocity flow) or
    // bail with invalid_id.
  }

  // 2. structured (last_name, first_name).
  let last = input.lastName ?? null;
  let first = input.firstName ?? null;
  if ((!last || !first) && input.fullName) {
    const parsed = parseName(input.fullName);
    if (parsed) {
      last = last ?? parsed.last;
      first = first ?? parsed.first;
    }
  }

  if (last && first) {
    const exact = await findEmployeeByName(last, first);
    if (exact) {
      return { ok: true, employee: exact, matchedBy: "name" };
    }

    const candidates = await findEmployeeCandidatesByName(last, first);
    if (candidates.length > 1) {
      return { ok: false, failure: { reason: "ambiguous", candidates } };
    }
  }

  // 3. alias array containment (full string match against aliases[]).
  if (input.fullName) {
    const arrMatch = await findEmployeeByAlias(input.fullName);
    if (arrMatch) {
      return { ok: true, employee: arrMatch, matchedBy: "alias_array" };
    }
  }

  // Alias array also stores "Last, First" canonical strings, so try
  // both common shapes if we have structured names.
  if (last && first) {
    const lastFirst = `${last}, ${first}`;
    const firstLast = `${first} ${last}`;
    const a = await findEmployeeByAlias(lastFirst);
    if (a) return { ok: true, employee: a, matchedBy: "alias_array" };
    const b = await findEmployeeByAlias(firstLast);
    if (b) return { ok: true, employee: b, matchedBy: "alias_array" };
  }

  if (input.paylocityId && input.paylocityId.trim().length > 0) {
    return {
      ok: false,
      failure: { reason: "invalid_id", paylocityId: input.paylocityId.trim() },
    };
  }
  return { ok: false, failure: { reason: "no_match" } };
}
