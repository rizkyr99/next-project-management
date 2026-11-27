import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';

/** C2: the team's own task, hidden from the project's client. Only the team ever sees this badge. */
export function InternalBadge({ className }: Readonly<{ className?: string }>) {
  return (
    <Badge
      variant='outline'
      className={cn('gap-1 px-1.5 py-0 text-xs font-normal text-muted-foreground', className)}
      title='Only your team sees this task, not the client'>
      <Lock className='size-3' aria-hidden />
      Internal
    </Badge>
  );
}
