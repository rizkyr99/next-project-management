'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { SmilePlus } from 'lucide-react';
import { useState } from 'react';
import { REACTIONS, reactionMeta, type Reaction, type ReactionSummary } from '../reaction-kinds';

/** The reactions under a comment, and a button to add one. */
export function CommentReactions({
  reactions,
  onToggle,
}: Readonly<{
  reactions: ReactionSummary[];
  onToggle: (reaction: Reaction) => void;
}>) {
  const [open, setOpen] = useState(false);

  return (
    <div className='mt-1 flex flex-wrap items-center gap-1'>
      {reactions.map((r) => (
        <button
          key={r.reaction}
          type='button'
          aria-pressed={r.mine}
          aria-label={`${reactionMeta[r.reaction].label}: ${r.count}. ${r.mine ? 'Remove your reaction' : 'React'}`}
          title={r.names.join(', ')}
          onClick={() => onToggle(r.reaction)}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors',
            r.mine ? 'border-primary/40 bg-primary/10 text-primary' : 'bg-muted/50 hover:bg-muted',
          )}>
          <span aria-hidden>{reactionMeta[r.reaction].emoji}</span>
          {r.count}
        </button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant='ghost' size='icon' className='size-6 text-muted-foreground' aria-label='Add reaction'>
            <SmilePlus className='size-3.5' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-auto p-1' align='start'>
          <div className='flex gap-0.5'>
            {REACTIONS.map((reaction) => (
              <Button
                key={reaction}
                variant='ghost'
                size='icon'
                className='size-8 text-base'
                aria-label={reactionMeta[reaction].label}
                onClick={() => {
                  onToggle(reaction);
                  setOpen(false);
                }}>
                {reactionMeta[reaction].emoji}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
