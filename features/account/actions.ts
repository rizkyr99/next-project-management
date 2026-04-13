'use server';

import { db } from '@/db/drizzle';
import { user } from '@/db/schema';
import { auth } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

export async function updateProfile(values: z.infer<typeof updateProfileSchema>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Unauthorized');

  const validated = updateProfileSchema.parse(values);

  await db
    .update(user)
    .set({ name: validated.name })
    .where(eq(user.id, session.user.id));

  revalidatePath('/', 'layout');
  return { success: true };
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export async function changePassword(
  values: z.infer<typeof changePasswordSchema>,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Unauthorized');

  const validated = changePasswordSchema.parse(values);

  try {
    await auth.api.changePassword({
      headers: await headers(),
      body: {
        currentPassword: validated.currentPassword,
        newPassword: validated.newPassword,
        revokeOtherSessions: false,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to change password';
    return { error: message };
  }

  return { success: true };
}
