import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInsert, mockSelect, mockBatch } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockBatch: vi.fn(),
}));

vi.mock('@/db/drizzle', () => ({
  db: { insert: mockInsert, select: mockSelect, batch: mockBatch },
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock('@/lib/activity', () => ({
  insertActivity: vi.fn(),
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

beforeEach(() => vi.resetAllMocks());

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

  function allowCreate() {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);
    vi.mocked(checkWorkspaceLimit).mockResolvedValue({ allowed: true, current: 0, limit: 1 });
  }

  it('writes the workspace and owner membership in a single batch', async () => {
    allowCreate();
    const inserted: Record<string, unknown>[] = [];
    mockInsert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v);
        return { kind: 'insert' };
      },
    }));
    mockBatch.mockResolvedValue([]);

    const result = await createWorkspace({ name: 'My WS', url: 'my-ws' });

    expect(result).toEqual({ slug: 'my-ws' });
    expect(mockBatch).toHaveBeenCalledOnce();
    expect(mockBatch.mock.calls[0][0]).toHaveLength(2);
    const [ws, owner] = inserted;
    expect(owner).toMatchObject({ workspaceId: ws.id, userId: 'user-1', role: 'owner' });
  });

  it('reports a taken URL when the slug violates the unique constraint', async () => {
    allowCreate();
    mockInsert.mockImplementation(() => ({ values: () => ({}) }));
    mockBatch.mockRejectedValue(
      Object.assign(new Error('Failed query'), { cause: { code: '23505' } }),
    );

    const result = await createWorkspace({ name: 'My WS', url: 'taken' });

    expect(result).toEqual({ error: 'That workspace URL is already taken' });
  });

  it('returns a generic error for other database failures', async () => {
    allowCreate();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInsert.mockImplementation(() => ({ values: () => ({}) }));
    mockBatch.mockRejectedValue(new Error('connection reset'));

    const result = await createWorkspace({ name: 'My WS', url: 'my-ws' });

    expect(result).toEqual({ error: 'Failed to create workspace. Please try again.' });
  });

  it('returns a validation error for an empty name without writing', async () => {
    allowCreate();
    const result = await createWorkspace({ name: '', url: 'my-ws' });
    expect(result).toEqual({ error: 'Workspace name is required' });
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it('enforces the slug format on the server', async () => {
    allowCreate();
    const result = await createWorkspace({ name: 'My WS', url: 'Not A Slug!' });
    expect(result.error).toMatch(/lowercase letters, numbers, and hyphens/);
    expect(mockBatch).not.toHaveBeenCalled();
  });
});
