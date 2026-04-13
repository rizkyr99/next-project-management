'use client';

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
import { ArrowDown, ArrowRight, ArrowUp, CheckSquare } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

type Priority = 'low' | 'medium' | 'high';

interface MyTask {
  id: string;
  title: string;
  priority: Priority;
  dueDate: Date | null;
  createdAt: Date;
  statusId: string;
  statusName: string;
  projectId: string;
  projectName: string;
}

interface MyTasksViewProps {
  tasks: MyTask[];
  workspaceSlug: string;
}

const priorityConfig: Record<
  Priority,
  { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  high: { label: 'High', icon: <ArrowUp className='size-3' />, variant: 'destructive' },
  medium: { label: 'Medium', icon: <ArrowRight className='size-3' />, variant: 'secondary' },
  low: { label: 'Low', icon: <ArrowDown className='size-3' />, variant: 'outline' },
};

function formatDate(date: Date | null) {
  if (!date) return null;
  const d = new Date(date);
  const isOverdue = d < new Date();
  const label = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
  return { label, isOverdue };
}

export function MyTasksView({ tasks, workspaceSlug }: Readonly<MyTasksViewProps>) {
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
      <div className='flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm'>
        <CheckSquare className='size-10 opacity-20' />
        <p className='font-medium'>No tasks assigned to you</p>
        <p>Tasks assigned to you across projects will appear here.</p>
      </div>
    );
  }

  return (
    <div className='flex-1 flex flex-col overflow-hidden'>
      {/* Filters */}
      <div className='flex items-center gap-3 px-4 py-3 border-b'>
        <span className='text-xs text-muted-foreground font-medium'>Filter:</span>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className='h-8 w-36 text-xs'>
            <SelectValue placeholder='Priority' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all' className='text-xs'>All priorities</SelectItem>
            <SelectItem value='high' className='text-xs'>High</SelectItem>
            <SelectItem value='medium' className='text-xs'>Medium</SelectItem>
            <SelectItem value='low' className='text-xs'>Low</SelectItem>
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

        <span className='ml-auto text-xs text-muted-foreground'>
          {filtered.length} {filtered.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>

      {/* Table */}
      <div className='flex-1 overflow-auto p-4'>
        {filtered.length === 0 ? (
          <div className='flex items-center justify-center py-16 text-sm text-muted-foreground'>
            No tasks match the selected filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className='hover:bg-transparent'>
                <TableHead>Task</TableHead>
                <TableHead className='w-40'>Project</TableHead>
                <TableHead className='w-36'>Status</TableHead>
                <TableHead className='w-32'>Priority</TableHead>
                <TableHead className='w-36'>Due date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const priority = priorityConfig[t.priority];
                const due = formatDate(t.dueDate);

                return (
                  <TableRow key={t.id}>
                    <TableCell className='font-medium max-w-xs'>
                      <Link
                        href={`/workspaces/${workspaceSlug}/projects/${t.projectId}`}
                        className='hover:underline truncate block'>
                        {t.title}
                      </Link>
                    </TableCell>

                    <TableCell>
                      <Link
                        href={`/workspaces/${workspaceSlug}/projects/${t.projectId}`}
                        className='text-sm text-muted-foreground hover:text-foreground truncate block'>
                        {t.projectName}
                      </Link>
                    </TableCell>

                    <TableCell>
                      <span className='text-sm text-muted-foreground'>
                        {t.statusName}
                      </span>
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
        )}
      </div>
    </div>
  );
}
