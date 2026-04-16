import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';

type ActivityAction =
  | 'task.created'
  | 'task.title_changed'
  | 'task.status_changed'
  | 'task.priority_changed'
  | 'task.due_date_changed'
  | 'task.assigned'
  | 'task.unassigned'
  | 'task.comment_added'
  | 'task.deleted'
  | 'project.created'
  | 'member.invited'
  | 'member.removed'
  | 'member.role_changed';

interface ActivityItemProps {
  action: string;
  metadata: Record<string, string> | null;
  createdAt: Date;
  actor: { id: string; name: string; image: string | null };
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function describeAction(action: string, metadata: Record<string, string> | null): string {
  const m = metadata ?? {};
  const task = m.taskTitle ? `"${m.taskTitle}"` : 'a task';

  switch (action as ActivityAction) {
    case 'task.created':
      return `created task ${task}`;
    case 'task.title_changed':
      return `renamed a task to ${task}`;
    case 'task.status_changed':
      return `changed the status of ${task}`;
    case 'task.priority_changed':
      return `set ${task} priority to ${m.priority ?? 'unknown'}`;
    case 'task.due_date_changed':
      return m.dueDate
        ? `set due date of ${task} to ${new Date(m.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : `cleared the due date of ${task}`;
    case 'task.assigned':
      return `assigned ${m.assigneeName ?? 'someone'} to ${task}`;
    case 'task.unassigned':
      return `removed ${m.assigneeName ?? 'someone'} from ${task}`;
    case 'task.comment_added':
      return `commented on ${task}`;
    case 'task.deleted':
      return `deleted task ${task}`;
    case 'project.created':
      return `created project "${m.projectName ?? 'Untitled'}"`;
    case 'member.invited':
      return `invited ${m.inviteEmail ?? 'someone'} as ${m.role ?? 'member'}`;
    case 'member.removed':
      return `removed ${m.memberName ?? 'a member'} from the workspace`;
    case 'member.role_changed':
      return `changed ${m.memberName ?? 'a member'}'s role from ${m.from ?? '?'} to ${m.to ?? '?'}`;
    default:
      return action.replace(/[._]/g, ' ');
  }
}

export function ActivityItem({ action, metadata, createdAt, actor }: ActivityItemProps) {
  return (
    <div className='flex gap-3 items-start'>
      <Avatar className='size-7 shrink-0 mt-0.5'>
        {actor.image && <AvatarImage src={actor.image} alt={actor.name} />}
        <AvatarFallback className='text-[10px]'>{getInitials(actor.name)}</AvatarFallback>
      </Avatar>
      <div className='flex-1 min-w-0'>
        <p className='text-sm'>
          <span className='font-medium'>{actor.name}</span>{' '}
          <span className='text-muted-foreground'>{describeAction(action, metadata)}</span>
        </p>
        <p className='text-xs text-muted-foreground mt-0.5'>
          {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
