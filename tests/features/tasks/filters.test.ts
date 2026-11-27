import { describe, expect, it } from 'vitest';
import {
  filtersActive,
  matchesFilters,
  parseFilters,
  parseSort,
  sortTasks,
  type FilterableTask,
} from '@/features/tasks/filters';

const params = (q: string) => new URLSearchParams(q);
const now = new Date(2026, 10, 17, 15, 0); // Tue Nov 17 2026, 15:00 local
const day = (d: number) => new Date(2026, 10, d, 9, 0);

const t = (over: Partial<FilterableTask> = {}): FilterableTask => ({
  title: 'Write launch plan',
  description: 'Draft for **Friday**',
  priority: 'medium',
  dueDate: null,
  assignees: [],
  ...over,
});
const ctx = { currentUserId: 'me-id', now };

describe('parseFilters', () => {
  it('reads known values and ignores junk', () => {
    expect(parseFilters(params('assignee=me&priority=high&due=week&q=  plan '))).toEqual({
      assignee: 'me',
      priority: 'high',
      due: 'week',
      label: null,
      approval: null,
      q: 'plan',
    });
    expect(parseFilters(params('priority=urgent')).priority).toBe('urgent');
    expect(parseFilters(params('priority=none')).priority).toBe('none');
    expect(parseFilters(params('priority=critical&due=yesterday'))).toEqual({
      assignee: null,
      priority: null,
      due: null,
      label: null,
      approval: null,
      q: '',
    });
    expect(filtersActive(parseFilters(params('view=list&task=x')))).toBe(false);
  });
});

describe('matchesFilters', () => {
  it('assignee: me, unassigned, or a specific person', () => {
    const mine = t({ assignees: [{ user: { id: 'me-id' } }] });
    const theirs = t({ assignees: [{ user: { id: 'u2' } }] });
    const nobody = t();
    const f = (assignee: string) => ({ assignee, priority: null, due: null, label: null, approval: null, q: '' });
    expect([mine, theirs, nobody].map((x) => matchesFilters(x, f('me'), ctx))).toEqual([true, false, false]);
    expect([mine, theirs, nobody].map((x) => matchesFilters(x, f('unassigned'), ctx))).toEqual([false, false, true]);
    expect([mine, theirs, nobody].map((x) => matchesFilters(x, f('u2'), ctx))).toEqual([false, true, false]);
  });

  it('label: keeps tasks that carry the label', () => {
    const f = { assignee: null, priority: null, due: null, label: 'l-1', approval: null, q: '' };
    const ctx = { currentUserId: 'me' };
    const task = (ids: string[]) => ({ title: 't', priority: 'medium' as const, assignees: [], labels: ids.map((id) => ({ label: { id } })) });
    expect(matchesFilters(task(['l-1', 'l-2']), f, ctx)).toBe(true);
    expect(matchesFilters(task(['l-2']), f, ctx)).toBe(false);
    expect(matchesFilters({ title: 't', priority: 'medium', assignees: [] }, f, ctx)).toBe(false);
    expect(parseFilters(params('label=l-1')).label).toBe('l-1');
  });

  it('approval: the latest round, e.g. waiting on the client', () => {
    const f = { assignee: null, priority: null, due: null, label: null, approval: 'pending' as const, q: '' };
    expect(matchesFilters(t({ approval: 'pending' }), f, ctx)).toBe(true);
    expect(matchesFilters(t({ approval: 'approved' }), f, ctx)).toBe(false);
    expect(matchesFilters(t(), f, ctx)).toBe(false);
    expect(parseFilters(params('approval=pending')).approval).toBe('pending');
    expect(parseFilters(params('approval=cancelled')).approval).toBeNull();
  });

  it('due: overdue is before today; this week is today through 6 days on; none has no date', () => {
    const f = (due: 'overdue' | 'week' | 'none') => ({ assignee: null, priority: null, due, label: null, approval: null, q: '' });
    const yesterday = t({ dueDate: day(16) });
    const today = t({ dueDate: day(17) });
    const in6 = t({ dueDate: day(23) });
    const in7 = t({ dueDate: day(24) });
    const none = t();
    expect([yesterday, today, in6, in7, none].map((x) => matchesFilters(x, f('overdue'), ctx))).toEqual([
      true, false, false, false, false,
    ]);
    expect([yesterday, today, in6, in7, none].map((x) => matchesFilters(x, f('week'), ctx))).toEqual([
      false, true, true, false, false,
    ]);
    expect([yesterday, none].map((x) => matchesFilters(x, f('none'), ctx))).toEqual([false, true]);
  });

  it('text matches title or description, case-insensitively; filters combine', () => {
    const base = { assignee: null, priority: null, due: null, label: null, approval: null } as const;
    expect(matchesFilters(t(), { ...base, q: 'LAUNCH' }, ctx)).toBe(true);
    expect(matchesFilters(t(), { ...base, q: 'friday' }, ctx)).toBe(true);
    expect(matchesFilters(t(), { ...base, q: 'budget' }, ctx)).toBe(false);
    expect(matchesFilters(t({ priority: 'high' }), { ...base, priority: 'high', q: 'plan' }, ctx)).toBe(true);
    expect(matchesFilters(t({ priority: 'low' }), { ...base, priority: 'high', q: 'plan' }, ctx)).toBe(false);
  });
});

