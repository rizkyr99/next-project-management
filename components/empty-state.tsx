import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The one empty-state pattern used across the app: an icon, a short title,
 * one sentence of direction, and (usually) the action that fills it.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-4 py-12 text-center', className)}>
      <div className='flex size-11 items-center justify-center rounded-full bg-muted'>
        <Icon className='size-5 text-muted-foreground' aria-hidden />
      </div>
      <div className='space-y-1'>
        <p className='font-medium'>{title}</p>
        {children && <p className='mx-auto max-w-[42ch] text-sm text-muted-foreground'>{children}</p>}
      </div>
      {action}
    </div>
  );
}
