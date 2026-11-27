import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { chain, failingChain } from '../../helpers/db-mock';

const LOCK = 'lock-task';
const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  batch: vi.fn(),
}));

vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/activity', () => ({ insertActivity: vi.fn() }));
vi.mock('@/lib/notification-emails', () => ({ emailTaskNotification: vi.fn() }));
// The row lock is a batch's first statement (C2); the batch mock skips it.
vi.mock('@/lib/task-lock', () => ({ lockTask: () => LOCK }));
vi.mock('@/lib/followers', () => ({ followQuietly: vi.fn(), notifyFollowers: vi.fn(), tasksLeavingColumn: vi.fn() }));
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, enforceRateLimit: vi.fn() };
});
// after() needs a request scope; run the callback inline so it can be asserted.
vi.mock('next/server', () => ({ after: (fn: () => unknown) => fn() }));

// Keep the real error classes and toActionError; stub the DB-backed checks so
// each action can be tested against "allowed" and "denied" outcomes.
vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authz')>();
  return {
    ...actual,
    requireProjectAccess: vi.fn(),
    requireTaskAccess: vi.fn(),
    requireCommentAccess: vi.fn(),
    assertStatusInProject: vi.fn(),
    assertTasksInProject: vi.fn(),
    assertWorkspaceMembers: vi.fn(),
  };
});

import { revalidatePath } from 'next/cache';
import { insertActivity } from '@/lib/activity';
import { emailTaskNotification } from '@/lib/notification-emails';
import { followQuietly, notifyFollowers, tasksLeavingColumn } from '@/lib/followers';
import { enforceRateLimit, RateLimitError } from '@/lib/rate-limit';
import {
  AuthzError,
  UnauthenticatedError,
  assertStatusInProject,
  assertTasksInProject,
  assertWorkspaceMembers,
  requireCommentAccess,
  requireProjectAccess,
  requireTaskAccess,
} from '@/lib/authz';
import {
  addComment,
  bulkDeleteTasks,
  bulkUpdateStatus,
  createTask,
  deleteComment,
  deleteTask,
  getComments,
  reorderTasks,
  setCommentVisibility,
  updateTaskAssignees,
  updateTaskDescription,
  updateTaskStartDate,
  updateTaskStatus,
  updateTaskTitle,
} from '@/features/tasks/actions';

/** db.batch that runs each query mock (the task lock resolves to no rows). */
function runBatch() {
  db.batch.mockImplementationOnce(async (queries: unknown[]) =>
    Promise.all(queries.map((q) => (q === LOCK ? [] : q))),
  );
}

/**
 * The comment insert (an insert from a select of the task row): records the
 * selected fields, resolves to the row the database would return.
 */
function commentInsert(returned: Record<string, unknown>, fields?: Record<string, unknown>[]) {
  runBatch();
  db.insert.mockImplementationOnce(() => ({
    select: (build: (qb: unknown) => unknown) => {
      build({
        select: (f: Record<string, unknown>) => {
          fields?.push(f);
          return chain(undefined);
        },
      });
      return chain([returned]);
    },
  }));
}

const PROJECT = '00000000-0000-4000-8000-000000000001';
const STATUS = '00000000-0000-4000-8000-000000000002';
const TASK = '00000000-0000-4000-8000-000000000003';
const OTHER_PROJECT = '00000000-0000-4000-8000-000000000004';
const COMMENT = '00000000-0000-4000-8000-000000000005';

const session = { user: { id: 'user-1', name: 'Alice', email: 'a@example.com' } };
const workspaceCtx = { id: 'ws-1', slug: 'acme' };

const projectCtx = {
  session,
  role: 'member' as const,
  project: { id: PROJECT, name: 'Website' },
  workspace: workspaceCtx,
};

const taskCtx = {
  session,
  role: 'member' as const,
  task: { id: TASK, title: 'Ship it', statusId: STATUS },
  project: { id: PROJECT },
  workspace: workspaceCtx,
};

const denied = () => Promise.reject(new AuthzError());

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireProjectAccess).mockResolvedValue(projectCtx as never);
  vi.mocked(requireTaskAccess).mockResolvedValue(taskCtx as never);
  vi.mocked(assertStatusInProject).mockResolvedValue(undefined);
  vi.mocked(assertTasksInProject).mockResolvedValue(undefined);
  vi.mocked(assertWorkspaceMembers).mockResolvedValue(undefined);
  vi.mocked(tasksLeavingColumn).mockResolvedValue([]);
});

