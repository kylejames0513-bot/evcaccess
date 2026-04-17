/**
 * Name resolution ladder for EVC ingestion.
 * Resolves a (lastName, firstName) pair against the employees table.
 *
 * Ladder (exact order, stop at first hit):
 * 1. Exact last + exact first (case-insensitive, trimmed)
 * 2. Exact last + first contains / contained-by
 * 3. Exact last + first name part split (handles "Mary Jane" / "Mary")
 * 4. Exact last + nickname dict lookup
 * 5. Alias table lookup (learned matches from name_aliases)
 * 6. Exact last + fuzzy first (Dice coefficient > 0.70)
 * 7. Fuzzy last (Dice > 0.85) + exact first
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isNicknameMatch, getNicknames } from "./nicknames";
import { normalizeName } from "./normalize";

export type ResolvedMatch = {
  employeeId: string;
  employeeDbId: string; // UUID
  confidence: "exact" | "nickname" | "fuzzy_high" | "fuzzy_low";
  score: number;
  method: string;
};

type EmployeeRow = {
  id: string;
  employee_id: string;
  legal_last_name: string;
  legal_first_name: string;
  preferred_name: string | null;
  known_aliases: string[];
  status: string;
};

type AliasRow = {
  employee_id: string;
  alias_last: string | null;
  alias_first: string | null;
};

/**
 * Dice coefficient for fuzzy string comparison.
 * Returns 0-1 where 1 is identical.
 */
function diceCoefficient(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return 1;
  if (la.length < 2 || lb.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < la.length - 1; i++) {
    const bigram = la.slice(i, i + 2);
    bigramsA.set(bigram, (bigramsA.get(bigram) ?? 0) + 1);
  }

  let matches = 0;
  for (let i = 0; i < lb.length - 1; i++) {
    const bigram = lb.slice(i, i + 2);
    const count = bigramsA.get(bigram);
    if (count && count > 0) {
      matches++;
      bigramsA.set(bigram, count - 1);
    }
  }

  return (2 * matches) / (la.length - 1 + lb.length - 1);
}

/**
 * Resolve a name against the employees table.
 * Returns the best match or null if unresolvable.
 */
