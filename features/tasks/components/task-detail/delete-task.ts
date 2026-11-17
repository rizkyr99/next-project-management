'use client';

import { toast } from 'sonner';
import { deleteTask } from '../../actions';
import { hideTask, unhideTask } from '../../pending-deletes';
import { closeTask } from '../../task-link';

export const UNDO_WINDOW_MS = 5000;

/**
 * Hide the task at once and only delete it on the server after the undo
 * window, so Undo needs no "restore" path (comments, assignees and activity
 * stay intact). If the tab closes inside the window, nothing is deleted.
 */
export function deleteTaskWithUndo(task: { id: string; title: string }) {
  closeTask();
  hideTask(task.id);

  const timer = setTimeout(async () => {
    const result = await deleteTask({ taskId: task.id });
    if (result.error !== undefined) {
      unhideTask(task.id);
      toast.error(result.error, { position: 'top-center' });
    }
  }, UNDO_WINDOW_MS);

  toast(`Deleted "${task.title}"`, {
    position: 'top-center',
    duration: UNDO_WINDOW_MS,
    action: {
      label: 'Undo',
      onClick: () => {
        clearTimeout(timer);
        unhideTask(task.id);
      },
    },
  });
}
