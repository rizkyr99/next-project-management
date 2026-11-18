'use client';

import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';
import { getWorkspaceActivity, type ActivityFilters } from '../actions';
import { ActivityItem } from './activity-item';
import { taskHref } from '@/features/tasks/task-link';
import { EmptyState } from '@/components/empty-state';
import { History } from 'lucide-react';

type ActivityRow = {
  id: string;
  action: string;
  metadata: Record<string, string> | null;
  createdAt: Date;
  taskId?: string | null;
  projectId?: string | null;
  actor: { id: string; name: string; image: string | null };
};

interface ActivityFeedProps {
  workspaceId: string;
  workspaceSlug: string;
  initialItems: ActivityRow[];
  initialNextCursor: string | null;
  /** The filters the first page was loaded with; later pages use the same. */
  filters?: ActivityFilters;
}

export function ActivityFeed({ workspaceId, workspaceSlug, initialItems, initialNextCursor, filters = {} }: ActivityFeedProps) {
  const [items, setItems] = useState<ActivityRow[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const res = await getWorkspaceActivity(workspaceId, cursor, filters);
      setItems((prev) => [...prev, ...(res.items as ActivityRow[])]);
      setCursor(res.nextCursor);
    } catch {
      toast.error('Failed to load more activity.', { position: 'top-center' });
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0 && (filters.projectId || filters.actorId)) {
    return (
      <EmptyState icon={History} title='No activity matches these filters'>
        Choose another project or person, or show all activity.
      </EmptyState>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState icon={History} title='No activity yet'>
        Creating tasks, changing their status, commenting and inviting people all show up here.
      </EmptyState>
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
          href={
            item.taskId && item.projectId
              ? taskHref(workspaceSlug, item.projectId, item.taskId)
              : undefined
          }
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
