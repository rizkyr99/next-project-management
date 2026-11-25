import { cn } from '@/lib/utils';
import { Building2, CalendarClock } from 'lucide-react';
import { formatDeadline, isPastDeadline, projectStatusConfig, type ProjectStatus } from '../details';

/** A project's status as a coloured dot and label. */
export function ProjectStatusBadge({ status, className }: Readonly<{ status: ProjectStatus; className?: string }>) {
  const c = projectStatusConfig[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', c.text, className)}>
      <span className={cn('size-2 rounded-full', c.dot)} aria-hidden />
      {c.label}
    </span>
  );
}

/** Client, status and deadline on one line; nothing when none are set. */
export function ProjectDetails({
  clientName,
  deadline,
  status,
  className,
}: Readonly<{
  clientName: string | null;
  deadline: string | null;
  status: ProjectStatus | null;
  className?: string;
}>) {
  if (!clientName && !deadline && !status) return null;
  const late = isPastDeadline(deadline, status);
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground', className)}>
      {clientName && (
        <span className='inline-flex min-w-0 items-center gap-1'>
          <Building2 className='size-3.5 shrink-0' aria-hidden />
          <span className='sr-only'>Client: </span>
          <span className='truncate'>{clientName}</span>
        </span>
      )}
      {status && <ProjectStatusBadge status={status} />}
      {deadline && (
        <span className={cn('inline-flex items-center gap-1', late && 'text-destructive')}>
          <CalendarClock className='size-3.5' aria-hidden />
          {late ? 'Was due' : 'Due'} {formatDeadline(deadline)}
        </span>
      )}
    </div>
  );
}
