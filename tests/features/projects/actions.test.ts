import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  batch: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/activity', () => ({ insertActivity: vi.fn() }));

import { auth } from '@/lib/auth';
import { insertActivity } from '@/lib/activity';
import { redirect } from 'next/navigation';
import {
  createProject,
  deleteProject,
  setProjectArchived,
  setProjectShareLink,
  updateProject,
} from '@/features/projects/actions';
import { isWellFormedShareToken } from '@/features/projects/share-link';

const session = { user: { id: 'user-1', name: 'Alice' } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue(session as never);
});

/** Records every insert's values and returns a recognisable query object. */
function captureInserts() {
  const inserted: unknown[] = [];
  db.insert.mockImplementation(() => ({
    values: (v: unknown) => {
      inserted.push(v);
      const q = { returning: () => q };
      return q;
    },
  }));
  return inserted;
}

describe('createProject', () => {
  it('returns a session-expired message without a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(await createProject({ workspaceSlug: 'acme', name: 'Site' })).toEqual({ error: 'Your session has expired. Log in again to continue.' });
  });

  it('rejects invalid input without touching the database', async () => {
    const result = await createProject({ workspaceSlug: 'acme', name: '' });
    expect(result.error).toBe('Project name is required');
    expect(db.select).not.toHaveBeenCalled();
  });

  it('refuses workspaces the user is not a member of', async () => {
    db.select.mockReturnValue(chain([]));
    const result = await createProject({ workspaceSlug: 'other', name: 'Site' });
    expect(result).toEqual({ error: 'Workspace not found.' });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('writes the project and its columns in one batch, with no tasks (P4.3)', async () => {
    db.select.mockReturnValue(chain([{ workspaceId: 'ws-1' }]));
    const inserted = captureInserts();
    db.batch.mockImplementation(async () => [[{ id: 'p-1', name: 'Site' }], []]);

    const result = await createProject({
      workspaceSlug: 'acme',
      name: 'Site',
      description: '  Marketing site  ',
    });

    expect(result).toEqual({ project: { id: 'p-1', name: 'Site' } });
    expect(db.batch).toHaveBeenCalledOnce();
    expect(db.batch.mock.calls[0][0]).toHaveLength(2);

    const [projectRow, statusRows] = inserted as [
      { id: string; description: string | null; workspaceId: string },
      { id?: string; projectId: string; isDefault?: boolean; name: string }[],
    ];
    expect(inserted).toHaveLength(2); // no welcome task any more
    expect(projectRow).toMatchObject({ description: 'Marketing site', workspaceId: 'ws-1' });
    expect(statusRows.map((r) => r.name)).toEqual(['To Do', 'In Progress', 'Done']);
    expect(statusRows.every((r) => r.projectId === projectRow.id)).toBe(true);
    expect(statusRows.filter((r) => r.isDefault)).toHaveLength(1);
  });

  it('returns an error (and writes nothing partially) when the batch fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.select.mockReturnValue(chain([{ workspaceId: 'ws-1' }]));
    captureInserts();
    db.batch.mockRejectedValue(new Error('insert into task_status failed'));

    const result = await createProject({ workspaceSlug: 'acme', name: 'Site' });
    expect(result).toEqual({ error: 'Failed to create project.' });
  });
});

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const access = (role: 'owner' | 'admin' | 'member') => [
  { projectId: PROJECT_ID, projectName: 'Old name', workspaceId: 'ws-1', workspaceSlug: 'acme', role },
];

