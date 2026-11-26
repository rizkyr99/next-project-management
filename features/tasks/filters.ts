/**
 * Task filters and sorting for the project views (board, list, table). Pure
 * functions over URL params, so the state lives in the URL (shareable,
 * survives reloads) and the logic is unit-tested. Filtering runs in the
 * browser: a project's tasks are already loaded for the board.
 */

import { PRIORITIES, PRIORITY_RANK, type Priority } from './priority';
import type { ApprovalState } from '@/features/approvals/states';

export type { Priority };
export type DueFilter = 'overdue' | 'week' | 'none';
/** The latest client approval round (C3); "pending" is "waiting on the client". */
export type ApprovalFilter = ApprovalState;

export interface TaskFilters {
  /** 'me', 'unassigned', or a user id. */
  assignee: string | null;
  priority: Priority | null;
  due: DueFilter | null;
  /** A label id. */
  label: string | null;
  approval: ApprovalFilter | null;
  q: string;
}

export interface FilterableTask {
  title: string;
  description?: string | null;
  priority: Priority;
  dueDate?: Date | null;
  assignees: { user: { id: string } }[];
  labels?: { label: { id: string } }[];
  approval?: ApprovalState | null;
}

const DUES: DueFilter[] = ['overdue', 'week', 'none'];
const APPROVALS: ApprovalFilter[] = ['pending', 'changes_requested', 'approved'];

export const FILTER_PARAMS = ['assignee', 'priority', 'due', 'label', 'approval', 'q'] as const;

export function parseFilters(params: Pick<URLSearchParams, 'get'>): TaskFilters {
  const priority = params.get('priority');
  const due = params.get('due');
  const approval = params.get('approval');
  return {
    assignee: params.get('assignee')?.trim() || null,
    priority: (PRIORITIES as readonly string[]).includes(priority ?? '') ? (priority as Priority) : null,
    due: DUES.includes(due as DueFilter) ? (due as DueFilter) : null,
    label: params.get('label')?.trim() || null,
    approval: APPROVALS.includes(approval as ApprovalFilter) ? (approval as ApprovalFilter) : null,
    q: (params.get('q') ?? '').trim().slice(0, 200),
  };
}

export function filtersActive(f: TaskFilters) {
  return Boolean(f.assignee || f.priority || f.due || f.label || f.approval || f.q);
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function matchesFilters(
  task: FilterableTask,
  f: TaskFilters,
  ctx: { currentUserId: string; now?: Date },
): boolean {
  if (f.priority && task.priority !== f.priority) return false;
  if (f.label && !(task.labels ?? []).some((l) => l.label.id === f.label)) return false;
  if (f.approval && task.approval !== f.approval) return false;

  if (f.assignee) {
    const ids = task.assignees.map((a) => a.user.id);
    if (f.assignee === 'unassigned') {
      if (ids.length > 0) return false;
    } else {
      const want = f.assignee === 'me' ? ctx.currentUserId : f.assignee;
      if (!ids.includes(want)) return false;
    }
  }

  if (f.due) {
    const due = task.dueDate ? new Date(task.dueDate) : null;
    const today = startOfDay(ctx.now ?? new Date());
    // Calendar days, not 7 × 24 h: across a DST change those differ by an hour.
    const weekEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    if (f.due === 'none' && due) return false;
    if (f.due === 'overdue' && !(due && due < today)) return false;
    if (f.due === 'week' && !(due && due >= today && due < weekEnd)) return false;
  }

  if (f.q) {
    const needle = f.q.toLowerCase();
    const haystack = `${task.title}\n${task.description ?? ''}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

// ── Sorting (list and table views) ───────────────────────────────────────

export type SortKey = 'title' | 'status' | 'priority' | 'due';
export type SortDir = 'asc' | 'desc';
export interface TaskSort {
  key: SortKey;
  dir: SortDir;
}

const SORT_KEYS: SortKey[] = ['title', 'status', 'priority', 'due'];

/** `?sort=priority&dir=desc`; null means the board's own order. */
export function parseSort(params: Pick<URLSearchParams, 'get'>): TaskSort | null {
  const key = params.get('sort');
  if (!SORT_KEYS.includes(key as SortKey)) return null;
  return { key: key as SortKey, dir: params.get('dir') === 'desc' ? 'desc' : 'asc' };
}

/**
 * Stable sort. Tasks without a due date always go last, whichever direction,
 * because "no date" isn't earlier or later than any date.
 */
export function sortTasks<T extends FilterableTask & { statusId: string }>(
  tasks: T[],
  sort: TaskSort | null,
  statusOrder: Record<string, number>,
): T[] {
  if (!sort) return tasks;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const x = a.task;
      const y = b.task;
      let cmp = 0;
      if (sort.key === 'title') cmp = x.title.localeCompare(y.title, undefined, { sensitivity: 'base' }) * sign;
      if (sort.key === 'priority') cmp = (PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority]) * sign;
      if (sort.key === 'status') cmp = ((statusOrder[x.statusId] ?? 0) - (statusOrder[y.statusId] ?? 0)) * sign;
      if (sort.key === 'due') {
        const dx = x.dueDate ? new Date(x.dueDate).getTime() : null;
        const dy = y.dueDate ? new Date(y.dueDate).getTime() : null;
        if (dx === null || dy === null) cmp = dx === dy ? 0 : dx === null ? 1 : -1;
        else cmp = (dx - dy) * sign;
      }
      return cmp || a.index - b.index;
    })
    .map(({ task }) => task);
}
