import { z } from 'zod';
import { STATUS_COLOR_KEYS } from '@/features/projects/status-colors';

export const MAX_LABELS_PER_TASK = 10;
export const MAX_LABELS_PER_WORKSPACE = 50;

const name = z.string().trim().min(1, 'Name the label.').max(40, 'Label names can be up to 40 characters.');
const color = z.enum(STATUS_COLOR_KEYS).nullable();

export const createLabelSchema = z.object({ projectId: z.uuid(), name, color: color.default(null) });
export const updateLabelSchema = z.object({ labelId: z.uuid(), name: name.optional(), color: color.optional() });
export const deleteLabelSchema = z.object({ labelId: z.uuid() });
export const setTaskLabelsSchema = z.object({
  taskId: z.uuid(),
  labelIds: z.array(z.uuid()).max(MAX_LABELS_PER_TASK, `A task can have up to ${MAX_LABELS_PER_TASK} labels.`),
});

export type LabelInfo = { id: string; name: string; color: string | null };
