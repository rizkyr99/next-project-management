'use client';

import { priorityConfig, type Priority } from '@/features/tasks/priority';
import { formatDue, isOverdue } from '@/features/tasks/due';
import { LabelChips } from '@/features/labels/components/label-chip';
import { ChecklistBadge } from '@/features/checklists/components/checklist-badge';

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
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { bulkDeleteTasks, bulkUpdateStatus } from '@/features/tasks/actions';
import { TaskStatusSelect } from '@/features/tasks/components/task-status-select';
import {
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { usePendingDeletes } from '@/features/tasks/pending-deletes';
import { openTask } from '@/features/tasks/task-link';
import { EmptyState } from '@/components/empty-state';
import { matchesFilters, sortTasks } from '@/features/tasks/filters';
import { useTaskFilters } from '@/features/tasks/use-task-filters';
import { ariaSort, SortButton } from '@/features/tasks/components/sort-button';
import { ListTodo } from 'lucide-react';


interface TableViewProps {
  currentUserId?: string;
  workspaceMembers?: { id: string; name: string; email: string; image: string | null }[];
  project?: {
    id: string;
    statuses: {
      id: string;
      name: string;
      tasks: {
        id: string;
        title: string;
        priority: Priority;
        dueDate: Date | null;
        dueHasTime?: boolean;
        labels?: { label: { id: string; name: string; color: string | null } }[];
        checklist?: { done: boolean }[];
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

function formatDate(date: Date | null, hasTime = false) {
  if (!date) return null;
  return { label: formatDue(date, hasTime), isOverdue: isOverdue(date, hasTime) };
}

export function TableView({ project, currentUserId = '' }: Readonly<TableViewProps>) {
  const projectId = project?.id;
  const statuses = project?.statuses ?? [];
  const initialTasks = statuses.flatMap((status) =>
    status.tasks.map((task) => ({ ...task, statusId: status.id })),
  );
  const statusOptions = statuses.map((s) => ({ id: s.id, name: s.name }));

  const [allTasks, setTasks] = useState(initialTasks);
  const hidden = usePendingDeletes();
  const tasks = hidden.size === 0 ? allTasks : allTasks.filter((t) => !hidden.has(t.id));
  // Filters and sorting (URL state, shared with the board's filter bar).
  const { filters, sort, active: filtering, setSort, clear: clearFilters } = useTaskFilters();
  const [taskStatusMap, setTaskStatusMap] = useState<Record<string, string>>(
    () => Object.fromEntries(initialTasks.map((t) => [t.id, t.statusId])),
  );
  const [rawSelectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // A task inside its undo window is hidden, so it must not stay selected
  // either: bulk actions would otherwise delete it behind Undo's back.
  const statusOrder = Object.fromEntries(statuses.map((st, i) => [st.id, i]));
  const withStatus = tasks.map((t) => ({ ...t, statusId: taskStatusMap[t.id] ?? t.statusId }));
  const visible = sortTasks(
    filtering ? withStatus.filter((t) => matchesFilters(t, filters, { currentUserId })) : withStatus,
    sort,
    statusOrder,
  );
  // Bulk actions only ever apply to what's on screen: tasks hidden by a
  // filter or inside their undo window drop out of the selection.
  const visibleIds = new Set(visible.map((t) => t.id));
  const selectedIds = new Set([...rawSelectedIds].filter((id) => visibleIds.has(id)));
  const [isPending, setIsPending] = useState(false);

  if (!projectId || tasks.length === 0) {
    return (
      <EmptyState icon={ListTodo} title='No tasks yet' className='flex-1'>
        Add tasks from the Board view, at the bottom of any column.
      </EmptyState>
    );
  }
  if (visible.length === 0) {
    return (
      <EmptyState
        icon={ListTodo}
        title='No tasks match these filters'
        className='flex-1'
        action={
          <Button size='sm' variant='outline' onClick={clearFilters}>
            Clear filters
          </Button>
        }>
        Try another assignee, priority or due date, or fewer words.
      </EmptyState>
    );
  }

  const allSelected = selectedIds.size === visible.length;
  const someSelected = selectedIds.size > 0;

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(visible.map((t) => t.id)));
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
                <SelectValue placeholder='Set status…' />
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

      <div className='flex-1 overflow-auto p-4'>
        <Table>
          <TableHeader>
            <TableRow className='hover:bg-transparent'>
              <TableHead className='w-10'>
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label='Select all'
                />
              </TableHead>
              <TableHead aria-sort={ariaSort(sort, 'title')}>
                <SortButton label='Task' sortKey='title' sort={sort} setSort={setSort} />
              </TableHead>
              <TableHead className='w-40' aria-sort={ariaSort(sort, 'status')}>
                <SortButton label='Status' sortKey='status' sort={sort} setSort={setSort} />
              </TableHead>
              <TableHead className='w-32' aria-sort={ariaSort(sort, 'priority')}>
                <SortButton label='Priority' sortKey='priority' sort={sort} setSort={setSort} />
              </TableHead>
              <TableHead className='w-36' aria-sort={ariaSort(sort, 'due')}>
                <SortButton label='Due date' sortKey='due' sort={sort} setSort={setSort} />
              </TableHead>
              <TableHead className='w-48'>Assignees</TableHead>
              <TableHead className='w-10' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((task) => {
              const priority = priorityConfig[task.priority];
              const due = formatDate(task.dueDate, task.dueHasTime);

              return (
                <TableRow key={task.id} data-state={selectedIds.has(task.id) ? 'selected' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(task.id)}
                      onCheckedChange={() => toggleOne(task.id)}
                      aria-label={`Select ${task.title}`}
                    />
                  </TableCell>

                  <TableCell className='font-medium max-w-xs'>
                    <button
                      type='button'
                      onClick={() => openTask(task.id)}
                      className='truncate block max-w-full text-left hover:underline'>
                      {task.title}
                    </button>
                    <span className='flex flex-wrap items-center gap-1.5'>
                      <ChecklistBadge items={task.checklist} />
                      <LabelChips labels={(task.labels ?? []).map((l) => l.label)} max={2} />
                    </span>
                  </TableCell>

                  <TableCell>
                    <TaskStatusSelect
                    label={`Status of ${task.title}`}
                      taskId={task.id}
                      projectId={projectId}
                      currentStatusId={taskStatusMap[task.id] ?? task.statusId}
                      statuses={statusOptions}
                      onStatusChange={handleStatusChange}
                    />
                  </TableCell>

                  <TableCell>
                    <Badge
                      variant={priority.variant}
                      className='gap-1 text-xs font-normal'>
                      {priority.icon}
                      {priority.label}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    {due ? (
                      <span
                        className={
                          due.isOverdue
                            ? 'text-destructive text-sm'
                            : 'text-sm text-muted-foreground'
                        }>
                        {due.label}
                      </span>
                    ) : (
                      <span className='text-sm text-muted-foreground'>—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {task.assignees.length === 0 ? (
                      <span className='text-sm text-muted-foreground'>
                        Unassigned
                      </span>
                    ) : (
                      <div className='flex items-center -space-x-2'>
                        {task.assignees.map(({ user }) => {
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
                        })}
                      </div>
                    )}
                  </TableCell>

                  <TableCell>
                    <AlertDialog>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant='ghost' size='icon' className='size-7' aria-label={`${task.title} options`}>
                            <MoreHorizontal className='size-4' />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem className='text-destructive focus:text-destructive'>
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
                            Are you sure you want to delete &quot;{task.title}
                            &quot;? This action cannot be undone.
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
