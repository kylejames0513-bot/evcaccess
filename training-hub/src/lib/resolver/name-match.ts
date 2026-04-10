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
  findEmployeesByNamePrefix,
  findFuzzyCandidates,
  getEmployeeByPaylocityId,
} from "@/lib/db/employees";
import {
  classifyFuzzy,
  pickBestFuzzy,
  type FuzzyMatchResult,
} from "./fuzzy";
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

/**
 * Take a raw first-name string and split out an embedded quoted nickname
 * if present. Returns the cleaned legal first name plus the preferred
 * name, if any. Examples:
 *
 *   'Michael "Mike"'    -> { first: 'Michael', preferred: 'Mike' }
 *   'Jamie "Jamie"'     -> { first: 'Jamie',   preferred: 'Jamie' }
 *   'Catherine'         -> { first: 'Catherine', preferred: null }
 *   'Niyonyishu (Frank)'-> { first: 'Niyonyishu', preferred: 'Frank' }  (parens form)
 *
 * The parens variant exists for one of Kyle's name_map rows.
 */
export function splitFirstName(raw: string): { first: string; preferred: string | null } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { first: "", preferred: null };

  // Quoted nickname: Michael "Mike"
  const quote = trimmed.match(/^([^"]+?)\s*"([^"]+)"\s*$/);
  if (quote) {
    return { first: quote[1].trim(), preferred: quote[2].trim() };
  }

  // Parenthesized nickname: Niyonyishu (Frank)
  const paren = trimmed.match(/^([^(]+?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    return { first: paren[1].trim(), preferred: paren[2].trim() };
  }

  return { first: trimmed, preferred: null };
}

export interface BuildAliasesInput {
  lastName: string;
  firstName: string;
  preferredName?: string | null;
  middleName?: string | null;
}

/**
 * Build the canonical alias set for an employee row. Returns every
 * common shape that downstream sources might use to refer to the same
 * person. Output is deduplicated and excludes empty strings. Always
 * returns at least the (last, first) pair if those are present.
 *
 * The output of this function is what gets merged into employees.aliases
 * during ingest, and what the alias-array lookup in resolveEmployee
 * checks against.
 */
export function buildNameAliases(input: BuildAliasesInput): string[] {
  const last = input.lastName.trim();
  const first = input.firstName.trim();
  const preferred = (input.preferredName ?? "").trim();
  const middle = (input.middleName ?? "").trim();

  if (!last || !first) return [];

  const aliases = new Set<string>();
  const addPair = (f: string) => {
    if (!f) return;
    aliases.add(`${last}, ${f}`);
    aliases.add(`${f} ${last}`);
  };

  // Legal name
  addPair(first);

  // Preferred name (if different)
  if (preferred && normalizeNameComponent(preferred) !== normalizeNameComponent(first)) {
    addPair(preferred);
  }

  // First + middle initial
  if (middle) {
    const midInitial = middle.charAt(0);
    addPair(`${first} ${midInitial}`);
  }

  // Quoted-form for the original sheet shape (e.g. 'Michael "Mike"')
  if (preferred && normalizeNameComponent(preferred) !== normalizeNameComponent(first)) {
    aliases.add(`${last}, ${first} "${preferred}"`);
    aliases.add(`${first} "${preferred}" ${last}`);
  }

  return [...aliases];
}

// ────────────────────────────────────────────────────────────
// Async employee lookups, server-only
// ────────────────────────────────────────────────────────────

export type ResolutionFailure =
  | { reason: "no_match" }
  | { reason: "ambiguous"; candidates: Employee[]; suggestion?: Employee }
  | { reason: "invalid_id"; paylocityId: string };

export type ResolutionResult =
  | { ok: true; employee: Employee; matchedBy: "paylocity_id" | "name" | "name_prefix" | "alias_array" | "alias_text" | "fuzzy" }
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

    // 2b. first_name prefix match. Catches the common mismatch where the
    //     DB stores "Heather M." but the import source sends just "Heather"
    //     (parseName strips middle initials). The query requires a space
    //     after the first name so "Heather" matches "Heather M." but not
    //     "Heatherly".
    const prefixMatches = await findEmployeesByNamePrefix(last, first);
    if (prefixMatches.length === 1) {
      return { ok: true, employee: prefixMatches[0], matchedBy: "name_prefix" };
    }
    if (prefixMatches.length > 1) {
      return { ok: false, failure: { reason: "ambiguous", candidates: prefixMatches } };
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

  // 4. Fuzzy match as the last resort. Conservative thresholds: a strong
  //    fuzzy match (score >= 0.92) is treated as a real match; a weak one
  //    (0.82..0.92) is returned as a suggestion via the ambiguous failure
  //    so the resolution review UI can offer it to a human.
  if (last && first) {
    const candidates = await findFuzzyCandidates(last);
    const best = pickBestFuzzy(candidates, last, first);
    const verdict = classifyFuzzy(best);
    if (verdict === "strong" && best) {
      return { ok: true, employee: best.employee, matchedBy: "fuzzy" };
    }
    if (verdict === "weak" && best) {
      return {
        ok: false,
        failure: {
          reason: "ambiguous",
          candidates: [best.employee],
          suggestion: best.employee,
        },
      };
    }
  }

  if (input.paylocityId && input.paylocityId.trim().length > 0) {
    return {
      ok: false,
      failure: { reason: "invalid_id", paylocityId: input.paylocityId.trim() },
    };
  }
  return { ok: false, failure: { reason: "no_match" } };
}
