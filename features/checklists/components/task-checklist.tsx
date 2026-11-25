'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { boardInstructions } from '@/features/projects/components/board-announcements';
import { useReadOnly } from '@/features/projects/read-only';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ListChecks, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { addChecklistItems, deleteChecklistItem, reorderChecklist, updateChecklistItem } from '../actions';
import { checklistProgress, MAX_CHECKLIST_ITEMS, splitSteps, type ChecklistItemInfo } from '../schema';

type Item = ChecklistItemInfo & { pending?: boolean };

const fail = (message?: string) =>
  toast.error(message ?? 'Something went wrong. Please try again.', { position: 'top-center' });

/**
 * A task's checklist: tick steps off, add one (or paste several lines),
 * rename, delete and drag to reorder. Every change shows at once and is
 * undone with a message if the save fails.
 */
export function TaskChecklist({ taskId, items: serverItems }: Readonly<{ taskId: string; items: ChecklistItemInfo[] }>) {
  const readOnly = useReadOnly();
  const [items, setItems] = useState<Item[]>(serverItems);
  // New server data replaces the local list, unless a save is still running
  // (it would briefly bring back what was just changed).
  const [inFlight, setInFlight] = useState(0);
  const [seen, setSeen] = useState(serverItems);
  if (seen !== serverItems) {
    setSeen(serverItems);
    if (inFlight === 0) setItems(serverItems);
  }

  const [draft, setDraft] = useState('');
  const tempId = useRef(0);

  async function run<T extends { error?: string }>(apply: () => void, undo: () => void, action: () => Promise<T>) {
    apply();
    setInFlight((n) => n + 1);
    let result: T | { error: string };
    try {
      result = await action();
    } catch {
      result = { error: 'Something went wrong. Please try again.' };
    } finally {
      setInFlight((n) => n - 1);
    }
    if (result.error !== undefined) {
      undo();
      fail(result.error);
    }
    return result;
  }

  const add = async (titles: string[]) => {
    const clean = titles.map((t) => t.trim().slice(0, 255)).filter(Boolean);
    if (clean.length === 0) return;
    if (items.length + clean.length > MAX_CHECKLIST_ITEMS) {
      fail(`A checklist can have up to ${MAX_CHECKLIST_ITEMS} steps.`);
      return;
    }
    const temps: Item[] = clean.map((title, i) => ({
      id: `pending-${++tempId.current}`,
      title,
      done: false,
      position: items.length + i,
      pending: true,
    }));
    const tempIds = new Set(temps.map((t) => t.id));
    setDraft('');
    const result = await run(
      () => setItems((prev) => [...prev, ...temps]),
      () => setItems((prev) => prev.filter((i) => !tempIds.has(i.id))),
      () => addChecklistItems({ taskId, titles: clean }),
    );
    if ('items' in result && result.items) {
      const saved = result.items;
      setItems((prev) => {
        let k = 0;
        return prev.map((i) => (tempIds.has(i.id) ? (saved[k++] ?? i) : i));
      });
    }
  };

  const patch = (id: string, change: Partial<Pick<Item, 'title' | 'done'>>) => {
    const before = items.find((i) => i.id === id);
    if (!before) return;
    void run(
      () => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...change } : i))),
      () => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, title: before.title, done: before.done } : i))),
      () => updateChecklistItem({ itemId: id, ...change }),
    );
  };

  const remove = (id: string) => {
    const index = items.findIndex((i) => i.id === id);
    const removed = items[index];
    if (!removed) return;
    void run(
      () => setItems((prev) => prev.filter((i) => i.id !== id)),
      () =>
        setItems((prev) => {
          const next = [...prev];
          next.splice(Math.min(index, next.length), 0, removed);
          return next;
        }),
      () => deleteChecklistItem({ itemId: id }),
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const anyPending = items.some((i) => i.pending);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const before = items;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(items, from, to);
    void run(
      () => setItems(next),
      () => setItems(before),
      () => reorderChecklist({ taskId, itemIds: next.map((i) => i.id) }),
    );
  };

  const progress = checklistProgress(items);
  // Guests see the checklist (if there is one) but can't change it.
  if (readOnly && items.length === 0) return null;

  // Screen readers hear step names, not internal ids.
  const nameOf = (id: string | number | undefined) => items.find((i) => i.id === id)?.title ?? '';
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up step ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over && over.id !== active.id ? `Step ${nameOf(active.id)} is over step ${nameOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over && over.id !== active.id
        ? `Moved step ${nameOf(active.id)} to where ${nameOf(over.id)} was.`
        : `Dropped step ${nameOf(active.id)}.`,
    onDragCancel: ({ active }) => `Cancelled moving step ${nameOf(active.id)}.`,
  };

  return (
    <section className='space-y-2' aria-labelledby={`checklist-${taskId}`}>
      <h3 id={`checklist-${taskId}`} className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
        <ListChecks className='size-4' aria-hidden />
        Checklist
        {progress && (
          <span className={cn('tabular-nums', progress.complete && 'text-emerald-600 dark:text-emerald-400')}>
            {progress.done}/{progress.total}
          </span>
        )}
      </h3>
      {progress && (
        <div
          role='progressbar'
          aria-label='Checklist progress'
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          className='h-1 overflow-hidden rounded-full bg-muted'>
          <div
            className={cn('h-full transition-[width]', progress.complete ? 'bg-emerald-500' : 'bg-primary')}
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}

      {items.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ announcements, screenReaderInstructions: boardInstructions }}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul aria-label='Steps' className='-mx-2'>
              {items.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  readOnly={readOnly}
                  dragDisabled={anyPending || readOnly}
                  onToggle={(done) => patch(item.id, { done })}
                  onRename={(title) => patch(item.id, { title })}
                  onDelete={() => remove(item.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {!readOnly && items.length < MAX_CHECKLIST_ITEMS && (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void add([draft]);
            } else if (e.key === 'Escape' && draft) {
              // Clear the step, and keep Escape from also closing the sheet.
              e.preventDefault();
              e.stopPropagation();
              setDraft('');
            }
          }}
          onPaste={(e) => {
            const steps = splitSteps(e.clipboardData.getData('text'));
            if (steps.length > 1) {
              e.preventDefault();
              void add(steps);
            }
          }}
          maxLength={255}
          placeholder={items.length ? 'Add a step…' : 'Add a step, or paste a list…'}
          aria-label='Add a checklist step'
          className='h-8'
        />
      )}
    </section>
  );
}

function ChecklistRow({
  item,
  readOnly = false,
  dragDisabled,
  onToggle,
  onRename,
  onDelete,
}: Readonly<{
  item: Item;
  readOnly?: boolean;
  dragDisabled: boolean;
  onToggle: (done: boolean) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}>) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: dragDisabled || item.pending,
  });
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.title);

  const commit = () => {
    setEditing(false);
    const next = text.trim();
    if (next && next !== item.title) onRename(next);
    else setText(item.title);
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted/60',
        isDragging && 'relative z-10 bg-muted shadow-sm',
        item.pending && 'opacity-60',
      )}>
      {!readOnly && (
      <button
        type='button'
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder “${item.title}”`}
        disabled={dragDisabled || item.pending}
        className='-ml-1 cursor-grab touch-none rounded text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-default'>
        <GripVertical className='size-3.5' aria-hidden />
      </button>
      )}
      <Checkbox
        checked={item.done}
        disabled={item.pending || readOnly}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={item.title}
      />
      {editing ? (
        <input
          autoFocus
          value={text}
          maxLength={255}
          aria-label='Edit step'
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setText(item.title);
              setEditing(false);
            }
          }}
          className='min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
        />
      ) : readOnly ? (
        <span className={cn('min-w-0 flex-1 break-words px-1.5 py-0.5 text-sm', item.done && 'text-muted-foreground line-through')}>
          {item.title}
        </span>
      ) : (
        <button
          type='button'
          disabled={item.pending}
          onClick={() => {
            setText(item.title);
            setEditing(true);
          }}
          title='Click to rename'
          className={cn(
            'min-w-0 flex-1 break-words rounded px-1.5 py-0.5 text-left text-sm cursor-text',
            item.done && 'text-muted-foreground line-through',
          )}>
          {item.title}
        </button>
      )}
      {!readOnly && (
      <button
        type='button'
        onClick={onDelete}
        disabled={item.pending}
        aria-label={`Delete “${item.title}”`}
        className='rounded p-0.5 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100'>
        <X className='size-3.5' aria-hidden />
      </button>
      )}
    </li>
  );
}
