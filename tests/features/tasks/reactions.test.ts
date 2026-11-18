import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), delete: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/activity', () => ({ insertActivity: vi.fn() }));
vi.mock('@/lib/notification-emails', () => ({ emailTaskNotification: vi.fn() }));
vi.mock('@/lib/rate-limit', async (orig) => ({ ...(await orig<typeof import('@/lib/rate-limit')>()), enforceRateLimit: vi.fn() }));
vi.mock('next/server', () => ({ after: (fn: () => unknown) => fn() }));
vi.mock('@/lib/authz', async (orig) => ({
  ...(await orig<typeof import('@/lib/authz')>()),
  requireCommentAccess: vi.fn(),
  requireTaskAccess: vi.fn(),
}));

import { AuthzError, requireCommentAccess, requireTaskAccess } from '@/lib/authz';
import { getComments, toggleReaction } from '@/features/tasks/actions';

const COMMENT = '11111111-1111-4111-8111-111111111111';
const TASK = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCommentAccess).mockResolvedValue({
    session: { user: { id: 'u-1' } },
    comment: { id: COMMENT, authorId: 'u-2', taskId: TASK },
  } as never);
});

describe('toggleReaction', () => {
  it('refuses a comment the user cannot see, without writing', async () => {
    vi.mocked(requireCommentAccess).mockRejectedValue(new AuthzError());
    const res = await toggleReaction(COMMENT, 'check');
    expect(res).toHaveProperty('error');
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects reactions that are not on the list', async () => {
    const res = await toggleReaction(COMMENT, 'fire' as never);
    expect(res).toHaveProperty('error');
    expect(requireCommentAccess).not.toHaveBeenCalled();
  });

  it('adds my reaction when I have not reacted', async () => {
    db.delete.mockReturnValue(chain([]));
    const values = vi.fn(() => ({ onConflictDoNothing: vi.fn(async () => undefined) }));
    db.insert.mockReturnValue({ values });
    expect(await toggleReaction(COMMENT, 'eyes')).toEqual({ reacted: true });
    expect(values).toHaveBeenCalledWith({ commentId: COMMENT, userId: 'u-1', reaction: 'eyes' });
  });

  it('removes my reaction when I already reacted', async () => {
    db.delete.mockReturnValue(chain([{ commentId: COMMENT }]));
    expect(await toggleReaction(COMMENT, 'eyes')).toEqual({ reacted: false });
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('getComments reactions', () => {
  it('summarises reactions per kind, marking mine', async () => {
    vi.mocked(requireTaskAccess).mockResolvedValue({ session: { user: { id: 'u-1' } }, task: { id: TASK } } as never);
    db.select
      .mockReturnValueOnce(chain([{ id: COMMENT, body: 'hi', createdAt: new Date(), updatedAt: null, author: { id: 'u-2', name: 'Bo', image: null } }]))
      .mockReturnValueOnce(
        chain([
          { commentId: COMMENT, reaction: 'thumbs_up', userId: 'u-2', name: 'Bo' },
          { commentId: COMMENT, reaction: 'thumbs_up', userId: 'u-1', name: 'Al' },
          { commentId: COMMENT, reaction: 'eyes', userId: 'u-2', name: 'Bo' },
        ]),
      );
    const res = await getComments(TASK);
    if (!('comments' in res) || !res.comments) throw new Error('expected comments');
    expect(res.comments[0].reactions).toEqual([
      { reaction: 'thumbs_up', count: 2, mine: true, names: ['Bo', 'Al'] },
      { reaction: 'eyes', count: 1, mine: false, names: ['Bo'] },
    ]);
  });
});
