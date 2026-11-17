'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { FILTER_PARAMS, filtersActive, parseFilters, parseSort, type TaskFilters, type TaskSort } from './filters';

/** Writes URL params in place (no server round trip; Next syncs useSearchParams). */
export function setUrlParams(updates: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href !== window.location.href) window.history.replaceState(null, '', url);
}

export function useTaskFilters(): {
  filters: TaskFilters;
  sort: TaskSort | null;
  active: boolean;
  setFilter: (key: keyof TaskFilters, value: string | null) => void;
  setSort: (sort: TaskSort | null) => void;
  clear: () => void;
} {
  const params = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const sort = useMemo(() => parseSort(params), [params]);
  return {
    filters,
    sort,
    active: filtersActive(filters),
    setFilter: (key, value) => setUrlParams({ [key]: value }),
    setSort: (next) => setUrlParams({ sort: next?.key ?? null, dir: next?.dir === 'desc' ? 'desc' : null }),
    clear: () => setUrlParams(Object.fromEntries(FILTER_PARAMS.map((k) => [k, null]))),
  };
}
