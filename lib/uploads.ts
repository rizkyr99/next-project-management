/** What can be uploaded, shared by the upload route and the editor. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Images only, recognised by their first bytes, not by the type the browser
 * claims. No SVG: it can carry scripts.
 */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const at = (i: number, ...sig: number[]) => sig.every((b, j) => bytes[i + j] === b);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

/** The URL the app uses for an uploaded file. */
export const fileUrl = (id: string) => `/api/files/${id}`;

/**
 * Files attached to a task (B3). Anything a studio hands over: documents,
 * images, design sources, fonts, media and zip archives. Allowed by
 * extension; nothing here is ever shown inline except images whose bytes
 * prove they're PNG, JPEG, GIF or WebP (everything else is served as a
 * download), so a wrong extension can't make the browser run anything.
 * Programs and scripts aren't on the list, so Tide can't be used to pass
 * them around.
 */
export const FILE_EXTENSIONS = [
  // Documents
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'key', 'pages', 'numbers',
  'odt', 'ods', 'odp', 'rtf', 'txt', 'csv', 'md',
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'svg', 'tif', 'tiff', 'bmp',
  // Design sources
  'psd', 'ai', 'eps', 'indd', 'sketch', 'fig', 'xd', 'afdesign', 'afphoto', 'afpub',
  // Fonts
  'ttf', 'otf', 'woff', 'woff2',
  // Audio and video
  'mp4', 'mov', 'm4v', 'webm', 'mp3', 'wav', 'm4a', 'aac',
  // Archives
  'zip',
] as const;

/** One file's limit. Storage per workspace is limited by plan (lib/plans.ts). */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/**
 * Files up to this size go through our own upload route. Vercel functions
 * accept request bodies up to 4.5 MB, so bigger files are sent by the
 * browser straight to private storage with a one-off token.
 */
export const SERVER_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

export const MAX_FILE_NAME = 255;

/** "Brand Guide.PDF" → "pdf"; "" when there's no extension. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
}

export function isAllowedFileName(name: string): boolean {
  return (FILE_EXTENSIONS as readonly string[]).includes(fileExtension(name));
}

/**
 * A file name safe to store and to put in a Content-Disposition header:
 * no path, no control characters, at most 255 characters with the
 * extension kept.
 */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_FILE_NAME) return clean;
  const ext = fileExtension(clean);
  const keep = MAX_FILE_NAME - (ext ? ext.length + 1 : 0);
  return ext ? `${clean.slice(0, keep)}.${ext}` : clean.slice(0, MAX_FILE_NAME);
}

/** Why a file can't be attached, or null when it can. Shared by browser and server. */
export function fileProblem(name: string, size: number): string | null {
  if (!isAllowedFileName(name)) {
    return `“${name}” can’t be attached. Documents, images, design files, fonts, audio, video and zip files can.`;
  }
  if (size <= 0) return `“${name}” is empty.`;
  if (size > MAX_FILE_BYTES) return `“${name}” is over 100 MB, the limit per file.`;
  return null;
}
