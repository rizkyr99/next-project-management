import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() }));

vi.mock('@/lib/subscription', () => ({ planGateProblem: vi.fn(async () => null) }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/activity', () => ({ insertActivity: vi.fn() }));
vi.mock('@/lib/notification-emails', () => ({ emailTaskNotification: vi.fn() }));
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, enforceRateLimit: vi.fn() };
});
vi.mock('next/server', () => ({ after: (fn: () => unknown) => fn() }));
vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authz')>();
  return { ...actual, requireTaskAccess: vi.fn() };
});

import { insertActivity } from '@/lib/activity';
import { emailTaskNotification } from '@/lib/notification-emails';
import { AuthzError, requireTaskAccess } from '@/lib/authz';
import { requestApproval, respondToApproval, withdrawApproval } from '@/features/approvals/actions';

const TASK = '00000000-0000-4000-8000-000000000003';

const ctx = (role: string, userId = 'user-1') => ({
  session: { user: { id: userId, name: role === 'guest' ? 'Cleo' : 'Alice' } },
  role,
  task: { id: TASK, title: 'Homepage', statusId: 's-1' },
  project: { id: 'p-1' },
  workspace: { id: 'ws-1', slug: 'acme' },
});

/** db.insert(...).values(rows): records the rows, resolves to `result`. */
function captureInsert(into: unknown[][], result: unknown = undefined) {
  db.insert.mockImplementationOnce(() => ({
    values: (rows: unknown) => {
      into.push(Array.isArray(rows) ? rows : [rows]);
      return chain(result);
    },
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('requestApproval', () => {
  it('is closed to guests: the access check is made without allowGuests', async () => {
    vi.mocked(requireTaskAccess).mockRejectedValue(new AuthzError());
    expect(await requestApproval({ taskId: TASK })).toEqual({ error: 'Not found.' });
    expect(vi.mocked(requireTaskAccess).mock.calls[0][1]).toBeUndefined();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('needs a client on the project to ask', async () => {
    vi.mocked(requireTaskAccess).mockResolvedValue(ctx('member') as never);
    db.select.mockReturnValueOnce(chain([]));
    expect((await requestApproval({ taskId: TASK })).error).toMatch(/Share this project with a client/);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('allows one waiting request per task', async () => {
    vi.mocked(requireTaskAccess).mockResolvedValue(ctx('member') as never);
    db.select.mockReturnValueOnce(chain([{ id: 'guest-1' }]));
    db.insert.mockReturnValueOnce(chain([])); // the partial unique index skipped it
    expect((await requestApproval({ taskId: TASK })).error).toMatch(/already waiting/);
    expect(insertActivity).not.toHaveBeenCalled();
  });

  it("notifies and emails the project's clients, and logs it", async () => {
    vi.mocked(requireTaskAccess).mockResolvedValue(ctx('member') as never);
    db.select.mockReturnValueOnce(chain([{ id: 'guest-1' }, { id: 'guest-2' }]));
    const rows: unknown[][] = [];
    captureInsert(rows, [{ id: 'a-1' }]);
    captureInsert(rows);
    expect(await requestApproval({ taskId: TASK, message: 'Please check the hero' })).toEqual({ success: true });
    expect(rows[0][0]).toMatchObject({ taskId: TASK, requestedById: 'user-1', message: 'Please check the hero' });
    expect(rows[1]).toEqual([
      expect.objectContaining({ userId: 'guest-1', type: 'approval_requested' }),
      expect.objectContaining({ userId: 'guest-2', type: 'approval_requested' }),
    ]);
    expect(emailTaskNotification).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'approval_requested', userIds: ['guest-1', 'guest-2'], excerpt: 'Please check the hero' }),
    );
    expect(insertActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'task.approval_requested' }));
  });
});

describe('respondToApproval', () => {
  it('only the client answers', async () => {
    vi.mocked(requireTaskAccess).mockResolvedValue(ctx('admin') as never);
    expect((await respondToApproval({ taskId: TASK, decision: 'approved' })).error).toMatch(/Only the client/);
    expect(db.update).not.toHaveBeenCalled();
    expect(vi.mocked(requireTaskAccess).mock.calls[0][1]).toEqual({ allowGuests: true });
  });

  it('asks what should change before requesting changes', async () => {
    vi.mocked(requireTaskAccess).mockResolvedValue(ctx('guest', 'guest-1') as never);
    const res = await respondToApproval({ taskId: TASK, decision: 'changes_requested', note: '   ' });
    expect(res.error).toBeTruthy();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("can't answer a request that was withdrawn or already answered", async () => {
    vi.mocked(requireTaskAccess).mockResolvedValue(ctx('guest', 'guest-1') as never);
    db.update.mockReturnValueOnce(chain([]));
    expect((await respondToApproval({ taskId: TASK, decision: 'approved' })).error).toMatch(/already answered/);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('tells whoever asked and the assignees, once each', async () => {
    vi.mocked(requireTaskAccess).mockResolvedValue(ctx('guest', 'guest-1') as never);
    db.update.mockReturnValueOnce(chain([{ requestedById: 'user-1' }]));
    db.select.mockReturnValueOnce(chain([{ id: 'user-1' }, { id: 'user-2' }]));
    const rows: unknown[][] = [];
    captureInsert(rows);
    const res = await respondToApproval({ taskId: TASK, decision: 'changes_requested', note: 'Bigger logo' });
    expect(res).toEqual({ success: true });
    expect(rows[0].map((r) => (r as { userId: string }).userId)).toEqual(['user-1', 'user-2']);
    expect(rows[0][0]).toMatchObject({ type: 'changes_requested' });
    expect(emailTaskNotification).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'changes_requested', excerpt: 'Bigger logo' }),
    );
    expect(insertActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'task.changes_requested' }));
  });
});

describe('withdrawApproval', () => {
  it('is closed to guests and needs a waiting request', async () => {
    vi.mocked(requireTaskAccess).mockResolvedValue(ctx('member') as never);
    db.update.mockReturnValueOnce(chain([]));
    expect((await withdrawApproval(TASK)).error).toMatch(/no request waiting/);
    expect(vi.mocked(requireTaskAccess).mock.calls[0][1]).toBeUndefined();
    expect(insertActivity).not.toHaveBeenCalled();
  });
});
