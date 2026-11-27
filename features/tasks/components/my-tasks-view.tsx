'use client';

import { Button } from '@/components/ui/button';

import { EmptyState } from '@/components/empty-state';

import { Badge } from '@/components/ui/badge';
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
import { CheckSquare } from 'lucide-react';
import { PRIORITIES, priorityConfig, type Priority } from '../priority';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { projectHref, taskHref } from '../task-link';
import { groupByDue, groupByProject } from '../due-groups';
import { setUrlParams } from '../use-task-filters';
import { formatDue, isOverdue } from '../due';


interface MyTask {
  id: string;
  title: string;
  priority: Priority;
  dueDate: Date | null;
  dueHasTime?: boolean;
  createdAt: Date;
  statusId: string;
  statusName: string;
  /** In its project's last column: finished. */
  done: boolean;
  projectId: string;
  projectName: string;
}

interface MyTasksViewProps {
  tasks: MyTask[];
  workspaceSlug: string;
}

function formatDate(date: Date | null, hasTime = false, done = false) {
  if (!date) return null;
  return { label: formatDue(date, hasTime), isOverdue: !done && isOverdue(date, hasTime) };
}

export function MyTasksView({ tasks, workspaceSlug }: Readonly<MyTasksViewProps>) {
  // In the URL, so a reload or a shared link keeps them (D3).
  const params = useSearchParams();
  const priorityFilter = params.get('priority') ?? 'all';
  const statusFilter = params.get('status') ?? 'all';
  const byProject = params.get('group') === 'project';
  const setPriorityFilter = (v: string) => setUrlParams({ priority: v === 'all' ? null : v });
  const setStatusFilter = (v: string) => setUrlParams({ status: v === 'all' ? null : v });

  const uniqueStatuses = Array.from(
    new Map(tasks.map((t) => [t.statusId, t.statusName])).entries(),
  ).map(([id, name]) => ({ id, name }));

  const filtered = tasks.filter((t) => {
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (statusFilter !== 'all' && t.statusId !== statusFilter) return false;
    return true;
  });

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={CheckSquare}
        title='Nothing assigned to you'
        className='flex-1'
        action={
          <Button asChild size='sm' variant='outline'>
            <Link href={`/workspaces/${workspaceSlug}`}>Browse projects</Link>
          </Button>
        }>
        Open a task and add yourself under Assignees. Everything assigned to you, in every project, lands here.
      </EmptyState>
    );
  }

  return (
    <div className='flex-1 flex flex-col overflow-hidden'>
      {/* Filters */}
      <div className='flex flex-wrap items-center gap-3 px-4 py-3 border-b'>
        <span className='text-xs text-muted-foreground font-medium'>Filter:</span>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className='h-8 w-36 text-xs'>
            <SelectValue placeholder='Priority' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all' className='text-xs'>All priorities</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p} className='text-xs'>
                {priorityConfig[p].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className='h-8 w-40 text-xs'>
            <SelectValue placeholder='Status' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all' className='text-xs'>All statuses</SelectItem>
            {uniqueStatuses.map((s) => (
              <SelectItem key={s.id} value={s.id} className='text-xs'>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div role='group' aria-label='Group by' className='flex items-center gap-1 rounded-lg bg-secondary p-1'>
          <Button
            size='sm'
            variant={byProject ? 'ghost' : 'outline'}
            className='h-6 text-xs'
            aria-pressed={!byProject}
            onClick={() => setUrlParams({ group: null })}>
            Due date
          </Button>
          <Button
            size='sm'
            variant={byProject ? 'outline' : 'ghost'}
            className='h-6 text-xs'
            aria-pressed={byProject}
            onClick={() => setUrlParams({ group: 'project' })}>
            Project
          </Button>
        </div>

        <span className='ml-auto text-xs text-muted-foreground'>
          {filtered.length} {filtered.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>

      {/* Table */}
      <div className='flex-1 overflow-auto p-4'>
        {filtered.length === 0 ? (
          <EmptyState icon={CheckSquare} title='No tasks match these filters'>
            Change the priority or status filter to see more.
          </EmptyState>
        ) : (
          <div className='space-y-6'>
            {(byProject ? groupByProject(filtered) : groupByDue(filtered)).map((group) => (
              <section
                key={group.key}
                aria-labelledby={`due-${group.key}`}
                data-testid={byProject ? `project-group-${group.key}` : `due-group-${group.key}`}>
                <h2
                  id={`due-${group.key}`}
                  className={`mb-1 flex items-baseline gap-2 text-sm font-semibold ${group.key === 'overdue' ? 'text-destructive' : ''}`}>
                  {byProject ? (
                    <Link href={projectHref(workspaceSlug, group.key)} className='hover:underline'>
                      {group.label}
                    </Link>
                  ) : (
                    group.label
                  )}
                  <span className='text-xs font-normal text-muted-foreground tabular-nums'>{group.tasks.length}</span>
                </h2>
                <Table>
                  <TableHeader className='sr-only sm:not-sr-only'>
                    <TableRow className='hover:bg-transparent'>
                      <TableHead>Task</TableHead>
                      {!byProject && <TableHead className='w-40'>Project</TableHead>}
                      <TableHead className='w-36'>Status</TableHead>
                      <TableHead className='w-32'>Priority</TableHead>
                      <TableHead className='w-36'>Due date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.tasks.map((t) => {
                      const priority = priorityConfig[t.priority];
                      const due = formatDate(t.dueDate, t.dueHasTime, t.done);

                      return (
                        <TableRow key={t.id}>
                          <TableCell className='font-medium max-w-xs'>
                            <Link
                              href={taskHref(workspaceSlug, t.projectId, t.id)}
                              className='hover:underline truncate block'>
                              {t.title}
                            </Link>
                          </TableCell>

                          {!byProject && (
                            <TableCell>
                              <Link
                                href={projectHref(workspaceSlug, t.projectId)}
                                className='text-sm text-muted-foreground hover:text-foreground truncate block'>
                                {t.projectName}
                              </Link>
                            </TableCell>
                          )}

                          <TableCell>
                            <span className='text-sm text-muted-foreground'>{t.statusName}</span>
                          </TableCell>

                          <TableCell>
                            <Badge variant={priority.variant} className='gap-1 text-xs font-normal'>
                              {priority.icon}
                              {priority.label}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            {due ? (
                              <span className={due.isOverdue ? 'text-destructive text-sm' : 'text-sm text-muted-foreground'}>
                                {due.label}
                              </span>
                            ) : (
                              <span className='text-sm text-muted-foreground'>—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
