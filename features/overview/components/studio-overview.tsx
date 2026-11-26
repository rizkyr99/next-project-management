'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { ProjectStatusBadge } from '@/features/projects/components/project-details';
import { PersonAvatar } from '@/features/tasks/components/task-meta';
import { formatDue } from '@/features/tasks/due';
import { groupByDue } from '@/features/tasks/due-groups';
import { taskHref } from '@/features/tasks/task-link';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, CalendarClock, CheckCircle2, MessageSquare, RotateCcw, Stamp } from 'lucide-react';
import Link from 'next/link';
import { useSyncExternalStore, type ReactNode } from 'react';
import { projectsNeedingAttention } from '../attention';
import type { DueTask, FeedbackItem, StudioOverviewData, WaitingApproval } from '../queries';

const noop = () => () => {};
/**
 * Due dates and "3 days ago" depend on the viewer's clock and time zone,
 * which the server doesn't know, so those parts render after mount.
 */
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

const ago = (d: Date) => formatDistanceToNow(new Date(d), { addSuffix: true });

/**
 * D1: the studio's morning view across every active project. What's late
 * and due this week, which projects need a look and why, what's waiting on
 * clients, and what clients said recently.
 */
export function StudioOverview({ workspaceSlug, data }: Readonly<{ workspaceSlug: string; data: StudioOverviewData }>) {
  const mounted = useMounted();
  const now = new Date();
  const groups = mounted ? groupByDue(data.dueTasks, now).filter((g) => g.key !== 'later' && g.key !== 'none') : [];
  const count = (key: string) => groups.find((g) => g.key === key)?.tasks.length ?? 0;
  const attention = mounted ? projectsNeedingAttention(data.projects, data.dueTasks, now) : [];
  const href = (projectId: string, taskId: string) => taskHref(workspaceSlug, projectId, taskId);

  return (
    <div className='space-y-6'>
      <ul aria-label='At a glance' className='grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4'>
        <Stat label='Overdue' target='#due' value={mounted ? count('overdue') : null} alert />
        <Stat label='Due in the next 7 days' target='#due' value={mounted ? count('today') + count('week') : null} />
        <Stat label='Waiting on clients' target='#waiting' value={data.waiting.length} />
        <Stat label='Projects needing attention' target='#attention' value={mounted ? attention.length : null} alert />
      </ul>

      <div className='grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'>
        <Panel id='due' title='Due soon' icon={<CalendarClock className='size-4' aria-hidden />}>
          {!mounted ? (
            <Rows />
          ) : groups.length === 0 ? (
            <Empty>Nothing is due in the next 7 days, and nothing is overdue.</Empty>
          ) : (
            <div className='space-y-4'>
              {groups.map((g) => (
                <div key={g.key}>
                  <h3
                    className={cn(
                      'mb-1 text-xs font-medium',
                      g.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground',
                    )}>
                    {g.label} <span className='tabular-nums'>{g.tasks.length}</span>
                  </h3>
                  <ul aria-label={g.label} className='-mx-2'>
                    {g.tasks.map((t) => (
                      <DueRow key={t.id} task={t} href={href(t.projectId, t.id)} overdue={g.key === 'overdue'} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className='space-y-6'>
          <Panel id='attention' title='Needs attention' icon={<AlertTriangle className='size-4' aria-hidden />}>
            {!mounted ? (
              <Rows n={2} />
            ) : attention.length === 0 ? (
              <Empty>Every active project is on schedule.</Empty>
            ) : (
              <ul aria-label='Projects needing attention' className='-mx-2'>
                {attention.map(({ project: p, reasons }) => (
                  <li key={p.id}>
                    <Link
                      href={`/workspaces/${workspaceSlug}/projects/${p.id}`}
                      className='block rounded-md px-2 py-2 hover:bg-muted/50'>
                      <span className='flex items-center justify-between gap-2'>
                        <span className='truncate text-sm font-medium'>{p.name}</span>
                        {p.status && <ProjectStatusBadge status={p.status} className='shrink-0' />}
                      </span>
                      <span className='block text-xs text-muted-foreground'>{reasons.join('. ')}.</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel id='waiting' title='Waiting on clients' icon={<Stamp className='size-4' aria-hidden />}>
            {data.waiting.length === 0 ? (
              <Empty>No approvals are waiting on a client.</Empty>
            ) : (
              <ul aria-label='Waiting on clients' className='-mx-2'>
                {data.waiting.map((w) => (
                  <WaitingRow key={w.taskId} item={w} href={href(w.projectId, w.taskId)} mounted={mounted} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel id='feedback' title='Client feedback' icon={<MessageSquare className='size-4' aria-hidden />}>
            {data.feedback.length === 0 ? (
              <Empty>Approvals and comments from clients in the last two weeks show up here.</Empty>
            ) : (
              <ul aria-label='Client feedback' className='-mx-2'>
                {data.feedback.map((f) => (
                  <FeedbackRow key={f.key} item={f} href={href(f.projectId, f.taskId)} mounted={mounted} />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  target,
  alert,
}: Readonly<{ label: string; value: number | null; target: string; alert?: boolean }>) {
  return (
    <li className='bg-card'>
      <a href={target} className='block px-4 py-3 hover:bg-muted/40'>
        <span className='block text-xs text-muted-foreground'>{label}</span>
        <span
          className={cn(
            'mt-1 block text-2xl font-semibold tabular-nums',
            alert && value ? 'text-destructive' : value === 0 && 'text-muted-foreground',
          )}>
          {value ?? <Skeleton className='h-8 w-8' />}
        </span>
      </a>
    </li>
  );
}

function Panel({
  id,
  title,
  icon,
  children,
}: Readonly<{ id: string; title: string; icon: ReactNode; children: ReactNode }>) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className='scroll-mt-20 rounded-lg border bg-card p-4'>
      <h2 id={`${id}-title`} className='mb-3 flex items-center gap-2 text-sm font-semibold'>
        <span className='text-muted-foreground'>{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: Readonly<{ children: ReactNode }>) {
  return <p className='text-sm text-muted-foreground'>{children}</p>;
}

function Rows({ n = 4 }: Readonly<{ n?: number }>) {
  return (
    <div className='space-y-2' aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className='h-9 w-full' />
      ))}
    </div>
  );
}

function DueRow({ task: t, href, overdue }: Readonly<{ task: DueTask; href: string; overdue: boolean }>) {
  return (
    <li>
      <Link href={href} className='flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50'>
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-sm'>{t.title}</span>
          <span className='block truncate text-xs text-muted-foreground'>{t.projectName}</span>
        </span>
        <span className={cn('shrink-0 text-xs', overdue ? 'text-destructive' : 'text-muted-foreground')}>
          {formatDue(t.dueDate, t.dueHasTime)}
        </span>
        <span className='flex w-20 shrink-0 justify-end -space-x-1'>
          {t.assignees.slice(0, 3).map((a) => (
            <PersonAvatar key={a.id} person={a} className='size-6 border-2 border-card' fallbackClassName='text-[9px]' />
          ))}
          {t.assignees.length === 0 && <span className='text-xs text-muted-foreground'>Unassigned</span>}
        </span>
      </Link>
    </li>
  );
}

function WaitingRow({ item: w, href, mounted }: Readonly<{ item: WaitingApproval; href: string; mounted: boolean }>) {
  return (
    <li>
      <Link href={href} className='flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50'>
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-sm'>{w.title}</span>
          <span className='block truncate text-xs text-muted-foreground'>{w.projectName}</span>
        </span>
        <span className='shrink-0 text-xs text-muted-foreground'>{mounted ? `Asked ${ago(w.requestedAt)}` : ''}</span>
      </Link>
    </li>
  );
}

/** Markdown reduced to a one-line excerpt: no images, links as their text, no markup. */
function excerpt(text: string) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function FeedbackRow({ item: f, href, mounted }: Readonly<{ item: FeedbackItem; href: string; mounted: boolean }>) {
  const what =
    f.kind === 'approved' ? 'approved' : f.kind === 'changes_requested' ? 'requested changes to' : 'commented on';
  const Icon = f.kind === 'approved' ? CheckCircle2 : f.kind === 'changes_requested' ? RotateCcw : MessageSquare;
  const quote = f.text ? excerpt(f.text) : '';
  return (
    <li>
      <Link href={href} className='flex gap-2.5 rounded-md px-2 py-2 hover:bg-muted/50'>
        <Icon
          className={cn(
            'mt-0.5 size-4 shrink-0',
            f.kind === 'approved'
              ? 'text-emerald-600 dark:text-emerald-400'
              : f.kind === 'changes_requested'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground',
          )}
          aria-hidden
        />
        <span className='min-w-0 flex-1 text-sm'>
          <span className='font-medium'>{f.who}</span> {what} <span className='font-medium'>{f.taskTitle}</span>
          {quote && <span className='mt-0.5 block truncate text-xs text-muted-foreground'>“{quote}”</span>}
          <span className='mt-0.5 block text-xs text-muted-foreground'>
            {f.projectName}
            {mounted ? `, ${ago(f.at)}` : ''}
          </span>
        </span>
      </Link>
    </li>
  );
}
