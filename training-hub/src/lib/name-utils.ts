/**
 * Normalize a name for comparison purposes.
 * Handles both "Last, First" and "First Last" formats.
 * Returns a lowercase sorted key like "first last".
 */
export function normalizeNameForCompare(name: string): string {
  const parts = name
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
