'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { SortKey, TaskSort } from '../filters';

/** "asc" | "desc" | "none", for the header cell's aria-sort. */
export function ariaSort(sort: TaskSort | null, key: SortKey) {
  if (sort?.key !== key) return 'none' as const;
  return sort.dir === 'asc' ? ('ascending' as const) : ('descending' as const);
}

/**
 * A sortable column header: click to sort ascending, again for descending,
 * a third time to go back to the board's order. State lives in the URL.
 */
export function SortButton({
  label,
  sortKey,
  sort,
  setSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: TaskSort | null;
  setSort: (sort: TaskSort | null) => void;
}) {
  const current = sort?.key === sortKey ? sort.dir : null;
  const next = (): TaskSort | null =>
    current === null ? { key: sortKey, dir: 'asc' } : current === 'asc' ? { key: sortKey, dir: 'desc' } : null;
  const Icon = current === 'asc' ? ArrowUp : current === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <button
      type='button'
      onClick={() => setSort(next())}
      className='inline-flex items-center gap-1 rounded uppercase hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring'
      aria-label={`Sort by ${label}${current ? `, currently ${current === 'asc' ? 'ascending' : 'descending'}` : ''}`}>
      {label}
      <Icon className={`size-3.5 ${current ? 'text-foreground' : 'opacity-50'}`} aria-hidden />
    </button>
  );
}
