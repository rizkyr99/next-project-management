import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError, z } from 'zod';
import { chain } from '../helpers/db-mock';

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock('@/db/drizzle', () => ({ db: { select: mockSelect } }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

import { auth } from '@/lib/auth';
import {
  AuthzError,
  UnauthenticatedError,
  assertStatusInProject,
  assertTasksInProject,
  assertWorkspaceMembers,
  projectPath,
  requireCommentAccess,
  requireProjectAccess,
  requireSession,
  requireTaskAccess,
  requireWorkspaceMember,
  SESSION_EXPIRED,
  runAction,
  toActionError,
} from '@/lib/authz';

const session = { user: { id: 'user-1', name: 'Test', email: 't@example.com' } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue(session as never);
});

describe('requireSession', () => {
  it('throws UnauthenticatedError without a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await expect(requireSession()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('returns the session', async () => {
    await expect(requireSession()).resolves.toBe(session);
  });
});

describe('requireWorkspaceMember', () => {
  it('throws AuthzError when the user is not a member (or the workspace does not exist)', async () => {
    mockSelect.mockReturnValueOnce(chain([]));
    await expect(requireWorkspaceMember('ws-1')).rejects.toBeInstanceOf(AuthzError);
  });

  it('throws AuthzError when the role is not allowed', async () => {
    mockSelect.mockReturnValueOnce(
      chain([{ id: 'ws-1', slug: 'acme', name: 'Acme', role: 'member' }]),
    );
    await expect(
      requireWorkspaceMember('ws-1', { roles: ['owner', 'admin'] }),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it('returns the workspace and role for a member', async () => {
    mockSelect.mockReturnValueOnce(
      chain([{ id: 'ws-1', slug: 'acme', name: 'Acme', role: 'admin' }]),
    );
    const ctx = await requireWorkspaceMember('ws-1', { roles: ['owner', 'admin'] });
    expect(ctx.workspace).toEqual({ id: 'ws-1', slug: 'acme', name: 'Acme' });
    expect(ctx.role).toBe('admin');
    expect(ctx.session).toBe(session);
  });

  it('does not query the database without a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await expect(requireWorkspaceMember('ws-1')).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(mockSelect).not.toHaveBeenCalled();
  });
});

describe('requireProjectAccess', () => {
  it('throws AuthzError for a project in another workspace', async () => {
    mockSelect.mockReturnValueOnce(chain([]));
    await expect(requireProjectAccess('p-1')).rejects.toBeInstanceOf(AuthzError);
  });

  it('returns project and workspace context for a member', async () => {
    mockSelect.mockReturnValueOnce(
      chain([
        {
          projectId: 'p-1',
          projectName: 'Website',
          workspaceId: 'ws-1',
          workspaceSlug: 'acme',
          role: 'member',
        },
      ]),
    );
    const ctx = await requireProjectAccess('p-1');
    expect(ctx.project).toEqual({ id: 'p-1', name: 'Website' });
    expect(ctx.workspace).toEqual({ id: 'ws-1', slug: 'acme' });
  });
});

describe('requireTaskAccess', () => {
  it('throws AuthzError for a task in another workspace', async () => {
    mockSelect.mockReturnValueOnce(chain([]));
    await expect(requireTaskAccess('t-1')).rejects.toBeInstanceOf(AuthzError);
  });

  it('returns task, project and workspace context for a member', async () => {
    mockSelect.mockReturnValueOnce(
      chain([
        {
          taskId: 't-1',
          taskTitle: 'Ship it',
          statusId: 's-1',
          projectId: 'p-1',
          workspaceId: 'ws-1',
          workspaceSlug: 'acme',
          role: 'owner',
        },
      ]),
    );
    const ctx = await requireTaskAccess('t-1');
    expect(ctx.task).toEqual({ id: 't-1', title: 'Ship it', statusId: 's-1' });
    expect(ctx.project).toEqual({ id: 'p-1' });
    expect(ctx.workspace).toEqual({ id: 'ws-1', slug: 'acme' });
  });
});

describe('requireCommentAccess', () => {
  it('throws AuthzError for a comment in another workspace', async () => {
    mockSelect.mockReturnValueOnce(chain([]));
    await expect(requireCommentAccess('c-1')).rejects.toBeInstanceOf(AuthzError);
  });

  it('returns the comment author for a member', async () => {
    mockSelect.mockReturnValueOnce(
      chain([
        {
          commentId: 'c-1',
          authorId: 'user-2',
          taskId: 't-1',
          projectId: 'p-1',
          workspaceId: 'ws-1',
          role: 'member',
        },
      ]),
    );
    const ctx = await requireCommentAccess('c-1');
    expect(ctx.comment).toEqual({ id: 'c-1', authorId: 'user-2', taskId: 't-1' });
  });
});

describe('assertStatusInProject', () => {
  it('throws when the status belongs to another project', async () => {
    mockSelect.mockReturnValueOnce(chain([]));
    await expect(assertStatusInProject('s-1', 'p-1')).rejects.toBeInstanceOf(AuthzError);
  });

  it('passes when the status belongs to the project', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 's-1' }]));
    await expect(assertStatusInProject('s-1', 'p-1')).resolves.toBeUndefined();
  });
});

