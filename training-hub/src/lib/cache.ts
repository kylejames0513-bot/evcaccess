// ============================================================
// Simple in-memory cache with TTL
// ============================================================
// Prevents hammering the Google Sheets API on every request.
// Data is cached for 60 seconds by default.
// ============================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Get a value from cache, or fetch it if expired/missing.
 */
export async function cached<T>(key: string, fetcher: () => Promise<T>, ttlMs: number = DEFAULT_TTL_MS): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;

  if (entry && entry.expiresAt > now) {
    return entry.data;
  }

  const data = await fetcher();
  cache.set(key, { data, expiresAt: now + ttlMs });
  return data;
}

/**
 * Invalidate a specific cache key.
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate all cache entries.
 */
export function invalidateAll(): void {
  cache.clear();
}
