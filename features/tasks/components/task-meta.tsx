import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import type { ReactNode } from 'react';

export type Priority = 'low' | 'medium' | 'high';

export interface Person {
  id: string;
  name: string;
  email?: string;
  image?: string | null;
}

/** The task shape the board, the card and the detail sheet share. */
export interface TaskData {
  id: string;
  title: string;
  description?: string | null;
  priority: Priority;
  dueDate?: Date | null;
  assignees: { user: Person }[];
}

export const priorityConfig: Record<
  Priority,
  { label: string; icon: ReactNode; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  high: { label: 'High', icon: <ArrowUp className='size-3' />, variant: 'destructive' },
  medium: { label: 'Medium', icon: <ArrowRight className='size-3' />, variant: 'secondary' },
  low: { label: 'Low', icon: <ArrowDown className='size-3' />, variant: 'outline' },
};

export function getInitials(source: string) {
  return source
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function PersonAvatar({
  person,
  className,
  fallbackClassName,
}: {
  person: Person;
  className?: string;
  fallbackClassName?: string;
}) {
  const label = person.name || person.email || 'U';
  return (
    <Avatar className={className}>
      {person.image ? <AvatarImage src={person.image} alt={label} /> : null}
      <AvatarFallback className={cn('text-[10px]', fallbackClassName)}>
        {getInitials(label) || 'U'}
      </AvatarFallback>
    </Avatar>
  );
}

export const formatShortDate = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
