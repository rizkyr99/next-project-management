'use client';

import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';
import { getWorkspaceActivity } from '../actions';
import { ActivityItem } from './activity-item';

type ActivityRow = {
  id: string;
  action: string;
  metadata: Record<string, string> | null;
  createdAt: Date;
  actor: { id: string; name: string; image: string | null };
};

interface ActivityFeedProps {
  workspaceId: string;
  initialItems: ActivityRow[];
  initialNextCursor: string | null;
}

export function ActivityFeed({ workspaceId, initialItems, initialNextCursor }: ActivityFeedProps) {
  const [items, setItems] = useState<ActivityRow[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const res = await getWorkspaceActivity(workspaceId, cursor);
      setItems((prev) => [...prev, ...(res.items as ActivityRow[])]);
      setCursor(res.nextCursor);
    } catch {
      toast.error('Failed to load more activity.', { position: 'top-center' });
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <p className='text-sm text-muted-foreground py-8 text-center'>
        No activity yet. Actions like creating tasks, inviting members, and changing statuses will appear here.
      </p>
    );
  }

  return (
    <div className='space-y-4'>
      {items.map((item) => (
        <ActivityItem
          key={item.id}
          action={item.action}
          metadata={item.metadata}
          createdAt={item.createdAt}
          actor={item.actor}
        />
      ))}
      {cursor && (
        <div className='pt-2'>
          <Button variant='outline' size='sm' onClick={loadMore} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
