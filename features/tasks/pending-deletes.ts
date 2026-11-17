'use client';

import { useSyncExternalStore } from 'react';

/**
 * Tasks the user deleted that are still inside their undo window. Views hide
 * them right away; the server delete only runs once the window passes.
 */
let pending: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function emit(next: ReadonlySet<string>) {
  pending = next;
  for (const listener of listeners) listener();
}

export function hideTask(taskId: string) {
  emit(new Set(pending).add(taskId));
}

export function unhideTask(taskId: string) {
  const next = new Set(pending);
  next.delete(taskId);
  emit(next);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const EMPTY: ReadonlySet<string> = new Set();

export function usePendingDeletes() {
  return useSyncExternalStore(subscribe, () => pending, () => EMPTY);
}
