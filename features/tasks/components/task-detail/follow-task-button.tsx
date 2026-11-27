'use client';

import { Button } from '@/components/ui/button';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Bell, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { getFollowState, setFollowing, type FollowState } from '../../follow-actions';

export const followKey = (taskId: string) => ['task-follow', taskId] as const;

/**
 * Commenting on or being assigned to a task follows it on the server (after
 * the response), so the button shows it straight away instead of refetching.
 */
export function markFollowing(queryClient: QueryClient, taskId: string, me: { id: string; name: string }) {
  queryClient.setQueryData<FollowState>(followKey(taskId), (prev) =>
    prev && !prev.following ? { following: true, followers: [...prev.followers, me] } : prev,
  );
}

function followersLabel(state: FollowState | undefined) {
  if (!state || state.followers.length === 0) return 'No one follows this task yet';
  const names = state.followers.map((f) => f.name);
  const shown = names.slice(0, 5).join(', ');
  return `Followed by ${shown}${names.length > 5 ? ` and ${names.length - 5} more` : ''}`;
}

/** I4: follow a task to hear about its comments and column changes. */
export function FollowTaskButton({ taskId, me }: Readonly<{ taskId: string; me: { id: string; name: string } }>) {
  const queryClient = useQueryClient();
  const key = followKey(taskId);
  const state = useQuery({
    queryKey: key,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await getFollowState({ taskId });
      if (res.error !== undefined) throw new Error(res.error);
      return res;
    },
  });

  const toggle = useMutation({
    mutationFn: (following: boolean) => setFollowing({ taskId, following }),
    onMutate: async (following) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<FollowState>(key);
      queryClient.setQueryData<FollowState>(key, (prev) => ({
        following,
        followers: following
          ? [...(prev?.followers ?? []).filter((f) => f.id !== me.id), me]
          : (prev?.followers ?? []).filter((f) => f.id !== me.id),
      }));
      return { previous };
    },
    onSuccess: (res, following, ctx) => {
      if (res.error !== undefined) {
        queryClient.setQueryData(key, ctx.previous);
        toast.error(res.error, { position: 'top-center' });
        return;
      }
      toast.success(following ? 'You’ll be notified about comments and moves' : 'Unfollowed', {
        position: 'top-center',
      });
    },
    onError: (_err, _following, ctx) => {
      queryClient.setQueryData(key, ctx?.previous);
      toast.error('Could not reach the server. Check your connection and try again.', { position: 'top-center' });
    },
  });

  const following = state.data?.following ?? false;
  const label = following ? 'Unfollow task' : 'Follow task';

  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      className={following ? 'size-8 shrink-0 text-primary' : 'size-8 shrink-0 text-muted-foreground'}
      aria-label={label}
      aria-pressed={following}
      title={`${label}. ${followersLabel(state.data)}`}
      disabled={!state.data || toggle.isPending}
      onClick={() => toggle.mutate(!following)}>
      {following ? <BellRing /> : <Bell />}
    </Button>
  );
}
