import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), batch: vi.fn() }));

vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/activity', () => ({ insertActivity: vi.fn() }));

import { auth } from '@/lib/auth';
import { createProject } from '@/features/projects/actions';

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
  it('throws Unauthorized without a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await expect(createProject({ workspaceSlug: 'acme', name: 'Site' })).rejects.toThrow(
      'Unauthorized',
    );
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

  it('writes project, columns and welcome task in one batch', async () => {
    db.select.mockReturnValue(chain([{ workspaceId: 'ws-1' }]));
    const inserted = captureInserts();
    db.batch.mockImplementation(async () => [[{ id: 'p-1', name: 'Site' }], [], []]);

    const result = await createProject({
      workspaceSlug: 'acme',
      name: 'Site',
      description: '  Marketing site  ',
    });

    expect(result).toEqual({ project: { id: 'p-1', name: 'Site' } });
    expect(db.batch).toHaveBeenCalledOnce();
    expect(db.batch.mock.calls[0][0]).toHaveLength(3);

    const [projectRow, statusRows, taskRow] = inserted as [
      { id: string; description: string | null; workspaceId: string },
      { id?: string; projectId: string; isDefault?: boolean }[],
      { projectId: string; statusId: string },
    ];
    expect(projectRow).toMatchObject({ description: 'Marketing site', workspaceId: 'ws-1' });
    expect(statusRows.every((r) => r.projectId === projectRow.id)).toBe(true);
    const todo = statusRows.find((r) => r.isDefault);
    expect(taskRow).toMatchObject({ projectId: projectRow.id, statusId: todo?.id });
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
