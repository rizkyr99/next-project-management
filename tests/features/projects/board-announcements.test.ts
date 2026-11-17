import { describe, expect, it } from 'vitest';
import { boardAnnouncements } from '@/features/projects/components/board-announcements';

const tasks: Record<string, string> = { t1: 'Write launch plan' };
const columns: Record<string, string> = { s1: 'To Do', s2: 'Done' };
const a = boardAnnouncements({ taskName: (id) => tasks[id], columnName: (id) => columns[id] });
const ev = (active: string, over?: string) =>
  ({ active: { id: active }, over: over === undefined ? null : { id: over } }) as never;

describe('board drag-and-drop announcements', () => {
  it('names tasks and columns instead of reading ids', () => {
    expect(a.onDragStart(ev('t1'))).toBe('Picked up Task Write launch plan.');
    expect(a.onDragOver(ev('t1', 's2'))).toBe('Task Write launch plan is over column Done.');
    expect(a.onDragEnd(ev('t1', 's2'))).toBe('Dropped Task Write launch plan on column Done.');
    expect(a.onDragStart(ev('column:s1'))).toBe('Picked up Column To Do.');
    expect(a.onDragOver(ev('column:s1', 'column:s2'))).toBe('Column To Do is over column Done.');
    expect(a.onDragCancel(ev('column:s1'))).toBe('Cancelled. Column To Do was put back.');
  });

  it('says nothing when an item is over itself, and handles leaving every drop area', () => {
    expect(a.onDragOver(ev('column:s1', 'column:s1'))).toBeUndefined();
    expect(a.onDragOver(ev('t1'))).toBe('Task Write launch plan is no longer over a drop area.');
  });
});
