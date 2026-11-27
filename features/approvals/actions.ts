'use server';

import z from 'zod';
import { after } from 'next/server';
import { aliasedTable, and, desc, eq, ne } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { notification, projectGuest, taskApproval, taskAssignee, member, user } from '@/db/schema';
import { insertActivity } from '@/lib/activity';
import { emailTaskNotification } from '@/lib/notification-emails';
import { enforceRateLimit } from '@/lib/rate-limit';
import { planGateProblem } from '@/lib/subscription';
import { type ActionResult, requireTaskAccess, toActionError } from '@/lib/authz';
import { taskHref } from '@/features/tasks/task-link';
import { MAX_APPROVAL_NOTE, type ApprovalStatus } from './states';

// Who may do what:
//   - the team (owner, admin, member) asks for and withdraws approval;
//   - only the project's guests (clients) answer. requireTaskAccess refuses a
//     guest unless the call opts in, and only on a project shared with them.

const noteSchema = z.string().trim().max(MAX_APPROVAL_NOTE, `Keep it under ${MAX_APPROVAL_NOTE} characters.`);

export type ApprovalRound = {
  id: string;
  status: ApprovalStatus;
  message: string | null;
  responseNote: string | null;
  createdAt: Date;
  respondedAt: Date | null;
  requestedBy: string | null;
  respondedBy: string | null;
};

const requester = aliasedTable(user, 'requester');
const responder = aliasedTable(user, 'responder');

/** A task's approval rounds, newest first. Guests don't see withdrawn ones. */
export async function getTaskApprovals(taskId: string): Promise<ActionResult<{ rounds: ApprovalRound[] }>> {
  try {
    const ctx = await requireTaskAccess(z.uuid().parse(taskId), { allowGuests: true });
    const rounds = await db
      .select({
        id: taskApproval.id,
        status: taskApproval.status,
        message: taskApproval.message,
        responseNote: taskApproval.responseNote,
        createdAt: taskApproval.createdAt,
        respondedAt: taskApproval.respondedAt,
        requestedBy: requester.name,
        respondedBy: responder.name,
      })
      .from(taskApproval)
      .leftJoin(requester, eq(requester.id, taskApproval.requestedById))
      .leftJoin(responder, eq(responder.id, taskApproval.respondedById))
      .where(
        and(
          eq(taskApproval.taskId, ctx.task.id),
          ctx.role === 'guest' ? ne(taskApproval.status, 'cancelled') : undefined,
        ),
      )
      .orderBy(desc(taskApproval.createdAt))
      .limit(20);
    return { rounds };
  } catch (error) {
    return toActionError(error, 'Could not load approvals.');
  }
}

const requestSchema = z.object({ taskId: z.uuid(), message: noteSchema.optional() });

/** The team asks the project's client to approve a task. */
export async function requestApproval(input: { taskId: string; message?: string }): Promise<ActionResult> {
  try {
    const { taskId, message } = requestSchema.parse(input);
    const ctx = await requireTaskAccess(taskId);
    await enforceRateLimit('comments', ctx.session.user.id);
    const gated = await planGateProblem(ctx.workspace.id, 'approvals');
    if (gated) return { error: gated };
    // C2: the client can't see an internal task, so can't be asked about it.
    if (ctx.task.internal) return { error: 'This task is internal. Show it to the client first, then ask for approval.' };

    const guests = await db
      .select({ id: projectGuest.userId })
      .from(projectGuest)
      .innerJoin(member, and(eq(member.userId, projectGuest.userId), eq(member.workspaceId, ctx.workspace.id)))
      .where(and(eq(projectGuest.projectId, ctx.project.id), eq(member.role, 'guest')));
    if (guests.length === 0) {
      return { error: 'Share this project with a client first: only clients can approve.' };
    }

    // The partial unique index allows one waiting round per task.
    const created = await db
      .insert(taskApproval)
      .values({ taskId: ctx.task.id, requestedById: ctx.session.user.id, message: message || null })
      .onConflictDoNothing()
      .returning({ id: taskApproval.id });
    if (created.length === 0) return { error: 'This task is already waiting for approval.' };

    const href = taskHref(ctx.workspace.slug, ctx.project.id, ctx.task.id);
    await db.insert(notification).values(
      guests.map((g) => ({
        userId: g.id,
        type: 'approval_requested' as const,
        actorName: ctx.session.user.name,
        taskTitle: ctx.task.title,
        workspaceId: ctx.workspace.id,
        projectId: ctx.project.id,
        taskId: ctx.task.id,
        href,
      })),
    );
    after(() =>
      emailTaskNotification({
        projectId: ctx.project.id,
        kind: 'approval_requested',
        userIds: guests.map((g) => g.id),
        actorName: ctx.session.user.name,
        taskTitle: ctx.task.title,
        href,
        excerpt: message || undefined,
      }),
    );
    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: 'task.approval_requested',
      projectId: ctx.project.id,
      taskId: ctx.task.id,
      metadata: { taskTitle: ctx.task.title },
    });
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not ask for approval.');
  }
}

