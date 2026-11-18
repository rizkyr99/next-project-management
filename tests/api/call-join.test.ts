import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn((q: unknown) => q), batch: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/authz', async (orig) => ({
  ...(await orig<typeof import('@/lib/authz')>()),
  requireProjectAccess: vi.fn(),
}));

import { requireProjectAccess, AuthzError } from '@/lib/authz';
import { POST } from '@/app/api/call/join/route';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const req = (body: unknown) => new Request('http://t/api/call/join', { method: 'POST', body: JSON.stringify(body) });
const rows = (n: number) => ({ rows: Array.from({ length: n }, (_, i) => ({ id: `r${i}` })) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireProjectAccess).mockResolvedValue({
    session: { user: { id: 'u-1' } },
    project: { id: PROJECT },
  } as never);
});

describe('POST /api/call/join', () => {
  it('rejects a malformed project id', async () => {
    expect((await POST(req({ projectId: 'nope' }))).status).toBe(400);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('404s a project the user cannot access', async () => {
    vi.mocked(requireProjectAccess).mockRejectedValue(new AuthzError());
    expect((await POST(req({ projectId: PROJECT }))).status).toBe(404);
  });

  it('locks the project, clears stale places, then refreshes or takes a place', async () => {
    db.batch.mockResolvedValue([rows(1), rows(0), rows(0), rows(1)]);
    const res = await POST(req({ projectId: PROJECT }));
    expect(res.status).toBe(200);
    const [ops] = db.batch.mock.calls[0];
    expect(ops).toHaveLength(4);
    const text = (q: unknown) => JSON.stringify(q);
    expect(text(ops[0])).toMatch(/for update/);
    expect(text(ops[1])).toMatch(/delete from call_participant/);
    expect(text(ops[3])).toMatch(/count\(\*\)/);
  });

  it('lets someone already in the call back in', async () => {
    db.batch.mockResolvedValue([rows(1), rows(0), rows(1), rows(0)]);
    expect((await POST(req({ projectId: PROJECT }))).status).toBe(200);
  });

  it('says the room is full when there is no place', async () => {
    db.batch.mockResolvedValue([rows(1), rows(0), rows(0), rows(0)]);
    const res = await POST(req({ projectId: PROJECT }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: expect.stringMatching(/call is full \(4 people max\)/) });
  });
});
