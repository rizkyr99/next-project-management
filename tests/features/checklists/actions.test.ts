import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), batch: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/authz', async (orig) => ({
  ...(await orig<typeof import('@/lib/authz')>()),
  requireTaskAccess: vi.fn(),
}));

import { AuthzError, requireTaskAccess } from '@/lib/authz';
import {
  addChecklistItems,
  deleteChecklistItem,
  reorderChecklist,
  updateChecklistItem,
} from '@/features/checklists/actions';

const TASK = '22222222-2222-4222-8222-222222222222';
const A = '33333333-3333-4333-8333-333333333333';
const B = '44444444-4444-4444-8444-444444444444';
const ctx = { workspace: { id: 'ws-1', slug: 'acme' }, project: { id: 'p-1' }, task: { id: TASK } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireTaskAccess).mockResolvedValue(ctx as never);
});

describe('addChecklistItems', () => {
  it('appends steps after the last position', async () => {
    db.select.mockReturnValueOnce(chain([{ n: 2, last: 4 }]));
    const values = vi.fn(() => chain([{ id: A, title: 'Wireframes', done: false, position: 5 }]));
    db.insert.mockReturnValue({ values });
    const res = await addChecklistItems({ taskId: TASK, titles: ['  Wireframes ', 'Copy'] });
    expect(res).toHaveProperty('items');
    expect(values).toHaveBeenCalledWith([
      { taskId: TASK, title: 'Wireframes', position: 5 },
      { taskId: TASK, title: 'Copy', position: 6 },
    ]);
  });

  it('starts at 0 on an empty checklist', async () => {
    db.select.mockReturnValueOnce(chain([{ n: 0, last: null }]));
    const values = vi.fn(() => chain([]));
    db.insert.mockReturnValue({ values });
    await addChecklistItems({ taskId: TASK, titles: ['First'] });
    expect(values).toHaveBeenCalledWith([{ taskId: TASK, title: 'First', position: 0 }]);
  });

  it('stops at 50 steps', async () => {
    db.select.mockReturnValueOnce(chain([{ n: 49, last: 48 }]));
    const res = await addChecklistItems({ taskId: TASK, titles: ['One', 'Two'] });
    expect(res.error).toMatch(/up to 50 steps/);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects an empty step before checking access', async () => {
    const res = await addChecklistItems({ taskId: TASK, titles: ['   '] });
    expect(res).toHaveProperty('error');
    expect(requireTaskAccess).not.toHaveBeenCalled();
  });

  it('refuses a task the caller cannot reach', async () => {
    vi.mocked(requireTaskAccess).mockRejectedValue(new AuthzError());
    const res = await addChecklistItems({ taskId: TASK, titles: ['x'] });
    expect(res).toHaveProperty('error');
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('updateChecklistItem / deleteChecklistItem', () => {
  it('checks access through the item’s task', async () => {
    db.select.mockReturnValueOnce(chain([{ taskId: TASK }]));
    const set = vi.fn(() => chain(undefined));
    db.update.mockReturnValue({ set });
    const res = await updateChecklistItem({ itemId: A, done: true });
    expect(res).toEqual({ success: true });
    expect(requireTaskAccess).toHaveBeenCalledWith(TASK);
    expect(set).toHaveBeenCalledWith({ done: true });
  });

  it('treats an unknown item as not found', async () => {
    db.select.mockReturnValueOnce(chain([]));
    const res = await deleteChecklistItem({ itemId: A });
    expect(res).toHaveProperty('error');
    expect(requireTaskAccess).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('needs something to change', async () => {
    const res = await updateChecklistItem({ itemId: A });
    expect(res).toHaveProperty('error');
  });
});

describe('reorderChecklist', () => {
  it('rewrites positions in the given order', async () => {
    db.select.mockReturnValueOnce(chain([{ id: A }, { id: B }]));
    const set = vi.fn(() => chain(undefined));
    db.update.mockReturnValue({ set });
    db.batch.mockResolvedValue([]);
    const res = await reorderChecklist({ taskId: TASK, itemIds: [B, A] });
    expect(res).toEqual({ success: true });
    expect(set.mock.calls).toEqual([[{ position: 0 }], [{ position: 1 }]]);
    expect(db.batch).toHaveBeenCalledOnce();
  });

  it('refuses a stale or foreign list', async () => {
    db.select.mockReturnValueOnce(chain([{ id: A }, { id: B }]));
    const res = await reorderChecklist({ taskId: TASK, itemIds: [A] });
    expect(res.error).toMatch(/changed/);
    expect(db.batch).not.toHaveBeenCalled();
  });
});