export async function resolveEmployee(
  lastName: string,
  firstName: string,
  supabase: SupabaseClient
): Promise<ResolvedMatch | null> {
  const normLast = normalizeName(lastName);
  const normFirst = normalizeName(firstName);

  if (!normLast && !normFirst) return null;

  // Fetch all employees (cached per run in practice)
  const { data: employees } = await supabase
    .from("employees")
    .select("id, employee_id, legal_last_name, legal_first_name, preferred_name, known_aliases, status");

  if (!employees?.length) return null;

  // Step 1: Exact last + exact first (legal OR preferred name)
  for (const emp of employees) {
    if (normalizeName(emp.legal_last_name) !== normLast) continue;
    const empLegal = normalizeName(emp.legal_first_name);
    if (empLegal === normFirst) {
      return {
        employeeId: emp.employee_id,
        employeeDbId: emp.id,
        confidence: "exact",
        score: 1.0,
        method: "exact_last_first",
      };
    }
    if (emp.preferred_name && normalizeName(emp.preferred_name) === normFirst) {
      return {
        employeeId: emp.employee_id,
        employeeDbId: emp.id,
        confidence: "exact",
        score: 1.0,
        method: "exact_last_preferred",
      };
    }
  }

  // Step 1b: Exact last + first matches one of the employee's known_aliases
  //          (typically populated from the merged sheet's Aliases column)
  for (const emp of employees) {
    if (normalizeName(emp.legal_last_name) !== normLast) continue;
    const rawAliases = (emp.known_aliases ?? []) as string[];
    const aliases = rawAliases.map((a: string) => normalizeName(a)).filter(Boolean);
    if (aliases.includes(normFirst)) {
      return {
        employeeId: emp.employee_id,
        employeeDbId: emp.id,
        confidence: "exact",
        score: 0.98,
        method: "known_alias",
      };
    }
  }

  // Step 2: Exact last + first contains/contained-by
  for (const emp of employees) {
    if (normalizeName(emp.legal_last_name) !== normLast) continue;
    const empFirst = normalizeName(emp.legal_first_name);
    if (empFirst.includes(normFirst) || normFirst.includes(empFirst)) {
      return {
        employeeId: emp.employee_id,
        employeeDbId: emp.id,
        confidence: "exact",
        score: 0.95,
        method: "exact_last_first_contains",
      };
    }
  }

  // Step 3: Exact last + first name part split
  const firstParts = normFirst.split(/\s+/);
  if (firstParts.length > 1) {
    for (const emp of employees) {
      if (normalizeName(emp.legal_last_name) !== normLast) continue;
      const empFirst = normalizeName(emp.legal_first_name);
      if (firstParts.some((p) => p === empFirst)) {
        return {
          employeeId: emp.employee_id,
          employeeDbId: emp.id,
          confidence: "exact",
          score: 0.9,
          method: "exact_last_first_part",
        };
      }
    }
  }

  // Step 4: Exact last + nickname match
  for (const emp of employees) {
    if (normalizeName(emp.legal_last_name) !== normLast) continue;
    const empFirst = normalizeName(emp.legal_first_name);
    if (isNicknameMatch(normFirst, empFirst)) {
      return {
        employeeId: emp.employee_id,
        employeeDbId: emp.id,
        confidence: "nickname",
        score: 0.85,
        method: "exact_last_nickname_first",
      };
    }
    // Also check preferred_name
    if (emp.preferred_name && isNicknameMatch(normFirst, normalizeName(emp.preferred_name))) {
      return {
        employeeId: emp.employee_id,
        employeeDbId: emp.id,
        confidence: "nickname",
        score: 0.85,
        method: "exact_last_nickname_preferred",
      };
    }
  }

  // Step 5: Alias table lookup
  const { data: aliases } = await supabase
    .from("name_aliases")
    .select("employee_id, alias_last, alias_first");

  if (aliases?.length) {
    for (const alias of aliases as AliasRow[]) {
      const aliasLast = normalizeName(alias.alias_last ?? "");
      const aliasFirst = normalizeName(alias.alias_first ?? "");
      if (aliasLast === normLast && aliasFirst === normFirst) {
        const emp = employees.find((e) => e.id === alias.employee_id);
        if (emp) {
          return {
            employeeId: emp.employee_id,
            employeeDbId: emp.id,
            confidence: "exact",
            score: 0.9,
            method: "alias_table",
          };
        }
      }
    }
  }

  // Step 6: Exact last + fuzzy first (Dice > 0.70)
  let bestFuzzy: ResolvedMatch | null = null;
  let bestScore = 0;
  for (const emp of employees) {
    if (normalizeName(emp.legal_last_name) !== normLast) continue;
    const empFirst = normalizeName(emp.legal_first_name);
    const score = diceCoefficient(normFirst, empFirst);
    if (score > 0.7 && score > bestScore) {
      bestScore = score;
      bestFuzzy = {
        employeeId: emp.employee_id,
        employeeDbId: emp.id,
        confidence: score > 0.85 ? "fuzzy_high" : "fuzzy_low",
        score,
        method: "exact_last_fuzzy_first",
      };
    }
  }
  if (bestFuzzy && bestFuzzy.score > 0.7) return bestFuzzy;

  // Step 7: Fuzzy last (Dice > 0.85) + exact first
  bestFuzzy = null;
  bestScore = 0;
  for (const emp of employees) {
    const lastScore = diceCoefficient(normLast, normalizeName(emp.legal_last_name));
    if (lastScore <= 0.85) continue;
    const empFirst = normalizeName(emp.legal_first_name);
    if (empFirst === normFirst) {
      if (lastScore > bestScore) {
        bestScore = lastScore;
        bestFuzzy = {
          employeeId: emp.employee_id,
          employeeDbId: emp.id,
          confidence: "fuzzy_high",
          score: lastScore,
          method: "fuzzy_last_exact_first",
        };
      }
    }
  }
  if (bestFuzzy) return bestFuzzy;

  // No match — return best fuzzy candidate for review_queue if score 0.5-0.7
  let suggestedMatch: ResolvedMatch | null = null;
  let suggestedScore = 0;
  for (const emp of employees) {
    const lastScore = diceCoefficient(normLast, normalizeName(emp.legal_last_name));
    const firstScore = diceCoefficient(normFirst, normalizeName(emp.legal_first_name));
    const combined = (lastScore * 0.6 + firstScore * 0.4);
    if (combined > 0.5 && combined > suggestedScore) {
      suggestedScore = combined;
      suggestedMatch = {
        employeeId: emp.employee_id,
        employeeDbId: emp.id,
        confidence: "fuzzy_low",
        score: combined,
        method: "suggested_fuzzy",
      };
    }
  }

  // Return null — caller should add to review_queue with suggestedMatch info
  return null;
}

/**
 * Resolve with a suggested match for the review queue.
 * Returns { match, suggested } where match is the resolved employee
 * and suggested is the best fuzzy candidate for manual review.
 */
export async function resolveEmployeeWithSuggestion(
  lastName: string,
  firstName: string,
  supabase: SupabaseClient
): Promise<{ match: ResolvedMatch | null; suggested: ResolvedMatch | null }> {
  const match = await resolveEmployee(lastName, firstName, supabase);
  if (match) return { match, suggested: null };

  // Find best fuzzy suggestion for the review queue
  const normLast = normalizeName(lastName);
  const normFirst = normalizeName(firstName);

  const { data: employees } = await supabase
    .from("employees")
    .select("id, employee_id, legal_last_name, legal_first_name, status");

  if (!employees?.length) return { match: null, suggested: null };

  let best: ResolvedMatch | null = null;
  let bestScore = 0;

  for (const emp of employees) {
    const lastScore = diceCoefficient(normLast, normalizeName(emp.legal_last_name));
    const firstScore = diceCoefficient(normFirst, normalizeName(emp.legal_first_name));
    const combined = lastScore * 0.6 + firstScore * 0.4;
    if (combined > 0.5 && combined > bestScore) {
      bestScore = combined;
      best = {
        employeeId: emp.employee_id,
        employeeDbId: emp.id,
        confidence: "fuzzy_low",
        score: combined,
        method: "suggested_fuzzy",
      };
    }
  }

  return { match: null, suggested: best };
}
