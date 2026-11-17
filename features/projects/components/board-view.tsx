'use client';

import { reorderTasks } from '@/features/tasks/actions';
import { reorderStatuses } from '@/features/projects/status-actions';
import { AddColumn, type ColumnInfo } from '@/features/projects/components/column-controls';
import { BoardColumn, columnDragId } from '@/features/tasks/components/board-column';
import { cardClassName, TaskCardPreview } from '@/features/tasks/components/task-card';
import type { TaskData } from '@/features/tasks/components/task-meta';
import { usePendingDeletes } from '@/features/tasks/pending-deletes';
import { boardAnnouncements, boardInstructions } from './board-announcements';
import { matchesFilters } from '@/features/tasks/filters';
import { useTaskFilters } from '@/features/tasks/use-task-filters';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

const isColumnEntry = (entry: { data: { current?: { type?: string } } } | undefined) =>
  entry?.data.current?.type === 'column';

/**
 * While a column is dragged, only other columns are valid targets. Otherwise
 * the task cards and task drop zones inside each column would compete, and
 * the drop (or each arrow-key step) would land inside the neighbour instead
 * of on it. Task drags keep pointer-based detection.
 */
const boardCollisionDetection: CollisionDetection = (args) => {
  if (isColumnEntry(args.active)) {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(isColumnEntry),
    });
  }
  return pointerWithin(args);
};

/** Keyboard sorting that moves a column exactly one column per arrow press. */
const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { context } = args;
  if (!isColumnEntry(context.active ?? undefined)) {
    return sortableKeyboardCoordinates(event, args);
  }
  const all = context.droppableContainers;
  const columnsOnly = all.getEnabled().filter(isColumnEntry);
  const filtered = Object.assign(Object.create(Object.getPrototypeOf(all)), all, {
    getEnabled: () => columnsOnly,
    get: (id: Parameters<typeof all.get>[0]) => all.get(id),
  }) as typeof all;
  return sortableKeyboardCoordinates(event, {
    ...args,
    context: { ...context, droppableContainers: filtered },
  });
};

interface BoardViewProps {
  currentUserId?: string;
  commentCountMap?: Record<string, number>;
  project?: {
    id: string;
    statuses: {
      id: string;
      name: string;
      color?: string | null;
      isDefault?: boolean | null;
      tasks: TaskData[];
    }[];
  };
}

