'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useUpgrade } from '@/features/billing/components/upgrade';
import { PersonAvatar } from '@/features/tasks/components/task-meta';
import { formatDay, formatDue, parseDay } from '@/features/tasks/due';
import { taskHref } from '@/features/tasks/task-link';
import { cn } from '@/lib/utils';
import { Users } from 'lucide-react';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { loadLevel, upcomingWeeks, workload, type WorkloadTask } from '../compute';

const WEEKS = 6;
const noop = () => () => {};
/** Weeks depend on the viewer's clock and time zone: the counts render after mount. */
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

interface Person {
  id: string;
  name: string;
  image: string | null;
}

/** "Nov 23–29", or "Nov 30 – Dec 6" across a month. */
function weekRange(start: string, end: string) {
  const a = parseDay(start);
  const b = parseDay(end);
  return a.getMonth() === b.getMonth() ? `${formatDay(start)}–${b.getDate()}` : `${formatDay(start)} – ${formatDay(end)}`;
}

const SHADES = ['', 'bg-primary/10', 'bg-amber-500/20 dark:bg-amber-500/25', 'bg-red-500/20 dark:bg-red-500/25'];

/**
 * D2: a table of open tasks per person per week (Pro). Each count opens the
 * tasks behind it; heavier weeks are shaded, so who's overloaded shows at a
 * glance before anyone is given more.
 */
export function WorkloadView(props: Readonly<{ workspaceSlug: string; people: Person[]; tasks: WorkloadTask[] }>) {
  const { canUse, openUpgrade } = useUpgrade();
  if (!canUse('workload')) {
    return (
      <div className='flex flex-col items-start gap-3 rounded-lg border p-8'>
        <Users className='size-6 text-muted-foreground' aria-hidden />
        <h2 className='text-lg font-semibold'>See who’s busy before you assign</h2>
        <p className='max-w-[56ch] text-sm text-muted-foreground'>
          Workload shows each person’s open tasks week by week across every project, so nobody ends up with three
          launches in one week. It’s part of Pro.
        </p>
        <Button onClick={() => openUpgrade('workload')}>See what Pro adds</Button>
      </div>
    );
  }
  return <WorkloadTable {...props} />;
}

function WorkloadTable({ workspaceSlug, people, tasks }: Readonly<{ workspaceSlug: string; people: Person[]; tasks: WorkloadTask[] }>) {
  const mounted = useMounted();
  if (!mounted) return <Skeleton className='h-64 w-full' />;

  const now = new Date();
  const weeks = upcomingWeeks(WEEKS, now);
  const rows = workload(tasks, people.map((p) => p.id), weeks, now);
  const byId = new Map(people.map((p) => [p.id, p]));
  const shown = rows.filter(
    (r) => r.personId !== null || r.overdue.length + r.noDate.length + r.weeks.flat().length > 0,
  );

  const weekLabel = (start: string, i: number) => (i === 0 ? 'This week' : i === 1 ? 'Next week' : `Week of ${formatDay(start)}`);

  return (
    <div className='overflow-x-auto rounded-lg border'>
      <table className='w-full min-w-[760px] text-sm'>
        <caption className='sr-only'>Open tasks per person, by week</caption>
        <thead className='bg-muted/40 text-xs text-muted-foreground'>
          <tr>
            <th scope='col' className='px-3 py-2 text-left font-medium'>
              Person
            </th>
            <th scope='col' className='px-2 py-2 text-center font-medium'>
              Overdue
            </th>
            {weeks.map((w, i) => (
              <th key={w.start} scope='col' className='px-2 py-2 text-center font-medium'>
                <span className='block'>{weekLabel(w.start, i)}</span>
                <span className='block font-normal'>{weekRange(w.start, w.end)}</span>
              </th>
            ))}
            <th scope='col' className='px-2 py-2 text-center font-medium'>
              No date
            </th>
          </tr>
        </thead>
        <tbody className='divide-y'>
          {shown.map((row) => {
            const person = row.personId ? byId.get(row.personId) : null;
            const name = person?.name ?? 'Unassigned';
            return (
              <tr key={row.personId ?? 'unassigned'}>
                <th scope='row' className='px-3 py-2 text-left font-medium'>
                  <span className='flex items-center gap-2'>
                    {person ? (
                      <PersonAvatar person={person} className='size-6' fallbackClassName='text-[10px]' />
                    ) : (
                      <span className='size-6 rounded-full border border-dashed' aria-hidden />
                    )}
                    <span className={cn('truncate', !person && 'text-muted-foreground')}>{name}</span>
                  </span>
                </th>
                <Cell slug={workspaceSlug} tasks={row.overdue} label={`${name}, overdue`} late />
                {row.weeks.map((list, i) => (
                  <Cell
                    key={weeks[i].start}
                    slug={workspaceSlug}
                    tasks={list}
                    label={`${name}, ${weekLabel(weeks[i].start, i).toLowerCase()}`}
                    shade
                  />
                ))}
                <Cell slug={workspaceSlug} tasks={row.noDate} label={`${name}, no date`} />
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.some((r) => r.later > 0) && (
        <p className='border-t px-3 py-2 text-xs text-muted-foreground'>
          Work further out than {WEEKS} weeks isn’t shown here; the calendar has it.
        </p>
      )}
    </div>
  );
}

function Cell({
  slug,
  tasks,
  label,
  shade = false,
  late = false,
}: Readonly<{ slug: string; tasks: WorkloadTask[]; label: string; shade?: boolean; late?: boolean }>) {
  const count = tasks.length;
  if (count === 0) {
    return (
      <td className='px-2 py-2 text-center text-muted-foreground/50' aria-label={`${label}: none`}>
        –
      </td>
    );
  }
  return (
    <td className={cn('px-1 py-1 text-center', shade && SHADES[loadLevel(count)])}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type='button'
            aria-label={`${label}: ${count} ${count === 1 ? 'task' : 'tasks'}`}
            className={cn(
              'w-full rounded-md px-2 py-1.5 font-medium tabular-nums hover:bg-muted',
              late && 'text-destructive',
            )}>
            {count}
          </button>
        </PopoverTrigger>
        <PopoverContent className='w-72 p-1' align='center'>
          <p className='px-2 py-1.5 text-xs font-medium text-muted-foreground'>{label}</p>
          <ul aria-label={label} className='max-h-72 overflow-y-auto'>
            {tasks.map((t) => (
              <li key={t.id}>
                <Link
                  href={taskHref(slug, t.projectId, t.id)}
                  className='block rounded-md px-2 py-1.5 hover:bg-muted'>
                  <span className='block truncate text-sm'>{t.title}</span>
                  <span className='block truncate text-xs text-muted-foreground'>
                    {t.projectName}
                    {t.dueDate ? `, due ${formatDue(t.dueDate, t.dueHasTime)}` : t.startDate ? `, starts ${formatDay(t.startDate)}` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </td>
  );
}
