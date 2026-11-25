import { cn } from '@/lib/utils';
import { ListChecks } from 'lucide-react';
import { checklistProgress } from '../schema';

/** "3/5" with a checklist icon; green once every step is done. Nothing when there's no checklist. */
export function ChecklistBadge({ items, className }: Readonly<{ items?: readonly { done: boolean }[]; className?: string }>) {
  const progress = checklistProgress(items);
  if (!progress) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs tabular-nums',
        progress.complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
        className,
      )}
      aria-label={`Checklist: ${progress.done} of ${progress.total} done`}>
      <ListChecks className='size-3' aria-hidden />
      {progress.done}/{progress.total}
    </span>
  );
}
