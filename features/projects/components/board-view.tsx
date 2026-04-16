'use client';

import { reorderTasks } from '@/features/tasks/actions';
import { BoardColumn } from '@/features/tasks/components/board-column';
import { TaskCard } from '@/features/tasks/components/task-card';
import {
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
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

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
  const [statuses, setStatuses] = useState(project?.statuses ?? []);

  const handleTaskCreated = (statusId: string, newTask: { id: string; title: string; priority: 'low' | 'medium' | 'high'; dueDate: Date | null; assignees: [] }) => {
    setStatuses((prev) =>
      prev.map((s) =>
        s.id === statusId ? { ...s, tasks: [...s.tasks, { ...newTask, statusId }] } : s,
      ),
    );
  };
  const [activeId, setActiveId] = useState<string | null>(null);
  const previousStatusesRef = useRef<typeof statuses | null>(null);

  const activeTask = statuses
    .flatMap((s) => s.tasks)
    .find((t) => t.id === activeId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
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

  const handleDragStart = (event: DragStartEvent) => {
    previousStatusesRef.current = statuses.map((status) => ({
      ...status,
      tasks: [...status.tasks],
    }));
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeStatusIndex = statuses.findIndex((status) =>
      status.tasks.some((t) => t.id === activeId),
    );
    const overStatusIndex = statuses.findIndex(
      (status) =>
        status.id === overId || status.tasks.some((t) => t.id === overId),
    );

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

  const handleDragEnd = async (event: DragEndEvent) => {
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
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}>
      <div className='flex-1 flex items-start gap-4 p-4 overflow-x-auto'>
        {statuses.map((status) => (
          <BoardColumn
            key={status.id}
            id={status.id}
            title={status.name}
            projectId={project!.id}
            statuses={statuses.map((s) => ({ id: s.id, name: s.name }))}
            tasks={status.tasks.map((t) => ({ ...t, commentCount: commentCountMap[t.id] ?? 0 }))}
            availableAssignees={workspaceMembers}
            currentUserId={currentUserId}
            onTaskCreated={(newTask) => handleTaskCreated(status.id, newTask)}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
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
