import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { limitMock, ctorArgs } = vi.hoisted(() => ({
  limitMock: vi.fn(),
  ctorArgs: [] as Record<string, unknown>[],
}));

vi.mock('@upstash/redis', () => ({ Redis: class {} }));
vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    static slidingWindow(limit: number, window: string) {
      return { limit, window };
    }
    constructor(config: Record<string, unknown>) {
      ctorArgs.push(config);
    }
    limit = limitMock;
  }
  return { Ratelimit };
});
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import {
  LIMITS,
  RateLimitError,
  __resetRateLimitForTests,
  clientIp,
  enforceRateLimit,
  rateLimit,
} from '@/lib/rate-limit';

beforeEach(() => {
  __resetRateLimitForTests();
  limitMock.mockReset();
  ctorArgs.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe('in-memory fallback (no Upstash credentials)', () => {
  it('allows up to the limit, then blocks', async () => {
    const opts = { limit: 3, windowMs: 60_000 };
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit('k', opts));
    expect(results.map((r) => r.success)).toEqual([true, true, true, false]);
    expect(results[2].remaining).toBe(0);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it('counts keys independently', async () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect((await rateLimit('a', opts)).success).toBe(true);
    expect((await rateLimit('b', opts)).success).toBe(true);
    expect((await rateLimit('a', opts)).success).toBe(false);
  });
});

describe('enforceRateLimit', () => {
  it('throws RateLimitError with a retry time once over the named limit', async () => {
    for (let i = 0; i < LIMITS.comments.limit; i++) {
      await enforceRateLimit('comments', 'user-1');
    }
    const error = await enforceRateLimit('comments', 'user-1').catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfterSeconds).toBeGreaterThan(0);
    expect(error.message).toMatch(/Too many requests\. Please try again in \d+ seconds?\./);
    // Other users are unaffected.
    await expect(enforceRateLimit('comments', 'user-2')).resolves.toBeUndefined();
  });
});

describe('Upstash backend', () => {
  beforeEach(() => {
    vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', 'token');
  });

  it('uses a sliding window with an environment-scoped key prefix', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    limitMock.mockResolvedValue({ success: true, remaining: 19, reset: 123, reason: undefined });
    const result = await rateLimit('auth:1.2.3.4', LIMITS.authSensitive);
    expect(result).toEqual({ success: true, remaining: 19, resetAt: 123 });
    expect(limitMock).toHaveBeenCalledWith('auth:1.2.3.4');
    expect(ctorArgs[0]).toMatchObject({
      prefix: 'tide:production:rl',
      limiter: { limit: 20, window: '60000 ms' },
      timeout: 1000,
    });
  });

  it('accepts the UPSTASH_REDIS_REST_* names too', async () => {
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    limitMock.mockResolvedValue({ success: false, remaining: 0, reset: 456 });
    expect((await rateLimit('x', { limit: 1, windowMs: 1000 })).success).toBe(false);
    expect(limitMock).toHaveBeenCalled();
  });

  it('reuses one limiter per (limit, window)', async () => {
    limitMock.mockResolvedValue({ success: true, remaining: 1, reset: 1 });
    await rateLimit('a', LIMITS.comments);
    await rateLimit('b', LIMITS.comments);
    await rateLimit('c', LIMITS.invites);
    expect(ctorArgs).toHaveLength(2);
  });

  it('fails open when Redis errors', async () => {
    limitMock.mockRejectedValue(new Error('ECONNRESET'));
    const result = await rateLimit('auth:1.2.3.4', LIMITS.authSensitive);
    expect(result.success).toBe(true);
  });
});

describe('clientIp', () => {
  it('prefers the platform-set x-real-ip', () => {
    const h = new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '6.6.6.6, 203.0.113.7' });
    expect(clientIp(h)).toBe('203.0.113.7');
  });

  it('ignores the client-controlled first x-forwarded-for entry', () => {
    const h = new Headers({ 'x-forwarded-for': '6.6.6.6, 198.51.100.4' });
    expect(clientIp(h)).toBe('198.51.100.4');
  });

  it('falls back to "unknown"', () => {
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