describe('sortTasks', () => {
  const rows = [
    { ...t({ title: 'beta', priority: 'low', dueDate: day(20) }), statusId: 's2', id: 1 },
    { ...t({ title: 'Alpha', priority: 'high', dueDate: null }), statusId: 's1', id: 2 },
    { ...t({ title: 'gamma', priority: 'medium', dueDate: day(18) }), statusId: 's3', id: 3 },
  ];
  const order = { s1: 0, s2: 1, s3: 2 };
  const ids = (sorted: typeof rows) => sorted.map((r) => r.id);

  it('keeps board order without a sort, and parses ?sort/&dir', () => {
    expect(ids(sortTasks(rows, null, order))).toEqual([1, 2, 3]);
    expect(parseSort(params('sort=priority&dir=desc'))).toEqual({ key: 'priority', dir: 'desc' });
    expect(parseSort(params('sort=assignee'))).toBeNull();
  });

  it('sorts by title (case-insensitive), priority, status and due date', () => {
    expect(ids(sortTasks(rows, { key: 'title', dir: 'asc' }, order))).toEqual([2, 1, 3]);
    expect(ids(sortTasks(rows, { key: 'priority', dir: 'desc' }, order))).toEqual([2, 3, 1]);
    expect(ids(sortTasks(rows, { key: 'status', dir: 'asc' }, order))).toEqual([2, 1, 3]);
  });

  it('puts tasks without a due date last in both directions', () => {
    expect(ids(sortTasks(rows, { key: 'due', dir: 'asc' }, order))).toEqual([3, 1, 2]);
    expect(ids(sortTasks(rows, { key: 'due', dir: 'desc' }, order))).toEqual([1, 3, 2]);
  });
});

describe('due "this week" across a daylight-saving change', () => {
  it('ends after 7 calendar days, not 168 hours (America/New_York, March 2026)', () => {
    const prevTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const nowDst = new Date(2026, 2, 7, 12, 0); // Sat Mar 7; clocks go forward Sun Mar 8
      const f = { assignee: null, priority: null, due: 'week' as const, label: null, approval: null, q: '' };
      const at = (d: number) => t({ dueDate: new Date(2026, 2, d, 0, 0) });
      const c = { currentUserId: 'me-id', now: nowDst };
      expect(matchesFilters(at(13), f, c)).toBe(true); // 6th day after today
      expect(matchesFilters(at(14), f, c)).toBe(false); // 7th: excluded
    } finally {
      process.env.TZ = prevTz;
    }
  });
});
