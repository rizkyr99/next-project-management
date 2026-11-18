import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));

import { GET } from '@/app/api/health/route';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VERCEL_GIT_COMMIT_SHA = 'abcdef1234567890';
});

describe('GET /api/health', () => {
  it('is 200 with the short commit when the database answers', async () => {
    db.execute.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'ok', database: 'ok', latencyMs: expect.any(Number), commit: 'abcdef1' });
  });

  it('is 503 without details when the database is unreachable', async () => {
    db.execute.mockRejectedValue(new Error('password authentication failed for user neondb_owner'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ status: 'error', database: 'unreachable', commit: 'abcdef1' });
    expect(JSON.stringify(body)).not.toMatch(/password|neondb/);
  });
});
