'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronRight } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { GROUP_OPTIONS, parseGroup, type GroupBy } from '../grouping';
import { setUrlParams } from '../use-task-filters';
import { cn } from '@/lib/utils';

const NONE = 'none';

/** The list/table grouping in the URL, and which groups are folded (per visit). */
export function useTaskGroups() {
  const params = useSearchParams();
  const group = useMemo(() => parseGroup(params), [params]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return {
    group,
    setGroup: (next: GroupBy | null) => {
      setCollapsed(new Set());
      setUrlParams({ group: next });
    },
    isCollapsed: (key: string) => collapsed.has(key),
    toggle: (key: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
  };
}

export function GroupBySelect({ group, onChange }: { group: GroupBy | null; onChange: (g: GroupBy | null) => void }) {
  const labelId = useId();
  return (
    <div className='flex items-center gap-2 text-sm'>
      <span className='text-muted-foreground' id={labelId}>
        Group by
      </span>
      <Select value={group ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : (v as GroupBy))}>
        <SelectTrigger size='sm' className='h-8 w-32' aria-labelledby={labelId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Nothing</SelectItem>
          {GROUP_OPTIONS.map((o) => (
            <SelectItem key={o.key} value={o.key}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A group's heading: folds the group, and says how many tasks are in it. */
export function GroupToggle({
  label,
  count,
  collapsed,
  onToggle,
  className,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type='button'
      aria-expanded={!collapsed}
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-semibold hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring',
        className,
      )}>
      <ChevronRight className={cn('size-4 shrink-0 transition-transform', !collapsed && 'rotate-90')} aria-hidden />
      <span className='truncate'>{label}</span>
      <span className='font-normal text-muted-foreground'>{count}</span>
    </button>
  );
}
