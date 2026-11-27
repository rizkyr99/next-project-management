'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { db } from '@/db/drizzle';
import { user } from '@/db/schema';
import { requireSession, toActionError, type ActionResult } from '@/lib/authz';
import { enforceRateLimit } from '@/lib/rate-limit';
import { deleteFile, saveFile, storageAvailable } from '@/lib/storage';
import { sniffImageType } from '@/lib/uploads';
import { AVATAR_MAX_BYTES, avatarExt, avatarPath, ownAvatarKey } from './avatar';

const CHANGED = 'Your photo was changed somewhere else just now. Reload the page and try again.';

/** A file nothing points at any more; failing to delete it is only logged. */
function deleteLater(key: string | null) {
  if (!key) return;
  after(() => deleteFile(key).catch((error) => console.error('[avatar] delete failed:', error)));
}

async function currentImage(userId: string) {
  const [row] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId)).limit(1);
  return row?.image ?? null;
}

/**
 * Sets user.image only if it's still what was read, so two changes at once
 * (two tabs) can't both "replace" the same photo and leave one file orphaned.
 * True when this write took effect.
 */
async function swapImage(userId: string, previous: string | null, next: string | null) {
  const updated = await db
    .update(user)
    .set({ image: next })
    .where(and(eq(user.id, userId), previous === null ? isNull(user.image) : eq(user.image, previous)))
    .returning({ id: user.id });
  return updated.length > 0;
}

/** I11: set your profile photo (already cropped and shrunk in the browser). */
export async function uploadAvatar(form: FormData): Promise<ActionResult<{ image: string }>> {
  try {
    const session = await requireSession();
    const userId = session.user.id;
    await enforceRateLimit('uploads', userId);
    if (!storageAvailable()) return { error: 'Photo uploads aren’t set up yet.' };

    const file = form.get('photo');
    if (!(file instanceof File) || file.size === 0) return { error: 'Choose a photo first.' };
    if (file.size > AVATAR_MAX_BYTES) return { error: 'That photo is too big. Try another one.' };
    const bytes = await file.arrayBuffer();
    const type = sniffImageType(new Uint8Array(bytes.slice(0, 16)));
    const ext = type && avatarExt(type);
    if (!type || !ext) return { error: 'Use a PNG, JPEG, GIF or WebP image.' };

    const name = `${crypto.randomUUID()}.${ext}`;
    const key = `avatars/${userId}/${name}`;
    const image = avatarPath(userId, name);
    await saveFile(key, bytes, type);
    let swapped = false;
    try {
      const previous = await currentImage(userId);
      swapped = await swapImage(userId, previous, image);
      if (swapped) deleteLater(ownAvatarKey(previous, userId));
    } finally {
      // Not saved on the profile (an error, or another change won): don't keep the file.
      if (!swapped) deleteLater(key);
    }
    if (!swapped) return { error: CHANGED };

    revalidatePath('/', 'layout');
    return { image };
  } catch (error) {
    return toActionError(error, 'Could not save your photo.');
  }
}

/** Back to initials. A Google photo can be removed too. */
export async function removeAvatar(): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const userId = session.user.id;
    const previous = await currentImage(userId);
    if (previous === null) return { success: true };
    if (!(await swapImage(userId, previous, null))) return { error: CHANGED };
    deleteLater(ownAvatarKey(previous, userId));
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not remove your photo.');
  }
}
