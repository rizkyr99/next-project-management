'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BookOpen, CircleHelp, MessageSquarePlus } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { sendFeedback } from '../actions';
import { MAX_FEEDBACK_LENGTH } from '../limits';

/**
 * E5: "Help and feedback" in the app header: the help centre, and a short
 * form that sends what you write, plus the page you're on, to the team
 * behind Tide.
 */
export function HelpMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='icon' aria-label='Help and feedback'>
            <CircleHelp />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-52'>
          <DropdownMenuItem asChild>
            <Link href='/help' target='_blank' rel='noopener'>
              <BookOpen />
              Help centre
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <MessageSquarePlus />
            Send feedback
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function FeedbackDialog({ open, onOpenChange }: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const pathname = usePathname();
  const search = useSearchParams();
  const { workspaceSlug } = useParams<{ workspaceSlug?: string }>();
  const query = search.toString();

  const send = () =>
    start(async () => {
      const result = await sendFeedback({
        message,
        page: `${pathname}${query ? `?${query}` : ''}`,
        workspaceSlug,
      });
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      toast.success('Thanks, your feedback was sent', {
        position: 'top-center',
        description: 'We read every message, and reply by email when there’s something to say.',
      });
      setMessage('');
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Something confusing, missing or broken? Tell us. We see the page you’re on, and can reply to your
            email address.
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}>
          <div className='space-y-2'>
            <Label htmlFor='feedback-message'>Your feedback</Label>
            <Textarea
              id='feedback-message'
              value={message}
              rows={5}
              maxLength={MAX_FEEDBACK_LENGTH}
              placeholder='What were you trying to do, and what happened?'
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type='button' variant='ghost' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type='submit' disabled={pending || !message.trim()}>
              {pending ? 'Sending…' : 'Send feedback'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
