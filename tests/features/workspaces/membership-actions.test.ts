import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  batch: vi.fn(),
}));

vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/activity', () => ({ insertActivity: vi.fn() }));
vi.mock('@/lib/subscription', () => ({ checkWorkspaceLimit: vi.fn() }));
vi.mock('@/lib/membership', () => ({
  lockWorkspace: vi.fn(() => ({ kind: 'lock' })),
  unassignFromWorkspaceTasks: vi.fn((userId: string) => ({ kind: 'unassign', userId })),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()) }));
vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authz')>();
  return { ...actual, requireWorkspaceMember: vi.fn() };
});

import { auth } from '@/lib/auth';
import { insertActivity } from '@/lib/activity';
import { AuthzError, requireWorkspaceMember } from '@/lib/authz';
import { lockWorkspace, unassignFromWorkspaceTasks } from '@/lib/membership';
import { checkWorkspaceLimit } from '@/lib/subscription';
import { redirect } from 'next/navigation';
import { removeMember } from '@/features/workspaces/actions';
import { leaveWorkspace, transferOwnership } from '@/features/workspaces/membership-actions';

const session = { user: { id: 'u-owner', name: 'Olive' } };
const ws = { id: 'ws-1', slug: 'acme', name: 'Acme' };
const ctx = (role: 'owner' | 'admin' | 'member') => ({ session, workspace: ws, role });

/** update().set().where() and delete().where() return markers for inspection. */
function markers() {
  const marker = (kind: string, values?: unknown) => ({
    kind,
    values,
    returning: () => ({ kind, values, returning: true }),
  });
  db.update.mockImplementation(() => ({ set: (values: unknown) => ({ where: () => marker('update', values) }) }));
  db.delete.mockImplementation(() => ({ where: () => marker('delete') }));
  // [lock, guarded write, ...]: the guarded write affected one row.
  db.batch.mockResolvedValue([[{ id: ws.id }], [{ id: 'row' }], []]);
}

beforeEach(() => {
  vi.resetAllMocks();
  markers();
  vi.mocked(unassignFromWorkspaceTasks).mockImplementation(
    (userId: string) => ({ kind: 'unassign', userId }) as never,
  );
  vi.mocked(lockWorkspace).mockImplementation(() => ({ kind: 'lock' }) as never);
});

describe('leaveWorkspace', () => {
  it('refuses to let the owner leave (last-owner guard)', async () => {
    vi.mocked(requireWorkspaceMember).mockResolvedValue(ctx('owner') as never);
    const result = await leaveWorkspace({ workspaceId: ws.id });
    expect(result?.error).toMatch(/Transfer ownership/);
    expect(db.batch).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('unassigns and removes the member in one batch, then redirects home', async () => {
    vi.mocked(requireWorkspaceMember).mockResolvedValue(ctx('member') as never);
    await leaveWorkspace({ workspaceId: ws.id });

    const batch = db.batch.mock.calls[0][0] as { kind: string; userId?: string }[];
    expect(batch.map((q) => q.kind)).toEqual(['lock', 'delete', 'unassign']);
    expect(lockWorkspace).toHaveBeenCalledWith(ws.id);
    expect(unassignFromWorkspaceTasks).toHaveBeenCalledWith('u-owner', ws.id);
    expect(insertActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'member.left' }));
    expect(redirect).toHaveBeenCalledWith('/');
  });

  it('reports the refusal when ownership moved to them meanwhile (delete matched nothing under the lock)', async () => {
    vi.mocked(requireWorkspaceMember).mockResolvedValue(ctx('member') as never);
    db.batch.mockResolvedValue([[{ id: ws.id }], [], []]);
    const result = await leaveWorkspace({ workspaceId: ws.id });
    expect(result?.error).toMatch(/Transfer ownership/);
    expect(insertActivity).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns Not found for a workspace the caller is not in', async () => {
    vi.mocked(requireWorkspaceMember).mockRejectedValue(new AuthzError());
    expect(await leaveWorkspace({ workspaceId: ws.id })).toEqual({ error: 'Not found.' });
    expect(db.batch).not.toHaveBeenCalled();
  });
});

