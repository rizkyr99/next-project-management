import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authz')>();
  return { ...actual, requireWorkspaceMember: vi.fn(), requireTaskAccess: vi.fn() };
});

import {
  AuthzError,
  UnauthenticatedError,
  requireTaskAccess,
  requireWorkspaceMember,
} from '@/lib/authz';
import { getTaskActivity, getWorkspaceActivity } from '@/features/activity/actions';

const WS = '00000000-0000-4000-8000-000000000001';
const TASK = '00000000-0000-4000-8000-000000000002';

beforeEach(() => vi.resetAllMocks());

describe('getWorkspaceActivity', () => {
  it('throws without a session', async () => {
    vi.mocked(requireWorkspaceMember).mockRejectedValue(new UnauthenticatedError());
    await expect(getWorkspaceActivity(WS)).rejects.toThrow('Unauthorized');
  });

  it('returns an empty feed for a workspace the user is not in', async () => {
    vi.mocked(requireWorkspaceMember).mockRejectedValue(new AuthzError());
    expect(await getWorkspaceActivity(WS)).toEqual({ items: [], nextCursor: null });
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns an empty feed for a malformed cursor', async () => {
    expect(await getWorkspaceActivity(WS, 'not-a-date')).toEqual({ items: [], nextCursor: null });
    expect(requireWorkspaceMember).not.toHaveBeenCalled();
  });

  it('returns an empty feed for a malformed project filter, without querying', async () => {
    expect(await getWorkspaceActivity(WS, undefined, { projectId: 'nope' })).toEqual({ items: [], nextCursor: null });
    expect(requireWorkspaceMember).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it('paginates for a member', async () => {
    vi.mocked(requireWorkspaceMember).mockResolvedValue({
      workspace: { id: WS, slug: 'acme', name: 'Acme' },
    } as never);
    const rows = Array.from({ length: 31 }, (_, i) => ({
      id: String(i),
      createdAt: new Date(Date.UTC(2026, 0, 31 - i)),
    }));
    db.select.mockReturnValue(chain(rows));

    const result = await getWorkspaceActivity(WS);
    expect(result.items).toHaveLength(30);
    expect(result.nextCursor).toBe(rows[29].createdAt.toISOString());
  });
});

describe('getTaskActivity', () => {
  it('returns no items for a task in another workspace', async () => {
    vi.mocked(requireTaskAccess).mockRejectedValue(new AuthzError());
    expect(await getTaskActivity(TASK)).toEqual({ items: [] });
    expect(db.select).not.toHaveBeenCalled();
  });
});
