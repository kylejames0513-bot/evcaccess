/**
 * Parse a raw name string into { last, firsts[] } where firsts includes
 * the regular first name AND any preferred name found in "quotes".
 *
 * Handles:
 *   "Smith, John"          → { last: "smith", firsts: ["john"] }
 *   "Smith, John"          → { last: "smith", firsts: ["john"] }
 *   'Smith, "Johnny" John' → { last: "smith", firsts: ["johnny", "john"] }
 *   '"Johnny" Smith'       → { last: "smith", firsts: ["johnny"] }
 *   "John Smith"           → { last: "smith", firsts: ["john"] }
 *   "SMITH JOHN"           → { last: "smith", firsts: ["john"] }
 */
function parseNameParts(raw: string): { last: string; firsts: string[] } {
  // Extract anything in double or single quotes as preferred name candidates
  const preferred: string[] = [];
  const withoutQuoted = raw.replace(/["']([^"']+)["']/g, (_, p) => {
    preferred.push(p.trim().toLowerCase());
    return " ";
  }).replace(/\s+/g, " ").trim();

  const lower = withoutQuoted.toLowerCase().trim();
  let last = "";
  let rest = "";

  if (lower.includes(",")) {
    // "Last, First" format
    const idx = lower.indexOf(",");
    last = lower.slice(0, idx).trim();
    rest = lower.slice(idx + 1).trim();
  } else {
    // "First Last" or "First Middle Last" — last token is last name
    const parts = lower.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { last: "", firsts: preferred };
    last = parts[parts.length - 1];
    rest = parts.slice(0, -1).join(" ");
  }

  // Collect all first name tokens (could be "First Middle")
  const firsts: string[] = [
    ...rest.split(/\s+/).filter(Boolean),
    ...preferred,
  ].filter((v, i, a) => v && a.indexOf(v) === i); // dedupe

  return { last, firsts };
}

/**
 * Normalize a name for exact-match comparison.
 * Strips quotes, lowercases, sorts all tokens alphabetically.
 * "Smith, John" == "John Smith" == "JOHN SMITH"
 */
export function normalizeNameForCompare(name: string): string {
  return name
    .replace(/["']/g, "")
    .split(/[,\s]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * Primary match function. Strategy:
 *  1. Fast path: exact normalized token match (all parts, any order)
 *  2. Last-name-first: last names must match (or one is an initial of the other),
 *     AND at least one first/preferred name from each side matches
 *     (exact, initial, or starts-with for abbreviated names)
 */
export function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;

  // Fast path — sort-normalized exact match
  if (normalizeNameForCompare(a) === normalizeNameForCompare(b)) return true;

  const pa = parseNameParts(a);
  const pb = parseNameParts(b);

  if (!pa.last || !pb.last) return false;

  // Last name must match (exact, or one is an initial)
  const lastMatch =
    pa.last === pb.last ||
    (pa.last.length === 1 && pb.last.startsWith(pa.last)) ||
    (pb.last.length === 1 && pa.last.startsWith(pb.last));

  if (!lastMatch) return false;

  // At least one first/preferred name from A must match one from B
  for (const fa of pa.firsts) {
    for (const fb of pb.firsts) {
      if (!fa || !fb) continue;
      if (fa === fb) return true;
      // Initial match: "j" or "j." matches "john", "john" matches "j"
      const fa0 = fa.replace(/\.$/, "");
      const fb0 = fb.replace(/\.$/, "");
      if (fa0.length === 1 && fb0.startsWith(fa0)) return true;
      if (fb0.length === 1 && fa0.startsWith(fb0)) return true;
    }
  }

  // If one side has no firsts at all (last-name-only entry), last match is enough
  if (pa.firsts.length === 0 || pb.firsts.length === 0) return true;

  return false;
}

/**
 * Convert "Last, First" → "First Last".
 */
export function toFirstLast(name: string): string {
  const parts = name.split(",").map((p) => p.trim());
  if (parts.length === 2 && parts[1]) return `${parts[1]} ${parts[0]}`;
  return name;
}

// ── Similarity scoring for suggestions ────────────────────────────────────────

/** Dice coefficient on character bigrams. */
function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bg = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = bg(a);
  const bb = bg(b);
  let overlap = 0;
  for (const x of ba) if (bb.has(x)) overlap++;
  return (2 * overlap) / (ba.size + bb.size);
}

/**
 * Score how well two names match (0–1).
 * Uses last-name-first weighting:
 *   - Last name bigram similarity × 0.6
 *   - Best first/preferred name match × 0.4
 */
export function nameMatchScore(rawA: string, rawB: string): number {
  if (namesMatch(rawA, rawB)) return 1;

  const pa = parseNameParts(rawA);
  const pb = parseNameParts(rawB);

  if (!pa.last || !pb.last) return 0;

  // Last name score (weighted 60%)
  const lastScore = bigramSimilarity(pa.last, pb.last);

  // Best first/preferred name pair score (weighted 40%)
  let bestFirstScore = 0;
  const allFirstsA = pa.firsts.length ? pa.firsts : [""];
  const allFirstsB = pb.firsts.length ? pb.firsts : [""];

  for (const fa of allFirstsA) {
    for (const fb of allFirstsB) {
      if (!fa || !fb) continue;
      let s = bigramSimilarity(fa, fb);
      // Boost for initial matches
      const fa0 = fa.replace(/\.$/, "");
      const fb0 = fb.replace(/\.$/, "");
      if (fa0.length === 1 && fb0.startsWith(fa0)) s = Math.max(s, 0.85);
      if (fb0.length === 1 && fa0.startsWith(fb0)) s = Math.max(s, 0.85);
      bestFirstScore = Math.max(bestFirstScore, s);
    }
  }

  return lastScore * 0.6 + bestFirstScore * 0.4;
}

export interface NameSuggestion {
  name: string;
  score: number;
  confidence: "high" | "medium";
}

/**
 * Return top-3 candidates from the Training sheet that best match an
 * unmatched import name. Only returns scores ≥ 0.60.
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
