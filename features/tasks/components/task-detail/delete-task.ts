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
 *
 * The window is owned by our timer, not the toast: sonner pauses a toast
 * while it's hovered, so the toast can outlive the window. When the timer
 * fires we dismiss the toast and ignore any late Undo click.
 */
export function deleteTaskWithUndo(task: { id: string; title: string }) {
  closeTask();
  hideTask(task.id);

  let phase: 'undoable' | 'undone' | 'deleting' = 'undoable';

  const toastId = toast(`Deleted "${task.title}"`, {
    position: 'top-center',
    duration: UNDO_WINDOW_MS,
    action: {
      label: 'Undo',
      onClick: () => {
        if (phase !== 'undoable') return;
        phase = 'undone';
        clearTimeout(timer);
        unhideTask(task.id);
      },
    },
  });

  const timer = setTimeout(async () => {
    if (phase !== 'undoable') return;
    phase = 'deleting';
    toast.dismiss(toastId);
    const result = await deleteTask({ taskId: task.id });
    if (result.error !== undefined) {
      unhideTask(task.id);
      toast.error(result.error, { position: 'top-center' });
    }
  }, UNDO_WINDOW_MS);
}
