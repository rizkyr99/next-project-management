'use client';

import { IMAGE_TYPES, MAX_UPLOAD_BYTES } from '@/lib/uploads';

/** Upload an image to a task. Resolves to its app URL, or throws a message to show. */
export async function uploadTaskImage(taskId: string, file: File): Promise<{ url: string; name: string }> {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Only PNG, JPEG, GIF and WebP images can be added.');
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Images can be up to 5 MB.');

  const body = new FormData();
  body.set('taskId', taskId);
  body.set('file', file);
  let res: Response;
  try {
    res = await fetch('/api/uploads', { method: 'POST', body });
  } catch {
    throw new Error('Could not upload the image. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => null)) as { url?: string; name?: string; error?: string } | null;
  if (!res.ok || !data?.url) throw new Error(data?.error ?? 'Could not upload the image. Try again.');
  return { url: data.url, name: data.name ?? file.name };
}

/** Image files in a paste or drop, if any. */
export function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
}
