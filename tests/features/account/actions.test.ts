import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({ select: vi.fn(), delete: vi.fn(), batch: vi.fn() }));
const verify = vi.hoisted(() => vi.fn());
const cancel = vi.hoisted(() => vi.fn());
const jar = vi.hoisted(() => ({ getAll: vi.fn(), delete: vi.fn() }));

vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() }, $context: Promise.resolve({ password: { verify } }) },
}));
vi.mock('@/lib/stripe', () => ({ stripe: { subscriptions: { cancel } } }));
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, enforceRateLimit: vi.fn() };
});
vi.mock('@/lib/account', () => ({ getOwnedWorkspaces: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()), cookies: vi.fn(async () => jar) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { auth } from '@/lib/auth';
import { getOwnedWorkspaces } from '@/lib/account';
import { enforceRateLimit, RateLimitError } from '@/lib/rate-limit';
import { redirect } from 'next/navigation';
import { deleteAccount } from '@/features/account/actions';

const session = { user: { id: 'u1', name: 'Ada', email: 'Ada@Example.com' } };

/** db.select is called for: credential account, then subscription. */
function selects({ password, sub }: { password?: string | null; sub?: { id: string | null; status: string | null } }) {
  db.select
    .mockReturnValueOnce(chain(password === undefined ? [] : [{ password }]))
    .mockReturnValueOnce(chain(sub ? [sub] : []));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue(session as never);
  vi.mocked(getOwnedWorkspaces).mockResolvedValue([]);
  db.delete.mockReturnValue(chain(undefined));
  db.select.mockReturnValue(chain([])); // the FOR UPDATE lock on owned workspaces
  db.batch.mockResolvedValue([[], [{ id: 'u1' }]]); // [lock, delete returning]
  jar.getAll.mockReturnValue([
    { name: 'better-auth.session_token' },
    { name: '__Secure-better-auth.session_data' },
    { name: 'theme' },
  ]);
});

describe('deleteAccount', () => {
  it('requires the account email, typed exactly (case-insensitive)', async () => {
    expect(await deleteAccount({ email: 'someone@else.com' })).toEqual({
      error: 'Type your account email exactly to confirm.',
    });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('checks the password for credential accounts, rate limited', async () => {
    selects({ password: 'hash' });
    verify.mockResolvedValue(false);
    expect(await deleteAccount({ email: 'ada@example.com', password: 'wrong' })).toEqual({
      error: 'Incorrect password.',
    });
    expect(enforceRateLimit).toHaveBeenCalledWith('accountDelete', 'u1');
    expect(verify).toHaveBeenCalledWith({ hash: 'hash', password: 'wrong' });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('refuses a credential account without a password', async () => {
    selects({ password: 'hash' });
    expect((await deleteAccount({ email: 'ada@example.com' }))?.error).toBe('Incorrect password.');
    expect(verify).not.toHaveBeenCalled();
  });

  it('surfaces the rate limit', async () => {
    selects({ password: 'hash' });
    vi.mocked(enforceRateLimit).mockRejectedValue(new RateLimitError(60));
    expect((await deleteAccount({ email: 'ada@example.com', password: 'x' }))?.error).toMatch(/Too many/);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('blocks while the user owns a workspace with other members', async () => {
    selects({}); // Google-only account: no password check
    const team = { id: 'w1', name: 'Team', slug: 'team', otherMembers: 2 };
    vi.mocked(getOwnedWorkspaces).mockResolvedValue([team, { id: 'w2', name: 'Solo', slug: 'solo', otherMembers: 0 }]);

    const result = await deleteAccount({ email: 'ada@example.com' });
    expect(result?.error).toMatch(/Transfer ownership or delete them first/);
    expect(result?.blockingWorkspaces).toEqual([team]);
    expect(cancel).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('cancels a live subscription before deleting, then clears auth cookies and redirects', async () => {
    selects({ password: 'hash', sub: { id: 'sub_1', status: 'active' } });
    verify.mockResolvedValue(true);

    await deleteAccount({ email: 'ada@example.com', password: 'right' });

    expect(cancel).toHaveBeenCalledWith('sub_1');
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(db.batch.mock.invocationCallOrder[0]);
    expect(db.batch).toHaveBeenCalledOnce();
    expect(jar.delete.mock.calls.map((c) => c[0])).toEqual([
      'better-auth.session_token',
      '__Secure-better-auth.session_data',
    ]);
    expect(redirect).toHaveBeenCalledWith('/login?deleted=1');
  });

  it('deletes nothing when Stripe cancellation fails', async () => {
    selects({ sub: { id: 'sub_1', status: 'past_due' } });
    cancel.mockRejectedValue(Object.assign(new Error('boom'), { code: 'api_error' }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await deleteAccount({ email: 'ada@example.com' }))?.error).toMatch(/nothing was deleted/);
    expect(db.delete).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('proceeds when the subscription is already gone on Stripe', async () => {
    selects({ sub: { id: 'sub_1', status: 'active' } });
    cancel.mockRejectedValue(Object.assign(new Error('No such subscription'), { code: 'resource_missing' }));
    await deleteAccount({ email: 'ada@example.com' });
    expect(db.batch).toHaveBeenCalledOnce();
  });

  it('skips Stripe for canceled or free subscriptions', async () => {
    selects({ sub: { id: 'sub_1', status: 'canceled' } });
    await deleteAccount({ email: 'ada@example.com' });
    expect(cancel).not.toHaveBeenCalled();
    expect(db.batch).toHaveBeenCalledOnce();
  });

  it('re-checks under lock: someone joined meanwhile, so nothing is deleted', async () => {
    selects({});
    const team = { id: 'w1', name: 'Team', slug: 'team', otherMembers: 1 };
    vi.mocked(getOwnedWorkspaces).mockResolvedValueOnce([]).mockResolvedValueOnce([team]);
    db.batch.mockResolvedValue([[{ id: 'w1' }], []]);

    const result = await deleteAccount({ email: 'ada@example.com' });
    expect(result?.blockingWorkspaces).toEqual([team]);
    expect(jar.delete).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