function expectNoWrites() {
  expect(db.insert).not.toHaveBeenCalled();
  expect(db.update).not.toHaveBeenCalled();
  expect(db.delete).not.toHaveBeenCalled();
  expect(db.batch).not.toHaveBeenCalled();
}

describe('createTask', () => {
  const input = { title: 'Task', order: 0, projectId: PROJECT, statusId: STATUS };

  it('returns a session-expired message when there is no session', async () => {
    vi.mocked(requireProjectAccess).mockRejectedValue(new UnauthenticatedError());
    expect(await createTask(input)).toEqual({ error: 'Your session has expired. Log in again to continue.' });
    expectNoWrites();
  });

  it('rejects a project in another workspace without writing', async () => {
    vi.mocked(requireProjectAccess).mockImplementation(denied);
    expect(await createTask(input)).toEqual({ error: 'Not found.' });
    expectNoWrites();
  });

  it("rejects a status that belongs to a different project", async () => {
    vi.mocked(assertStatusInProject).mockImplementation(denied);
    expect(await createTask(input)).toEqual({ error: 'Not found.' });
    expectNoWrites();
  });

  it('rejects invalid input before checking access', async () => {
    const result = await createTask({ ...input, title: '' });
    expect(result.error).toBe('Task title is required');
    expect(requireProjectAccess).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('creates the task and revalidates the real project route', async () => {
    const newTask = { id: TASK, title: 'Task', projectId: PROJECT, statusId: STATUS, order: 0 };
    db.insert.mockReturnValue(chain([newTask]));

    expect(await createTask(input)).toEqual({ task: newTask });
    expect(revalidatePath).toHaveBeenCalledWith(`/workspaces/acme/projects/${PROJECT}`);
    expect(insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', actorId: 'user-1', action: 'task.created' }),
    );
  });

  it('returns a generic error when the insert fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.insert.mockReturnValue(failingChain(new Error('DB error')));
    expect(await createTask(input)).toEqual({ error: 'Failed to create task.' });
  });
});

describe('updateTaskStatus', () => {
  it('rejects when the task is not in the claimed project', async () => {
    const result = await updateTaskStatus({
      taskId: TASK,
      statusId: STATUS,
      projectId: OTHER_PROJECT,
    });
    expect(result).toEqual({ error: 'Not found.' });
    expectNoWrites();
  });

  it('rejects a task from another workspace', async () => {
    vi.mocked(requireTaskAccess).mockImplementation(denied);
    const result = await updateTaskStatus({ taskId: TASK, statusId: STATUS, projectId: PROJECT });
    expect(result).toEqual({ error: 'Not found.' });
    expectNoWrites();
  });

  it('updates the status for a member', async () => {
    db.update.mockReturnValue(chain(undefined));
    const result = await updateTaskStatus({ taskId: TASK, statusId: STATUS, projectId: PROJECT });
    expect(result).toEqual({ success: true });
    expect(db.update).toHaveBeenCalledOnce();
  });

  it('tells followers when the task changes column, not when it stays (I4)', async () => {
    db.update.mockReturnValue(chain(undefined));
    await updateTaskStatus({ taskId: TASK, statusId: STATUS, projectId: PROJECT });
    expect(notifyFollowers).not.toHaveBeenCalled();

    const DONE = '00000000-0000-4000-8000-000000000009';
    await updateTaskStatus({ taskId: TASK, statusId: DONE, projectId: PROJECT });
    expect(notifyFollowers).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task_status_changed',
        statusId: DONE,
        tasks: [{ id: TASK, title: 'Ship it' }],
        actor: session.user,
      }),
    );
  });
});

describe('bulkUpdateStatus', () => {
  it('rejects when any task is outside the project', async () => {
    vi.mocked(assertTasksInProject).mockImplementation(denied);
    const result = await bulkUpdateStatus({
      taskIds: [TASK],
      statusId: STATUS,
      projectId: PROJECT,
    });
    expect(result).toEqual({ error: 'Not found.' });
    expectNoWrites();
  });
});