describe('updateProject', () => {
  function captureUpdate(returned: unknown) {
    const sets: unknown[] = [];
    db.update.mockImplementation(() => ({
      set: (v: unknown) => {
        sets.push(v);
        return { where: () => ({ returning: async () => [returned] }) };
      },
    }));
    return sets;
  }

  it('returns Not found for a project outside the caller\'s workspaces', async () => {
    db.select.mockReturnValue(chain([]));
    const result = await updateProject({ projectId: PROJECT_ID, name: 'New' });
    expect(result).toEqual({ error: 'Not found.' });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('rejects an empty name before any query', async () => {
    const result = await updateProject({ projectId: PROJECT_ID, name: '   ' });
    expect(result.error).toBe('Project name is required');
    expect(db.select).not.toHaveBeenCalled();
  });

  it('lets any member rename, trims input and logs the rename', async () => {
    db.select.mockReturnValue(chain(access('member')));
    const sets = captureUpdate({ id: PROJECT_ID, name: 'New name', description: 'About' });

    const result = await updateProject({ projectId: PROJECT_ID, name: '  New name ', description: ' About ' });

    expect(result).toEqual({ project: { id: PROJECT_ID, name: 'New name', description: 'About' } });
    expect(sets[0]).toEqual({ name: 'New name', description: 'About' });
    expect(insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'project.updated', metadata: { from: 'Old name', to: 'New name' } }),
    );
  });

  it('stores a blank description as null and skips activity when the name is unchanged', async () => {
    db.select.mockReturnValue(chain(access('member')));
    const sets = captureUpdate({ id: PROJECT_ID, name: 'Old name', description: null });

    await updateProject({ projectId: PROJECT_ID, name: 'Old name', description: '  ' });

    expect(sets[0]).toEqual({ name: 'Old name', description: null });
    expect(insertActivity).not.toHaveBeenCalled();
  });
});

