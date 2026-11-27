import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chain, failingChain } from '../../helpers/db-mock';
import { avatarExt, avatarPath, ownAvatarKey, parseAvatar } from '@/features/account/avatar';

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
const CHANGED = 'Your photo was changed somewhere else just now. Reload the page and try again.';

describe('avatar paths', () => {
  it('reads only "<user>/<uuid>.<image ext>"', () => {
    expect(parseAvatar('u1', `${ID}.webp`)).toEqual({ key: `avatars/u1/${ID}.webp`, contentType: 'image/webp' });
    expect(parseAvatar('u1', `${ID}.svg`)).toBeNull();
    expect(parseAvatar('..', `${ID}.png`)).toBeNull();
    expect(parseAvatar('u1', 'photo.png')).toBeNull();
    expect(avatarExt('image/jpeg')).toBe('jpg');
    expect(avatarExt('image/svg+xml')).toBeNull();
  });

  it('a photo is only "own" for the user it was uploaded by', () => {
    expect(ownAvatarKey(avatarPath('u1', `${ID}.jpg`), 'u1')).toBe(`avatars/u1/${ID}.jpg`);
    // Someone else's photo URL set as your image is never deleted on your behalf.
    expect(ownAvatarKey(avatarPath('victim', `${ID}.jpg`), 'u1')).toBeNull();
    expect(ownAvatarKey('https://lh3.googleusercontent.com/a/x', 'u1')).toBeNull();
    expect(ownAvatarKey(null, 'u1')).toBeNull();
  });
});

describe('uploadAvatar / removeAvatar', () => {
  const written: Record<string, unknown>[] = [];
  /** The next profile write takes effect (one row) or loses to another change (none). */
  const nextWrite = (takesEffect: boolean) =>
    db.update.mockImplementationOnce(() => ({
      set: (v: Record<string, unknown>) => {
        written.push(v);
        return chain(takesEffect ? [{ id: 'u1' }] : []);
      },
    }));

  beforeEach(() => {
    vi.resetAllMocks();
    written.length = 0;
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'u1', name: 'Ada' } } as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    storage.storageAvailable.mockReturnValue(true);
    storage.saveFile.mockResolvedValue(undefined);
    storage.deleteFile.mockResolvedValue(undefined);
  });

  const form = (bytes: Uint8Array, type = 'image/png') => {
    const f = new FormData();
    f.set('photo', new File([bytes as BlobPart], 'photo', { type }));
    return f;
  };

  it('stores a checked image under the user, points the profile at it, and deletes their old upload', async () => {
    db.select.mockReturnValueOnce(chain([{ image: avatarPath('u1', `${ID}.webp`) }]));
    nextWrite(true);
    const result = await uploadAvatar(form(PNG));
    expect(result.error).toBeUndefined();
    const image = (result as { image: string }).image;
    expect(image).toMatch(/^\/api\/avatars\/u1\/[0-9a-f-]{36}\.png$/);
    const key = `avatars/u1/${image.split('/').pop()}`;
    expect(storage.saveFile).toHaveBeenCalledWith(key, expect.any(ArrayBuffer), 'image/png');
    expect(written).toEqual([{ image }]);
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledWith(`avatars/u1/${ID}.webp`);
  });

  it('never deletes a photo that isn’t theirs, even if their profile points at it', async () => {
    db.select.mockReturnValueOnce(chain([{ image: avatarPath('victim', `${ID}.webp`) }]));
    nextWrite(true);
    await uploadAvatar(form(PNG));
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('drops the new file when another change won, or the save failed', async () => {
    db.select.mockReturnValueOnce(chain([{ image: null }]));
    nextWrite(false);
    expect(await uploadAvatar(form(PNG))).toEqual({ error: CHANGED });
    const saved = storage.saveFile.mock.calls[0][0];
    expect(storage.deleteFile).toHaveBeenCalledWith(saved);

    storage.deleteFile.mockClear();
    db.select.mockReturnValueOnce(failingChain(new Error('db down')));
    expect((await uploadAvatar(form(PNG))).error).toBeDefined();
    expect(storage.deleteFile).toHaveBeenCalledWith(storage.saveFile.mock.calls[1][0]);
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

  it('removing clears the photo; a Google photo has no file to delete; a lost race keeps both', async () => {
    db.select.mockReturnValueOnce(chain([{ image: 'https://lh3.googleusercontent.com/a/x' }]));
    nextWrite(true);
    expect(await removeAvatar()).toEqual({ success: true });
    expect(written).toEqual([{ image: null }]);
    expect(storage.deleteFile).not.toHaveBeenCalled();

    db.select.mockReturnValueOnce(chain([{ image: avatarPath('u1', `${ID}.png`) }]));
    nextWrite(false);
    expect(await removeAvatar()).toEqual({ error: CHANGED });
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
});
