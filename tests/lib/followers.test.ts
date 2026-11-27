import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain, failingChain } from '../helpers/db-mock';

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), delete: vi.fn(), batch: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));

import { follow, notifyFollowers } from '@/lib/followers';

const workspace = { id: 'ws-1', slug: 'acme' };
const actor = { id: 'me', name: 'Alice' };
const task = { id: 'task-1', title: 'Hero' };

/** Captures the rows passed to db.insert(...).values(rows). */
function captureInsert() {
  const rows: Record<string, unknown>[] = [];
  db.insert.mockImplementation(() => ({
    values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
      rows.push(...(Array.isArray(v) ? v : [v]));
      return chain(undefined);
    },
  }));
  return rows;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('follow', () => {
  it('does nothing for no one, and follows each person once', async () => {
    await follow('task-1', []);
    expect(db.insert).not.toHaveBeenCalled();

    const rows = captureInsert();
    await follow('task-1', ['a', 'a', 'b']);
    expect(rows).toEqual([
      { taskId: 'task-1', userId: 'a' },
      { taskId: 'task-1', userId: 'b' },
    ]);
  });
});

describe('notifyFollowers', () => {
  it('sends nothing when no one else follows', async () => {
    db.select.mockReturnValueOnce(chain([]));
    await notifyFollowers({ type: 'task_comment', workspace, projectId: 'p-1', actor, tasks: [task] });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('notifies followers of a comment, linking to the task', async () => {
    db.select.mockReturnValueOnce(chain([{ taskId: 'task-1', userId: 'bob' }]));
    const rows = captureInsert();
    await notifyFollowers({ type: 'task_comment', workspace, projectId: 'p-1', actor, tasks: [task] });
    expect(rows).toEqual([
      expect.objectContaining({
        userId: 'bob',
        type: 'task_comment',
        actorName: 'Alice',
        taskTitle: 'Hero',
        detail: null,
        taskId: 'task-1',
        href: '/workspaces/acme/projects/p-1?task=task-1',
      }),
    ]);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('names the new column, replacing the unread column notification in one batch', async () => {
    db.select
      .mockReturnValueOnce(chain([{ taskId: 'task-1', userId: 'bob' }]))
      .mockReturnValueOnce(chain([{ name: 'Done' }]));
    db.delete.mockReturnValue(chain(undefined));
    const rows = captureInsert();
    db.batch.mockResolvedValue([]);
    await notifyFollowers({
      type: 'task_status_changed',
      workspace,
      projectId: 'p-1',
      actor,
      tasks: [task],
      statusId: 's-done',
    });
    expect(db.batch).toHaveBeenCalledOnce();
    expect(db.batch.mock.calls[0][0]).toHaveLength(2);
    expect(rows).toEqual([expect.objectContaining({ type: 'task_status_changed', detail: 'Done' })]);
  });

  it('sends nothing for a column outside the project', async () => {
    db.select.mockReturnValueOnce(chain([{ taskId: 'task-1', userId: 'bob' }])).mockReturnValueOnce(chain([]));
    await notifyFollowers({
      type: 'task_status_changed',
      workspace,
      projectId: 'p-1',
      actor,
      tasks: [task],
      statusId: 'elsewhere',
    });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('skips the query when no task changed, and never throws', async () => {
    await notifyFollowers({ type: 'task_comment', workspace, projectId: 'p-1', actor, tasks: [] });
    expect(db.select).not.toHaveBeenCalled();

    db.select.mockReturnValueOnce(failingChain(new Error('db down')));
    await expect(
      notifyFollowers({ type: 'task_comment', workspace, projectId: 'p-1', actor, tasks: [task] }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
