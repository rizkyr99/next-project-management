import { FILTER_PARAMS } from '@/features/tasks/filters';

/**
 * D3: a project view is the part of the project page's URL that says what
 * you're looking at: the layout, the filters and the sort. Saved and built-in
 * views are that part as a query string; applying one replaces it and leaves
 * the rest (an open task, the calendar's month) alone.
 */
export const VIEW_PARAMS = ['view', ...FILTER_PARAMS, 'sort', 'dir', 'group'] as const;

type Search = string | Pick<URLSearchParams, 'get'>;

function pick(search: Search, keys: readonly string[]): string {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const out = new URLSearchParams();
  for (const key of keys) {
    const value = params.get(key)?.trim();
    // The board is the default layout; leaving it out keeps "board" and "" equal.
    if (value && !(key === 'view' && value === 'board')) out.set(key, value.slice(0, 200));
  }
  return out.toString();
}

/** The view part of a query string, keys in a fixed order, so equal views compare equal. */
export const viewQuery = (search: Search) => pick(search, VIEW_PARAMS);

/** Just the filters: what a built-in view sets. */
export const filterQuery = (search: Search) => pick(search, FILTER_PARAMS);

/**
 * The URL changes that apply a view: a saved view sets layout, filters and
 * sort; a built-in one sets the filters and keeps the layout you're in.
 */
export function viewUpdates(query: string, kind: 'saved' | 'preset'): Record<string, string | null> {
  const params = new URLSearchParams(query);
  const keys = kind === 'saved' ? VIEW_PARAMS : FILTER_PARAMS;
  return Object.fromEntries(keys.map((key) => [key, params.get(key)]));
}

export interface ViewOption {
  id: string;
  name: string;
  query: string;
}

/** Built in for every project (filters only); "Waiting on client" shows when the project uses approvals. */
export const PRESET_VIEWS: (ViewOption & { approvals?: true })[] = [
  { id: 'preset:mine', name: 'Assigned to me', query: 'assignee=me' },
  { id: 'preset:my-overdue', name: 'My overdue', query: 'assignee=me&due=overdue' },
  { id: 'preset:week', name: 'Due this week', query: 'due=week' },
  { id: 'preset:unassigned', name: 'Unassigned', query: 'assignee=unassigned' },
  { id: 'preset:waiting', name: 'Waiting on client', query: 'approval=pending', approvals: true },
];

/** The saved view the URL is showing, or else the built-in one its filters match. */
export function currentView(saved: ViewOption[], presets: ViewOption[], search: Search): ViewOption | null {
  const view = viewQuery(search);
  const filters = filterQuery(search);
  return (
    (view && saved.find((v) => viewQuery(v.query) === view)) ||
    (filters && presets.find((v) => filterQuery(v.query) === filters)) ||
    null
  );
}
