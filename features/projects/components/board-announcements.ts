import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from '@dnd-kit/core';

/**
 * What screen readers hear during drag and drop. dnd-kit's defaults read out
 * internal ids ("Draggable item column:4f2a… was moved over droppable area …");
 * these use the task and column names people see.
 */
export const boardInstructions: ScreenReaderInstructions = {
  draggable:
    'To move this item, press Space. Use the arrow keys to move it, Space to drop it, or Escape to cancel.',
};

type Lookup = { taskName: (id: string) => string | undefined; columnName: (id: string) => string | undefined };

/** Over-targets can be a task, a column (column:<id>) or a column's drop zone (<statusId>). */
function where(overId: UniqueIdentifier | undefined, l: Lookup) {
  if (overId === undefined) return null;
  const id = String(overId);
  const column = l.columnName(id.startsWith('column:') ? id.slice('column:'.length) : id);
  if (column) return `column ${column}`;
  const task = l.taskName(id);
  return task ? `task ${task}` : null;
}

function subject(e: { active: { id: UniqueIdentifier } }, l: Lookup) {
  const id = String(e.active.id);
  if (id.startsWith('column:')) return `Column ${l.columnName(id.slice('column:'.length)) ?? ''}`.trim();
  return `Task ${l.taskName(id) ?? ''}`.trim();
}

export function boardAnnouncements(l: Lookup): Announcements {
  return {
    onDragStart: (e) => `Picked up ${subject(e, l)}.`,
    onDragOver: (e) => {
      // Right after pickup the item is "over" itself: nothing to say.
      if (e.over?.id === e.active.id) return undefined;
      const target = where(e.over?.id, l);
      return target ? `${subject(e, l)} is over ${target}.` : `${subject(e, l)} is no longer over a drop area.`;
    },
    onDragEnd: (e) => {
      const target = where(e.over?.id, l);
      return target ? `Dropped ${subject(e, l)} on ${target}.` : `Dropped ${subject(e, l)}.`;
    },
    onDragCancel: (e) => `Cancelled. ${subject(e, l)} was put back.`,
  };
}
