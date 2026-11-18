/**
 * The project page's view (board, list or table) lives in the URL as
 * `?view=…`, so it survives reloads and can be shared. Switching changes the
 * URL without a server round trip: all three views show the same data the
 * page already has. Next.js syncs `history.replaceState` with
 * `useSearchParams`.
 */
export const VIEWS = ['board', 'list', 'table'] as const;
export type View = (typeof VIEWS)[number];

export function parseView(value: string | null | undefined): View {
  return value === 'list' || value === 'table' ? value : 'board';
}

export function setView(view: View) {
  const url = new URL(window.location.href);
  if (view === 'board') url.searchParams.delete('view');
  else url.searchParams.set('view', view);
  if (url.href !== window.location.href) window.history.replaceState(null, '', url);
}