describe('updateProject: details (B7)', () => {
  function captureSet() {
    const sets: unknown[] = [];
    db.update.mockImplementation(() => ({
      set: (v: unknown) => {
        sets.push(v);
        return { where: () => ({ returning: async () => [{ id: PROJECT_ID }] }) };
      },
    }));
    return sets;
  }

  it('saves client, deadline and status, clearing blanks to null', async () => {
    db.select.mockReturnValue(chain(access('member')));
    const sets = captureSet();
    await updateProject({ projectId: PROJECT_ID, name: 'Old name', clientName: ' Acme Co ', deadline: '2026-12-01', status: 'at_risk' });
    expect(sets[0]).toMatchObject({ clientName: 'Acme Co', deadline: '2026-12-01', status: 'at_risk' });

    await updateProject({ projectId: PROJECT_ID, name: 'Old name', clientName: '  ', deadline: '', status: null });
    expect(sets[1]).toMatchObject({ clientName: null, deadline: null, status: null });
  });

  it('leaves details alone when they are not sent', async () => {
    db.select.mockReturnValue(chain(access('member')));
    const sets = captureSet();
    await updateProject({ projectId: PROJECT_ID, name: 'Old name' });
    expect(sets[0]).not.toHaveProperty('clientName');
    expect(sets[0]).not.toHaveProperty('deadline');
    expect(sets[0]).not.toHaveProperty('status');
  });

  it('rejects a bad deadline or status before any query', async () => {
    expect(await updateProject({ projectId: PROJECT_ID, name: 'X', deadline: '12/01/2026' })).toHaveProperty('error');
    expect(
      await updateProject({ projectId: PROJECT_ID, name: 'X', status: 'great' as never }),
    ).toHaveProperty('error');
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('setProjectArchived (B6)', () => {
  function captureArchive(changed: boolean) {
    const sets: unknown[] = [];
    db.update.mockImplementation(() => ({
      set: (v: unknown) => {
        sets.push(v);
        return { where: () => ({ returning: async () => (changed ? [{ id: PROJECT_ID }] : []) }) };
      },
    }));
    return sets;
  }

  it('lets any member archive, and logs it', async () => {
    db.select.mockReturnValue(chain(access('member')));
    const sets = captureArchive(true);
    expect(await setProjectArchived({ projectId: PROJECT_ID, archived: true })).toEqual({ success: true });
    expect((sets[0] as { archivedAt: unknown }).archivedAt).toBeInstanceOf(Date);
    expect(insertActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'project.archived' }));
  });

  it('restores by clearing the date', async () => {
    db.select.mockReturnValue(chain(access('member')));
    const sets = captureArchive(true);
    await setProjectArchived({ projectId: PROJECT_ID, archived: false });
    expect(sets[0]).toEqual({ archivedAt: null });
    expect(insertActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'project.restored' }));
  });

  it('does nothing more when it was already archived', async () => {
    db.select.mockReturnValue(chain(access('member')));
    captureArchive(false);
    expect(await setProjectArchived({ projectId: PROJECT_ID, archived: true })).toEqual({ success: true });
    expect(insertActivity).not.toHaveBeenCalled();
  });

  it('refuses a project outside the caller\'s workspaces', async () => {
    db.select.mockReturnValue(chain([]));
    expect(await setProjectArchived({ projectId: PROJECT_ID, archived: true })).toEqual({ error: 'Not found.' });
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('setProjectShareLink (C4)', () => {
  /** Access check, then the current token. Records what gets written. */
  function setUp(role: 'owner' | 'admin' | 'member', current: string | null) {
    db.select.mockReturnValueOnce(chain(access(role))).mockReturnValueOnce(chain([{ token: current }]));
    const sets: { shareToken: string | null }[] = [];
    db.update.mockImplementation(() => ({
      set: (v: { shareToken: string | null }) => {
        sets.push(v);
        return chain(undefined);
      },
    }));
    return sets;
  }

  it('is for owners and admins only', async () => {
    const sets = setUp('member', null);
    expect(await setProjectShareLink({ projectId: PROJECT_ID, action: 'enable' })).toEqual({ error: 'Not found.' });
    expect(sets).toEqual([]);
  });

  it('creates an unguessable token and logs it', async () => {
    const sets = setUp('admin', null);
    const result = await setProjectShareLink({ projectId: PROJECT_ID, action: 'enable' });
    const token = (result as { token: string }).token;
    expect(isWellFormedShareToken(token)).toBe(true);
    expect(sets).toEqual([{ shareToken: token }]);
    expect(insertActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'project.share_link_created' }));
  });

  it('keeps the current link when turned on again', async () => {
    const existing = 'a'.repeat(43);
    const sets = setUp('owner', existing);
    expect(await setProjectShareLink({ projectId: PROJECT_ID, action: 'enable' })).toEqual({ token: existing });
    expect(sets).toEqual([]);
  });

  it('replaces the link with a new token', async () => {
    const existing = 'a'.repeat(43);
    const sets = setUp('owner', existing);
    const { token } = (await setProjectShareLink({ projectId: PROJECT_ID, action: 'replace' })) as { token: string };
    expect(token).not.toBe(existing);
    expect(sets).toEqual([{ shareToken: token }]);
  });

  it('turns the link off', async () => {
    const sets = setUp('owner', 'a'.repeat(43));
    expect(await setProjectShareLink({ projectId: PROJECT_ID, action: 'disable' })).toEqual({ token: null });
    expect(sets).toEqual([{ shareToken: null }]);
    expect(insertActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'project.share_link_disabled' }));
  });

  it('only accepts tokens of the issued shape', () => {
    expect(isWellFormedShareToken('a'.repeat(43))).toBe(true);
    expect(isWellFormedShareToken('a'.repeat(42))).toBe(false);
    expect(isWellFormedShareToken(`${'a'.repeat(42)}%`)).toBe(false);
  });
});

describe('deleteProject', () => {
  function captureDelete() {
    const where = vi.fn(async () => undefined);
    db.delete.mockImplementation(() => ({ where }));
    return where;
  }

  it('refuses plain members', async () => {
    db.select.mockReturnValue(chain(access('member')));
    const where = captureDelete();
    const result = await deleteProject({ projectId: PROJECT_ID });
    expect(result).toEqual({ error: 'Not found.' });
    expect(where).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('lets admins delete, logs it and redirects to the workspace home', async () => {
    db.select.mockReturnValue(chain(access('admin')));
    const where = captureDelete();

    await deleteProject({ projectId: PROJECT_ID });

    expect(where).toHaveBeenCalledOnce();
    expect(insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'project.deleted', metadata: { projectName: 'Old name' } }),
    );
    expect(redirect).toHaveBeenCalledWith('/workspaces/acme');
  });

  it('reports a failure without redirecting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.select.mockReturnValue(chain(access('owner')));
    db.delete.mockImplementation(() => ({ where: async () => { throw new Error('db down'); } }));

    const result = await deleteProject({ projectId: PROJECT_ID });
    expect(result).toEqual({ error: 'Failed to delete project.' });
    expect(redirect).not.toHaveBeenCalled();
  });
});
