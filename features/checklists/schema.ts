import { z } from 'zod';

export const MAX_CHECKLIST_ITEMS = 50;

const title = z.string().trim().min(1, 'Write the step.').max(255, 'Steps can be up to 255 characters.');

/** Several at once, so pasting a list of lines adds one step per line. */
export const addChecklistItemsSchema = z.object({
  taskId: z.uuid(),
  titles: z.array(title).min(1).max(MAX_CHECKLIST_ITEMS, `A checklist can have up to ${MAX_CHECKLIST_ITEMS} steps.`),
});
export const updateChecklistItemSchema = z
  .object({ itemId: z.uuid(), title: title.optional(), done: z.boolean().optional() })
  .refine((v) => v.title !== undefined || v.done !== undefined, 'Nothing to change.');
export const deleteChecklistItemSchema = z.object({ itemId: z.uuid() });
export const reorderChecklistSchema = z.object({
  taskId: z.uuid(),
  itemIds: z.array(z.uuid()).max(MAX_CHECKLIST_ITEMS),
});

export type ChecklistItemInfo = { id: string; title: string; done: boolean; position: number };

/** "3/5", or null when there's no checklist. */
export function checklistProgress(items: readonly { done: boolean }[] | undefined) {
  if (!items || items.length === 0) return null;
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, complete: done === items.length };
}

/** One step per non-empty line, for pasting a list. */
export function splitSteps(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s+/, '').trim())
    .filter(Boolean);
}
