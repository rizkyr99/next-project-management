import { parseAvatarFile } from '@/features/account/avatar';
import { readFileStream } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * I11: a profile photo. Shown wherever the person appears (boards, comments,
 * share links), so there's no sign-in check; the URL is a random ID, and
 * only images whose bytes were checked on upload are stored here.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const avatar = parseAvatarFile((await params).file);
  const stream = avatar ? await readFileStream(avatar.key) : null;
  if (!avatar || !stream) return new Response('Not found', { status: 404 });
  return new Response(stream, {
    headers: {
      'Content-Type': avatar.contentType,
      // A new photo gets a new URL, so this one never changes.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
