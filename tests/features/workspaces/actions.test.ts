import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInsert, mockSelect } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock('@/db/drizzle', () => ({
  db: { insert: mockInsert, select: mockSelect },
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock('@/lib/activity', () => ({
  insertActivity: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendWorkspaceInviteEmail: vi.fn(),
}));

vi.mock('@/lib/subscription', () => ({
  checkWorkspaceLimit: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

import { createWorkspace } from '@/features/workspaces/actions';
import { auth } from '@/lib/auth';
import { checkWorkspaceLimit } from '@/lib/subscription';

const mockSession = { user: { id: 'user-1', name: 'Test', email: 'test@example.com' } };

beforeEach(() => vi.clearAllMocks());

describe('createWorkspace', () => {
  it('throws Unauthorized when there is no session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    await expect(
      createWorkspace({ name: 'My WS', url: 'my-ws' }),
    ).rejects.toThrow('Unauthorized');
  });

  it('returns error when workspace limit is reached', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);
    vi.mocked(checkWorkspaceLimit).mockResolvedValue({ allowed: false, current: 1, limit: 1 });

    const result = await createWorkspace({ name: 'My WS', url: 'my-ws' });

    expect(result).toMatchObject({ error: expect.stringContaining('limit reached') });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('inserts workspace and member rows when limit allows', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);
    vi.mocked(checkWorkspaceLimit).mockResolvedValue({ allowed: true, current: 0, limit: 1 });

    const returning = vi.fn().mockResolvedValue([{ id: 'ws-1', slug: 'my-ws' }]);
    const values1 = vi.fn().mockReturnValue({ returning });
    const values2 = vi.fn().mockResolvedValue([]);
    mockInsert.mockReturnValueOnce({ values: values1 }).mockReturnValueOnce({ values: values2 });

    // redirect throws in some Next.js versions — catch it
    try {
      await createWorkspace({ name: 'My WS', url: 'my-ws' });
    } catch {
      // redirect() throws NEXT_REDIRECT — expected
    }

    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('throws when name is empty (Zod validation)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);
    vi.mocked(checkWorkspaceLimit).mockResolvedValue({ allowed: true, current: 0, limit: 1 });

    await expect(
      createWorkspace({ name: '', url: 'my-ws' }),
    ).rejects.toThrow();
  });
});
