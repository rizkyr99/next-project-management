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
import { createProject, deleteProject, updateProject } from '@/features/projects/actions';

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
