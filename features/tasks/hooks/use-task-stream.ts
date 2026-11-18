'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

const MAX_BACKOFF_MS = 60_000;

/**
 * Keeps an open project view in sync with changes made by others.
 *
 * - The server sends `tasks_changed` whenever the project's snapshot moves
 *   on, and every event's id is that snapshot.
 * - The stream recycles every few minutes; EventSource reconnects by itself
 *   and sends the last id, so changes made in between aren't lost.
 * - While the tab is hidden the stream is closed, so idle tabs don't poll the
 *   database. On return it reopens from the last snapshot and catches up.
 * - If the server refuses the stream (a deploy, an expired session),
 *   reconnecting backs off up to a minute.
 * - A change the page already shows isn't refreshed again. Your own saves
 *   revalidate the page straight away, so the stream hearing about them
 *   moments later would only add a redundant refresh, and Next queues your
 *   next action behind any refresh in flight.
 */
export function useTaskStream(projectId: string, initialSnapshot?: string) {
  const router = useRouter();
  // The snapshot this page's data matches; starts at the server render's.
  const snapshotRef = useRef(initialSnapshot);
  // The snapshot of the data currently rendered (from the latest render).
  const renderedRef = useRef(initialSnapshot);

  useEffect(() => {
    snapshotRef.current = initialSnapshot;
    renderedRef.current = initialSnapshot;
  }, [initialSnapshot]);

  useEffect(() => {
    if (!projectId) return;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let backoff = 1_000;

    const open = () => {
      clearTimeout(retryTimer);
      if (es || document.visibilityState === 'hidden') return;
      const since = snapshotRef.current ? `&since=${encodeURIComponent(snapshotRef.current)}` : '';
      const source = new EventSource(`/api/tasks/stream?projectId=${projectId}${since}`);
      es = source;

      source.onopen = () => {
        backoff = 1_000;
      };
      source.onmessage = (event) => {
        if (event.lastEventId) snapshotRef.current = event.lastEventId;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'tasks_changed' && event.lastEventId !== renderedRef.current) router.refresh();
        } catch {
          // ignore malformed messages
        }
      };
      source.onerror = () => {
        // CONNECTING means the browser is already retrying on its own.
        if (source.readyState !== EventSource.CLOSED) return;
        close();
        retryTimer = setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      };
    };

    const close = () => {
      es?.close();
      es = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(retryTimer);
        close();
      } else {
        open();
      }
    };

    open();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(retryTimer);
      close();
    };
  }, [projectId, router]);
}
