'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { db } from '@/db/drizzle';
import { user } from '@/db/schema';
import { requireSession, toActionError, type ActionResult } from '@/lib/authz';
import { enforceRateLimit } from '@/lib/rate-limit';
import { deleteFile, saveFile, storageAvailable } from '@/lib/storage';
import { sniffImageType } from '@/lib/uploads';
import { AVATAR_MAX_BYTES, avatarExt, avatarPath, ownAvatarKey } from './avatar';

/** The old photo's file goes once the new one is saved; failing to delete it is only logged. */
function deleteLater(key: string | null) {
  if (!key) return;
  after(() => deleteFile(key).catch((error) => console.error('[avatar] delete failed:', error)));
}

async function currentImage(userId: string) {
  const [row] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId)).limit(1);
  return row?.image ?? null;
}

/** I11: set your profile photo (already cropped and shrunk in the browser). */
export async function uploadAvatar(form: FormData): Promise<ActionResult<{ image: string }>> {
  try {
    const session = await requireSession();
    await enforceRateLimit('uploads', session.user.id);
    if (!storageAvailable()) return { error: 'Photo uploads aren’t set up yet.' };

    const file = form.get('photo');
    if (!(file instanceof File) || file.size === 0) return { error: 'Choose a photo first.' };
    if (file.size > AVATAR_MAX_BYTES) return { error: 'That photo is too big. Try another one.' };
    const bytes = await file.arrayBuffer();
    const type = sniffImageType(new Uint8Array(bytes.slice(0, 16)));
    const ext = type && avatarExt(type);
    if (!type || !ext) return { error: 'Use a PNG, JPEG, GIF or WebP image.' };

    const name = `${crypto.randomUUID()}.${ext}`;
    await saveFile(`avatars/${name}`, bytes, type);
    const previous = await currentImage(session.user.id);
    const image = avatarPath(name);
    await db.update(user).set({ image }).where(eq(user.id, session.user.id));
    deleteLater(ownAvatarKey(previous));

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
    const previous = await currentImage(session.user.id);
    await db.update(user).set({ image: null }).where(eq(user.id, session.user.id));
    deleteLater(ownAvatarKey(previous));
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not remove your photo.');
  }
}
