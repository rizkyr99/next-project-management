'use client';

import { createContext, useContext, type ReactNode } from 'react';

const ReadOnlyContext = createContext(false);

/**
 * Marks a project's views as read-only: guests (clients) can look and
 * comment, but the board, list, table and task sheet don't offer edits. The
 * server refuses those edits regardless (lib/authz.ts); this only keeps the UI
 * from offering controls that would fail.
 */
export function ProjectReadOnly({ readOnly, children }: Readonly<{ readOnly: boolean; children: ReactNode }>) {
  return <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>;
}

export function useReadOnly() {
  return useContext(ReadOnlyContext);
}
