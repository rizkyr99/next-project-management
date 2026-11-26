'use client';

import { Button } from '@/components/ui/button';
import { useUpgrade } from '@/features/billing/components/upgrade';
import { useReadOnly } from '@/features/projects/read-only';
import { statusDotClass } from '@/features/projects/status-colors';
import { updateTaskSchedule } from '@/features/tasks/actions';
import type { TaskData } from '@/features/tasks/components/task-meta';
import { dayKey, formatDay, formatDue, isOverdue, parseDay } from '@/features/tasks/due';
import { matchesFilters } from '@/features/tasks/filters';
import { openTask } from '@/features/tasks/task-link';
import { setUrlParams, useTaskFilters } from '@/features/tasks/use-task-filters';
import { cn } from '@/lib/utils';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { layoutWeek, monthWeeks, moveSchedule, taskSpan } from '../layout';

type CalendarTask = TaskData & { statusId: string; statusName: string; statusColor: string | null; done: boolean };

interface CalendarViewProps {
  currentUserId?: string;
  project?: {
    id: string;
    statuses: { id: string; name: string; color?: string | null; tasks: TaskData[] }[];
  };
}

/** A task's dates as one comparable string. */
function scheduleKey(t: Pick<TaskData, 'startDate' | 'dueDate' | 'dueHasTime'>) {
  return `${t.startDate ?? ''}|${t.dueDate ? new Date(t.dueDate).getTime() : ''}|${t.dueHasTime ? 1 : 0}`;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH = /^(\d{4})-(\d{2})$/;

/** The month shown (?month=YYYY-MM, so it survives reloads), or this month. */
function useMonth(): [number, number] {
  const m = MONTH.exec(useSearchParams().get('month') ?? '');
  if (m) return [Number(m[1]), Number(m[2]) - 1];
  const now = new Date();
  return [now.getFullYear(), now.getMonth()];
}

function showMonth(year: number, month: number) {
  const d = new Date(year, month, 1);
  setUrlParams({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` });
}

/**
 * B4: a project's tasks on a month calendar. A task spans its start day to
 * its due day; drag it to the day it should start on to move both dates.
 * Tasks without dates wait on the side, ready to drop onto a day. Pro only
 * (with the upgrade prompt on Free); read-only for clients.
 */
export function CalendarView({ project, currentUserId = '' }: Readonly<CalendarViewProps>) {
  const { canUse, openUpgrade } = useUpgrade();
  if (!canUse('calendar')) {
    return (
      <div className='flex flex-col items-start gap-3 p-8'>
        <CalendarDays className='size-6 text-muted-foreground' aria-hidden />
        <h2 className='text-lg font-semibold'>Plan by date with the calendar</h2>
        <p className='max-w-[52ch] text-sm text-muted-foreground'>
          See every task on the days it runs, and drag work to a new date. The calendar is part of Pro.
        </p>
        <Button onClick={() => openUpgrade('calendar')}>See what Pro adds</Button>
      </div>
    );
  }
  return <Calendar project={project} currentUserId={currentUserId} />;
}

function Calendar({ project, currentUserId }: Readonly<Required<Pick<CalendarViewProps, 'currentUserId'>> & CalendarViewProps>) {
  const readOnly = useReadOnly();
  const [year, month] = useMonth();
  const { filters, active } = useTaskFilters();
  // Moves shown before the server confirms them. Each remembers the task's
  // dates when it was made: once the server's dates differ from those (the
  // save landed, or someone else changed the task), the server's win. So the
  // view never has to remount for new data, which would cancel a drag.
  const [moved, setMoved] = useState<Record<string, { before: string; next: Pick<TaskData, 'startDate' | 'dueDate' | 'dueHasTime'> }>>({});
  const [dragging, setDragging] = useState<CalendarTask | null>(null);
  const [, start] = useTransition();
  const today = dayKey(new Date());

  const tasks = useMemo<CalendarTask[]>(() => {
    const statuses = project?.statuses ?? [];
    const all = statuses.flatMap((s, i) =>
      s.tasks.map((t) => ({
        ...t,
        ...(moved[t.id]?.before === scheduleKey(t) ? moved[t.id].next : {}),
        statusId: s.id,
        statusName: s.name,
        statusColor: s.color ?? null,
        done: i === statuses.length - 1,
      })),
    );
    return active ? all.filter((t) => matchesFilters(t, filters, { currentUserId })) : all;
  }, [project, moved, active, filters, currentUserId]);

  const weeks = monthWeeks(year, month);
  const unscheduled = tasks.filter((t) => !taskSpan(t));
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = ({ active: a }: DragStartEvent) => setDragging(tasks.find((t) => t.id === a.data.current?.taskId) ?? null);

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    setDragging(null);
    const task = tasks.find((t) => t.id === a.data.current?.taskId);
    const toDay = over?.data.current?.day as string | undefined;
    const fromDay = (a.data.current?.fromDay as string | null) ?? null;
    if (!task || !toDay || toDay === fromDay) return;
    const next = moveSchedule(task, fromDay, toDay);
    // The server's dates for this task, before any move shown here.
    const server = project?.statuses.flatMap((st) => st.tasks).find((t) => t.id === task.id);
    if (!server) return;
    setMoved((m) => ({ ...m, [task.id]: { before: scheduleKey(server), next } }));
    start(async () => {
      const result = await updateTaskSchedule({
        taskId: task.id,
        startDate: next.startDate,
        dueDate: next.dueDate,
        hasTime: next.dueHasTime,
      });
      if (result.error !== undefined) {
        setMoved((m) => {
          const rest = { ...m };
          delete rest[task.id];
          return rest;
        });
        toast.error(result.error, { position: 'top-center' });
      } else {
        toast.success(`Moved “${task.title}” to ${formatDay(next.startDate ?? toDay)}`, { position: 'top-center' });
      }
    });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className='flex flex-col gap-4 p-4 lg:flex-row'>
        <section aria-label={monthName} className='min-w-0 flex-1'>
          <div className='mb-3 flex items-center gap-2'>
            <h2 className='mr-auto text-base font-semibold'>{monthName}</h2>
            <Button variant='outline' size='sm' onClick={() => showMonth(new Date().getFullYear(), new Date().getMonth())}>
              Today
            </Button>
            <Button variant='ghost' size='icon' aria-label='Previous month' onClick={() => showMonth(year, month - 1)}>
              <ChevronLeft />
            </Button>
            <Button variant='ghost' size='icon' aria-label='Next month' onClick={() => showMonth(year, month + 1)}>
              <ChevronRight />
            </Button>
          </div>

          <div className='overflow-x-auto rounded-lg border'>
            <div className='min-w-[720px]'>
              <div className='grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground'>
                {WEEKDAYS.map((d) => (
                  <div key={d} className='px-2 py-1.5'>
                    {d}
                  </div>
                ))}
              </div>
              {weeks.map((week) => (
                <Week
                  key={week[0]}
                  week={week}
                  month={month}
                  today={today}
                  tasks={tasks}
                  draggable={!readOnly}
                />
              ))}
            </div>
          </div>
        </section>

        <aside aria-label='Without dates' className='w-full shrink-0 lg:w-60'>
          <h2 className='mb-2 text-sm font-medium'>
            Without dates <span className='text-muted-foreground tabular-nums'>{unscheduled.length}</span>
          </h2>
          {unscheduled.length === 0 ? (
            <p className='text-sm text-muted-foreground'>Every task here has a date.</p>
          ) : (
            <ul className='space-y-1.5'>
              {unscheduled.map((t) => (
                <li key={t.id}>
                  <TaskChip task={t} fromDay={null} draggable={!readOnly} />
                </li>
              ))}
            </ul>
          )}
          {!readOnly && unscheduled.length > 0 && (
            <p className='mt-2 text-xs text-muted-foreground'>Drag one onto a day to give it a due date.</p>
          )}
        </aside>
      </div>
      <DragOverlay>{dragging && <TaskChip task={dragging} fromDay={null} draggable={false} overlay />}</DragOverlay>
    </DndContext>
  );
}

function Week({
  week,
  month,
  today,
  tasks,
  draggable,
}: Readonly<{ week: string[]; month: number; today: string; tasks: CalendarTask[]; draggable: boolean }>) {
  const bars = layoutWeek(week, tasks);
  const lanes = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0);
  return (
    <div className='relative grid grid-cols-7 border-b last:border-b-0' style={{ minHeight: `${4.5 + lanes * 1.75}rem` }}>
      {week.map((day) => (
        <DayCell key={day} day={day} inMonth={parseDay(day).getMonth() === month} isToday={day === today} />
      ))}
      <div
        className='pointer-events-none absolute inset-x-0 top-8 grid grid-cols-7 gap-y-1 px-1'
        style={{ gridTemplateRows: `repeat(${Math.max(lanes, 1)}, 1.5rem)` }}>
        {bars.map((bar) => (
          <div
            key={bar.task.id}
            className='pointer-events-auto min-w-0 px-0.5'
            style={{ gridColumn: `${bar.from + 1} / ${bar.to + 2}`, gridRow: bar.lane + 1 }}>
            <TaskChip
              task={bar.task}
              fromDay={taskSpan(bar.task)!.start}
              draggable={draggable}
              continuesBefore={bar.continuesBefore}
              continuesAfter={bar.continuesAfter}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function DayCell({ day, inMonth, isToday }: Readonly<{ day: string; inMonth: boolean; isToday: boolean }>) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}`, data: { day } });
  const date = parseDay(day);
  return (
    <div
      ref={setNodeRef}
      data-day={day}
      aria-label={date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      className={cn('border-r p-1 last:border-r-0', !inMonth && 'bg-muted/30', isOver && 'bg-primary/10')}>
      <span
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-full text-xs',
          !inMonth && 'text-muted-foreground',
          isToday && 'bg-primary font-semibold text-primary-foreground',
        )}>
        {date.getDate()}
      </span>
    </div>
  );
}

