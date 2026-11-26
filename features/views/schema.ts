import { z } from 'zod';

export const MAX_SAVED_VIEWS_PER_PROJECT = 20;

export const createSavedViewSchema = z.object({
  projectId: z.string().min(1).max(64),
  name: z.string().trim().min(1, 'Name the view.').max(60, 'Names can be up to 60 characters.'),
  query: z.string().trim().min(1, 'Set a filter, sort or layout to save first.').max(1000),
});

export const deleteSavedViewSchema = z.object({ viewId: z.string().min(1).max(64) });
