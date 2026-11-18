import 'server-only';
import { get, put, del } from '@vercel/blob';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Where uploaded files live.
 *
 * - With BLOB_READ_WRITE_TOKEN: a **private** Vercel Blob store. Nothing is
 *   reachable by URL; files are only read here, by the server.
 * - Without it, outside Vercel deployments (local dev, CI): a folder on disk,
 *   so uploads work and are tested end to end without a store.
 * - Without it on Vercel: uploads are off (`storageAvailable()` is false).
 *
 * Browsers never see a storage key; they load files from /api/files/[id],
 * which checks access first.
 */

const LOCAL_DIR = path.join(process.cwd(), '.data', 'uploads');

function mode(): 'blob' | 'local' | 'off' {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  return process.env.VERCEL ? 'off' : 'local';
}

export function storageAvailable() {
  return mode() !== 'off';
}

/** Keys are generated here only, never taken from a request. */
function localPath(key: string) {
  const file = path.join(LOCAL_DIR, key);
  if (!file.startsWith(LOCAL_DIR + path.sep)) throw new Error('Invalid storage key');
  return file;
}

export async function saveFile(key: string, body: ArrayBuffer, contentType: string) {
  const m = mode();
  if (m === 'blob') {
    await put(key, body, { access: 'private', contentType, addRandomSuffix: false });
    return;
  }
  if (m === 'local') {
    const file = localPath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(body));
    return;
  }
  throw new Error('File storage is not configured');
}

export async function readFileStream(key: string): Promise<ReadableStream<Uint8Array> | null> {
  const m = mode();
  if (m === 'blob') {
    const result = await get(key, { access: 'private' });
    return result?.statusCode === 200 ? result.stream : null;
  }
  if (m === 'local') {
    try {
      const data = await readFile(localPath(key));
      return new Response(data).body;
    } catch {
      return null;
    }
  }
  return null;
}

export async function deleteFile(key: string) {
  const m = mode();
  if (m === 'blob') await del(key);
  else if (m === 'local') await rm(localPath(key), { force: true });
}
