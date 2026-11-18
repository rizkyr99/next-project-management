'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TaskActivity } from '@/features/activity/components/task-activity';
import { Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  updateTaskAssignees,
  updateTaskDescription,
  updateTaskDueDate,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskTitle,
} from '../../actions';
import { usePendingDeletes } from '../../pending-deletes';
import { closeTask, TASK_PARAM } from '../../task-link';
import { TaskComments } from '../task-comments';
import type { Person, Priority, TaskData } from '../task-meta';
import { deleteTaskWithUndo } from './delete-task';
import { CopyTaskLink } from './copy-task-link';
import { TaskDescription } from './task-description';
import { TaskProperties } from './task-properties';

type SheetTask = TaskData & { statusId: string };

interface TaskDetailSheetProps {
  projectId: string;
  statuses: { id: string; name: string; tasks: SheetTask[] }[];
  members: Person[];
  currentUserId: string;
}

/**
 * The project page's single task sheet, driven by `?task=<id>`. It reads the
 * task from the page's server data, so any refresh (our own revalidation or
 * another member's change) shows here too.
 */
export function TaskDetailSheet({ projectId, statuses, members, currentUserId }: TaskDetailSheetProps) {
  const taskId = useSearchParams().get(TASK_PARAM);
  const hidden = usePendingDeletes();

  const task = useMemo(() => {
    if (!taskId || hidden.has(taskId)) return null;
    for (const status of statuses) {
      const found = status.tasks.find((t) => t.id === taskId);
      if (found) return found;
    }
    return null;
  }, [statuses, taskId, hidden]);

  // A task id we can't find. It may be brand new (its card shows from the
  // board's local update before the page data catches up), so refresh once
  // first; only if it's still missing is it really gone (deleted, or a bad URL).
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const refreshedFor = useRef<string | null>(null);
  // The page data at the time of that refresh. The verdict waits until newer
  // data arrives: a fast refresh can finish within one commit, so watching
  // isRefreshing alone could miss it and never report.
  const statusesAtRefresh = useRef<typeof statuses | null>(null);
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!taskId || task || hidden.has(taskId)) return;
    if (reported.current === taskId) return;
    if (refreshedFor.current !== taskId) {
      refreshedFor.current = taskId;
      statusesAtRefresh.current = statuses;
      startRefresh(() => router.refresh());
      return;
    }
    if (isRefreshing || statuses === statusesAtRefresh.current) return;
    reported.current = taskId;
    toast.error('That task no longer exists.', { position: 'top-center' });
    closeTask();
  }, [taskId, task, hidden, isRefreshing, router, statuses]);

  const statusOptions = useMemo(() => statuses.map((s) => ({ id: s.id, name: s.name })), [statuses]);

  // The sheet opens from a card or row, not a Dialog trigger, so Radix can't
  // return focus on its own: remember what was focused when it opened and go
  // back there when it closes (WCAG 2.4.3).
  const openerRef = useRef<HTMLElement | null>(null);
  const isOpen = task !== null;
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) setWasOpen(isOpen);
  useEffect(() => {
    if (isOpen && !wasOpen && document.activeElement instanceof HTMLElement) {
      openerRef.current = document.activeElement;
    }
  }, [isOpen, wasOpen]);

  return (
    <Sheet open={task !== null} onOpenChange={(open) => !open && closeTask()}>
      <SheetContent
        aria-describedby={undefined}
        onOpenAutoFocus={() => {
          if (!openerRef.current && document.activeElement instanceof HTMLElement) {
            openerRef.current = document.activeElement;
          }
        }}
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current;
          openerRef.current = null;
          if (opener?.isConnected) {
            event.preventDefault();
            opener.focus();
          }
        }}
        className='w-full sm:max-w-xl gap-0 overflow-y-auto'>
        {task && (
          <TaskDetailBody
            key={task.id}
            task={task}
            projectId={projectId}
            statuses={statusOptions}
            members={members}
            currentUserId={currentUserId}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

type Overrides = Partial<{
  title: string;
  statusId: string;
  priority: Priority;
  dueDate: Date | null;
  assigneeIds: string[];
  description: string | null;
}>;

function TaskDetailBody({
  task,
  projectId,
  statuses,
  members,
  currentUserId,
}: {
  task: SheetTask;
  projectId: string;
  statuses: { id: string; name: string }[];
  members: Person[];
  currentUserId: string;
}) {
  // Optimistic edits sit on top of the server data. A refresh drops only the
  // overrides with no save in flight: a refresh triggered by one save must
  // not erase a newer edit that's still saving (e.g. two quick assignee
  // toggles), or the next edit would be built on stale values.
  const [overrides, setOverrides] = useState<Overrides>({});
  const [inFlight, setInFlight] = useState<Partial<Record<keyof Overrides, number>>>({});
  const [serverTask, setServerTask] = useState(task);
  if (serverTask !== task) {
    setServerTask(task);
    setOverrides((prev) => {
      const kept: Overrides = {};
      for (const key of Object.keys(prev) as (keyof Overrides)[]) {
        if ((inFlight[key] ?? 0) > 0) Object.assign(kept, { [key]: prev[key] });
      }
      return kept;
    });
  }

  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);

  const title = overrides.title ?? task.title;
  const statusId = overrides.statusId ?? task.statusId;
  const priority = overrides.priority ?? task.priority;
  const dueDate = overrides.dueDate !== undefined ? overrides.dueDate : (task.dueDate ?? null);
  const description = overrides.description !== undefined ? overrides.description : (task.description ?? null);
  const assigneeIds = overrides.assigneeIds ?? task.assignees.map((a) => a.user.id);

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, Person>();
    for (const m of members) map.set(m.id, m);
    // Keep showing assignees who have since left the workspace.
    for (const a of task.assignees) if (!map.has(a.user.id)) map.set(a.user.id, a.user);
    return [...map.values()];
  }, [members, task.assignees]);
  const assignees = assigneeIds
    .map((id) => assigneeOptions.find((a) => a.id === id))
    .filter((a): a is Person => Boolean(a));

  async function save<K extends keyof Overrides>(key: K, value: Overrides[K], action: () => Promise<{ error?: string }>) {
    setOverrides((prev) => ({ ...prev, [key]: value }));
    setInFlight((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
    let result: { error?: string };
    try {
      result = await action();
    } catch {
      result = { error: 'Something went wrong. Please try again.' };
    } finally {
      setInFlight((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 0) - 1) }));
    }
    if (result.error !== undefined) {
      toast.error(result.error, { position: 'top-center' });
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === title) return;
    void save('title', trimmed, () => updateTaskTitle(task.id, trimmed));
  };

  const toggleAssignee = (userId: string) => {
    const next = assigneeIds.includes(userId)
      ? assigneeIds.filter((id) => id !== userId)
      : [...assigneeIds, userId];
    void save('assigneeIds', next, () => updateTaskAssignees(task.id, next));
  };

  return (
    <>
      <SheetHeader className='pr-12 pb-2 flex-row items-start gap-1 space-y-0'>
        <div className='min-w-0 flex-1'>
        {editingTitle ? (
          <input
            autoFocus
            aria-label='Task title'
            value={draftTitle}
            maxLength={255}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setDraftTitle(title);
                setEditingTitle(false);
              }
            }}
            className='w-full rounded-md border border-input bg-background px-2 py-1 text-lg font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          />
        ) : (
          <SheetTitle asChild>
            <button
              type='button'
              title='Click to rename'
              onClick={() => {
                setDraftTitle(title);
                setEditingTitle(true);
              }}
              className='w-full text-left text-lg font-semibold hover:bg-muted px-2 py-1 rounded-md cursor-text break-words'>
              {title}
            </button>
          </SheetTitle>
        )}
        </div>
        <CopyTaskLink taskId={task.id} />
      </SheetHeader>

      <div className='space-y-5 px-4 pb-6'>
        <TaskProperties
          statusId={statusId}
          statuses={statuses}
          priority={priority}
          dueDate={dueDate}
          assignees={assignees}
          assigneeOptions={assigneeOptions}
          onStatusChange={(next) =>
            save('statusId', next, () => updateTaskStatus({ taskId: task.id, statusId: next, projectId }))
          }
          onPriorityChange={(next) => save('priority', next, () => updateTaskPriority(task.id, next))}
          onDueDateChange={(next) => save('dueDate', next, () => updateTaskDueDate(task.id, next))}
          onToggleAssignee={toggleAssignee}
        />

        <TaskDescription
          taskId={task.id}
          value={description}
          onSave={(next) =>
            save('description', next.trim() || null, () =>
              updateTaskDescription({ taskId: task.id, description: next }),
            )
          }
        />

        <Separator />
        <TaskComments taskId={task.id} currentUserId={currentUserId} workspaceMembers={members} />
        <Separator />
        <TaskActivity taskId={task.id} />
        <Separator />

        <Button
          variant='ghost'
          size='sm'
          className='text-destructive hover:text-destructive'
          onClick={() => deleteTaskWithUndo({ id: task.id, title })}>
          <Trash2 />
          Delete task
        </Button>
      </div>
    </>
  );
}
