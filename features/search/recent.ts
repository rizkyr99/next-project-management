'use client';

import { useSyncExternalStore } from 'react';

/**
 * Tasks and projects this person opened recently in a workspace, newest
 * first, for ⌘K before typing. Kept in this browser only (localStorage);
 * without storage, ⌘K simply shows no recent items.
 */
export type RecentItem =
  | { type: 'project'; id: string; title: string; projectId: string }
  | { type: 'task'; id: string; title: string; projectId: string; projectName: string };

const MAX = 6;
const key = (workspaceSlug: string) => `tide:recent:${workspaceSlug}`;
const listeners = new Set<() => void>();
const cache = new Map<string, RecentItem[]>();
const EMPTY: RecentItem[] = [];

function read(workspaceSlug: string): RecentItem[] {
  const cached = cache.get(workspaceSlug);
  if (cached) return cached;
  let items: RecentItem[] = EMPTY;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key(workspaceSlug)) ?? '[]');
    if (Array.isArray(parsed)) {
      items = parsed.filter(
        (i): i is RecentItem =>
          i && (i.type === 'task' || i.type === 'project') && typeof i.id === 'string' && typeof i.title === 'string',
      );
    }
  } catch {
    // Blocked or corrupt storage: no recent items.
  }
  cache.set(workspaceSlug, items);
  return items;
}

export function rememberRecent(workspaceSlug: string, item: RecentItem) {
  const current = read(workspaceSlug);
  if (current[0]?.type === item.type && current[0].id === item.id && current[0].title === item.title) return;
  const next = [item, ...current.filter((i) => !(i.type === item.type && i.id === item.id))].slice(0, MAX);
  cache.set(workspaceSlug, next);
  try {
    window.localStorage.setItem(key(workspaceSlug), JSON.stringify(next));
  } catch {
    // Still listed for this visit.
  }
  listeners.forEach((l) => l());
}

/** Drop an item that no longer opens (deleted, or access lost). */
export function forgetRecent(workspaceSlug: string, item: Pick<RecentItem, 'type' | 'id'>) {
  const current = read(workspaceSlug);
  const next = current.filter((i) => !(i.type === item.type && i.id === item.id));
  if (next.length === current.length) return;
  cache.set(workspaceSlug, next);
  try {
    window.localStorage.setItem(key(workspaceSlug), JSON.stringify(next));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useRecent(workspaceSlug: string | undefined): RecentItem[] {
  return useSyncExternalStore(
    subscribe,
    () => (workspaceSlug ? read(workspaceSlug) : EMPTY),
    () => EMPTY,
  );
}