describe('transferOwnership', () => {
  const target = { id: 'm-2', userId: 'u-2', name: 'Theo' };

  beforeEach(() => {
    vi.mocked(requireWorkspaceMember).mockResolvedValue(ctx('owner') as never);
    vi.mocked(checkWorkspaceLimit).mockResolvedValue({ allowed: true, current: 0, limit: 1 });
  });

  it('is owner-only', async () => {
    vi.mocked(requireWorkspaceMember).mockRejectedValue(new AuthzError());
    expect(await transferOwnership({ workspaceId: ws.id, toMemberId: 'm-2' })).toEqual({
      error: 'Not found.',
    });
    expect(requireWorkspaceMember).toHaveBeenCalledWith(ws.id, { roles: ['owner'] });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('rejects a member of another workspace', async () => {
    db.select.mockReturnValueOnce(chain([]));
    expect(await transferOwnership({ workspaceId: ws.id, toMemberId: 'm-x' })).toEqual({
      error: 'Not found.',
    });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('rejects transferring to yourself', async () => {
    db.select.mockReturnValueOnce(chain([{ id: 'm-1', userId: 'u-owner', name: 'Olive' }]));
    const result = await transferOwnership({ workspaceId: ws.id, toMemberId: 'm-1' });
    expect(result.error).toMatch(/already own/);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("refuses when the new owner's plan is at its workspace limit", async () => {
    db.select.mockReturnValueOnce(chain([target]));
    vi.mocked(checkWorkspaceLimit).mockResolvedValue({ allowed: false, current: 1, limit: 1 });
    const result = await transferOwnership({ workspaceId: ws.id, toMemberId: target.id });
    expect(result.error).toMatch(/Theo has reached their plan's workspace limit \(1\/1\)/);
    expect(checkWorkspaceLimit).toHaveBeenCalledWith('u-2');
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('promotes, demotes and moves workspace.userId in one batch', async () => {
    db.select.mockReturnValueOnce(chain([target]));
    expect(await transferOwnership({ workspaceId: ws.id, toMemberId: target.id })).toEqual({
      success: true,
    });

    const batch = db.batch.mock.calls[0][0] as { kind: string; values: Record<string, string> }[];
    expect(batch.map((q) => q.kind)).toEqual(['lock', 'update', 'update', 'update']);
    expect(batch.slice(1).map((q) => q.values)).toEqual([{ role: 'owner' }, { role: 'admin' }, { userId: 'u-2' }]);
    expect(insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'member.ownership_transferred', metadata: { memberName: 'Theo' } }),
    );
  });
});

describe('transferOwnership under concurrency', () => {
  it('reports a stale transfer (promotion matched nothing under the lock) without logging', async () => {
    vi.mocked(requireWorkspaceMember).mockResolvedValue(ctx('owner') as never);
    vi.mocked(checkWorkspaceLimit).mockResolvedValue({ allowed: true, current: 0, limit: 1 });
    db.select.mockReturnValueOnce(chain([{ id: 'm-2', userId: 'u-2', name: 'Theo' }]));
    db.batch.mockResolvedValue([[{ id: ws.id }], [], [], []]);

    const result = await transferOwnership({ workspaceId: ws.id, toMemberId: 'm-2' });
    expect(result.error).toMatch(/changed while you were doing this/);
    expect(insertActivity).not.toHaveBeenCalled();
  });
});

describe('removeMember', () => {
  it('unassigns the removed member from workspace tasks in the same batch', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(session as never);
    db.select
      .mockReturnValueOnce(chain([{ id: ws.id, slug: ws.slug }])) // workspace
      .mockReturnValueOnce(chain([{ role: 'owner' }])) // actor membership
      .mockReturnValueOnce(chain([{ id: 'm-2', userId: 'u-2', role: 'member' }])) // target
      .mockReturnValueOnce(chain([{ name: 'Theo' }])); // target's name

    expect(await removeMember(ws.slug, 'm-2')).toEqual({ success: true });
    const batch = db.batch.mock.calls[0][0] as { kind: string }[];
    expect(batch.map((q) => q.kind)).toEqual(['lock', 'delete', 'unassign']);
    expect(unassignFromWorkspaceTasks).toHaveBeenCalledWith('u-2', ws.id);
  });

  it('reports a removal refused under the lock (e.g. they just became owner) without logging', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(session as never);
    db.select
      .mockReturnValueOnce(chain([{ id: ws.id, slug: ws.slug }]))
      .mockReturnValueOnce(chain([{ role: 'admin' }]))
      .mockReturnValueOnce(chain([{ id: 'm-2', userId: 'u-2', role: 'member' }]))
      .mockReturnValueOnce(chain([{ name: 'Theo' }]));
    db.batch.mockResolvedValue([[{ id: ws.id }], [], []]);

    const result = await removeMember(ws.slug, 'm-2');
    expect(result?.error).toMatch(/Roles changed/);
    expect(insertActivity).not.toHaveBeenCalled();
  });

  it('still refuses to remove the owner', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(session as never);
    db.select
      .mockReturnValueOnce(chain([{ id: ws.id, slug: ws.slug }]))
      .mockReturnValueOnce(chain([{ role: 'admin' }]))
      .mockReturnValueOnce(chain([{ id: 'm-1', userId: 'u-owner', role: 'owner' }]));
    expect(await removeMember(ws.slug, 'm-1')).toEqual({ error: 'Cannot remove the workspace owner' });
    expect(db.batch).not.toHaveBeenCalled();
  });
});
