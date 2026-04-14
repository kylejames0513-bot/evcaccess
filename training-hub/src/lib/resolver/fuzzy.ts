// ============================================================
// Fuzzy name matching.
// ============================================================
// Per Kyle: alias matching plus fuzzy matching are both required for
// person resolution. Alias matching lives in name-match.resolveEmployee
// (it walks the employees.aliases[] array). Fuzzy matching lives here.
//
// Strategy:
//   1. Compute Levenshtein-based similarity on lower-case + diacritic-
//      stripped name components.
//   2. Score = 1 - (distance / max(len_a, len_b)). Range: 0..1.
//   3. Combined score = (last_sim * 0.65) + (first_sim * 0.35) because
//      last names are usually more reliable than first names (preferred
//      vs legal name divergence).
//   4. STRONG threshold: 0.92. Caller treats as a match.
//   5. WEAK threshold:   0.82. Caller routes to unresolved_people with
//      reason='ambiguous' and suggested_employee_id populated.
//   6. Below 0.82: not a match at all.
//
// The matcher is deliberately conservative: a wrong fuzzy match attributes
// training records to the wrong person, which is worse than a missing
// record landing in the review queue.
// ============================================================

import { normalizeNameComponent } from "./name-match";
import type { Employee } from "@/types/database";

export const FUZZY_STRONG_THRESHOLD = 0.92;
export const FUZZY_WEAK_THRESHOLD = 0.82;

export interface FuzzyMatchResult {
  employee: Employee;
  score: number;
  lastSim: number;
  firstSim: number;
}

/**
 * Pure Levenshtein distance. O(m*n) time, O(min(m,n)) space.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Make `a` the shorter so the row buffer is smaller.
  if (a.length > b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  const prev = new Array<number>(a.length + 1);
  const curr = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,
        prev[i] + 1,
        prev[i - 1] + cost
      );
    }
    for (let i = 0; i <= a.length; i++) prev[i] = curr[i];
  }

  return prev[a.length];
}

/**
 * Similarity in 0..1. Higher is closer.
 */
export function similarity(a: string, b: string): number {
  const aN = normalizeNameComponent(a);
  const bN = normalizeNameComponent(b);
  if (aN.length === 0 && bN.length === 0) return 1;
  const dist = levenshtein(aN, bN);
  const maxLen = Math.max(aN.length, bN.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

/**
 * Score a single candidate against a target name.
 */
export function scoreNameAgainst(
  candidate: { last_name: string; first_name: string },
  targetLast: string,
  targetFirst: string
): { score: number; lastSim: number; firstSim: number } {
  const lastSim = similarity(candidate.last_name, targetLast);
  const firstSim = similarity(candidate.first_name, targetFirst);
  const score = lastSim * 0.65 + firstSim * 0.35;
  return { score, lastSim, firstSim };
}

/**
 * Pick the best candidate from a pool. Returns null if no candidate
 * meets the WEAK threshold. Returns the top candidate even if it only
 * meets the WEAK threshold; caller decides whether to treat as a strong
 * match or as a suggestion.
 */
export function pickBestFuzzy(
  candidates: Employee[],
  targetLast: string,
  targetFirst: string
): FuzzyMatchResult | null {
  let best: FuzzyMatchResult | null = null;
  for (const c of candidates) {
    const { score, lastSim, firstSim } = scoreNameAgainst(c, targetLast, targetFirst);
    if (score < FUZZY_WEAK_THRESHOLD) continue;
    if (!best || score > best.score) {
      best = { employee: c, score, lastSim, firstSim };
    }
  }
  return best;
}

/**
 * Helper: classify a fuzzy result for the resolver pipeline.
 *   "strong"  -> match it, write the training record
 *   "weak"    -> drop into unresolved_people with suggested_employee_id
 *   "none"    -> not a fuzzy match at all
 */
export function classifyFuzzy(result: FuzzyMatchResult | null): "strong" | "weak" | "none" {
  if (!result) return "none";
  if (result.score >= FUZZY_STRONG_THRESHOLD) return "strong";
  if (result.score >= FUZZY_WEAK_THRESHOLD) return "weak";
  return "none";
}
