import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiting, shared across every serverless instance via Upstash Redis
 * (sliding window). Without Upstash credentials (unit tests, a fresh clone)
 * it falls back to a per-process in-memory window, which is fine for one
 * process but useless on Vercel, where every instance would count separately.
 *
 * Keys are namespaced per environment, so local development and preview
 * deployments sharing the free-tier database never touch production's
 * counters.
 */

export interface RateLimitOptions {
  /** Maximum number of requests allowed within the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  /** Epoch ms when the window frees up again */
  resetAt: number;
}

/** Named limits, so every call site uses the same numbers. */
export const LIMITS = {
  /** Credential endpoints (sign-in, sign-up, password reset), per IP. */
  authSensitive: { limit: 20, windowMs: 60_000 },
  /** Everything else under /api/auth (session reads, sign-out), per IP. */
  authGeneral: { limit: 300, windowMs: 60_000 },
  /** Invites sent or resent, per user. */
  invites: { limit: 20, windowMs: 60 * 60_000 },
  /** Comments posted, per user. */
  comments: { limit: 30, windowMs: 60_000 },
  /** Tasks created, per user. */
  taskCreate: { limit: 120, windowMs: 60_000 },
  /** Assignee changes, per user (each can email the people assigned). */
  assignees: { limit: 60, windowMs: 60_000 },
  /** Files uploaded (pasted screenshots), per user. */
  uploads: { limit: 30, windowMs: 60_000 },
  /** Account deletion attempts (password checks), per user. */
  accountDelete: { limit: 5, windowMs: 15 * 60_000 },
} as const satisfies Record<string, RateLimitOptions>;

export type LimitName = keyof typeof LIMITS;

/** Thrown by enforceRateLimit; server actions turn it into a friendly `{ error }`. */
export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(
      `Too many requests. Please try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}.`,
    );
    this.name = 'RateLimitError';
  }
}

// ── Backends ────────────────────────────────────────────────────────────────

function redisCredentials() {
  // The Vercel Upstash integration names these KV_REST_API_* (with prefix
  // "KV"); Upstash's own docs use UPSTASH_REDIS_REST_*. Accept both.
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)?.trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)?.trim();
  return url && token ? { url, token } : null;
}

function keyPrefix() {
  // Only Vercel sets VERCEL_ENV (production | preview | development). Don't
  // fall back to NODE_ENV: a local `next start` runs with NODE_ENV=production
  // and must not spend production's quotas.
  const env = process.env.VERCEL_ENV?.trim() || 'local';
  return `tide:${env}:rl`;
}

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis === undefined) {
    const creds = redisCredentials();
    try {
      redis = creds ? new Redis(creds) : null;
    } catch (error) {
      // e.g. a redis:// URL where the REST URL belongs. Misconfiguration must
      // degrade to per-instance limits, not break every auth request.
      console.error('[rate-limit] invalid Upstash config; using in-memory limits:', error);
      redis = null;
    }
  }
  return redis;
}

// One Ratelimit per (limit, window): it holds the algorithm config and an
// in-instance cache of identifiers that are already blocked, which saves
// Redis calls while a function stays warm.
const limiters = new Map<string, Ratelimit>();
function getLimiter(client: Redis, { limit, windowMs }: RateLimitOptions): Ratelimit {
  const id = `${limit}/${windowMs}`;
  let limiter = limiters.get(id);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: keyPrefix(),
      ephemeralCache: new Map(),
      // Fail open quickly: a Redis hiccup must not lock everyone out of login.
      timeout: 1_000,
      analytics: false,
    });
    limiters.set(id, limiter);
  }
  return limiter;
}

const memory = new Map<string, number[]>();
function memoryLimit(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const timestamps = (memory.get(key) ?? []).filter((t) => t > now - windowMs);
  timestamps.push(now);
  memory.set(key, timestamps);
  return {
    success: timestamps.length <= limit,
    remaining: Math.max(0, limit - timestamps.length),
    resetAt: (timestamps[0] ?? now) + windowMs,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Counts one request for `key` and says whether it's within the limit. */
export async function rateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const client = getRedis();
  if (!client) return memoryLimit(key, opts);

  try {
    const { success, remaining, reset, reason } = await getLimiter(client, opts).limit(key);
    if (reason === 'timeout') console.warn('[rate-limit] Upstash timed out; allowing request');
    return { success, remaining, resetAt: reset };
  } catch (error) {
    // Fail open, loudly.
    console.error('[rate-limit] Upstash error; allowing request:', error);
    try {
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureException(error, { tags: { area: 'rate-limit' } });
    } catch {
      // Sentry unavailable (e.g. in tests)
    }
    return { success: true, remaining: opts.limit, resetAt: Date.now() + opts.windowMs };
  }
}

/** For server actions: throws RateLimitError when `subject` is over the named limit. */
export async function enforceRateLimit(name: LimitName, subject: string): Promise<void> {
  const result = await rateLimit(`${name}:${subject}`, LIMITS[name]);
  if (!result.success) {
    throw new RateLimitError(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)));
  }
}

/**
 * The caller's IP. On Vercel `x-real-ip` is set by the platform and can't be
 * spoofed, unlike the first `x-forwarded-for` entry, which the client
 * controls. The last forwarded hop is the closest trustworthy fallback.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? 'unknown';
}

/** Test-only: drop cached clients and in-memory counters. */
export function __resetRateLimitForTests() {
  redis = undefined;
  limiters.clear();
  memory.clear();
}
