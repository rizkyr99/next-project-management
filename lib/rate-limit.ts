// In-memory sliding window rate limiter.
// Works for single-instance deployments (Vercel serverless with a single region).
// For multi-region, swap the Map for an Upstash Redis token bucket.

interface Entry {
  timestamps: number[];
}

const store = new Map<string, Entry>();

export interface RateLimitOptions {
  /** Maximum number of requests allowed within the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): { success: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  const entry = store.get(key) ?? { timestamps: [] };

  // Drop timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
  entry.timestamps.push(now);
  store.set(key, entry);

  const remaining = Math.max(0, limit - entry.timestamps.length);
  const oldest = entry.timestamps[0] ?? now;
  const resetAt = oldest + windowMs;

  return { success: entry.timestamps.length <= limit, remaining, resetAt };
}
