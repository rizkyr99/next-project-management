'use client';

import { fileProblem, SERVER_UPLOAD_MAX_BYTES } from '@/lib/uploads';
import { finishFileUpload, startFileUpload } from './actions';

const OFFLINE = 'Could not upload the file. Check your connection and try again.';

async function viaServer(taskId: string, file: File) {
  const body = new FormData();
  body.set('taskId', taskId);
  body.set('kind', 'file');
  body.set('file', file);
  let res: Response;
  try {
    res = await fetch('/api/uploads', { method: 'POST', body });
  } catch {
    throw new Error(OFFLINE);
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(data?.error ?? 'Could not upload the file. Try again.');
}

/**
 * Attaches a file to a task (B3). Small files go through /api/uploads;
 * larger ones go from the browser straight to private storage with a token
 * the server issues for that one file, then the server records them.
 * Throws a message to show.
 */
export async function uploadTaskFile(taskId: string, file: File, onProgress?: (percent: number) => void) {
  const problem = fileProblem(file.name, file.size);
  if (problem) throw new Error(problem);
  if (file.size <= SERVER_UPLOAD_MAX_BYTES) return viaServer(taskId, file);

  const start = await startFileUpload({ taskId, name: file.name, size: file.size });
  if (start.error !== undefined) throw new Error(start.error);
  if (start.mode === 'server') return viaServer(taskId, file);

  // Loaded only when needed, so the client bundle stays small.
  const { put } = await import('@vercel/blob/client');
  try {
    await put(start.key, file, {
      access: 'private',
      token: start.token,
      contentType: 'application/octet-stream',
      multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
    });
  } catch (err) {
    console.error('[files] direct upload failed:', err);
    throw new Error(OFFLINE);
  }
  const done = await finishFileUpload({ taskId, id: start.id, name: file.name });
  if (done.error !== undefined) throw new Error(done.error);
}
