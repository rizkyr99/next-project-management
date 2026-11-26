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
const storage = vi.hoisted(() => ({
  storageAvailable: vi.fn(),
  directUploadsAvailable: vi.fn(),
  saveFile: vi.fn(),
  readFileStream: vi.fn(),
}));
vi.mock('@/lib/storage', () => storage);
const files = vi.hoisted(() => ({ storageProblem: vi.fn(), recordTaskFile: vi.fn() }));
vi.mock('@/features/attachments/server', () => files);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { AuthzError, requireProjectAccess, requireTaskAccess } from '@/lib/authz';
import { POST as upload } from '@/app/api/uploads/route';
import { GET as serve } from '@/app/api/files/[id]/route';
import { sniffImageType } from '@/lib/uploads';

const TASK = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function form(bytes: Uint8Array<ArrayBuffer>, name = 'shot.png', type = 'image/png', kind?: 'file') {
  const f = new FormData();
  f.set('taskId', TASK);
  if (kind) f.set('kind', kind);
  f.set('file', new File([bytes], name, { type }));
  return new Request('http://t/api/uploads', { method: 'POST', body: f });
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.storageAvailable.mockReturnValue(true);
  storage.directUploadsAvailable.mockReturnValue(false);
  files.storageProblem.mockResolvedValue(null);
  vi.mocked(requireTaskAccess).mockResolvedValue({
    session: { user: { id: 'u-1' } },
    role: 'member',
    task: { id: TASK, title: 'Homepage' },
    project: { id: 'p-1' },
    workspace: { id: 'ws-1', slug: 'acme' },
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

  it('answers 400, not 500, to a request without form data', async () => {
    const res = await upload(new Request('http://t/api/uploads', { method: 'POST' }));
    expect(res.status).toBe(400);
    expect(requireTaskAccess).not.toHaveBeenCalled();
  });

  it('says so when uploads are not set up', async () => {
    storage.storageAvailable.mockReturnValue(false);
    const res = await upload(form(PNG));
    expect(res.status).toBe(503);
    expect(requireTaskAccess).not.toHaveBeenCalled();
  });
});

describe('POST /api/uploads, kind=file (B3)', () => {
  it('stores a listed file as plain bytes and records it', async () => {
    const res = await upload(form(new TextEncoder().encode('%PDF-1.7'), 'Brand guide.pdf', 'application/pdf', 'file'));
    expect(res.status).toBe(200);
    const [key, , type] = storage.saveFile.mock.calls[0];
    expect(key).toMatch(/^attachments\/p-1\/[0-9a-f-]{36}$/);
    expect(type).toBe('application/octet-stream');
    expect(files.recordTaskFile).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'member' }),
      expect.objectContaining({ key, name: 'Brand guide.pdf', size: 8 }),
    );
  });

  it('refuses programs and scripts, whatever they claim to be', async () => {
    for (const name of ['setup.exe', 'run.sh', 'page.html', 'noext']) {
      const res = await upload(form(new TextEncoder().encode('x'), name, 'application/pdf', 'file'));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/can’t be attached/);
    }
    expect(storage.saveFile).not.toHaveBeenCalled();
  });

  it('refuses when the workspace is out of storage, before storing', async () => {
    files.storageProblem.mockResolvedValue('This workspace is out of file storage.');
    const res = await upload(form(new TextEncoder().encode('x'), 'a.pdf', 'application/pdf', 'file'));
    expect(res.status).toBe(400);
    expect(storage.saveFile).not.toHaveBeenCalled();
  });

  it('sends files over 4 MB elsewhere when storage takes direct uploads', async () => {
    storage.directUploadsAvailable.mockReturnValue(true);
    const res = await upload(form(new Uint8Array(4 * 1024 * 1024 + 1), 'big.zip', 'application/zip', 'file'));
    expect(res.status).toBe(400);
    expect(storage.saveFile).not.toHaveBeenCalled();
  });

  it('counts pasted images against the storage limit too', async () => {
    files.storageProblem.mockResolvedValue('This workspace is out of file storage.');
    expect((await upload(form(PNG))).status).toBe(413);
    expect(storage.saveFile).not.toHaveBeenCalled();
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

  it('downloads anything that is not a checked image, as plain bytes', async () => {
    db.select.mockReturnValue(chain([{ ...stored, name: 'guide.pdf', contentType: 'application/octet-stream', listed: true }]));
    vi.mocked(requireProjectAccess).mockResolvedValue({ role: 'member' } as never);
    storage.readFileStream.mockResolvedValue(new Response('%PDF').body);
    const res = await get();
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toBe("attachment; filename*=UTF-8''guide.pdf");
  });

  it('downloads an image too when asked', async () => {
    db.select.mockReturnValue(chain([stored]));
    vi.mocked(requireProjectAccess).mockResolvedValue({} as never);
    storage.readFileStream.mockResolvedValue(new Response('png').body);
    const res = await serve(new Request(`http://t/api/files/${FILE_ID}?download`), { params: Promise.resolve({ id: FILE_ID }) });
    expect(res.headers.get('content-disposition')).toMatch(/^attachment;/);
  });

  it('lets a client open listed files shared with them, and nothing internal', async () => {
    const guest = { role: 'guest', session: { user: { id: 'client-1' } } };
    vi.mocked(requireProjectAccess).mockResolvedValue(guest as never);
    storage.readFileStream.mockResolvedValue(new Response('x').body);

    db.select.mockReturnValueOnce(chain([{ ...stored, uploadedById: 'u-1', listed: true, clientVisible: true }]));
    expect((await get()).status).toBe(200);

    db.select
      .mockReturnValueOnce(chain([{ ...stored, uploadedById: 'u-1', listed: true, clientVisible: false }]))
      // Not referenced in anything shared either.
      .mockReturnValueOnce(chain([]));
    expect((await get()).status).toBe(404);
  });

  it('404s a malformed id without touching the database', async () => {
    expect((await get('../../etc/passwd')).status).toBe(404);
    expect(db.select).not.toHaveBeenCalled();
  });
});