describe('assertTasksInProject', () => {
  it('throws when any task is outside the project', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 't-1' }]));
    await expect(assertTasksInProject(['t-1', 't-foreign'], 'p-1')).rejects.toBeInstanceOf(
      AuthzError,
    );
  });

  it('ignores duplicate IDs', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 't-1' }]));
    await expect(assertTasksInProject(['t-1', 't-1'], 'p-1')).resolves.toBeUndefined();
  });

  it('skips the query for an empty list', async () => {
    await assertTasksInProject([], 'p-1');
    expect(mockSelect).not.toHaveBeenCalled();
  });
});

describe('assertWorkspaceMembers', () => {
  it('throws when any user is not a member', async () => {
    mockSelect.mockReturnValueOnce(chain([{ userId: 'user-1' }]));
    await expect(
      assertWorkspaceMembers(['user-1', 'outsider'], 'ws-1'),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it('passes when all users are members', async () => {
    mockSelect.mockReturnValueOnce(chain([{ userId: 'user-1' }, { userId: 'user-2' }]));
    await expect(assertWorkspaceMembers(['user-1', 'user-2'], 'ws-1')).resolves.toBeUndefined();
  });
});

describe('toActionError', () => {
  it('turns a missing session into a message instead of throwing (P4.2)', () => {
    expect(toActionError(new UnauthenticatedError(), 'x')).toEqual({ error: SESSION_EXPIRED });
  });

  it('maps AuthzError to a generic "Not found."', () => {
    expect(toActionError(new AuthzError(), 'x')).toEqual({ error: 'Not found.' });
  });

  it('surfaces the first Zod issue message', () => {
    const result = z.string().min(3, 'Too short').safeParse('a');
    expect(toActionError(result.error as ZodError, 'x')).toEqual({ error: 'Too short' });
  });

  it('hides unexpected errors behind the fallback message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(toActionError(new Error('relation "task" does not exist'), 'Failed.')).toEqual({
      error: 'Failed.',
    });
    spy.mockRestore();
  });
});

describe('projectPath', () => {
  it('builds the real project route', () => {
    expect(projectPath('acme', 'p-1')).toBe('/workspaces/acme/projects/p-1');
  });
});

describe('toActionError with rate limits', () => {
  it('passes the retry message through', async () => {
    const { RateLimitError } = await import('@/lib/rate-limit');
    const { toActionError } = await import('@/lib/authz');
    expect(toActionError(new RateLimitError(12), 'fallback')).toEqual({
      error: 'Too many requests. Please try again in 12 seconds.',
    });
  });
});

