import { cn } from '@/lib/utils';
import { CircleCheck, Hourglass, Undo2 } from 'lucide-react';
import { approvalStateLabel, type ApprovalState } from '../states';

const STYLE: Record<ApprovalState, { className: string; icon: typeof Hourglass }> = {
  pending: { className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', icon: Hourglass },
  approved: { className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', icon: CircleCheck },
  changes_requested: { className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', icon: Undo2 },
};

/** A task's approval state, as a small pill on its card or in its sheet. */
export function ApprovalBadge({ state, className }: { state: ApprovalState; className?: string }) {
  const { className: tone, icon: Icon } = STYLE[state];
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium', tone, className)}>
      <Icon className='size-3' aria-hidden />
      {approvalStateLabel[state]}
    </span>
  );
}
