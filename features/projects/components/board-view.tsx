'use client';

import { reorderTasks } from '@/features/tasks/actions';
import { BoardColumn } from '@/features/tasks/components/board-column';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useId, useState } from 'react';

interface BoardViewProps {
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
          };
        }[];
      }[];
    }[];
  };
}

export function BoardView({ project }: BoardViewProps) {
  const [statuses, setStatuses] = useState(project?.statuses ?? []);
  const id = useId();

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
    await reorderTasks({
      projectId,
      statusId,
      tasks: tasks.map((t, index) => ({
        id: t.id,
        order: index,
      })),
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const statusIndex = statuses.findIndex((status) =>
      status.tasks.some((t) => t.id === active.id),
    );

    const status = statuses[statusIndex];
    const oldIndex = status.tasks.findIndex((t) => t.id === active.id);
    const newIndex = status.tasks.findIndex((t) => t.id === over.id);

    const reordered = arrayMove(status.tasks, oldIndex, newIndex);

    const newStatuses = [...statuses];
    newStatuses[statusIndex] = {
      ...statuses[statusIndex],
      tasks: reordered,
    };

    setStatuses(newStatuses);

    persistTaskOrder(project!.id, status.id, reordered);
  };

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}>
      <div className='flex-1 flex items-start gap-4 p-4 overflow-x-auto'>
        {statuses.map((status) => (
          <BoardColumn
            key={status.id}
            id={status.id}
            title={status.name}
            tasks={status.tasks}
          />
        ))}
      </div>
    </DndContext>
  );
}
