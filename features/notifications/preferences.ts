'use server';

import { db } from '@/db/drizzle';
import { userPreferences } from '@/db/schema';
import { requireSession, toActionError, type ActionResult } from '@/lib/authz';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const preferencesSchema = z
  .object({
    emailOnAssign: z.boolean(),
    emailOnMention: z.boolean(),
    emailDigest: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

/** Saves one or more email preferences for the signed-in user (creating the row if needed). */
export async function updateEmailPreferences(
  values: z.input<typeof preferencesSchema>,
): Promise<ActionResult> {
  try {
    const input = preferencesSchema.parse(values);
    const session = await requireSession();
    await db
      .insert(userPreferences)
      .values({ userId: session.user.id, ...input })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { ...input, updatedAt: new Date() } });
    revalidatePath('/settings/notifications');
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to save your preferences.');
  }
}
