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
import { layoutWeek, monthWeeks, moveSchedule, taskSpan, weekLabel, weekOf, addDays } from '../layout';

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
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Range = 'month' | 'week';

/**
 * What the calendar shows, from the URL so it survives reloads: a month
 * (?month=YYYY-MM) or, with ?cal=week, the week around ?week=YYYY-MM-DD.
 * Without either, this month or this week.
 */
function usePlace(): { range: Range; year: number; month: number; week: string[] } {
  const params = useSearchParams();
  const now = new Date();
  const m = MONTH.exec(params.get('month') ?? '');
  const day = params.get('week') ?? '';
  const valid = DAY.test(day) && !Number.isNaN(parseDay(day).getTime());
  return {
    range: params.get('cal') === 'week' ? 'week' : 'month',
    year: m ? Number(m[1]) : now.getFullYear(),
    month: m ? Number(m[2]) - 1 : now.getMonth(),
    week: weekOf(valid ? day : dayKey(now)),
  };
}

const monthParam = (year: number, month: number) => {
  const d = new Date(year, month, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function showMonth(year: number, month: number) {
  setUrlParams({ cal: null, week: null, month: monthParam(year, month) });
}

function showWeek(day: string | null) {
  setUrlParams({ cal: 'week', week: day, month: null });
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
  const { range, year, month, week } = usePlace();
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

  const weeks = range === 'week' ? [week] : monthWeeks(year, month);
  const unscheduled = tasks.filter((t) => !taskSpan(t));
  const title =
    range === 'week' ? weekLabel(week) : new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const now = new Date();
  // Switching keeps your place: a month opens on this week if it's this
  // month, otherwise its first week; a week opens the month most of it is in.
  const toWeek = () =>
    showWeek(year === now.getFullYear() && month === now.getMonth() ? null : dayKey(new Date(year, month, 1)));
  const toMonth = () => {
    const mid = parseDay(week[3]);
    showMonth(mid.getFullYear(), mid.getMonth());
  };
  const step = (n: number) => (range === 'week' ? showWeek(addDays(week[0], 7 * n)) : showMonth(year, month + n));

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
        <section aria-label={title} className='min-w-0 flex-1'>
          <div className='mb-3 flex flex-wrap items-center gap-2'>
            <h2 className='mr-auto text-base font-semibold'>{title}</h2>
            {/* The same look as the view switcher above it. */}
            <div role='group' aria-label='Calendar range' className='flex items-center gap-1 rounded-lg bg-secondary p-1'>
              {(['month', 'week'] as const).map((r) => (
                <Button
                  key={r}
                  variant={range === r ? 'outline' : 'ghost'}
                  size='sm'
                  className='h-7'
                  aria-pressed={range === r}
                  onClick={() => (r === range ? undefined : r === 'week' ? toWeek() : toMonth())}>
                  {r === 'month' ? 'Month' : 'Week'}
                </Button>
              ))}
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => (range === 'week' ? showWeek(null) : showMonth(now.getFullYear(), now.getMonth()))}>
              Today
            </Button>
            <Button variant='ghost' size='icon' aria-label={`Previous ${range}`} onClick={() => step(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant='ghost' size='icon' aria-label={`Next ${range}`} onClick={() => step(1)}>
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
              {weeks.map((days) => (
                <Week
                  key={days[0]}
                  week={days}
                  month={range === 'week' ? null : month}
                  today={today}
                  tasks={tasks}
                  draggable={!readOnly}
                  detailed={range === 'week'}
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

/**
 * One week row. In the week view (`detailed`) it's the whole calendar: taller
 * days, and bars that also show the column and the due time.
 */
function Week({
  week,
  month,
  today,
  tasks,
  draggable,
  detailed = false,
}: Readonly<{
  week: string[];
  /** The month being shown, to dim days outside it; null in the week view. */
  month: number | null;
  today: string;
  tasks: CalendarTask[];
  draggable: boolean;
  detailed?: boolean;
}>) {
  const bars = layoutWeek(week, tasks);
  const lanes = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0);
  const row = detailed ? 2.5 : 1.5;
  return (
    <div
      className='relative grid grid-cols-7 border-b last:border-b-0'
      style={{ minHeight: `${(detailed ? 24 : 4.5) + lanes * (row + 0.25)}rem` }}>
      {week.map((day) => (
        <DayCell
          key={day}
          day={day}
          inMonth={month === null || parseDay(day).getMonth() === month}
          isToday={day === today}
        />
      ))}
      <div
        className='pointer-events-none absolute inset-x-0 top-8 grid grid-cols-7 gap-y-1 px-1'
        style={{ gridTemplateRows: `repeat(${Math.max(lanes, 1)}, ${row}rem)` }}>
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
              detailed={detailed}
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
  detailed = false,
}: Readonly<{
  task: CalendarTask;
  fromDay: string | null;
  draggable: boolean;
  continuesBefore?: boolean;
  continuesAfter?: boolean;
  overlay?: boolean;
  /** Two lines: the title, then the column and (if set) the due time. */
  detailed?: boolean;
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
        'flex w-full items-center gap-1.5 truncate border bg-card px-1.5 text-left text-xs shadow-sm hover:bg-muted',
        detailed ? 'h-10' : 'h-6',
        continuesBefore ? 'rounded-l-none border-l-0' : 'rounded-l-md',
        continuesAfter ? 'rounded-r-none border-r-0' : 'rounded-r-md',
        isDragging && 'opacity-40',
        overlay && 'w-56 cursor-grabbing shadow-md',
        task.done && 'text-muted-foreground line-through',
        late && 'border-destructive/50 text-destructive',
      )}>
      <span className={cn('size-2 shrink-0 rounded-full', statusDotClass(task.statusColor))} aria-hidden />
      {detailed ? (
        <span className='flex min-w-0 flex-col'>
          <span className='truncate font-medium'>{task.title}</span>
          <span className={cn('truncate', late ? 'text-destructive' : 'text-muted-foreground')} aria-hidden>
            {/* The time first: a narrow day cuts off the end. */}
            {task.dueDate && task.dueHasTime
              ? `${new Date(task.dueDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · `
              : ''}
            {task.statusName}
          </span>
        </span>
      ) : (
        <span className='truncate'>{task.title}</span>
      )}
    </button>
  );
}
