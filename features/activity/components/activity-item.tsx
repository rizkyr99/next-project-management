import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

type ActivityAction =
  | 'task.created'
  | 'task.title_changed'
  | 'task.description_changed'
  | 'task.status_changed'
  | 'task.priority_changed'
  | 'task.due_date_changed'
  | 'task.assigned'
  | 'task.unassigned'
  | 'task.comment_added'
  | 'task.approval_requested'
  | 'task.approval_withdrawn'
  | 'task.approved'
  | 'task.changes_requested'
  | 'task.deleted'
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'project.archived'
  | 'project.restored'
  | 'project.share_link_created'
  | 'project.share_link_disabled'
  | 'member.invited'
  | 'member.joined'
  | 'member.removed'
  | 'member.left'
  | 'member.ownership_transferred'
  | 'member.role_changed';

interface ActivityItemProps {
  action: string;
  metadata: Record<string, string> | null;
  createdAt: Date;
  actor: { id: string; name: string; image: string | null };
  /** Where the entry links to (the task's sheet), when the task still exists. */
  href?: string;
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
    case 'task.description_changed':
      return `updated the description of ${task}`;
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
    case 'task.approval_requested':
      return `asked the client to approve ${task}`;
    case 'task.approval_withdrawn':
      return `withdrew the approval request on ${task}`;
    case 'task.approved':
      return `approved ${task}`;
    case 'task.changes_requested':
      return `requested changes to ${task}`;
    case 'task.deleted':
      return `deleted task ${task}`;
    case 'project.created':
      return m.templateName
        ? `created project "${m.projectName ?? 'Untitled'}" from the "${m.templateName}" template`
        : `created project "${m.projectName ?? 'Untitled'}"`;
    case 'project.updated':
      return `renamed project "${m.from ?? '?'}" to "${m.to ?? '?'}"`;
    case 'project.archived':
      return `archived project "${m.projectName ?? 'Untitled'}"`;
    case 'project.restored':
      return `restored project "${m.projectName ?? 'Untitled'}" from the archive`;
    case 'project.share_link_created':
      return `created a share link for "${m.projectName ?? 'Untitled'}"`;
    case 'project.share_link_disabled':
      return `turned off the share link for "${m.projectName ?? 'Untitled'}"`;
    case 'project.deleted':
      return `deleted project "${m.projectName ?? 'Untitled'}"`;
    case 'member.invited':
      return `invited ${m.inviteEmail ?? 'someone'} as ${m.role ?? 'member'}`;
    case 'member.joined':
      return `joined the workspace as ${m.role ?? 'member'}`;
    case 'member.removed':
      return `removed ${m.memberName ?? 'a member'} from the workspace`;
    case 'member.left':
      return 'left the workspace';
    case 'member.ownership_transferred':
      return `transferred ownership to ${m.memberName ?? 'another member'}`;
    case 'member.role_changed':
      return `changed ${m.memberName ?? 'a member'}'s role from ${m.from ?? '?'} to ${m.to ?? '?'}`;
    default:
      return action.replace(/[._]/g, ' ');
  }
}

export function ActivityItem({ action, metadata, createdAt, actor, href }: ActivityItemProps) {
  const description = describeAction(action, metadata);
  return (
    <div className='flex gap-3 items-start'>
      <Avatar className='size-7 shrink-0 mt-0.5'>
        {actor.image && <AvatarImage src={actor.image} alt={actor.name} />}
        <AvatarFallback className='text-[10px]'>{getInitials(actor.name)}</AvatarFallback>
      </Avatar>
      <div className='flex-1 min-w-0'>
        <p className='text-sm'>
          <span className='font-medium'>{actor.name}</span>{' '}
          {href ? (
            <Link href={href} className='text-muted-foreground hover:text-foreground hover:underline'>
              {description}
            </Link>
          ) : (
            <span className='text-muted-foreground'>{description}</span>
          )}
        </p>
        <p className='text-xs text-muted-foreground mt-0.5'>
          {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