/** The team withdraws a request the client hasn't answered yet. */
export async function withdrawApproval(taskId: string): Promise<ActionResult> {
  try {
    const ctx = await requireTaskAccess(z.uuid().parse(taskId));
    const withdrawn = await db
      .update(taskApproval)
      .set({ status: 'cancelled', respondedById: ctx.session.user.id, respondedAt: new Date() })
      .where(and(eq(taskApproval.taskId, ctx.task.id), eq(taskApproval.status, 'pending')))
      .returning({ id: taskApproval.id });
    if (withdrawn.length === 0) return { error: 'There’s no request waiting on this task.' };

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: 'task.approval_withdrawn',
      projectId: ctx.project.id,
      taskId: ctx.task.id,
      metadata: { taskTitle: ctx.task.title },
    });
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not withdraw the request.');
  }
}

const respondSchema = z
  .object({
    taskId: z.uuid(),
    decision: z.enum(['approved', 'changes_requested']),
    note: noteSchema.optional(),
  })
  .refine((v) => v.decision === 'approved' || (v.note ?? '').length > 0, {
    message: 'Say what should change.',
    path: ['note'],
  });

/** A client approves the waiting request, or asks for changes (with a note). */
export async function respondToApproval(input: {
  taskId: string;
  decision: 'approved' | 'changes_requested';
  note?: string;
}): Promise<ActionResult> {
  try {
    const { taskId, decision, note } = respondSchema.parse(input);
    const ctx = await requireTaskAccess(taskId, { allowGuests: true });
    if (ctx.role !== 'guest') return { error: 'Only the client can answer an approval request.' };

    // Conditional on still waiting: a withdrawn or already answered request
    // can't be answered (twice).
    const [answered] = await db
      .update(taskApproval)
      .set({ status: decision, respondedById: ctx.session.user.id, respondedAt: new Date(), responseNote: note || null })
      .where(and(eq(taskApproval.taskId, ctx.task.id), eq(taskApproval.status, 'pending')))
      .returning({ requestedById: taskApproval.requestedById });
    if (!answered) return { error: 'This request was already answered or withdrawn.' };

    // Tell the person who asked and the task's assignees (all team members).
    const assignees = await db
      .select({ id: taskAssignee.userId })
      .from(taskAssignee)
      .innerJoin(member, and(eq(member.userId, taskAssignee.userId), eq(member.workspaceId, ctx.workspace.id)))
      .where(and(eq(taskAssignee.taskId, ctx.task.id), ne(member.role, 'guest')));
    const recipients = [
      ...new Set([answered.requestedById, ...assignees.map((a) => a.id)].filter((id): id is string => !!id)),
    ].filter((id) => id !== ctx.session.user.id);

    const href = taskHref(ctx.workspace.slug, ctx.project.id, ctx.task.id);
    if (recipients.length > 0) {
      await db.insert(notification).values(
        recipients.map((userId) => ({
          userId,
          type: decision === 'approved' ? ('task_approved' as const) : ('changes_requested' as const),
          actorName: ctx.session.user.name,
          taskTitle: ctx.task.title,
          workspaceId: ctx.workspace.id,
          projectId: ctx.project.id,
          taskId: ctx.task.id,
          href,
        })),
      );
      after(() =>
        emailTaskNotification({
          projectId: ctx.project.id,
          kind: decision,
          userIds: recipients,
          actorName: ctx.session.user.name,
          taskTitle: ctx.task.title,
          href,
          excerpt: note || undefined,
        }),
      );
    }
    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: decision === 'approved' ? 'task.approved' : 'task.changes_requested',
      projectId: ctx.project.id,
      taskId: ctx.task.id,
      metadata: { taskTitle: ctx.task.title },
    });
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not send your answer.');
  }
}
