'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateTaskStatus } from '@/features/tasks/actions';
import { useState } from 'react';
import { toast } from 'sonner';

interface TaskStatusSelectProps {
  taskId: string;
  projectId: string;
  currentStatusId: string;
  statuses: { id: string; name: string }[];
  onStatusChange?: (taskId: string, newStatusId: string) => void;
}

export function TaskStatusSelect({
  taskId,
  projectId,
  currentStatusId,
  statuses,
  onStatusChange,
}: Readonly<TaskStatusSelectProps>) {
  const [isPending, setIsPending] = useState(false);

  const handleChange = async (newStatusId: string) => {
    if (newStatusId === currentStatusId) return;
    onStatusChange?.(taskId, newStatusId);
    setIsPending(true);

    const result = await updateTaskStatus({
      taskId,
      statusId: newStatusId,
      projectId,
    });

    setIsPending(false);

    if (result?.error) {
      onStatusChange?.(taskId, currentStatusId);
      toast.error(result.error, { position: 'top-center' });
    }
  };

  return (
    <Select value={currentStatusId} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className='h-7 w-fit gap-1 border-none shadow-none px-2 text-xs font-medium bg-secondary rounded-md'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((s) => (
          <SelectItem key={s.id} value={s.id} className='text-xs'>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
