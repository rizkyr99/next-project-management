'use server';

import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/drizzle';
import { member, taskFollower, user } from '@/db/schema';
import { requireTaskAccess, toActionError, type ActionResult } from '@/lib/authz';
import { follow } from '@/lib/followers';

/** I4: following a task from its sheet. Team members only. */

const taskIdSchema = z.object({ taskId: z.string().min(1).max(64) });
const setSchema = taskIdSchema.extend({ following: z.boolean() });

export type FollowState = { following: boolean; followers: { id: string; name: string }[] };

/** Whether I follow the task, and who does (team members still in the workspace). */
export async function getFollowState(input: { taskId: string }): Promise<ActionResult<FollowState>> {
  try {
    const { taskId } = taskIdSchema.parse(input);
    const ctx = await requireTaskAccess(taskId);
    const followers = await db
      .select({ id: user.id, name: user.name })
      .from(taskFollower)
      .innerJoin(user, eq(user.id, taskFollower.userId))
      .innerJoin(
        member,
        and(eq(member.userId, taskFollower.userId), eq(member.workspaceId, ctx.workspace.id), ne(member.role, 'guest')),
      )
      .where(eq(taskFollower.taskId, ctx.task.id))
      .orderBy(taskFollower.createdAt);
    return { following: followers.some((f) => f.id === ctx.session.user.id), followers };
  } catch (error) {
    return toActionError(error, 'Could not load who follows this task.');
  }
}

export async function setFollowing(input: { taskId: string; following: boolean }): Promise<ActionResult> {
  try {
    const { taskId, following } = setSchema.parse(input);
    const ctx = await requireTaskAccess(taskId);
    if (following) {
      await follow(ctx.task.id, [ctx.session.user.id]);
    } else {
      await db
        .delete(taskFollower)
        .where(and(eq(taskFollower.taskId, ctx.task.id), eq(taskFollower.userId, ctx.session.user.id)));
    }
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not update following.');
  }
}
