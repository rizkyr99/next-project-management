import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), batch: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/activity', () => ({ insertActivity: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/rate-limit', async (orig) => ({ ...(await orig<typeof import('@/lib/rate-limit')>()), enforceRateLimit: vi.fn() }));
vi.mock('@/lib/authz', async (orig) => ({ ...(await orig<typeof import('@/lib/authz')>()), requireTaskAccess: vi.fn() }));
const storage = vi.hoisted(() => ({
  directUploadsAvailable: vi.fn(),
  directUploadToken: vi.fn(),
  storedSize: vi.fn(),
  deleteFile: vi.fn(),
  readFirstBytes: vi.fn(),
}));
vi.mock('@/lib/storage', () => storage);
vi.mock('@/lib/subscription', () => ({ getWorkspacePlan: vi.fn(async () => 'free') }));

import { auth } from '@/lib/auth';
import { insertActivity } from '@/lib/activity';
import { requireTaskAccess } from '@/lib/authz';
import { deleteTaskFile, finishFileUpload, setFileVisibility, startFileUpload } from '@/features/attachments/actions';
import { workspaceStorage } from '@/features/attachments/server';
import { PLAN_DETAILS } from '@/lib/plans';

const TASK = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';
const MB = 1024 * 1024;

const ctx = (role = 'member') => ({
  session: { user: { id: 'user-1' } },
  role,
  task: { id: TASK, title: 'Homepage', statusId: 's' },
  project: { id: 'p-1' },
  workspace: { id: 'ws-1', slug: 'acme' },
});

/** Storage the workspace uses (sum of sizes), as workspaceStorage reads it; its plan is mocked as Free. */
const usage = (used: number) => db.select.mockReturnValueOnce(chain([{ used: String(used) }]));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'user-1' } } as never);
  vi.mocked(requireTaskAccess).mockResolvedValue(ctx() as never);
  // db.batch is handed select builders; their results come from the batch mock.
  db.select.mockReturnValue(chain([]));
});

describe('workspaceStorage', () => {
  it('sums the workspace’s files against its plan', async () => {
    usage(300 * MB);
    expect(await workspaceStorage('ws-1')).toEqual({ used: 300 * MB, limit: PLAN_DETAILS.free.storageBytes });
  });
});

describe('startFileUpload', () => {
  it('hands out a one-off token for exactly this file’s path and size', async () => {
    usage(0);
    storage.directUploadsAvailable.mockReturnValue(true);
    storage.directUploadToken.mockResolvedValue('tok');
    const res = await startFileUpload({ taskId: TASK, name: 'cut.mp4', size: 30 * MB });
    expect(res).toMatchObject({ mode: 'direct', token: 'tok' });
    if (res.error !== undefined || res.mode !== 'direct') throw new Error('expected a direct upload');
    expect(res.key).toBe(`attachments/p-1/${res.id}`);
    expect(storage.directUploadToken).toHaveBeenCalledWith(res.key, 30 * MB);
  });

  it('lets clients attach files to shared projects', async () => {
    usage(0);
    storage.directUploadsAvailable.mockReturnValue(false);
    expect(await startFileUpload({ taskId: TASK, name: 'logo.ai', size: 10 * MB })).toEqual({ mode: 'server' });
    expect(requireTaskAccess).toHaveBeenCalledWith(TASK, { allowGuests: true });
  });

  it('refuses disallowed files and full workspaces without a token', async () => {
    expect((await startFileUpload({ taskId: TASK, name: 'tool.exe', size: 10 * MB })).error).toMatch(/can’t be attached/);
    usage(PLAN_DETAILS.free.storageBytes - MB);
    expect((await startFileUpload({ taskId: TASK, name: 'cut.mp4', size: 10 * MB })).error).toMatch(/out of file storage/);
    expect(storage.directUploadToken).not.toHaveBeenCalled();
  });
});

