'use server';

import { db } from '@/db/drizzle';
import { account, subscription, user } from '@/db/schema';
import { getOwnedWorkspaces, type OwnedWorkspace } from '@/lib/account';
import { auth } from '@/lib/auth';
import { requireSession, toActionError } from '@/lib/authz';
import { enforceRateLimit } from '@/lib/rate-limit';
import { stripe } from '@/lib/stripe';
import { and, eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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

const deleteAccountSchema = z.object({
  email: z.string().trim().max(320),
  password: z.string().max(1024).optional(),
});

/** Subscriptions in these states can still bill, so they're cancelled first. */
const BILLABLE = new Set(['active', 'trialing', 'past_due', 'incomplete', 'unpaid']);

function isMissingStripeResource(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'resource_missing'
  );
}

/**
 * Permanently deletes the signed-in user's account.
 *
 * 1. Re-confirms identity: the account email typed out, plus the password
 *    when the account has one (rate limited).
 * 2. Refuses while they own a workspace that has other members; those must
 *    be transferred (P2.4) or deleted first. Workspaces only they are in are
 *    deleted with the account.
 * 3. Cancels a billable Stripe subscription; if that fails, nothing is deleted.
 * 4. Signs out and deletes the user. Foreign keys cascade to sessions,
 *    memberships, owned workspaces, comments, assignments and notifications.
 */
export async function deleteAccount(
  values: z.input<typeof deleteAccountSchema>,
): Promise<{ error: string; blockingWorkspaces?: OwnedWorkspace[] } | void> {
  try {
    const input = deleteAccountSchema.parse(values);
    const session = await requireSession();
    const userId = session.user.id;

    if (input.email.toLowerCase() !== session.user.email.toLowerCase()) {
      return { error: 'Type your account email exactly to confirm.' };
    }

    const [credential] = await db
      .select({ password: account.password })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
      .limit(1);
    if (credential?.password) {
      await enforceRateLimit('accountDelete', userId);
      const ctx = await auth.$context;
      const ok =
        Boolean(input.password) &&
        (await ctx.password.verify({ hash: credential.password, password: input.password! }));
      if (!ok) return { error: 'Incorrect password.' };
    }

    const blockingWorkspaces = (await getOwnedWorkspaces(userId)).filter((w) => w.otherMembers > 0);
    if (blockingWorkspaces.length > 0) {
      return {
        error: 'You own workspaces that other people use. Transfer ownership or delete them first.',
        blockingWorkspaces,
      };
    }

    const [sub] = await db
      .select({ id: subscription.stripeSubscriptionId, status: subscription.status })
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);
    if (sub?.id && sub.status && BILLABLE.has(sub.status)) {
      try {
        await stripe.subscriptions.cancel(sub.id);
      } catch (error) {
        // Already gone on Stripe's side is fine; anything else stops here so
        // a deleted account is never left with a live subscription.
        if (!isMissingStripeResource(error)) {
          console.error('[account] subscription cancel failed:', error);
          return { error: "We couldn't cancel your subscription, so nothing was deleted. Please try again." };
        }
      }
    }

    // Deleting the user cascades to its session rows; also drop the auth
    // cookies so the browser doesn't keep sending a dead token.
    await db.delete(user).where(eq(user.id, userId));
    const jar = await cookies();
    for (const { name } of jar.getAll()) {
      if (/^(__Secure-)?better-auth\./.test(name)) jar.delete(name);
    }
  } catch (error) {
    return toActionError(error, 'Failed to delete your account.');
  }

  redirect('/login?deleted=1');
}
