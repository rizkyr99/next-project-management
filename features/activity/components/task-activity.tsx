'use client';

import { useEffect, useState } from 'react';
import { getTaskActivity } from '../actions';
import { ActivityItem } from './activity-item';

type ActivityRow = {
  id: string;
  action: string;
  metadata: Record<string, string> | null;
  createdAt: Date;
  actor: { id: string; name: string; image: string | null };
};

export function TaskActivity({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<ActivityRow[]>([]);

  useEffect(() => {
    getTaskActivity(taskId).then((res) => setItems(res.items as ActivityRow[]));
  }, [taskId]);

  if (items.length === 0) return null;

  return (
    <div className='space-y-3'>
      <p className='text-sm font-medium text-muted-foreground'>Activity</p>
      <div className='space-y-3'>
        {items.map((item) => (
          <ActivityItem
            key={item.id}
            action={item.action}
            metadata={item.metadata}
            createdAt={item.createdAt}
            actor={item.actor}
          />
        ))}
      </div>
    </div>
  );
}
