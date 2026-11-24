import { statusDotClass } from '@/features/projects/status-colors';
import { cn } from '@/lib/utils';
import type { LabelInfo } from '../schema';

export function LabelChip({ label, className }: Readonly<{ label: LabelInfo; className?: string }>) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-1.5 py-0 text-[11px] leading-4 text-foreground/80',
        className,
      )}>
      <span className={cn('size-1.5 shrink-0 rounded-full', statusDotClass(label.color))} aria-hidden />
      <span className='truncate'>{label.name}</span>
    </span>
  );
}

/** A task's labels; past `max`, the rest are counted. */
export function LabelChips({ labels, max = 3 }: Readonly<{ labels: LabelInfo[]; max?: number }>) {
  if (labels.length === 0) return null;
  const shown = labels.slice(0, max);
  const rest = labels.length - shown.length;
  return (
    <span className='flex flex-wrap items-center gap-1' aria-label={`Labels: ${labels.map((l) => l.name).join(', ')}`}>
      {shown.map((l) => (
        <LabelChip key={l.id} label={l} />
      ))}
      {rest > 0 && <span className='text-[11px] text-muted-foreground'>+{rest}</span>}
    </span>
  );
}
