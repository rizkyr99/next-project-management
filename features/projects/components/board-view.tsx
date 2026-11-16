'use client';

import { reorderTasks } from '@/features/tasks/actions';
import { reorderStatuses } from '@/features/projects/status-actions';
import { AddColumn, type ColumnInfo } from '@/features/projects/components/column-controls';
import { BoardColumn, columnDragId } from '@/features/tasks/components/board-column';
import { TaskCard } from '@/features/tasks/components/task-card';
import { useTaskStream } from '@/features/tasks/hooks/use-task-stream';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
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
import { useRef, useState } from 'react';
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

interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface BoardViewProps {
  workspaceMembers?: WorkspaceMember[];
  currentUserId?: string;
  commentCountMap?: Record<string, number>;
  project?: {
    id: string;
    statuses: {
      id: string;
      name: string;
      color?: string | null;
      isDefault?: boolean | null;
      tasks: {
        id: string;
        title: string;
        priority: 'low' | 'medium' | 'high';
        dueDate?: Date | null;
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

export function BoardView({ project, workspaceMembers = [], currentUserId = '', commentCountMap = {} }: BoardViewProps) {
  useTaskStream(project?.id ?? '');
  const [statuses, setStatuses] = useState(project?.statuses ?? []);

  const handleTaskCreated = (statusId: string, newTask: { id: string; title: string; priority: 'low' | 'medium' | 'high'; dueDate: Date | null; assignees: [] }) => {
    setStatuses((prev) =>
      prev.map((s) =>
        s.id === statusId ? { ...s, tasks: [...s.tasks, { ...newTask, statusId }] } : s,
      ),
    );
  };
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const previousStatusesRef = useRef<typeof statuses | null>(null);

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
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
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

  const handleColumnDragEnd = async (event: DragEndEvent) => {
    setActiveColumnId(null);
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
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}>
      <div className='flex-1 flex items-start gap-4 p-4 overflow-x-auto'>
        <SortableContext
          items={statuses.map((s) => columnDragId(s.id))}
          strategy={horizontalListSortingStrategy}>
        {statuses.map((status) => (
          <BoardColumn
            key={status.id}
            id={status.id}
            title={status.name}
            color={status.color ?? null}
            isDefault={Boolean(status.isDefault)}
            columns={columnInfos}
            projectId={project!.id}
            statuses={statuses.map((s) => ({ id: s.id, name: s.name }))}
            tasks={status.tasks.map((t) => ({ ...t, commentCount: commentCountMap[t.id] ?? 0 }))}
            availableAssignees={workspaceMembers}
            currentUserId={currentUserId}
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
          <TaskCard
            id={activeTask.id}
            title={activeTask.title}
            priority={activeTask.priority}
            dueDate={activeTask.dueDate}
            statusId={statuses.find((s) => s.tasks.some((t) => t.id === activeTask.id))?.id ?? ''}
            projectId={project!.id}
            statuses={statuses.map((s) => ({ id: s.id, name: s.name }))}
            assignees={activeTask.assignees}
            availableAssignees={workspaceMembers}
            currentUserId={currentUserId}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
