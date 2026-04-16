'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarIcon,
  MessageSquare,
  Target,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  updateTaskAssignees,
  updateTaskDueDate,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskTitle,
} from '../actions';
import { TaskActivity } from '@/features/activity/components/task-activity';
import { TaskComments } from './task-comments';

type Priority = 'low' | 'medium' | 'high';

interface AssigneeOption {
  id: string;
  name: string;
  email?: string;
  image?: string | null;
}

interface TaskCardProps {
  id: string;
  title: string;
  priority: Priority;
  dueDate?: Date | null;
  statusId: string;
  projectId: string;
  statuses: { id: string; name: string }[];
  assignees?: { user: AssigneeOption }[];
  availableAssignees?: AssigneeOption[];
  currentUserId: string;
  commentCount?: number;
}

const priorityConfig: Record<
  Priority,
  {
    label: string;
    icon: ReactNode;
    variant: 'default' | 'secondary' | 'outline' | 'destructive';
  }
> = {
  high: {
    label: 'High',
    icon: <ArrowUp className='size-3' />,
    variant: 'destructive',
  },
  medium: {
    label: 'Medium',
    icon: <ArrowRight className='size-3' />,
    variant: 'secondary',
  },
  low: {
    label: 'Low',
    icon: <ArrowDown className='size-3' />,
    variant: 'outline',
  },
};

