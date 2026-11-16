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
  it('re-throws UnauthenticatedError', () => {
    expect(() => toActionError(new UnauthenticatedError(), 'x')).toThrow('Unauthorized');
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
