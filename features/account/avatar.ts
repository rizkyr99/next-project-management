/**
 * I11: profile photos. The browser crops and shrinks the photo to a small
 * square before uploading, so it's always small; the server checks its
 * bytes. Stored privately as `avatars/<userId>/<uuid>.<ext>` and served from
 * /api/avatars/<userId>/<uuid>.<ext>: the URL is unguessable, names whose
 * photo it is (so a photo is only ever deleted for its owner) and carries
 * the type, so serving needs no database lookup.
 */

export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 512 * 1024;

const EXT_TYPES = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' } as const;
type AvatarExt = keyof typeof EXT_TYPES;

const AVATAR_PATH = '/api/avatars/';
const USER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const FILE_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpg|gif|webp)$/;

export function avatarExt(contentType: string): AvatarExt | null {
  const found = Object.entries(EXT_TYPES).find(([, type]) => type === contentType);
  return found ? (found[0] as AvatarExt) : null;
}

/** A user's photo file name → its storage key and type; null for anything else. */
export function parseAvatar(userId: string, file: string): { key: string; contentType: string } | null {
  const match = FILE_PATTERN.exec(file);
  if (!match || !USER_PATTERN.test(userId)) return null;
  return { key: `avatars/${userId}/${match[1]}.${match[2]}`, contentType: EXT_TYPES[match[2] as AvatarExt] };
}

export const avatarPath = (userId: string, file: string) => `${AVATAR_PATH}${userId}/${file}`;

/**
 * The storage key of a photo this user uploaded, from their user.image. Null
 * for a Google photo, or for someone else's photo URL: that's never deleted.
 */
export function ownAvatarKey(image: string | null | undefined, userId: string): string | null {
  const prefix = `${AVATAR_PATH}${userId}/`;
  if (!image?.startsWith(prefix)) return null;
  return parseAvatar(userId, image.slice(prefix.length))?.key ?? null;
}
