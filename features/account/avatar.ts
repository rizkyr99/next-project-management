/**
 * I11: profile photos. The browser crops and shrinks the photo to a small
 * square before uploading, so it's always small; the server checks its
 * bytes. Stored privately as `avatars/<uuid>.<ext>` and served from
 * /api/avatars/<uuid>.<ext>: the URL is unguessable and the type is in it,
 * so serving needs no database lookup.
 */

export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 512 * 1024;

const EXT_TYPES = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' } as const;
type AvatarExt = keyof typeof EXT_TYPES;

const AVATAR_PATH = '/api/avatars/';
const FILE_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpg|gif|webp)$/;

export function avatarExt(contentType: string): AvatarExt | null {
  const found = Object.entries(EXT_TYPES).find(([, type]) => type === contentType);
  return found ? (found[0] as AvatarExt) : null;
}

/** "<uuid>.webp" → its storage key and type; null for anything else. */
export function parseAvatarFile(file: string): { key: string; contentType: string } | null {
  const match = FILE_PATTERN.exec(file);
  if (!match) return null;
  return { key: `avatars/${match[1]}.${match[2]}`, contentType: EXT_TYPES[match[2] as AvatarExt] };
}

export const avatarPath = (file: string) => `${AVATAR_PATH}${file}`;

/** The storage key of a photo uploaded here (not a Google one), from user.image. */
export function ownAvatarKey(image: string | null | undefined): string | null {
  if (!image?.startsWith(AVATAR_PATH)) return null;
  return parseAvatarFile(image.slice(AVATAR_PATH.length))?.key ?? null;
}
