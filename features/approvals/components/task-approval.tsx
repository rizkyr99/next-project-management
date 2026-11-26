'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Stamp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { getTaskApprovals, requestApproval, respondToApproval, withdrawApproval, type ApprovalRound } from '../actions';
import { ApprovalBadge } from './approval-badge';
import { MAX_APPROVAL_NOTE } from '../states';
import { useUpgrade } from '@/features/billing/components/upgrade';

const ago = (d: Date) => formatDistanceToNow(new Date(d), { addSuffix: true });

/**
 * C3 approvals in the task sheet. The team asks the project's client to
 * approve (with an optional message) and can withdraw while it waits; the
 * client approves or requests changes. Earlier rounds stay listed below.
 * The server enforces who may do what (features/approvals/actions.ts).
 */
export function TaskApproval({
  taskId,
  viewerIsGuest,
  projectHasGuests,
  everAsked,
}: {
  taskId: string;
  viewerIsGuest: boolean;
  projectHasGuests: boolean;
  /** The task has an approval state (from the page), so there's history to show. */
  everAsked: boolean;
}) {
  const queryClient = useQueryClient();
  // E3: a plan gate's error opens the upgrade prompt; anything else is a toast.
  const { showError } = useUpgrade();
  const router = useRouter();
  const queryKey = ['approvals', taskId];
  // Server actions from a page run one at a time, so skip the request when
  // there's nothing to show: no client to ask, and never asked.
  const relevant = viewerIsGuest || projectHasGuests || everAsked;
  const { data: rounds = [], isLoading } = useQuery({
    queryKey,
    enabled: relevant,
    queryFn: async () => {
      const res = await getTaskApprovals(taskId);
      return 'rounds' in res ? res.rounds : [];
    },
  });

  const [composing, setComposing] = useState<null | 'request' | 'changes'>(null);
  const [text, setText] = useState('');

  const run = useMutation({
    mutationFn: async (action: () => Promise<{ error?: string } | { success: true }>) => action(),
    onSuccess: (res) => {
      if (res && 'error' in res && res.error) {
        showError(res.error);
      } else {
        setComposing(null);
        setText('');
      }
      void queryClient.invalidateQueries({ queryKey });
      // Cards show the state too.
      router.refresh();
    },
    onError: () => toast.error('Could not reach the server. Check your connection and try again.', { position: 'top-center' }),
  });

  const pending = rounds.find((r) => r.status === 'pending');
  const history = rounds.filter((r) => r !== pending);
  if (!relevant || isLoading) return null;
  // Nothing to show or do: no client to ask, and never asked.
  if (!viewerIsGuest && !projectHasGuests && rounds.length === 0) return null;
  if (viewerIsGuest && rounds.length === 0) return null;

  const done = (message: string) => () => toast.success(message, { position: 'top-center' });

  return (
    <section aria-label='Approval' className='space-y-3'>
      <p className='text-sm font-medium text-muted-foreground'>Approval</p>

      {pending && (
        <div className='rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2'>
          <div className='flex items-center gap-2 text-sm'>
            <Stamp className='size-4 text-amber-600 dark:text-amber-400' aria-hidden />
            <span>
              {viewerIsGuest ? (
                <>
                  <span className='font-medium'>{pending.requestedBy ?? 'The team'}</span> asked for your approval
                </>
              ) : (
                'Waiting for the client'
              )}
              <span className='text-muted-foreground'> · {ago(pending.createdAt)}</span>
            </span>
          </div>
          {pending.message && <p className='text-sm whitespace-pre-wrap'>{pending.message}</p>}

          {viewerIsGuest ? (
            composing === 'changes' ? (
              <div className='space-y-2'>
                <Textarea
                  aria-label='What should change?'
                  placeholder='What should change?'
                  value={text}
                  maxLength={MAX_APPROVAL_NOTE}
                  onChange={(e) => setText(e.target.value)}
                  className='min-h-[72px] text-sm resize-none'
                  autoFocus
                />
                <div className='flex gap-2'>
                  <Button
                    size='sm'
                    disabled={!text.trim() || run.isPending}
                    onClick={() =>
                      run.mutate(async () => {
                        const res = await respondToApproval({ taskId, decision: 'changes_requested', note: text.trim() });
                        if (!('error' in res)) done('Changes requested')();
                        return res;
                      })
                    }>
                    Send request
                  </Button>
                  <Button size='sm' variant='ghost' onClick={() => setComposing(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className='flex gap-2'>
                <Button
                  size='sm'
                  disabled={run.isPending}
                  onClick={() =>
                    run.mutate(async () => {
                      const res = await respondToApproval({ taskId, decision: 'approved' });
                      if (!('error' in res)) done('Approved')();
                      return res;
                    })
                  }>
                  Approve
                </Button>
                <Button size='sm' variant='outline' onClick={() => setComposing('changes')}>
                  Request changes
                </Button>
              </div>
            )
          ) : (
            <Button
              size='sm'
              variant='ghost'
              className='h-7 px-2 text-xs'
              disabled={run.isPending}
              onClick={() => run.mutate(() => withdrawApproval(taskId))}>
              Withdraw request
            </Button>
          )}
        </div>
      )}

      {!viewerIsGuest && !pending && projectHasGuests && (
        composing === 'request' ? (
          <div className='space-y-2'>
            <Textarea
              aria-label='Message to the client'
              placeholder='What should the client look at? (optional)'
              value={text}
              maxLength={MAX_APPROVAL_NOTE}
              onChange={(e) => setText(e.target.value)}
              className='min-h-[72px] text-sm resize-none'
              autoFocus
            />
            <div className='flex gap-2'>
              <Button
                size='sm'
                disabled={run.isPending}
                onClick={() =>
                  run.mutate(async () => {
                    const res = await requestApproval({ taskId, message: text.trim() || undefined });
                    if (!('error' in res)) done('Approval requested')();
                    return res;
                  })
                }>
                Send to client
              </Button>
              <Button size='sm' variant='ghost' onClick={() => setComposing(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size='sm' variant='outline' className='gap-1.5' onClick={() => setComposing('request')}>
            <Stamp className='size-3.5' aria-hidden />
            Request approval
          </Button>
        )
      )}

      {history.length > 0 && (
        <ul aria-label='Approval history' className='space-y-2'>
          {history.map((r) => (
            <HistoryItem key={r.id} round={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryItem({ round: r }: { round: ApprovalRound }) {
  if (r.status === 'cancelled') {
    return (
      <li className='text-xs text-muted-foreground'>
        Request withdrawn{r.respondedBy ? ` by ${r.respondedBy}` : ''} · {r.respondedAt && ago(r.respondedAt)}
      </li>
    );
  }
  return (
    <li className='space-y-1'>
      <div className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
        <ApprovalBadge state={r.status === 'pending' ? 'pending' : r.status} />
        <span>
          by {r.respondedBy ?? 'the client'}
          {r.respondedAt && ` · ${ago(r.respondedAt)}`}
        </span>
      </div>
      {r.responseNote && (
        <p className='border-l-2 pl-2 text-sm whitespace-pre-wrap'>{r.responseNote}</p>
      )}
    </li>
  );
}
