/**
 * Normalize a name for comparison purposes.
 * Handles both "Last, First" and "First Last" formats.
 * Returns a lowercase sorted key like "first last".
 */
export function normalizeNameForCompare(name: string): string {
  const parts = name
    .replace(/['"]/g, "") // strip quotes
    .split(/[,\s]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return parts.join(" ");
}

/**
 * Check if two names match regardless of format.
 * "Smith, John" matches "John Smith" and vice versa.
 */
export function namesMatch(a: string, b: string): boolean {
  return normalizeNameForCompare(a) === normalizeNameForCompare(b);
}

/**
 * Convert "Last, First" to "First Last".
 */
export function toFirstLast(name: string): string {
  const parts = name.split(",").map((p) => p.trim());
  if (parts.length === 2 && parts[1]) {
    return `${parts[1]} ${parts[0]}`;
  }
  return name;
}

/**
 * Compute bigram (Dice coefficient) similarity between two strings.
 * Returns 0–1 where 1 = identical.
 */
function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const getBigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = getBigrams(a);
  const bb = getBigrams(b);
  let overlap = 0;
  for (const bg of ba) if (bb.has(bg)) overlap++;
  return (2 * overlap) / (ba.size + bb.size);
}

/**
 * Score how well two names match (0–1).
 * Checks parts individually: last name is weighted more heavily.
 * Also strips quotes and handles initials.
 */
export function nameMatchScore(rawA: string, rawB: string): number {
  if (namesMatch(rawA, rawB)) return 1;

  const clean = (s: string) => s.replace(/['"]/g, "").trim().toLowerCase();
  const splitParts = (s: string) =>
    clean(s).split(/[,\s]+/).filter(Boolean);

  const partsA = splitParts(rawA);
  const partsB = splitParts(rawB);

  // Score each part of A against the best matching part in B
  let totalScore = 0;
  for (const pa of partsA) {
    let best = 0;
    for (const pb of partsB) {
      // Exact token match
      if (pa === pb) { best = 1; break; }
      // Initial match: "j" matches "john"
      if (pa.length === 1 && pb.startsWith(pa)) { best = Math.max(best, 0.8); continue; }
      if (pb.length === 1 && pa.startsWith(pb)) { best = Math.max(best, 0.8); continue; }
      // Bigram similarity on individual parts
      best = Math.max(best, bigramSimilarity(pa, pb));
    }
    totalScore += best;
  }

  const precisionScore = totalScore / partsA.length;

  // Also score B→A (recall)
  let reverseTotal = 0;
  for (const pb of partsB) {
    let best = 0;
    for (const pa of partsA) {
      if (pb === pa) { best = 1; break; }
      if (pb.length === 1 && pa.startsWith(pb)) { best = Math.max(best, 0.8); continue; }
      if (pa.length === 1 && pb.startsWith(pa)) { best = Math.max(best, 0.8); continue; }
      best = Math.max(best, bigramSimilarity(pb, pa));
    }
    reverseTotal += best;
  }
  const recallScore = reverseTotal / partsB.length;

  // F1-style harmonic mean of precision and recall
  if (precisionScore + recallScore === 0) return 0;
  return (2 * precisionScore * recallScore) / (precisionScore + recallScore);
}

export interface NameSuggestion {
  name: string;      // candidate name from Training sheet
  score: number;     // 0–1
  confidence: "high" | "medium"; // high ≥ 0.82, medium ≥ 0.60
}

/**
 * Given an unmatched name and a list of Training sheet candidates,
 * return the top suggestions sorted by score descending.
 * Only returns matches scoring ≥ 0.60.
 */
export function suggestNameMatches(
  unmatched: string,
  candidates: string[]
): NameSuggestion[] {
  const results: NameSuggestion[] = [];
  for (const candidate of candidates) {
    const score = nameMatchScore(unmatched, candidate);
    if (score >= 0.60) {
      results.push({
        name: candidate,
        score: Math.round(score * 100) / 100,
        confidence: score >= 0.82 ? "high" : "medium",
      });
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 3);
}
