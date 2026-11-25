import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  lockWorkspace: vi.fn(() => 'lock'),
  unassignFromWorkspaceTasks: vi.fn(() => 'unassign'),
  revokeGuestProjects: vi.fn(() => 'revoke-guest'),
}));

import { auth } from '@/lib/auth';
import { insertActivity } from '@/lib/activity';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { changeMemberRole, deleteWorkspace, removeMember, updateWorkspace } from '@/features/workspaces/actions';

const ws = { id: 'ws-1', slug: 'acme', userId: 'owner-1' };
const EXPIRED = { error: 'Your session has expired. Log in again to continue.' };

function signIn(id: string) {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id, name: id } } as never);
}

/** Queue the selects in the order the action makes them. */
function selects(...results: unknown[][]) {
  for (const r of results) db.select.mockReturnValueOnce(chain(r));
}

/** Any write chain: update().set().where().returning(), delete().where()… */
function writes(result: unknown = []) {
  db.update.mockReturnValue(chain(result));
  db.delete.mockReturnValue(chain(result));
}

beforeEach(() => {
  vi.resetAllMocks();
  signIn('owner-1');
});

describe('updateWorkspace', () => {
  it('needs a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(await updateWorkspace('acme', { name: 'New' })).toEqual(EXPIRED);
  });

  it('404s an unknown workspace', async () => {
    selects([]);
    expect(await updateWorkspace('nope', { name: 'New' })).toEqual({ error: 'Workspace not found' });
  });

  it('refuses plain members', async () => {
    selects([ws], [{ role: 'member' }]);
    expect(await updateWorkspace('acme', { name: 'New' })).toEqual({
      error: 'You do not have permission to update this workspace',
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('lets admins rename and revalidates the layout', async () => {
    selects([ws], [{ role: 'admin' }]);
    writes();
    expect(await updateWorkspace('acme', { name: 'New name' })).toEqual({ success: true });
    expect(db.update).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith('/workspaces/acme', 'layout');
  });
});

describe('removeMember', () => {
  it('404s an unknown workspace', async () => {
    selects([]);
    expect(await removeMember('nope', 'm-2')).toEqual({ error: 'Workspace not found' });
  });

  it('refuses plain members and non-members', async () => {
    selects([ws], [{ role: 'member' }]);
    expect(await removeMember('acme', 'm-2')).toEqual({ error: 'You do not have permission to remove members' });
    selects([ws], []);
    expect(await removeMember('acme', 'm-2')).toEqual({ error: 'You do not have permission to remove members' });
  });

  it('reports a member that is not in this workspace', async () => {
    selects([ws], [{ role: 'owner' }], []);
    expect(await removeMember('acme', 'm-x')).toEqual({ error: 'Member not found' });
  });

  it('never removes the owner', async () => {
    selects([ws], [{ role: 'admin' }], [{ id: 'm-1', role: 'owner', userId: 'owner-1' }]);
    expect(await removeMember('acme', 'm-1')).toEqual({ error: 'Cannot remove the workspace owner' });
  });

  it('stops admins removing other admins', async () => {
    signIn('admin-1');
    selects([ws], [{ role: 'admin' }], [{ id: 'm-3', role: 'admin', userId: 'admin-2' }]);
    expect(await removeMember('acme', 'm-3')).toEqual({ error: 'Admins cannot remove other admins' });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('removes under the workspace lock, unassigns their tasks and logs it', async () => {
    selects([ws], [{ role: 'owner' }], [{ id: 'm-2', role: 'member', userId: 'u-2' }], [{ name: 'Bob' }]);
    writes();
    db.batch.mockResolvedValue(['locked', [{ id: 'm-2' }], []]);

    expect(await removeMember('acme', 'm-2')).toEqual({ success: true });

    const [ops] = db.batch.mock.calls[0];
    expect(ops[0]).toBe('lock');
    expect(ops[2]).toBe('unassign');
    // A removed guest loses their shared projects in the same transaction.
    expect(ops[3]).toBe('revoke-guest');
    expect(insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'member.removed', metadata: { memberName: 'Bob' } }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/workspaces/acme/settings');
  });

  it('reports a race when the guarded delete removed nothing', async () => {
    selects([ws], [{ role: 'owner' }], [{ id: 'm-2', role: 'member', userId: 'u-2' }], []);
    writes();
    db.batch.mockResolvedValue(['locked', [], []]);
    expect(await removeMember('acme', 'm-2')).toEqual({
      error: 'Roles changed while you were doing this. Refresh and try again.',
    });
    expect(insertActivity).not.toHaveBeenCalled();
  });
});

describe('changeMemberRole', () => {
  it('needs a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(await changeMemberRole('acme', 'm-2', 'admin')).toEqual(EXPIRED);
  });

  it('404s an unknown workspace', async () => {
    selects([]);
    expect(await changeMemberRole('nope', 'm-2', 'admin')).toEqual({ error: 'Workspace not found' });
  });

  it('is owner-only', async () => {
    selects([ws], [{ role: 'admin' }]);
    expect(await changeMemberRole('acme', 'm-2', 'admin')).toEqual({
      error: 'Only the workspace owner can change roles',
    });
  });

  it('reports a missing member and refuses the owner', async () => {
    selects([ws], [{ role: 'owner' }], []);
    expect(await changeMemberRole('acme', 'm-x', 'admin')).toEqual({ error: 'Member not found' });
    selects([ws], [{ role: 'owner' }], [{ id: 'm-1', role: 'owner', userId: 'owner-1' }]);
    expect(await changeMemberRole('acme', 'm-1', 'member')).toEqual({ error: "Cannot change the owner's role" });
  });

  it('changes the role under the lock and logs from/to', async () => {
    selects([ws], [{ role: 'owner' }], [{ id: 'm-2', role: 'member', userId: 'u-2' }], [{ name: 'Bob' }]);
    writes();
    db.batch.mockResolvedValue(['locked', [{ id: 'm-2' }]]);
    expect(await changeMemberRole('acme', 'm-2', 'admin')).toEqual({ success: true });
    expect(db.batch.mock.calls[0][0][0]).toBe('lock');
    expect(insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'member.role_changed',
        metadata: { memberName: 'Bob', from: 'member', to: 'admin' },
      }),
    );
  });

  it('reports a race when ownership moved meanwhile', async () => {
    selects([ws], [{ role: 'owner' }], [{ id: 'm-2', role: 'member', userId: 'u-2' }], [{ name: 'Bob' }]);
    writes();
    db.batch.mockResolvedValue(['locked', []]);
    expect(await changeMemberRole('acme', 'm-2', 'admin')).toEqual({
      error: 'Roles changed while you were doing this. Refresh and try again.',
    });
  });
});

describe('deleteWorkspace', () => {
  it('needs a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(await deleteWorkspace('acme')).toEqual(EXPIRED);
  });

  it('404s an unknown workspace', async () => {
    selects([]);
    expect(await deleteWorkspace('nope')).toEqual({ error: 'Workspace not found' });
  });

  it('is owner-only', async () => {
    selects([ws], [{ role: 'admin' }]);
    expect(await deleteWorkspace('acme')).toEqual({ error: 'Only the workspace owner can delete this workspace' });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('deletes and sends the owner to create a new workspace', async () => {
    selects([ws], [{ role: 'owner' }]);
    writes();
    await deleteWorkspace('acme');
    expect(db.delete).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith('/create-workspace');
  });
});