describe('finishFileUpload', () => {
  it('records the file using the size in storage, not the browser’s word', async () => {
    storage.storedSize.mockResolvedValue(12 * MB);
    storage.readFirstBytes.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    usage(0);
    const values = vi.fn(() => ({ onConflictDoNothing: () => ({ returning: async () => [{ id: FILE }] }) }));
    db.insert.mockReturnValue({ values });
    expect(await finishFileUpload({ taskId: TASK, id: FILE, name: 'guide.pdf' })).toEqual({ success: true });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: FILE,
        storageKey: `attachments/p-1/${FILE}`,
        size: 12 * MB,
        contentType: 'application/octet-stream',
        listed: true,
        clientVisible: false,
      }),
    );
    expect(insertActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'task.file_added' }));
  });

  it('makes a client’s own upload visible to them', async () => {
    vi.mocked(requireTaskAccess).mockResolvedValue(ctx('guest') as never);
    storage.storedSize.mockResolvedValue(5 * MB);
    storage.readFirstBytes.mockResolvedValue(new Uint8Array());
    usage(0);
    const values = vi.fn(() => ({ onConflictDoNothing: () => ({ returning: async () => [{ id: FILE }] }) }));
    db.insert.mockReturnValue({ values });
    await finishFileUpload({ taskId: TASK, id: FILE, name: 'feedback.pdf' });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ clientVisible: true }));
  });

  it('says so when nothing arrived, and deletes what doesn’t fit', async () => {
    storage.storedSize.mockResolvedValueOnce(null);
    expect((await finishFileUpload({ taskId: TASK, id: FILE, name: 'a.pdf' })).error).toMatch(/didn’t arrive/);

    storage.storedSize.mockResolvedValueOnce(10 * MB);
    usage(PLAN_DETAILS.free.storageBytes);
    storage.deleteFile.mockResolvedValue(undefined);
    expect((await finishFileUpload({ taskId: TASK, id: FILE, name: 'a.pdf' })).error).toMatch(/out of file storage/);
    expect(storage.deleteFile).toHaveBeenCalledWith(`attachments/p-1/${FILE}`);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

const fileRow = (over: Record<string, unknown> = {}) => ({
  id: FILE,
  name: 'guide.pdf',
  storageKey: `attachments/p-1/${FILE}`,
  uploadedById: 'user-2',
  clientVisible: false,
  taskId: TASK,
  taskTitle: 'Homepage',
  projectId: 'p-1',
  workspaceId: 'ws-1',
  workspaceSlug: 'acme',
  role: 'member',
  ...over,
});

describe('setFileVisibility', () => {
  it('lets the uploader share their file with the client', async () => {
    db.select
      .mockReturnValueOnce(chain([fileRow({ uploadedById: 'user-1' })]))
      .mockReturnValueOnce(chain([{ role: 'member' }]));
    db.update.mockReturnValue(chain(undefined));
    expect(await setFileVisibility({ fileId: FILE, clientVisible: true })).toEqual({ success: true });
  });

  it('stops other members, and clients entirely', async () => {
    db.select.mockReturnValueOnce(chain([fileRow()]));
    expect((await setFileVisibility({ fileId: FILE, clientVisible: true })).error).toMatch(/Only the person/);
    db.select.mockReturnValueOnce(chain([fileRow({ role: 'guest', uploadedById: 'user-1' })]));
    expect(await setFileVisibility({ fileId: FILE, clientVisible: false })).toEqual({ error: 'Not found.' });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('keeps a client’s own files visible to them', async () => {
    db.select
      .mockReturnValueOnce(chain([fileRow({ role: 'admin' })]))
      .mockReturnValueOnce(chain([{ role: 'guest' }]));
    expect((await setFileVisibility({ fileId: FILE, clientVisible: false })).error).toMatch(/always visible/);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('deleteTaskFile', () => {
  it('lets an admin remove anyone’s file, deleting the row before the bytes', async () => {
    db.select.mockReturnValueOnce(chain([fileRow({ role: 'admin' })]));
    db.delete.mockReturnValue(chain(undefined));
    storage.deleteFile.mockResolvedValue(undefined);
    expect(await deleteTaskFile(FILE)).toEqual({ success: true });
    expect(storage.deleteFile).toHaveBeenCalledWith(`attachments/p-1/${FILE}`);
    expect(insertActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'task.file_removed' }));
  });

  it('lets a client remove their own file but not see anyone else’s', async () => {
    db.select.mockReturnValueOnce(chain([fileRow({ role: 'guest', uploadedById: 'user-1' })]));
    db.delete.mockReturnValue(chain(undefined));
    storage.deleteFile.mockResolvedValue(undefined);
    expect(await deleteTaskFile(FILE)).toEqual({ success: true });

    db.select.mockReturnValueOnce(chain([fileRow({ role: 'guest' })]));
    expect(await deleteTaskFile(FILE)).toEqual({ error: 'Not found.' });
  });

  it('stops other members', async () => {
    db.select.mockReturnValueOnce(chain([fileRow()]));
    expect((await deleteTaskFile(FILE)).error).toMatch(/Only the person/);
    expect(db.delete).not.toHaveBeenCalled();
  });
});
