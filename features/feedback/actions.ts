'use server';

import { db } from '@/db/drizzle';
import { feedback, member, workspace } from '@/db/schema';
import { requireSession, toActionError, type ActionResult } from '@/lib/authz';
import { APP_URL, sendFeedbackEmail } from '@/lib/email';
import { enforceRateLimit } from '@/lib/rate-limit';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { MAX_FEEDBACK_LENGTH } from './limits';

const feedbackSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Write a few words first.')
    .max(MAX_FEEDBACK_LENGTH, `Feedback can be up to ${MAX_FEEDBACK_LENGTH.toLocaleString('en-US')} characters.`),
  /** The app path they were on. Only a same-site path is kept. */
  page: z.string().max(500).optional(),
  workspaceSlug: z.string().max(100).optional(),
});

/** "/workspaces/acme/projects/x?task=y" stays; anything that isn't a plain app path is dropped. */
function samePath(page: string | undefined): string | null {
  if (!page || !page.startsWith('/') || page.startsWith('//')) return null;
  return page;
}

/**
 * E5: the feedback button. Saved first (so nothing is lost), then emailed to
 * FEEDBACK_EMAIL with the sender as reply-to. The workspace is only recorded
 * if the sender belongs to it.
 */
export async function sendFeedback(input: z.input<typeof feedbackSchema>): Promise<ActionResult> {
  try {
    const { message, page, workspaceSlug } = feedbackSchema.parse(input);
    const session = await requireSession();
    await enforceRateLimit('feedback', session.user.id);

    const [ws] = workspaceSlug
      ? await db
          .select({ id: workspace.id, name: workspace.name })
          .from(workspace)
          .innerJoin(member, and(eq(member.workspaceId, workspace.id), eq(member.userId, session.user.id)))
          .where(eq(workspace.slug, workspaceSlug))
          .limit(1)
      : [];

    const path = samePath(page);
    const [row] = await db
      .insert(feedback)
      .values({ userId: session.user.id, workspaceId: ws?.id ?? null, page: path, message })
      .returning({ id: feedback.id });

    const { sent } = await sendFeedbackEmail({
      fromName: session.user.name,
      fromEmail: session.user.email,
      workspaceName: ws?.name ?? null,
      pageUrl: path ? `${APP_URL}${path}` : null,
      message,
    });
    if (sent) await db.update(feedback).set({ emailedAt: new Date() }).where(eq(feedback.id, row.id));
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Couldn’t send your feedback. Please try again.');
  }
}
