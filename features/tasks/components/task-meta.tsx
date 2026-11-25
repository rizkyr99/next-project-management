import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { priorityConfig, type Priority } from '../priority';
import type { LabelInfo } from '@/features/labels/schema';
import type { ChecklistItemInfo } from '@/features/checklists/schema';

export { priorityConfig, type Priority };

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
  /** The due date includes a time of day. */
  dueHasTime?: boolean;
  labels?: { label: LabelInfo }[];
  checklist?: ChecklistItemInfo[];
  assignees: { user: Person }[];
  /** Client-only: just added, still being saved. Not openable or draggable yet. */
  pending?: boolean;
}

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