function getInitials(source: string) {
  return source
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function AssigneePicker({
  trigger,
  options,
  selectedIds,
  onToggle,
}: {
  trigger: ReactNode;
  options: AssigneeOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (a) =>
        a.name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q),
    );
  }, [options, search]);

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-72 p-2'
        data-ignore-outside-click>
        <div className='space-y-2'>
          <Input
            placeholder='Search members…'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <div className='max-h-52 overflow-y-auto space-y-0.5'>
            {filtered.length === 0 ? (
              <p className='px-2 py-1.5 text-sm text-muted-foreground'>
                No members found.
              </p>
            ) : (
              filtered.map((a) => {
                const label = a.name || a.email || 'U';
                return (
                  <label
                    key={a.id}
                    className='flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent cursor-pointer'
                    onClick={() => onToggle(a.id)}>
                    <Checkbox checked={selectedIds.includes(a.id)} />
                    <Avatar className='size-6'>
                      {a.image ? (
                        <AvatarImage src={a.image} alt={label} />
                      ) : null}
                      <AvatarFallback className='text-[10px]'>
                        {getInitials(label) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className='flex flex-col'>
                      <span className='font-medium'>{a.name}</span>
                      {a.email && (
                        <span className='text-xs text-muted-foreground'>
                          {a.email}
                        </span>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DatePicker({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className='justify-start gap-2 font-normal'>
          <CalendarIcon className='size-3.5' />
          {value
            ? value.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'Pick a date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0' align='start'>
        <Calendar
          mode='single'
          selected={value ?? undefined}
          onSelect={(day) => {
            onChange(day ?? null);
            setOpen(false);
          }}
        />
        {value && (
          <div className='border-t p-2'>
            <Button
              variant='ghost'
              size='sm'
              className='w-full text-muted-foreground'
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}>
              <X className='size-3.5 mr-1' />
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function TaskCard({
  id,
  title,
  priority: initialPriority,
  dueDate: initialDueDate,
  statusId: initialStatusId,
  projectId,
  statuses,
  assignees = [],
  availableAssignees = [],
  currentUserId,
  commentCount = 0,
}: Readonly<TaskCardProps>) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [draftTitle, setDraftTitle] = useState(title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [priority, setPriority] = useState<Priority>(initialPriority);
  const [dueDate, setDueDate] = useState<Date | null>(initialDueDate ?? null);
  const [statusId, setStatusId] = useState(initialStatusId);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>(
    assignees.map((a) => a.user.id),
  );

  useEffect(() => {
    setCurrentTitle(title);
    setDraftTitle(title);
  }, [title]);

  useEffect(() => {
    setSelectedAssigneeIds(assignees.map((a) => a.user.id));
  }, [assignees]);

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, AssigneeOption>();
    for (const a of availableAssignees) map.set(a.id, a);
    for (const a of assignees) {
      if (!map.has(a.user.id)) map.set(a.user.id, a.user);
    }
    return Array.from(map.values());
  }, [availableAssignees, assignees]);

  const selectedAssignees = useMemo(
    () =>
      selectedAssigneeIds
        .map((uid) => assigneeOptions.find((a) => a.id === uid))
        .filter(Boolean) as AssigneeOption[],
    [assigneeOptions, selectedAssigneeIds],
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleTitleSave = async () => {
    const trimmed = draftTitle.trim() || currentTitle;
    setCurrentTitle(trimmed);
    setDraftTitle(trimmed);
    setIsEditingTitle(false);
    if (trimmed !== currentTitle) {
      const result = await updateTaskTitle(id, trimmed, projectId);
      if (result?.error) toast.error(result.error, { position: 'top-center' });
    }
  };

  const handleStatusChange = async (newStatusId: string) => {
    setStatusId(newStatusId);
    const result = await updateTaskStatus({
      taskId: id,
      statusId: newStatusId,
      projectId,
    });
    if (result?.error) toast.error(result.error, { position: 'top-center' });
  };

  const handlePriorityChange = async (newPriority: Priority) => {
    setPriority(newPriority);
    const result = await updateTaskPriority(id, newPriority, projectId);
    if (result?.error) toast.error(result.error, { position: 'top-center' });
  };

  const handleDueDateChange = async (date: Date | null) => {
    setDueDate(date);
    const result = await updateTaskDueDate(id, date, projectId);
    if (result?.error) toast.error(result.error, { position: 'top-center' });
  };

  const handleToggleAssignee = async (userId: string) => {
    const next = selectedAssigneeIds.includes(userId)
      ? selectedAssigneeIds.filter((i) => i !== userId)
      : [...selectedAssigneeIds, userId];
    setSelectedAssigneeIds(next);
    const result = await updateTaskAssignees(id, next, projectId);
    if (result?.error) toast.error(result.error, { position: 'top-center' });
  };

  const p = priorityConfig[priority];
  const isOverdue = dueDate && dueDate < new Date();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          className='bg-white dark:bg-card shadow p-2.5 rounded-md space-y-2 hover:shadow-md cursor-pointer transition'>
          <div className='text-sm font-medium leading-snug'>{currentTitle}</div>

          {/* Card preview: priority + due date + assignees */}
          <div className='flex items-center gap-1.5 flex-wrap'>
            <Badge
              variant={p.variant}
              className='gap-1 text-xs font-normal px-1.5 py-0'>
              {p.icon}
              {p.label}
            </Badge>

            {dueDate && (
              <span
                className={`text-xs ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                {dueDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}

            <div className='flex items-center gap-2 ml-auto'>
              {commentCount > 0 && (
                <span className='flex items-center gap-0.5 text-xs text-muted-foreground'>
                  <MessageSquare className='size-3' />
                  {commentCount}
                </span>
              )}
              {selectedAssignees.length > 0 && (
                <div className='flex items-center -space-x-2'>
                  {selectedAssignees.slice(0, 3).map((a) => {
                    const label = a.name || a.email || 'U';
                    return (
                      <Avatar
                        key={a.id}
                        className='size-5 border-2 border-background'>
                        {a.image ? (
                          <AvatarImage src={a.image} alt={label} />
                        ) : null}
                        <AvatarFallback className='text-[9px]'>
                          {getInitials(label) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                    );
                  })}
                  {selectedAssignees.length > 3 && (
                    <span className='text-xs text-muted-foreground pl-3'>
                      +{selectedAssignees.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogTrigger>

      <DialogContent className='max-w-2xl max-h-[85vh] overflow-y-auto'>
        <DialogHeader>
          {isEditingTitle ? (
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleTitleSave();
                }
                if (e.key === 'Escape') {
                  setDraftTitle(currentTitle);
                  setIsEditingTitle(false);
                }
              }}
              className='w-full rounded-md border border-input bg-background px-2 py-1 text-lg font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
            />
          ) : (
            <DialogTitle asChild>
              <button
                type='button'
                onClick={() => {
                  setDraftTitle(currentTitle);
                  setIsEditingTitle(true);
                }}
                className='w-full text-left text-lg font-semibold hover:bg-muted px-2 py-1.5 rounded-lg cursor-text'>
                {currentTitle}
              </button>
            </DialogTitle>
          )}
        </DialogHeader>

        <div className='space-y-3 pt-1'>
          {/* Status */}
          <div className='grid grid-cols-[120px_1fr] items-center gap-2'>
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Target className='size-4' />
              Status
            </div>
            <Select value={statusId} onValueChange={handleStatusChange}>
              <SelectTrigger className='h-8 text-sm'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className='grid grid-cols-[120px_1fr] items-center gap-2'>
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              {p.icon}
              Priority
            </div>
            <Select
              value={priority}
              onValueChange={(v) => handlePriorityChange(v as Priority)}>
              <SelectTrigger className='h-8 text-sm'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='high'>High</SelectItem>
                <SelectItem value='medium'>Medium</SelectItem>
                <SelectItem value='low'>Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='grid grid-cols-[120px_1fr] items-center gap-2'>
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <CalendarIcon className='size-4' />
              Due date
            </div>
            <DatePicker value={dueDate} onChange={handleDueDateChange} />
          </div>

          <div className='grid grid-cols-[120px_1fr] items-start gap-2'>
            <div className='flex items-center gap-2 text-sm text-muted-foreground pt-1'>
              <Users className='size-4' />
              Assignees
            </div>
            <div className='space-y-2'>
              {selectedAssignees.length > 0 && (
                <div className='flex flex-wrap gap-1.5'>
                  {selectedAssignees.map((a) => {
                    const label = a.name || a.email || 'U';
                    return (
                      <div
                        key={a.id}
                        className='flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs'>
                        <Avatar className='size-4'>
                          {a.image ? (
                            <AvatarImage src={a.image} alt={label} />
                          ) : null}
                          <AvatarFallback className='text-[8px]'>
                            {getInitials(label) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        {a.name || a.email}
                        <button
                          type='button'
                          onClick={() => handleToggleAssignee(a.id)}
                          className='ml-0.5 text-muted-foreground hover:text-foreground'>
                          <X className='size-3' />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <AssigneePicker
                options={assigneeOptions}
                selectedIds={selectedAssigneeIds}
                onToggle={handleToggleAssignee}
                trigger={
                  <Button variant='outline' size='sm' className='h-7 text-xs'>
                    {selectedAssignees.length > 0
                      ? 'Edit assignees'
                      : 'Assign members'}
                  </Button>
                }
              />
            </div>
          </div>

          <Separator />

          <TaskComments
            taskId={id}
            currentUserId={currentUserId}
            workspaceMembers={availableAssignees}
          />

          <Separator />

          <TaskActivity taskId={id} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
