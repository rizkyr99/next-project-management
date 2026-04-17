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

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { createTask } from '@/features/tasks/actions';
import { auth } from '@/lib/auth';

const UUID1 = '00000000-0000-4000-8000-000000000001';
const UUID2 = '00000000-0000-4000-8000-000000000002';
const UUID3 = '00000000-0000-4000-8000-000000000003';

const mockSession = { user: { id: 'user-1', name: 'Test', email: 'test@example.com' } };

beforeEach(() => vi.clearAllMocks());

function setupInsert(rows: object[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const values = vi.fn().mockReturnValue({ returning });
  mockInsert.mockReturnValue({ values });
}

function setupSelect(rows: object[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin, where });
  mockSelect.mockReturnValue({ from });
}

describe('createTask', () => {
  it('throws Unauthorized when there is no session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    await expect(
      createTask({ title: 'Task', order: 0, projectId: UUID1, statusId: UUID2 }),
    ).rejects.toThrow('Unauthorized');
  });

  it('creates a task and returns it when authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);
    const newTask = { id: UUID3, title: 'Task', projectId: UUID1, statusId: UUID2, order: 0 };
    setupInsert([newTask]);
    setupSelect([{ workspaceId: UUID1 }]);

    const result = await createTask({ title: 'Task', order: 0, projectId: UUID1, statusId: UUID2 });

    expect(result).toEqual({ task: newTask });
    expect(mockInsert).toHaveBeenCalledOnce();
  });

  it('returns error object when db insert throws', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);
    const returning = vi.fn().mockRejectedValue(new Error('DB error'));
    const values = vi.fn().mockReturnValue({ returning });
    mockInsert.mockReturnValue({ values });

    const result = await createTask({ title: 'Task', order: 0, projectId: UUID1, statusId: UUID2 });

    expect(result).toEqual({ error: 'Failed to create task.' });
  });
});
