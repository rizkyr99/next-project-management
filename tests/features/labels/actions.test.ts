import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), batch: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/authz', async (orig) => ({
  ...(await orig<typeof import('@/lib/authz')>()),
  requireProjectAccess: vi.fn(),
  requireTaskAccess: vi.fn(),
  requireWorkspaceMember: vi.fn(),
}));

import { AuthzError, requireProjectAccess, requireTaskAccess, requireWorkspaceMember } from '@/lib/authz';
import { createLabel, deleteLabel, setTaskLabels } from '@/features/labels/actions';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const TASK = '22222222-2222-4222-8222-222222222222';
const L1 = '33333333-3333-4333-8333-333333333333';
const L2 = '44444444-4444-4444-8444-444444444444';
const ws = { id: 'ws-1', slug: 'acme' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireProjectAccess).mockResolvedValue({ workspace: ws, project: { id: PROJECT } } as never);
  vi.mocked(requireTaskAccess).mockResolvedValue({ workspace: ws, project: { id: PROJECT }, task: { id: TASK } } as never);
});

describe('createLabel', () => {
  it('creates a label in the project’s workspace', async () => {
    db.select.mockReturnValueOnce(chain([{ n: 3 }]));
    const values = vi.fn(() => chain([{ id: L1, name: 'Design', color: 'blue' }]));
    db.insert.mockReturnValue({ values });
    const res = await createLabel({ projectId: PROJECT, name: '  Design ', color: 'blue' });
    expect(res).toEqual({ label: { id: L1, name: 'Design', color: 'blue' } });
    expect(values).toHaveBeenCalledWith({ workspaceId: 'ws-1', name: 'Design', color: 'blue' });
  });

  it('explains a duplicate name', async () => {
    db.select.mockReturnValueOnce(chain([{ n: 3 }]));
    const err = Object.assign(new Error('dup'), { code: '23505' });
    db.insert.mockReturnValue({ values: () => ({ returning: () => Promise.reject(err) }) });
    const res = await createLabel({ projectId: PROJECT, name: 'design' });
    expect(res.error).toMatch(/already a label called .design./);
  });

  it('stops at the per-workspace limit', async () => {
    db.select.mockReturnValueOnce(chain([{ n: 50 }]));
    const res = await createLabel({ projectId: PROJECT, name: 'One more' });
    expect(res.error).toMatch(/up to 50 labels/);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects a bad colour before any access check', async () => {
    const res = await createLabel({ projectId: PROJECT, name: 'X', color: 'chartreuse' });
    expect(res).toHaveProperty('error');
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });
});

describe('setTaskLabels', () => {
  it('refuses labels from another workspace, without writing', async () => {
    db.select.mockReturnValueOnce(chain([{ id: L1 }])); // only one of the two is in this workspace
    const res = await setTaskLabels({ taskId: TASK, labelIds: [L1, L2] });
    expect(res).toEqual({ error: 'Not found.' });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('replaces the task’s labels in one batch', async () => {
    db.select.mockReturnValueOnce(chain([{ id: L1 }, { id: L2 }]));
    db.delete.mockReturnValue(chain(undefined));
    db.insert.mockReturnValue({ values: vi.fn(() => chain(undefined)) });
    db.batch.mockResolvedValue([]);
    expect(await setTaskLabels({ taskId: TASK, labelIds: [L1, L2, L1] })).toEqual({ success: true });
    expect(db.batch.mock.calls[0][0]).toHaveLength(2);
  });

  it('clears all labels with an empty list', async () => {
    db.delete.mockReturnValue(chain(undefined));
    db.batch.mockResolvedValue([]);
    expect(await setTaskLabels({ taskId: TASK, labelIds: [] })).toEqual({ success: true });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.batch.mock.calls[0][0]).toHaveLength(1);
  });
});

describe('deleteLabel', () => {
  it('is for owners and admins', async () => {
    db.select.mockReturnValueOnce(chain([{ workspaceId: 'ws-1' }]));
    vi.mocked(requireWorkspaceMember).mockRejectedValue(new AuthzError());
    expect(await deleteLabel({ labelId: L1 })).toEqual({ error: 'Not found.' });
    expect(vi.mocked(requireWorkspaceMember).mock.calls[0][1]).toEqual({ roles: ['owner', 'admin'] });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('404s an unknown label', async () => {
    db.select.mockReturnValueOnce(chain([]));
    expect(await deleteLabel({ labelId: L1 })).toEqual({ error: 'Not found.' });
    expect(requireWorkspaceMember).not.toHaveBeenCalled();
  });
});
