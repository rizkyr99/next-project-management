'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { bulkDeleteTasks, bulkUpdateStatus } from '@/features/tasks/actions';
import { TaskStatusSelect } from '@/features/tasks/components/task-status-select';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface ListViewProps {
  workspaceMembers?: { id: string; name: string; email: string; image: string | null }[];
  project?: {
    id: string;
    statuses: {
      id: string;
      name: string;
      tasks: {
        id: string;
        title: string;
        assignees: {
          user: {
            id: string;
            name: string;
            email?: string;
            image?: string | null;
          };
        }[];
      }[];
    }[];
  };
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function ListView({ project }: Readonly<ListViewProps>) {
  const projectId = project?.id;
  const statuses = project?.statuses ?? [];
  const initialTasks = statuses.flatMap((status) =>
    status.tasks.map((task) => ({ ...task, statusId: status.id })),
  );
  const statusOptions = statuses.map((s) => ({ id: s.id, name: s.name }));

  const [tasks, setTasks] = useState(initialTasks);
  const [taskStatusMap, setTaskStatusMap] = useState<Record<string, string>>(
    () => Object.fromEntries(initialTasks.map((t) => [t.id, t.statusId])),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPending, setIsPending] = useState(false);

  if (!projectId || tasks.length === 0) {
    return (
      <div className='flex-1 flex items-center justify-center text-muted-foreground text-sm'>
        No tasks found.
      </div>
    );
  }

  const allSelected = selectedIds.size === tasks.length;
  const someSelected = selectedIds.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStatusChange = (taskId: string, newStatusId: string) => {
    setTaskStatusMap((prev) => ({ ...prev, [taskId]: newStatusId }));
  };

  const handleBulkStatusChange = async (statusId: string) => {
    const ids = Array.from(selectedIds);
    setTaskStatusMap((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = statusId;
      return next;
    });
    setIsPending(true);
    const result = await bulkUpdateStatus({ taskIds: ids, statusId, projectId });
    setIsPending(false);
    if (result?.error) {
      toast.error(result.error, { position: 'top-center' });
    } else {
      toast.success('Status updated', { position: 'top-center' });
      setSelectedIds(new Set());
    }
  };

  const removeTasksFromState = (ids: string[]) => {
    setTasks((prev) => prev.filter((t) => !ids.includes(t.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    setIsPending(true);
    const result = await bulkDeleteTasks({ taskIds: ids, projectId });
    setIsPending(false);
    if (result?.error) {
      toast.error(result.error, { position: 'top-center' });
    } else {
      toast.success('Tasks deleted', { position: 'top-center' });
      removeTasksFromState(ids);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const result = await bulkDeleteTasks({ taskIds: [taskId], projectId });
    if (result?.error) {
      toast.error(result.error, { position: 'top-center' });
    } else {
      toast.success('Task deleted', { position: 'top-center' });
      removeTasksFromState([taskId]);
    }
  };

  return (
    <div className='flex-1 flex flex-col overflow-hidden'>
      {someSelected && (
        <div className='flex items-center gap-2 px-4 py-2 bg-primary/5 border-b text-sm'>
          <span className='text-muted-foreground'>
            {selectedIds.size} selected
          </span>
          <div className='flex items-center gap-2 ml-auto'>
            <Select onValueChange={handleBulkStatusChange} disabled={isPending}>
              <SelectTrigger className='h-8 text-xs w-36'>
                <SelectValue placeholder='Set status...' />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id} className='text-xs'>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant='destructive' size='sm' disabled={isPending}>
                  <Trash2 className='size-3.5' />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete tasks</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete {selectedIds.size}{' '}
                    {selectedIds.size === 1 ? 'task' : 'tasks'}? This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleBulkDelete}
                    className='bg-destructive text-destructive-foreground hover:bg-destructive/90'>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
      <div className='flex-1 overflow-y-auto p-4'>
        <div>
          <div className='grid grid-cols-[32px_1fr_160px_200px_40px] px-4 py-2 text-sm uppercase font-medium text-muted-foreground bg-muted rounded-lg'>
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              aria-label='Select all'
              className='mt-0.5'
            />
            <span>Task</span>
            <span>Status</span>
            <span>Assignees</span>
            <span />
          </div>
          {tasks.map((task) => (
            <div
              key={task.id}
              className='group grid grid-cols-[32px_1fr_160px_200px_40px] px-4 py-2 items-center hover:bg-muted/30 transition-colors'>
              <Checkbox
                checked={selectedIds.has(task.id)}
                onCheckedChange={() => toggleOne(task.id)}
                aria-label={`Select ${task.title}`}
              />
              <span className='text-sm font-medium truncate pr-4'>
                {task.title}
              </span>
              <div>
                <TaskStatusSelect
                  taskId={task.id}
                  projectId={projectId}
                  currentStatusId={taskStatusMap[task.id] ?? task.statusId}
                  statuses={statusOptions}
                  onStatusChange={handleStatusChange}
                />
              </div>
              <div className='flex items-center -space-x-2'>
                {task.assignees.length === 0 ? (
                  <span className='text-xs text-muted-foreground'>
                    Unassigned
                  </span>
                ) : (
                  task.assignees.map(({ user }) => {
                    const label = user.name || user.email || 'U';
                    return (
                      <Avatar
                        key={user.id}
                        className='size-7 border-2 border-background'>
                        {user.image ? (
                          <AvatarImage src={user.image} alt={label} />
                        ) : null}
                        <AvatarFallback className='text-[10px] font-medium'>
                          {getInitials(label) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                    );
                  })
                )}
              </div>
              <AlertDialog>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='size-7 opacity-0 group-hover:opacity-100 transition-opacity'>
                      <MoreHorizontal className='size-4' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        className='text-destructive focus:text-destructive'>
                        <Trash2 className='size-4' />
                        Delete
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                  </DropdownMenuContent>
                </DropdownMenu>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete task</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete &quot;{task.title}&quot;?
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeleteTask(task.id)}
                      className='bg-destructive text-destructive-foreground hover:bg-destructive/90'>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