function TaskChip({
  task,
  fromDay,
  draggable,
  continuesBefore = false,
  continuesAfter = false,
  overlay = false,
}: Readonly<{
  task: CalendarTask;
  fromDay: string | null;
  draggable: boolean;
  continuesBefore?: boolean;
  continuesAfter?: boolean;
  overlay?: boolean;
}>) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${fromDay ?? 'undated'}:${task.id}`,
    data: { taskId: task.id, fromDay },
    disabled: !draggable || overlay,
  });
  const span = taskSpan(task);
  const late = !task.done && task.dueDate ? isOverdue(task.dueDate, task.dueHasTime) : false;
  const when = !span
    ? 'no dates'
    : span.start === span.end
      ? task.dueDate
        ? `due ${formatDue(task.dueDate, task.dueHasTime)}`
        : `starts ${formatDay(span.start)}`
      : `${formatDay(span.start)} to ${task.dueDate ? formatDue(task.dueDate, task.dueHasTime) : formatDay(span.end)}`;

  return (
    <button
      ref={overlay ? undefined : setNodeRef}
      type='button'
      {...(draggable && !overlay ? { ...attributes, ...listeners } : {})}
      aria-roledescription={draggable ? 'draggable task' : undefined}
      aria-label={`${task.title}, ${when}, ${task.statusName}${late ? ', overdue' : ''}`}
      onClick={() => openTask(task.id)}
      className={cn(
        'flex h-6 w-full items-center gap-1.5 truncate border bg-card px-1.5 text-left text-xs shadow-sm hover:bg-muted',
        continuesBefore ? 'rounded-l-none border-l-0' : 'rounded-l-md',
        continuesAfter ? 'rounded-r-none border-r-0' : 'rounded-r-md',
        isDragging && 'opacity-40',
        overlay && 'w-56 cursor-grabbing shadow-md',
        task.done && 'text-muted-foreground line-through',
        late && 'border-destructive/50 text-destructive',
      )}>
      <span className={cn('size-2 shrink-0 rounded-full', statusDotClass(task.statusColor))} aria-hidden />
      <span className='truncate'>{task.title}</span>
    </button>
  );
}
