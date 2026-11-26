import 'server-only';
import { get, put, del, head } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { stat } from 'node:fs/promises';
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

/**
 * Whether browsers can upload straight to storage (B3, files over the
 * function body limit). Only a Blob store can take them; on disk, the
 * upload route handles every size.
 */
export function directUploadsAvailable() {
  return mode() === 'blob';
}

/**
 * A one-off token letting a browser upload one file to exactly `key`, at
 * most `maxBytes`, within 15 minutes. It can't overwrite anything.
 */
export async function directUploadToken(key: string, maxBytes: number): Promise<string> {
  if (mode() !== 'blob') throw new Error('Direct uploads need a Blob store');
  return generateClientTokenFromReadWriteToken({
    token: process.env.BLOB_READ_WRITE_TOKEN,
    pathname: key,
    maximumSizeInBytes: maxBytes,
    validUntil: Date.now() + 15 * 60_000,
    addRandomSuffix: false,
    allowOverwrite: false,
  });
}

/** The stored file's size, or null when nothing is stored at `key`. */
export async function storedSize(key: string): Promise<number | null> {
  const m = mode();
  try {
    if (m === 'blob') return (await head(key)).size;
    if (m === 'local') return (await stat(localPath(key))).size;
  } catch {
    return null;
  }
  return null;
}

/** The first `n` bytes of a stored file (to recognise images), without reading the rest. */
export async function readFirstBytes(key: string, n: number): Promise<Uint8Array> {
  const stream = await readFileStream(key);
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < n) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(Math.min(total, n));
  let offset = 0;
  for (const c of chunks) {
    const take = Math.min(c.length, out.length - offset);
    out.set(c.subarray(0, take), offset);
    offset += take;
    if (offset >= out.length) break;
  }
  return out;
}