describe('bulkDeleteTasks', () => {
  it('deletes nothing when a foreign task ID is included', async () => {
    vi.mocked(assertTasksInProject).mockImplementation(denied);
    const result = await bulkDeleteTasks({ taskIds: [TASK], projectId: PROJECT });
    expect(result).toEqual({ error: 'Not found.' });
    expectNoWrites();
  });

  it('rejects a project in another workspace', async () => {
    vi.mocked(requireProjectAccess).mockImplementation(denied);
    const result = await bulkDeleteTasks({ taskIds: [TASK], projectId: PROJECT });
    expect(result).toEqual({ error: 'Not found.' });
    expect(assertTasksInProject).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('deletes and logs one activity per task', async () => {
    db.delete.mockReturnValue(chain([{ title: 'A' }, { title: 'B' }]));
    const result = await bulkDeleteTasks({ taskIds: [TASK], projectId: PROJECT });
    expect(result).toEqual({ success: true });
    expect(insertActivity).toHaveBeenCalledTimes(2);
  });
});

describe('reorderTasks', () => {
  it('rejects tasks from another project', async () => {
    vi.mocked(assertTasksInProject).mockImplementation(denied);
    const result = await reorderTasks({
      projectId: PROJECT,
      statusId: STATUS,
      tasks: [{ id: TASK, order: 0 }],
    });
    expect(result).toEqual({ error: 'Not found.' });
    expectNoWrites();
  });

  it('sends all updates in a single batch', async () => {
    db.update.mockReturnValue(chain(undefined));
    db.batch.mockResolvedValue([]);
    const result = await reorderTasks({
      projectId: PROJECT,
      statusId: STATUS,
      tasks: [
        { id: TASK, order: 0 },
        { id: COMMENT, order: 1 },
      ],
    });
    expect(result).toEqual({ success: true });
    expect(db.batch).toHaveBeenCalledOnce();
    expect(db.batch.mock.calls[0][0]).toHaveLength(2);
  });

  it('tells followers only about the cards that came from another column (I4)', async () => {
    db.update.mockReturnValue(chain(undefined));
    db.batch.mockResolvedValue([]);
    vi.mocked(tasksLeavingColumn).mockResolvedValue([{ id: TASK, title: 'Ship it' }]);
    await reorderTasks({ projectId: PROJECT, statusId: STATUS, tasks: [{ id: TASK, order: 0 }, { id: COMMENT, order: 1 }] });
    expect(tasksLeavingColumn).toHaveBeenCalledWith([TASK, COMMENT], STATUS, PROJECT);
    expect(notifyFollowers).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task_status_changed', tasks: [{ id: TASK, title: 'Ship it' }], statusId: STATUS }),
    );
  });
});

describe('updateTaskTitle', () => {
  it('rejects a task from another workspace', async () => {
    vi.mocked(requireTaskAccess).mockImplementation(denied);
    expect(await updateTaskTitle(TASK, 'New')).toEqual({ error: 'Not found.' });
    expectNoWrites();
  });

  it('rejects an empty title', async () => {
    const result = await updateTaskTitle(TASK, '   ');
    expect(result.error).toMatch(/between 1 and 255/);
    expectNoWrites();
  });
});

describe('updateTaskStartDate (B4)', () => {
  it('saves a calendar day and logs it', async () => {
    const set = vi.fn(() => chain(undefined));
    db.update.mockReturnValue({ set } as never);
    expect(await updateTaskStartDate(TASK, '2026-12-01')).toEqual({ success: true });
    expect(set).toHaveBeenCalledWith({ startDate: '2026-12-01' });
    expect(insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.start_date_changed', metadata: expect.objectContaining({ startDate: '2026-12-01' }) }),
    );
  });

  it('clears it, and refuses anything that isn’t a day or a task you can open', async () => {
    const set = vi.fn(() => chain(undefined));
    db.update.mockReturnValue({ set } as never);
    expect(await updateTaskStartDate(TASK, null)).toEqual({ success: true });
    expect(set).toHaveBeenCalledWith({ startDate: null });
    set.mockClear();
    expect((await updateTaskStartDate(TASK, '2026-13-40')).error).toBe('Pick a valid start date.');
    vi.mocked(requireTaskAccess).mockImplementation(denied);
    expect(await updateTaskStartDate(TASK, '2026-12-01')).toEqual({ error: 'Not found.' });
    expect(set).not.toHaveBeenCalled();
  });
});

describe('updateTaskDescription', () => {
  function captureSet() {
    const set = vi.fn(() => chain(undefined));
    db.update.mockReturnValue({ set });
    return set;
  }

  it('rejects a task from another workspace', async () => {
    vi.mocked(requireTaskAccess).mockImplementation(denied);
    expect(await updateTaskDescription({ taskId: TASK, description: 'x' })).toEqual({ error: 'Not found.' });
    expectNoWrites();
  });

  it('stores trimmed Markdown and logs the change', async () => {
    const set = captureSet();
    const result = await updateTaskDescription({ taskId: TASK, description: '  **Do** the thing  ' });
    expect(result).toEqual({ success: true });
    expect(set).toHaveBeenCalledWith({ description: '**Do** the thing' });
    expect(revalidatePath).toHaveBeenCalledWith(`/workspaces/acme/projects/${PROJECT}`);
    expect(insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.description_changed', taskId: TASK }),
    );
  });

  it('clears the description when it is blank', async () => {
    const set = captureSet();
    await updateTaskDescription({ taskId: TASK, description: '   \n ' });
    expect(set).toHaveBeenCalledWith({ description: null });
  });

  it('rejects descriptions over 10,000 characters', async () => {
    const result = await updateTaskDescription({ taskId: TASK, description: 'a'.repeat(10_001) });
    expect(result.error).toMatch(/10,000 characters/);
    expectNoWrites();
  });
});

describe('deleteTask', () => {
  it('rejects a task from another workspace', async () => {
    vi.mocked(requireTaskAccess).mockImplementation(denied);
    expect(await deleteTask({ taskId: TASK })).toEqual({ error: 'Not found.' });
    expectNoWrites();
  });

  it('rejects a malformed id without touching the database', async () => {
    expect((await deleteTask({ taskId: 'nope' })).error).toBeDefined();
    expect(requireTaskAccess).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('deletes the task and logs it without a dangling task id', async () => {
    db.delete.mockReturnValue(chain(undefined));
    expect(await deleteTask({ taskId: TASK })).toEqual({ success: true });
    expect(db.delete).toHaveBeenCalledOnce();
    expect(insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.deleted', taskId: null, metadata: { taskTitle: 'Ship it' } }),
    );
  });
});

describe('updateTaskAssignees', () => {
  it('is rate limited per actor before any write (each assignment can send an email)', async () => {
    vi.mocked(enforceRateLimit).mockRejectedValue(new RateLimitError(30));
    const result = await updateTaskAssignees(TASK, ['user-2']);
    expect(result.error).toMatch(/Too many requests/);
    expect(enforceRateLimit).toHaveBeenCalledWith('assignees', 'user-1');
    expectNoWrites();
    expect(emailTaskNotification).not.toHaveBeenCalled();
  });

  it('refuses to assign users outside the workspace', async () => {
    vi.mocked(assertWorkspaceMembers).mockImplementation(denied);
    expect(await updateTaskAssignees(TASK, ['outsider'])).toEqual({ error: 'Not found.' });
    expectNoWrites();
  });
});

describe('task notifications link to the task', () => {
  const href = `/workspaces/acme/projects/${PROJECT}?task=${TASK}`;

  it('stores the task link on assignment notifications', async () => {
    const written: Record<string, unknown>[] = [];
    db.select
      .mockReturnValueOnce(chain([])) // existing assignees
      .mockReturnValueOnce(chain([{ id: 'user-2', name: 'Bob' }])); // names for activity
    db.delete.mockReturnValue(chain(undefined));
    db.batch.mockResolvedValue([]);
    db.insert
      .mockReturnValueOnce(chain(undefined)) // assignee rows (inside the batch)
      .mockImplementationOnce(() => ({
        values: (rows: Record<string, unknown>[]) => {
          written.push(...rows);
          return chain(undefined);
        },
      }));

    expect(await updateTaskAssignees(TASK, ['user-2'])).toEqual({ success: true });
    expect(followQuietly).toHaveBeenCalledWith(TASK, ['user-2']);
    expect(emailTaskNotification).toHaveBeenCalledWith({
      projectId: expect.any(String),
      kind: 'assigned',
      userIds: ['user-2'],
      actorName: 'Alice',
      taskTitle: 'Ship it',
      href,
    });
    expect(written).toEqual([
      expect.objectContaining({
        userId: 'user-2',
        type: 'task_assigned',
        workspaceId: 'ws-1',
        projectId: PROJECT,
        taskId: TASK,
        href,
      }),
    ]);
  });

  it('stores the task link on mention notifications', async () => {
    const written: Record<string, unknown>[] = [];
    commentInsert({ id: COMMENT, clientVisible: false });
    db.insert.mockImplementationOnce(() => ({
      values: (rows: Record<string, unknown>[]) => {
        written.push(...rows);
        return chain(undefined);
      },
    }));
    db.select
      .mockReturnValueOnce(chain([{ id: 'user-2', name: 'Bob' }]))
      .mockReturnValueOnce(chain([{ id: COMMENT, body: 'hi @Bob' }]));

    await addComment(TASK, 'hi @Bob');
    expect(written).toEqual([expect.objectContaining({ type: 'comment_mention', taskId: TASK, href })]);
    // I4: the commenter follows; followers hear about it, except those just @mentioned.
    expect(followQuietly).toHaveBeenCalledWith(TASK, ['user-1']);
    expect(notifyFollowers).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task_comment', tasks: [{ id: TASK, title: 'Ship it' }], skip: ['user-2'] }),
    );
    expect(emailTaskNotification).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'mentioned', userIds: ['user-2'], href, excerpt: 'hi @Bob' }),
    );
  });
});

