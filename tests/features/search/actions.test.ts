import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

import { auth } from '@/lib/auth';
import { searchWorkspace } from '@/features/search/actions';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'user-1' } } as never);
});

describe('searchWorkspace', () => {
  it('ignores queries shorter than two characters', async () => {
    expect(await searchWorkspace(' ', 'acme')).toEqual([]);
    expect(await searchWorkspace('a', 'acme')).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns nothing without a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(await searchWorkspace('login', 'acme')).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns nothing for a workspace the user is not a member of', async () => {
    db.select.mockReturnValueOnce(chain([]));
    expect(await searchWorkspace('login', 'other')).toEqual([]);
    expect(db.select).toHaveBeenCalledOnce();
  });

  it('returns nothing when the workspace has no projects', async () => {
    db.select.mockReturnValueOnce(chain([{ id: 'ws-1' }])).mockReturnValueOnce(chain([]));
    expect(await searchWorkspace('login', 'acme')).toEqual([]);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('combines tasks, projects and comments, with context and short comment titles', async () => {
    const longBody = 'x'.repeat(70);
    db.select
      .mockReturnValueOnce(chain([{ id: 'ws-1' }]))
      .mockReturnValueOnce(chain([{ id: 'p-1', name: 'Website' }]))
      .mockReturnValueOnce(chain([{ id: 't-1', title: 'Fix login', projectId: 'p-1', statusName: 'To Do' }]))
      .mockReturnValueOnce(chain([{ id: 'p-1', name: 'Website' }]))
      .mockReturnValueOnce(
        chain([
          { id: 'c-1', body: longBody, taskId: 't-1', taskTitle: 'Fix login', projectId: 'p-1' },
          { id: 'c-2', body: 'short', taskId: 't-2', taskTitle: 'Gone', projectId: 'p-x' },
        ]),
      );

    const results = await searchWorkspace('  login ', 'acme');

    expect(results).toEqual([
      { type: 'task', id: 't-1', title: 'Fix login', subtitle: 'Website · To Do', projectId: 'p-1', taskId: 't-1', workspaceSlug: 'acme' },
      { type: 'project', id: 'p-1', title: 'Website', subtitle: 'Project', projectId: 'p-1', workspaceSlug: 'acme' },
      { type: 'comment', id: 'c-1', title: `${'x'.repeat(60)}…`, subtitle: 'Comment on: Fix login', projectId: 'p-1', taskId: 't-1', workspaceSlug: 'acme' },
      { type: 'comment', id: 'c-2', title: 'short', subtitle: 'Comment on: Gone', projectId: 'p-x', taskId: 't-2', workspaceSlug: 'acme' },
    ]);
  });

  it('labels a task whose project is not in the map', async () => {
    db.select
      .mockReturnValueOnce(chain([{ id: 'ws-1' }]))
      .mockReturnValueOnce(chain([{ id: 'p-1', name: 'Website' }]))
      .mockReturnValueOnce(chain([{ id: 't-9', title: 'Orphan', projectId: 'p-9', statusName: 'Done' }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]));
    const [task] = await searchWorkspace('orphan', 'acme');
    expect(task.subtitle).toBe('Unknown project · Done');
  });
});
