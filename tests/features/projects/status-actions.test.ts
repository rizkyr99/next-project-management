import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  batch: vi.fn(),
}));

vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

import { auth } from '@/lib/auth';
import {
  createStatus,
  deleteStatus,
  reorderStatuses,
  setDefaultStatus,
} from '@/features/projects/status-actions';

const P = '11111111-1111-4111-8111-111111111111';
const S1 = '22222222-2222-4222-8222-222222222222';
const S2 = '33333333-3333-4333-8333-333333333333';
const S3 = '44444444-4444-4444-8444-444444444444';
const FOREIGN = '55555555-5555-4555-8555-555555555555';

const statusAccess = (isDefault = false) => [
  {
    statusId: S1,
    statusName: 'Doing',
    isDefault,
    projectId: P,
    workspaceId: 'ws',
    workspaceSlug: 'acme',
    role: 'member',
  },
];
const projectAccess = [
  { projectId: P, projectName: 'Site', workspaceId: 'ws', workspaceSlug: 'acme', role: 'member' },
];

/** db.update/db.delete return tagged markers so we can inspect the batch. */
function markers() {
  db.update.mockImplementation(() => ({
    set: (values: unknown) => ({ where: () => ({ kind: 'update', values }) }),
  }));
  db.delete.mockImplementation(() => ({ where: () => ({ kind: 'delete' }) }));
  db.batch.mockResolvedValue([]);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'u1', name: 'A' } } as never);
  markers();
});

describe('deleteStatus', () => {
  function selects(...results: unknown[]) {
    for (const r of results) db.select.mockReturnValueOnce(chain(r));
  }

  it('refuses to delete the last column', async () => {
    selects(statusAccess(), [{ id: S1 }]);
    const result = await deleteStatus({ statusId: S1 });
    expect(result).toEqual({ error: 'A project needs at least one column.' });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('requires a destination when the column has tasks', async () => {
    selects(statusAccess(), [{ id: S1 }, { id: S2 }], [{ id: 't1' }]);
    const result = await deleteStatus({ statusId: S1 });
    expect(result.error).toMatch(/Choose a column to move/);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('requires a new default when deleting the default column, even if empty', async () => {
    selects(statusAccess(true), [{ id: S1 }, { id: S2 }], []);
    const result = await deleteStatus({ statusId: S1 });
    expect(result.error).toMatch(/new default/);
  });

  it("rejects a destination from another project (or itself) as Not found", async () => {
    selects(statusAccess(), [{ id: S1 }, { id: S2 }], [{ id: 't1' }]);
    expect(await deleteStatus({ statusId: S1, moveTasksTo: FOREIGN })).toEqual({ error: 'Not found.' });
    selects(statusAccess(), [{ id: S1 }, { id: S2 }], [{ id: 't1' }]);
    expect(await deleteStatus({ statusId: S1, moveTasksTo: S1 })).toEqual({ error: 'Not found.' });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('moves every task and deletes the column in one batch', async () => {
    selects(statusAccess(), [{ id: S1 }, { id: S2 }], [{ id: 't1' }, { id: 't2' }], [{ maxOrder: 4 }]);
    const result = await deleteStatus({ statusId: S1, moveTasksTo: S2 });

    expect(result).toEqual({ movedTasks: 2 });
    expect(db.batch).toHaveBeenCalledOnce();
    const batch = db.batch.mock.calls[0][0] as { kind: string; values?: { statusId?: string } }[];
    expect(batch.map((s) => s.kind)).toEqual(['update', 'delete']);
    expect(batch[0].values?.statusId).toBe(S2);
  });

  it('hands the default flag to the destination when deleting the default column', async () => {
    selects(statusAccess(true), [{ id: S1 }, { id: S2 }], [], );
    const result = await deleteStatus({ statusId: S1, moveTasksTo: S2 });

    expect(result).toEqual({ movedTasks: 0 });
    const batch = db.batch.mock.calls[0][0] as { kind: string; values?: { isDefault?: boolean } }[];
    expect(batch.map((s) => s.kind)).toEqual(['update', 'delete']);
    expect(batch[0].values).toEqual({ isDefault: true });
  });

  it('deletes an empty, non-default column without a destination', async () => {
    selects(statusAccess(), [{ id: S1 }, { id: S2 }], []);
    expect(await deleteStatus({ statusId: S1 })).toEqual({ movedTasks: 0 });
    const batch = db.batch.mock.calls[0][0] as { kind: string }[];
    expect(batch.map((s) => s.kind)).toEqual(['delete']);
  });

  it('returns Not found for columns outside the caller\'s workspaces', async () => {
    selects([]);
    expect(await deleteStatus({ statusId: S1, moveTasksTo: S2 })).toEqual({ error: 'Not found.' });
  });
});

describe('reorderStatuses', () => {
  it('rejects a list that is not exactly the project\'s columns', async () => {
    db.select.mockReturnValueOnce(chain(projectAccess));
    db.select.mockReturnValueOnce(chain([{ id: S1 }, { id: S2 }, { id: S3 }]));
    const result = await reorderStatuses({ projectId: P, statusIds: [S2, S1] });
    expect(result.error).toMatch(/board changed/);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('rejects duplicates', async () => {
    db.select.mockReturnValueOnce(chain(projectAccess));
    db.select.mockReturnValueOnce(chain([{ id: S1 }, { id: S2 }]));
    const result = await reorderStatuses({ projectId: P, statusIds: [S1, S1] });
    expect(result.error).toMatch(/board changed/);
  });

  it('writes 1-based orders in the given sequence', async () => {
    db.select.mockReturnValueOnce(chain(projectAccess));
    db.select.mockReturnValueOnce(chain([{ id: S1 }, { id: S2 }, { id: S3 }]));
    expect(await reorderStatuses({ projectId: P, statusIds: [S3, S1, S2] })).toEqual({ success: true });
    const batch = db.batch.mock.calls[0][0] as { values: { order: number } }[];
    expect(batch.map((s) => s.values.order)).toEqual([1, 2, 3]);
  });
});

describe('createStatus', () => {
  it('caps a project at 20 columns', async () => {
    db.select.mockReturnValueOnce(chain(projectAccess));
    db.select.mockReturnValueOnce(chain([{ count: 20, maxOrder: 20 }]));
    const result = await createStatus({ projectId: P, name: 'One more' });
    expect(result.error).toMatch(/at most 20 columns/);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('appends after the last column', async () => {
    db.select.mockReturnValueOnce(chain(projectAccess));
    db.select.mockReturnValueOnce(chain([{ count: 3, maxOrder: 3 }]));
    const values = vi.fn(() => ({ returning: async () => [{ id: 'new', name: 'Review', order: 4 }] }));
    db.insert.mockImplementation(() => ({ values }));

    expect(await createStatus({ projectId: P, name: ' Review ' })).toEqual({
      status: { id: 'new', name: 'Review', order: 4 },
    });
    expect(values).toHaveBeenCalledWith({ projectId: P, name: 'Review', order: 4 });
  });
});

describe('setDefaultStatus', () => {
  it('clears every default in the project, then sets one, atomically', async () => {
    db.select.mockReturnValueOnce(chain(statusAccess()));
    expect(await setDefaultStatus({ statusId: S1 })).toEqual({ success: true });
    const batch = db.batch.mock.calls[0][0] as { values: { isDefault: boolean } }[];
    expect(batch.map((s) => s.values.isDefault)).toEqual([false, true]);
  });
});