describe('getComments', () => {
  it('returns Not found for a task in another workspace', async () => {
    vi.mocked(requireTaskAccess).mockImplementation(denied);
    expect(await getComments(TASK)).toEqual({ error: 'Not found.' });
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('addComment', () => {
  it('rejects a task in another workspace', async () => {
    vi.mocked(requireTaskAccess).mockImplementation(denied);
    expect(await addComment(TASK, 'hello')).toEqual({ error: 'Not found.' });
    expectNoWrites();
  });

  /** Runs addComment against the given members; returns notified user IDs. */
  async function notifiedBy(body: string, members: { id: string; name: string }[]) {
    const notified: string[] = [];
    commentInsert({ id: COMMENT, clientVisible: false });
    db.insert
      // notification insert: capture what gets written
      .mockImplementationOnce(() => ({
        values: (rows: { userId: string }[]) => {
          notified.push(...rows.map((r) => r.userId));
          return chain(undefined);
        },
      }));
    db.select
      // workspace members (server-side source of truth)
      .mockReturnValueOnce(chain(members))
      // comment with author
      .mockReturnValueOnce(chain([{ id: COMMENT, body }]));

    await addComment(TASK, body);
    return notified;
  }

  const members = [
    { id: 'user-1', name: 'Alice' }, // the commenter
    { id: 'user-2', name: 'Bob' },
    { id: 'user-3', name: 'Ada Lovelace' },
  ];

  it('notifies members mentioned mid-sentence, but not non-members or yourself', async () => {
    const notified = await notifiedBy('hey @Bob can you check, cc @Mallory @Alice', members);
    expect(notified).toEqual(['user-2']);
  });

  it('notifies only the longest matching member at each @ (not "Ada" for "@Ada Lovelace")', async () => {
    const notified = await notifiedBy('@Ada Lovelace please review', [
      ...members,
      { id: 'user-4', name: 'Ada' },
    ]);
    expect(notified).toEqual(['user-3']);
  });

  it('matches multi-word names case-insensitively', async () => {
    const notified = await notifiedBy('@ada lovelace please review', members);
    expect(notified).toEqual(['user-3']);
  });

  it('does not match a name that is only a prefix of another word', async () => {
    const notified = await notifiedBy('ping @Bobby', members);
    expect(notified).toEqual([]);
  });

  it('skips the member lookup when there is no @', async () => {
    commentInsert({ id: COMMENT, clientVisible: false });
    db.select.mockReturnValueOnce(chain([{ id: COMMENT, body: 'plain' }]));
    await addComment(TASK, 'plain comment');
    expect(db.select).toHaveBeenCalledOnce();
  });
});

describe('internal vs client-visible comments (C2)', () => {
  /**
   * Runs addComment. The database decides visibility from the task row, so
   * `stored` is what it returns; `asked` is whether the insert asked for the
   * client to see it (before the task's own internal flag is applied).
   */
  async function post(
    role: 'member' | 'guest',
    body: string,
    options: { clientVisible?: boolean },
    members: { id: string; name: string; role: string }[] = [],
    stored?: boolean,
  ) {
    vi.mocked(requireTaskAccess).mockResolvedValue({ ...taskCtx, role } as never);
    const fields: Record<string, unknown>[] = [];
    const notified: string[] = [];
    commentInsert({ id: COMMENT, clientVisible: stored ?? false }, fields);
    if (body.includes('@'))
      db.insert.mockImplementationOnce(() => ({
        values: (rows: { userId: string }[]) => {
          notified.push(...rows.map((r) => r.userId));
          return chain(undefined);
        },
      }));
    if (body.includes('@')) db.select.mockReturnValueOnce(chain(members));
    db.select.mockReturnValueOnce(chain([{ id: COMMENT, body }]));
    await addComment(TASK, body, options);
    const visible = new PgDialect().sqlToQuery((fields[0].clientVisible as SQL.Aliased).sql);
    // `<asked> and not "task"."internal"`: an internal task's comments stay with the team.
    expect(visible.sql).toMatch(/and not "task"\."internal"$/);
    return { asked: visible.params[0], notified };
  }

  const audience = [
    { id: 'user-1', name: 'Alice', role: 'member' },
    { id: 'user-2', name: 'Bob', role: 'member' },
    { id: 'guest-1', name: 'Cleo', role: 'guest' },
  ];

  it('keeps a team comment internal unless it is posted to the client', async () => {
    expect((await post('member', 'note', {})).asked).toBe(false);
    expect((await post('member', 'for you', { clientVisible: true })).asked).toBe(true);
  });

  it("always shows a guest's comment to the client side", async () => {
    expect((await post('guest', 'hi', { clientVisible: false })).asked).toBe(true);
  });

  it('never notifies a client about an internal comment, even if mentioned', async () => {
    const { notified } = await post('member', '@Cleo @Bob see this', {}, audience);
    expect(notified).toEqual(['user-2']);
  });

  it('notifies a mentioned client about a comment posted to them', async () => {
    const { notified } = await post('member', '@Cleo see this', { clientVisible: true }, audience, true);
    expect(notified).toEqual(['guest-1']);
  });

  it("refuses a client's comment on a task hidden from them meanwhile", async () => {
    vi.mocked(requireTaskAccess).mockResolvedValue({ ...taskCtx, role: 'guest' } as never);
    runBatch();
    db.insert.mockImplementationOnce(() => ({ select: () => chain([]) })); // the task is internal now
    expect(await addComment(TASK, 'hi')).toEqual({ error: 'Not found.' });
    expect(insertActivity).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it('follows what was saved: asked for the client, but the task went internal', async () => {
    const { asked, notified } = await post('member', '@Cleo @Bob see this', { clientVisible: true }, audience, false);
    expect(asked).toBe(true);
    expect(notified).toEqual(['user-2']);
  });

  const commentCtx = (role: string, authorId: string) => ({
    session,
    role,
    comment: { id: COMMENT, authorId, taskId: TASK, clientVisible: false },
    project: { id: PROJECT },
    workspace: { id: 'ws-1' },
  });

  it("refuses to share someone else's comment unless you're an admin", async () => {
    vi.mocked(requireCommentAccess).mockResolvedValue(commentCtx('member', 'user-2') as never);
    expect((await setCommentVisibility(COMMENT, true)).error).toMatch(/author or an admin/);
    expectNoWrites();
  });

  it("refuses to make a client's own comment internal", async () => {
    vi.mocked(requireCommentAccess).mockResolvedValue(commentCtx('admin', 'guest-1') as never);
    db.select.mockReturnValueOnce(chain([{ role: 'guest' }]));
    expect((await setCommentVisibility(COMMENT, false)).error).toMatch(/always visible/);
    expectNoWrites();
  });

  it('lets the author share their comment, and is closed to guests', async () => {
    vi.mocked(requireCommentAccess).mockResolvedValue(commentCtx('member', 'user-1') as never);
    db.select.mockReturnValueOnce(chain([{ role: 'member' }]));
    db.update.mockReturnValueOnce(chain(undefined));
    expect(await setCommentVisibility(COMMENT, true)).toEqual({ success: true });
    expect(db.update).toHaveBeenCalledOnce();
    // No allowGuests: a guest is refused by requireCommentAccess itself.
    expect(vi.mocked(requireCommentAccess).mock.calls[0][1]).toBeUndefined();
  });
});

describe('deleteComment', () => {
  it("cannot delete another user's comment", async () => {
    vi.mocked(requireCommentAccess).mockResolvedValue({
      session,
      role: 'member',
      comment: { id: COMMENT, authorId: 'user-2', taskId: TASK },
      project: { id: PROJECT },
      workspace: { id: 'ws-1' },
    } as never);
    const result = await deleteComment(COMMENT);
    expect(result.error).toMatch(/Not authorized/);
    expectNoWrites();
  });

  it('cannot delete a comment in another workspace', async () => {
    vi.mocked(requireCommentAccess).mockImplementation(denied);
    expect(await deleteComment(COMMENT)).toEqual({ error: 'Not found.' });
    expectNoWrites();
  });
});
