import { ArrowDown, ArrowRight, ArrowUp, ChevronsUp, Minus } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Task priorities, highest first. The one place that defines them: the
 * database enum (db/schema.ts), validation, filters, sorting and every
 * badge read from here.
 */
export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Higher means more important. */
export const PRIORITY_RANK: Record<Priority, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value);
}

export const priorityConfig: Record<
  Priority,
  { label: string; icon: ReactNode; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  urgent: { label: 'Urgent', icon: <ChevronsUp className='size-3' />, variant: 'destructive' },
  high: { label: 'High', icon: <ArrowUp className='size-3' />, variant: 'default' },
  medium: { label: 'Medium', icon: <ArrowRight className='size-3' />, variant: 'secondary' },
  low: { label: 'Low', icon: <ArrowDown className='size-3' />, variant: 'outline' },
  none: { label: 'No priority', icon: <Minus className='size-3' />, variant: 'outline' },
};
