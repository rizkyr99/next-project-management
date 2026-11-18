import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../helpers/db-mock';

const db = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/authz', async (orig) => ({
  ...(await orig<typeof import('@/lib/authz')>()),
  requireTaskAccess: vi.fn(),
  requireProjectAccess: vi.fn(),
}));
const storage = vi.hoisted(() => ({ storageAvailable: vi.fn(), saveFile: vi.fn(), readFileStream: vi.fn() }));
vi.mock('@/lib/storage', () => storage);

import { AuthzError, requireProjectAccess, requireTaskAccess } from '@/lib/authz';
import { POST as upload } from '@/app/api/uploads/route';
import { GET as serve } from '@/app/api/files/[id]/route';
import { sniffImageType } from '@/lib/uploads';

const TASK = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function form(bytes: Uint8Array<ArrayBuffer>, name = 'shot.png', type = 'image/png') {
  const f = new FormData();
  f.set('taskId', TASK);
  f.set('file', new File([bytes], name, { type }));
  return new Request('http://t/api/uploads', { method: 'POST', body: f });
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.storageAvailable.mockReturnValue(true);
  vi.mocked(requireTaskAccess).mockResolvedValue({
    session: { user: { id: 'u-1' } },
    project: { id: 'p-1' },
  } as never);
  const values = vi.fn(async () => undefined);
  db.insert.mockReturnValue({ values });
});

describe('sniffImageType', () => {
  it('recognises images by their bytes, not their name', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('<html><script>'))).toBeNull();
  });
});

describe('POST /api/uploads', () => {
  it('stores an image privately and returns its app URL, never the storage location', async () => {
    const res = await upload(form(PNG));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^\/api\/files\/[0-9a-f-]{36}$/);
    const [key, , type] = storage.saveFile.mock.calls[0];
    expect(key).toMatch(/^attachments\/p-1\/[0-9a-f-]{36}$/);
    expect(type).toBe('image/png');
    expect(JSON.stringify(body)).not.toContain('attachments/');
  });

  it('refuses a task the user cannot access, before storing anything', async () => {
    vi.mocked(requireTaskAccess).mockRejectedValue(new AuthzError());
    expect((await upload(form(PNG))).status).toBe(404);
    expect(storage.saveFile).not.toHaveBeenCalled();
  });

  it('refuses a disguised non-image', async () => {
    const res = await upload(form(new TextEncoder().encode('<svg onload=alert(1)>'), 'evil.png'));
    expect(res.status).toBe(415);
    expect(storage.saveFile).not.toHaveBeenCalled();
  });

  it('refuses files over 5 MB', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await upload(form(big))).status).toBe(413);
  });

  it('says so when uploads are not set up', async () => {
    storage.storageAvailable.mockReturnValue(false);
    const res = await upload(form(PNG));
    expect(res.status).toBe(503);
    expect(requireTaskAccess).not.toHaveBeenCalled();
  });
});

describe('GET /api/files/[id]', () => {
  const get = (id = FILE_ID) => serve(new Request(`http://t/api/files/${id}`), { params: Promise.resolve({ id }) });
  const stored = { projectId: 'p-1', storageKey: 'attachments/p-1/x', name: 'shot.png', contentType: 'image/png' };

  it('serves the file to someone with project access, privately cached and sandboxed', async () => {
    db.select.mockReturnValue(chain([stored]));
    vi.mocked(requireProjectAccess).mockResolvedValue({} as never);
    storage.readFileStream.mockResolvedValue(new Response('png').body);
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('private');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
  });

  it('gives outsiders the same 404 as a missing file', async () => {
    db.select.mockReturnValue(chain([stored]));
    vi.mocked(requireProjectAccess).mockRejectedValue(new AuthzError());
    expect((await get()).status).toBe(404);
    expect(storage.readFileStream).not.toHaveBeenCalled();

    db.select.mockReturnValue(chain([]));
    expect((await get()).status).toBe(404);
  });

  it('404s a malformed id without touching the database', async () => {
    expect((await get('../../etc/passwd')).status).toBe(404);
    expect(db.select).not.toHaveBeenCalled();
  });
});
