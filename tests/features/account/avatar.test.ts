import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chain } from '../../helpers/db-mock';
import { avatarExt, avatarPath, ownAvatarKey, parseAvatarFile } from '@/features/account/avatar';

const db = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn() }));
const storage = vi.hoisted(() => ({ saveFile: vi.fn(), deleteFile: vi.fn(), storageAvailable: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/storage', () => storage);
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, enforceRateLimit: vi.fn() };
});
vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()) }));
vi.mock('next/server', () => ({ after: (fn: () => unknown) => fn() }));

import { auth } from '@/lib/auth';
import { removeAvatar, uploadAvatar } from '@/features/account/avatar-actions';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);

describe('avatar paths', () => {
  it('reads only "<uuid>.<image ext>" files', () => {
    expect(parseAvatarFile(`${ID}.webp`)).toEqual({ key: `avatars/${ID}.webp`, contentType: 'image/webp' });
    expect(parseAvatarFile(`${ID}.svg`)).toBeNull();
    expect(parseAvatarFile(`../${ID}.png`)).toBeNull();
    expect(parseAvatarFile('photo.png')).toBeNull();
  });

  it('knows its own photos from Google ones', () => {
    expect(ownAvatarKey(avatarPath(`${ID}.jpg`))).toBe(`avatars/${ID}.jpg`);
    expect(ownAvatarKey('https://lh3.googleusercontent.com/a/x')).toBeNull();
    expect(ownAvatarKey(null)).toBeNull();
    expect(avatarExt('image/jpeg')).toBe('jpg');
    expect(avatarExt('image/svg+xml')).toBeNull();
  });
});

describe('uploadAvatar / removeAvatar', () => {
  const written: Record<string, unknown>[] = [];
  beforeEach(() => {
    vi.resetAllMocks();
    written.length = 0;
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'u1', name: 'Ada' } } as never);
    storage.storageAvailable.mockReturnValue(true);
    storage.saveFile.mockResolvedValue(undefined);
    storage.deleteFile.mockResolvedValue(undefined);
    db.update.mockImplementation(() => ({
      set: (v: Record<string, unknown>) => {
        written.push(v);
        return chain(undefined);
      },
    }));
  });

  const form = (bytes: Uint8Array, type = 'image/png') => {
    const f = new FormData();
    f.set('photo', new File([bytes as BlobPart], 'photo', { type }));
    return f;
  };

  it('stores a checked image, points the profile at it, and deletes the old upload', async () => {
    db.select.mockReturnValueOnce(chain([{ image: avatarPath(`${ID}.webp`) }]));
    const result = await uploadAvatar(form(PNG));
    expect(result.error).toBeUndefined();
    const image = (result as { image: string }).image;
    expect(image).toMatch(/^\/api\/avatars\/[0-9a-f-]{36}\.png$/);
    expect(storage.saveFile).toHaveBeenCalledWith(`avatars/${image.split('/').pop()}`, expect.any(ArrayBuffer), 'image/png');
    expect(written).toEqual([{ image }]);
    expect(storage.deleteFile).toHaveBeenCalledWith(`avatars/${ID}.webp`);
  });

  it('refuses anything whose bytes aren’t an image, and oversized files', async () => {
    expect(await uploadAvatar(form(new TextEncoder().encode('<svg onload=alert(1)>'), 'image/png'))).toEqual({
      error: 'Use a PNG, JPEG, GIF or WebP image.',
    });
    expect(await uploadAvatar(form(new Uint8Array(600 * 1024)))).toEqual({
      error: 'That photo is too big. Try another one.',
    });
    expect(storage.saveFile).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('removing clears the photo; a Google photo has no file to delete', async () => {
    db.select.mockReturnValueOnce(chain([{ image: 'https://lh3.googleusercontent.com/a/x' }]));
    expect(await removeAvatar()).toEqual({ success: true });
    expect(written).toEqual([{ image: null }]);
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
});
