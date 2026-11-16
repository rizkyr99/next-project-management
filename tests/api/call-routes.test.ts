import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../helpers/db-mock';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authz')>();
  return { ...actual, requireProjectAccess: vi.fn(), requireSession: vi.fn() };
});

import { AuthzError, UnauthenticatedError, requireProjectAccess, requireSession } from '@/lib/authz';
import { POST as join } from '@/app/api/call/join/route';
import { POST as leave } from '@/app/api/call/leave/route';
import { POST as signal } from '@/app/api/call/signal/route';
import { GET as callStream } from '@/app/api/call/stream/route';
import { GET as taskStream } from '@/app/api/tasks/stream/route';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const session = { user: { id: 'user-1', name: 'Alice' } };
const access = {
  session,
  role: 'member',
  project: { id: PROJECT, name: 'Website' },
  workspace: { id: 'ws-1', slug: 'acme' },
};

const post = (body: unknown) =>
  new Request('http://test/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const validSignal = {
  projectId: PROJECT,
  toUserId: 'user-2',
  type: 'offer',
  payload: { sdp: 'v=0' },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireProjectAccess).mockResolvedValue(access as never);
  vi.mocked(requireSession).mockResolvedValue(session as never);
});

describe('POST /api/call/join', () => {
  it('returns 401 without a session', async () => {
    vi.mocked(requireProjectAccess).mockRejectedValue(new UnauthenticatedError());
    expect((await join(post({ projectId: PROJECT }))).status).toBe(401);
  });

  it('returns 404 for a project in another workspace and writes nothing', async () => {
    vi.mocked(requireProjectAccess).mockRejectedValue(new AuthzError());
    expect((await join(post({ projectId: PROJECT }))).status).toBe(404);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed body', async () => {
    expect((await join(post('not json'))).status).toBe(400);
    expect((await join(post({ projectId: 'nope' }))).status).toBe(400);
  });

  it('adds a member to the call', async () => {
    db.select.mockReturnValue(chain([]));
    db.insert.mockReturnValue(chain(undefined));
    expect((await join(post({ projectId: PROJECT }))).status).toBe(200);
    expect(db.insert).toHaveBeenCalledOnce();
  });
});

describe('POST /api/call/leave', () => {
  it('only needs a session, since it deletes the caller’s own rows', async () => {
    db.delete.mockReturnValue(chain(undefined));
    expect((await leave(post({ projectId: PROJECT }))).status).toBe(200);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('returns 401 without a session', async () => {
    vi.mocked(requireSession).mockRejectedValue(new UnauthenticatedError());
    expect((await leave(post({ projectId: PROJECT }))).status).toBe(401);
    expect(db.delete).not.toHaveBeenCalled();
  });
});

describe('POST /api/call/signal', () => {
  it('returns 404 for a project in another workspace', async () => {
    vi.mocked(requireProjectAccess).mockRejectedValue(new AuthzError());
    expect((await signal(post(validSignal))).status).toBe(404);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects an unknown signal type', async () => {
    expect((await signal(post({ ...validSignal, type: 'evil' }))).status).toBe(400);
  });

  it('rejects oversized payloads', async () => {
    const huge = 'x'.repeat(64 * 1024 + 1);
    expect((await signal(post({ ...validSignal, payload: huge }))).status).toBe(400);
  });

  it('refuses to signal a user who is not in the call', async () => {
    db.select.mockReturnValue(chain([{ userId: 'user-1' }]));
    expect((await signal(post(validSignal))).status).toBe(404);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('refuses to signal when the sender is not in the call', async () => {
    db.select.mockReturnValue(chain([{ userId: 'user-2' }]));
    expect((await signal(post(validSignal))).status).toBe(404);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('stores the signal when both users are in the call', async () => {
    db.select.mockReturnValue(chain([{ userId: 'user-1' }, { userId: 'user-2' }]));
    const values = vi.fn(() => chain(undefined));
    db.insert.mockReturnValue({ values });

    expect((await signal(post(validSignal))).status).toBe(200);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        fromUserId: 'user-1',
        toUserId: 'user-2',
        payload: JSON.stringify({ sdp: 'v=0' }),
      }),
    );
  });
});

describe('GET stream routes', () => {
  const get = (path: string, projectId: string) =>
    new Request(`http://test${path}?projectId=${projectId}`);

  it.each([
    ['/api/call/stream', callStream],
    ['/api/tasks/stream', taskStream],
  ])('%s returns 404 for a project in another workspace', async (path, handler) => {
    vi.mocked(requireProjectAccess).mockRejectedValue(new AuthzError());
    const res = await handler(get(path, PROJECT));
    expect(res.status).toBe(404);
    expect(db.select).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/call/stream', callStream],
    ['/api/tasks/stream', taskStream],
  ])('%s returns 400 for a missing or malformed projectId', async (path, handler) => {
    expect((await handler(new Request(`http://test${path}`))).status).toBe(400);
    expect((await handler(get(path, 'nope'))).status).toBe(400);
  });
});