export function BoardView({ project, commentCountMap = {}, currentUserId = '' }: BoardViewProps) {
  const [allStatuses, setStatuses] = useState(project?.statuses ?? []);
  // Tasks inside their undo window are hidden everywhere, drag logic included.
  const hidden = usePendingDeletes();
  const statuses = useMemo(
    () =>
      hidden.size === 0
        ? allStatuses
        : allStatuses.map((s) => ({ ...s, tasks: s.tasks.filter((t) => !hidden.has(t.id)) })),
    [allStatuses, hidden],
  );

  const handleTaskCreated = (statusId: string, newTask: TaskData) => {
    setStatuses((prev) =>
      prev.map((s) =>
        s.id === statusId ? { ...s, tasks: [...s.tasks, { ...newTask, statusId }] } : s,
      ),
    );
  };
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);

  // Take in fresh server data (our own saves, teammates' changes) without
  // remounting, so open forms like "Add column" survive a refresh. During a
  // drag the local order wins; the latest data is applied once it ends.
  const [syncedProject, setSyncedProject] = useState(project);
  if (project !== syncedProject && activeId === null && activeColumnId === null) {
    setSyncedProject(project);
    setStatuses(project?.statuses ?? []);
  }
  const previousStatusesRef = useRef<typeof statuses | null>(null);

  // Filters (URL state) only change what's shown. While they're on, cards
  // can't be dragged: reordering a filtered subset would scramble the order
  // of the hidden cards. Columns can still be reordered.
  const { filters, active: filtering } = useTaskFilters();
  const shown = useMemo(
    () =>
      filtering
        ? statuses.map((s) => ({ ...s, tasks: s.tasks.filter((t) => matchesFilters(t, filters, { currentUserId })) }))
        : statuses,
    [statuses, filters, filtering, currentUserId],
  );
  const shownCount = shown.reduce((n, s) => n + s.tasks.length, 0);
  const totalCount = statuses.reduce((n, s) => n + s.tasks.length, 0);

  const announcements = useMemo(() => {
    const tasks = new Map(statuses.flatMap((s) => s.tasks.map((t) => [t.id, t.title] as const)));
    const columns = new Map(statuses.map((s) => [s.id, s.name] as const));
    return boardAnnouncements({ taskName: (id) => tasks.get(id), columnName: (id) => columns.get(id) });
  }, [statuses]);

  const columnInfos: ColumnInfo[] = statuses.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color ?? null,
    isDefault: Boolean(s.isDefault),
    taskCount: s.tasks.length,
  }));

  /** The column an over-target belongs to: a column, a column drop zone, or a task in it. */
  const columnIndexFor = (overId: string) =>
    statuses.findIndex(
      (s) => columnDragId(s.id) === overId || s.id === overId || s.tasks.some((t) => t.id === overId),
    );

  const activeTask = statuses
    .flatMap((s) => s.tasks)
    .find((t) => t.id === activeId);

  const sensors = useSensors(
    // Mouse: drag after moving 5px. Touch: press and hold 250ms first, so a
    // swipe across the board scrolls instead of picking up a card (P4.6).
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: boardKeyboardCoordinates,
    }),
  );

  const persistTaskOrder = async (
    projectId: string,
    statusId: string,
    tasks: { id: string }[],
  ) => {
    try {
      const result = await reorderTasks({
        projectId,
        statusId,
        tasks: tasks.map((t, index) => ({
          id: t.id,
          order: index,
        })),
      });

      if (result?.error) {
        return { ok: false as const, error: result.error };
      }

      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to reorder',
      };
    }
  };

  const isColumnDrag = (event: { active: { data: { current?: { type?: string } } } }) =>
    event.active.data.current?.type === 'column';

  const handleDragStart = (event: DragStartEvent) => {
    if (isColumnDrag(event)) {
      setActiveColumnId(event.active.data.current?.statusId as string);
      return;
    }
    previousStatusesRef.current = statuses.map((status) => ({
      ...status,
      tasks: [...status.tasks],
    }));
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (isColumnDrag(event)) return; // columns only move on drop
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeStatusIndex = statuses.findIndex((status) =>
      status.tasks.some((t) => t.id === activeId),
    );
    // Over a task, a column's task list, or a column (e.g. its header).
    const overStatusIndex = columnIndexFor(overId);

    if (activeStatusIndex === -1 || overStatusIndex === -1) return;
    if (activeStatusIndex === overStatusIndex) return;

    const activeStatus = statuses[activeStatusIndex];
    const overStatus = statuses[overStatusIndex];
    const activeTask = activeStatus.tasks.find((t) => t.id === activeId)!;

    const newActiveStatusTasks = activeStatus.tasks.filter(
      (t) => t.id !== activeId,
    );

    const overTaskIndex = overStatus.tasks.findIndex((t) => t.id === overId);
    const newOverStatusTasks = [...overStatus.tasks];

    if (overTaskIndex === -1) {
      newOverStatusTasks.push(activeTask);
    } else {
      newOverStatusTasks.splice(overTaskIndex, 0, activeTask);
    }

    const newStatuses = [...statuses];
    newStatuses[activeStatusIndex] = {
      ...activeStatus,
      tasks: newActiveStatusTasks,
    };
    newStatuses[overStatusIndex] = {
      ...overStatus,
      tasks: newOverStatusTasks,
    };

    setStatuses(newStatuses);
  };

  // A drop wins over any server data that arrived during the drag: that data
  // predates the drop. The save's own revalidation brings the next snapshot.
  const acceptCurrentProject = () => setSyncedProject(project);

  /** Escape (or any cancelled drag): put everything back as it was. */
  const handleDragCancel = () => {
    if (activeId !== null && previousStatusesRef.current) setStatuses(previousStatusesRef.current);
    previousStatusesRef.current = null;
    setActiveId(null);
    setActiveColumnId(null);
  };

  const handleColumnDragEnd = async (event: DragEndEvent) => {
    setActiveColumnId(null);
    acceptCurrentProject();
    const fromId = event.active.data.current?.statusId as string;
    if (!event.over) return;
    const from = statuses.findIndex((s) => s.id === fromId);
    const to = columnIndexFor(event.over.id as string);
    if (from === -1 || to === -1 || from === to) return;

    const before = statuses;
    const reordered = arrayMove(statuses, from, to);
    setStatuses(reordered);
    const result = await reorderStatuses({
      projectId: project!.id,
      statusIds: reordered.map((s) => s.id),
    });
    if (result.error !== undefined) {
      toast.error(result.error, { position: 'top-center' });
      setStatuses(before);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (isColumnDrag(event)) return handleColumnDragEnd(event);
    const { active, over } = event;
    setActiveId(null);
    acceptCurrentProject();

    if (!over) {
      if (previousStatusesRef.current) {
        setStatuses(previousStatusesRef.current);
      }
      previousStatusesRef.current = null;
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    const statusIndex = statuses.findIndex((status) =>
      status.tasks.some((t) => t.id === active.id),
    );

    if (statusIndex === -1) return;

    const status = statuses[statusIndex];
    const oldIndex = status.tasks.findIndex((t) => t.id === activeId);
    const newIndex = status.tasks.findIndex((t) => t.id === overId);

    let finalTasks = status.tasks;

    if (newIndex !== -1 && oldIndex !== newIndex) {
      finalTasks = arrayMove(status.tasks, oldIndex, newIndex);

      const newStatuses = [...statuses];
      newStatuses[statusIndex] = {
        ...status,
        tasks: finalTasks,
      };

      setStatuses(newStatuses);
    }

    const persistResult = await persistTaskOrder(
      project!.id,
      status.id,
      finalTasks,
    );

    if (!persistResult.ok) {
      toast.error(persistResult.error || 'Failed to reorder tasks', {
        position: 'top-center',
      });
      if (previousStatusesRef.current) {
        setStatuses(previousStatusesRef.current);
      }
    }

    previousStatusesRef.current = null;
  };

  return (
    <>
    {filtering && (
      <div role='status' className='border-b bg-muted/40 px-4 py-2 text-sm'>
        Showing {shownCount} of {totalCount} tasks. Dragging cards is off while filters are on.
      </div>
    )}
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{ announcements, screenReaderInstructions: boardInstructions }}>
      {/* Phones: one column at a time with the next peeking in, snapping as you swipe. */}
      <div className='flex-1 flex items-start gap-4 p-4 overflow-x-auto snap-x snap-mandatory scroll-px-4 sm:snap-none'>
        <SortableContext
          items={statuses.map((s) => columnDragId(s.id))}
          strategy={horizontalListSortingStrategy}>
        {shown.map((status) => (
          <BoardColumn
            key={status.id}
            id={status.id}
            title={status.name}
            color={status.color ?? null}
            isDefault={Boolean(status.isDefault)}
            columns={columnInfos}
            tasks={status.tasks.map((t) => ({ ...t, commentCount: commentCountMap[t.id] ?? 0 }))}
            filtering={filtering}
            onTaskCreated={(newTask) => handleTaskCreated(status.id, newTask)}
          />
        ))}
        </SortableContext>
        <AddColumn projectId={project!.id} columnCount={statuses.length} />
      </div>
      <DragOverlay>
        {activeColumnId ? (
          <div className='bg-muted w-64 p-2 rounded-lg shadow-lg text-sm font-medium uppercase text-muted-foreground'>
            {statuses.find((s) => s.id === activeColumnId)?.name}
          </div>
        ) : activeTask ? (
          <div className={cardClassName}>
            <TaskCardPreview task={activeTask} commentCount={commentCountMap[activeTask.id] ?? 0} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
    </>
  );
}
