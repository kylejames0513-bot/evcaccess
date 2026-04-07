/**
 * Format a division name consistently as "number - name".
 * Examples:
 *   "100-Residential"   → "100 - Residential"
 *   "100 - Residential" → "100 - Residential" (no change)
 *   "700-Executive"     → "700 - Executive"
 *
 * Display-only — does not affect stored values.
 */
export function formatDivision(name: string): string {
  const match = name.match(/^(\d+)\s*[-–]\s*(.+)$/);
  if (match) return `${match[1]} - ${match[2]}`;
  return name;
}