describe('runAction', () => {
  it('returns the body\'s result when it succeeds', async () => {
    expect(await runAction('x', async () => ({ success: true }))).toEqual({ success: true });
  });

  it('turns thrown errors into messages instead of rejecting', async () => {
    expect(await runAction('Failed.', async () => { throw new UnauthenticatedError(); })).toEqual({ error: SESSION_EXPIRED });
    expect(await runAction('Failed.', async () => { throw new AuthzError(); })).toEqual({ error: 'Not found.' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await runAction('Failed.', async () => { throw new Error('db down'); })).toEqual({ error: 'Failed.' });
  });

  it('lets Next.js control flow through (redirect, notFound)', async () => {
    const { unstable_rethrow } = await import('next/navigation');
    const signal = new Error('NEXT_REDIRECT');
    await runAction('x', async () => { throw signal; });
    expect(unstable_rethrow).toHaveBeenCalledWith(signal);
  });
});

describe('guests (C1): refused unless the action opts in, and only on shared projects', () => {
  const guestWorkspace = { id: 'ws-1', slug: 'acme', name: 'Acme', role: 'guest' };
  const projectRow = (shared: string | null) => ({
    projectId: 'p-1',
    projectName: 'Site',
    workspaceId: 'ws-1',
    workspaceSlug: 'acme',
    role: 'guest',
    shared,
  });
  const taskRow = (shared: string | null) => ({
    taskId: 't-1',
    taskTitle: 'Homepage',
    statusId: 's-1',
    projectId: 'p-1',
    workspaceId: 'ws-1',
    workspaceSlug: 'acme',
    role: 'guest',
    shared,
  });

  it('refuses a guest at workspace level by default', async () => {
    mockSelect.mockReturnValueOnce(chain([guestWorkspace]));
    await expect(requireWorkspaceMember('ws-1')).rejects.toBeInstanceOf(AuthzError);
  });

  it('lets a guest through at workspace level only with allowGuests (e.g. leaving)', async () => {
    mockSelect.mockReturnValueOnce(chain([guestWorkspace]));
    await expect(requireWorkspaceMember('ws-1', { allowGuests: true })).resolves.toMatchObject({ role: 'guest' });
  });

  it('refuses a guest on a shared project when the action does not opt in (edits)', async () => {
    mockSelect.mockReturnValueOnce(chain([projectRow('p-1')]));
    await expect(requireProjectAccess('p-1')).rejects.toBeInstanceOf(AuthzError);
  });

  it('refuses a guest on a project not shared with them, even with allowGuests', async () => {
    mockSelect.mockReturnValueOnce(chain([projectRow(null)]));
    await expect(requireProjectAccess('p-1', { allowGuests: true })).rejects.toBeInstanceOf(AuthzError);
    mockSelect.mockReturnValueOnce(chain([taskRow(null)]));
    await expect(requireTaskAccess('t-1', { allowGuests: true })).rejects.toBeInstanceOf(AuthzError);
  });

  it('allows a guest on a shared project when the action opts in (view, comment)', async () => {
    mockSelect.mockReturnValueOnce(chain([projectRow('p-1')]));
    await expect(requireProjectAccess('p-1', { allowGuests: true })).resolves.toMatchObject({ role: 'guest' });
    mockSelect.mockReturnValueOnce(chain([taskRow('p-1')]));
    await expect(requireTaskAccess('t-1', { allowGuests: true })).resolves.toMatchObject({ role: 'guest' });
  });

  it('to a guest, an internal task (C2) and its comments do not exist, even on a shared project', async () => {
    mockSelect.mockReturnValueOnce(chain([{ ...taskRow('p-1'), internal: true }]));
    await expect(requireTaskAccess('t-1', { allowGuests: true })).rejects.toBeInstanceOf(AuthzError);
    mockSelect.mockReturnValueOnce(
      chain([
        {
          commentId: 'c-1',
          authorId: 'u-2',
          clientVisible: true,
          taskId: 't-1',
          taskInternal: true,
          projectId: 'p-1',
          workspaceId: 'ws-1',
          role: 'guest',
          shared: 'p-1',
        },
      ]),
    );
    await expect(requireCommentAccess('c-1', { allowGuests: true })).rejects.toBeInstanceOf(AuthzError);
    // The team still reaches it.
    mockSelect.mockReturnValueOnce(chain([{ ...taskRow('p-1'), role: 'member', internal: true }]));
    await expect(requireTaskAccess('t-1')).resolves.toMatchObject({ task: { internal: true } });
  });

  it('never lets a guest past a roles list', async () => {
    mockSelect.mockReturnValueOnce(chain([projectRow('p-1')]));
    await expect(
      requireProjectAccess('p-1', { allowGuests: true, roles: ['owner', 'admin'] }),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it('leaves team members unaffected by sharing', async () => {
    mockSelect.mockReturnValueOnce(chain([{ ...projectRow(null), role: 'member' }]));
    await expect(requireProjectAccess('p-1')).resolves.toMatchObject({ role: 'member' });
  });
  // C2: an internal comment doesn't exist for a guest, even on a shared project.
  const commentRow = (role: string, clientVisible: boolean) => ({
    commentId: 'c-1',
    authorId: 'u-2',
    clientVisible,
    taskId: 't-1',
    projectId: 'p-1',
    workspaceId: 'ws-1',
    role,
    shared: role === 'guest' ? 'p-1' : null,
  });

  it('hides an internal comment from a guest (edit, delete, react)', async () => {
    mockSelect.mockReturnValueOnce(chain([commentRow('guest', false)]));
    await expect(requireCommentAccess('c-1', { allowGuests: true })).rejects.toBeInstanceOf(AuthzError);
  });

  it('lets a guest reach a client-visible comment on a shared project', async () => {
    mockSelect.mockReturnValueOnce(chain([commentRow('guest', true)]));
    await expect(requireCommentAccess('c-1', { allowGuests: true })).resolves.toMatchObject({
      comment: { clientVisible: true },
    });
  });

  it('lets the team reach internal comments', async () => {
    mockSelect.mockReturnValueOnce(chain([commentRow('member', false)]));
    await expect(requireCommentAccess('c-1', { allowGuests: true })).resolves.toMatchObject({ role: 'member' });
  });
});
