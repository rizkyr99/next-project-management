'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Which board columns this person has collapsed, per project. A display
 * preference for this browser only, so it lives in localStorage (and the
 * board simply shows every column if storage isn't available).
 */
const key = (projectId: string) => `tide:collapsed-columns:${projectId}`;
const listeners = new Set<() => void>();
const EMPTY: readonly string[] = [];
const cache = new Map<string, readonly string[]>();

function read(projectId: string): readonly string[] {
  if (cache.has(projectId)) return cache.get(projectId)!;
  let ids: readonly string[] = EMPTY;
  try {
    const raw = window.localStorage.getItem(key(projectId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) ids = parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    // Storage blocked or corrupt: nothing collapsed.
  }
  cache.set(projectId, ids);
  return ids;
}

function write(projectId: string, ids: readonly string[]) {
  cache.set(projectId, ids);
  try {
    window.localStorage.setItem(key(projectId), JSON.stringify(ids));
  } catch {
    // Still applies for this visit.
  }
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useCollapsedColumns(projectId: string) {
  const collapsed = useSyncExternalStore(
    subscribe,
    () => read(projectId),
    () => EMPTY,
  );
  const setCollapsed = useCallback(
    (statusId: string, value: boolean) => {
      const current = read(projectId);
      const next = value ? [...new Set([...current, statusId])] : current.filter((id) => id !== statusId);
      write(projectId, next);
    },
    [projectId],
  );
  return { isCollapsed: (statusId: string) => collapsed.includes(statusId), setCollapsed };
}
