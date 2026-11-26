import 'server-only';
import { db } from '@/db/drizzle';
import { attachment, member, project } from '@/db/schema';
import { insertActivity } from '@/lib/activity';
import { PLAN_DETAILS } from '@/lib/plans';
import { getUserPlan } from '@/lib/subscription';
import { sniffImageType } from '@/lib/uploads';
import { and, eq, sum } from 'drizzle-orm';
import { readFirstBytes } from '@/lib/storage';

/**
 * Bytes stored for a workspace's projects, and what its plan allows. The
 * limit follows the workspace owner's plan: they're the one who pays.
 */
export async function workspaceStorage(workspaceId: string): Promise<{ used: number; limit: number }> {
  const [[usage], [owner]] = await db.batch([
    db
      .select({ used: sum(attachment.size) })
      .from(attachment)
      .innerJoin(project, eq(project.id, attachment.projectId))
      .where(eq(project.workspaceId, workspaceId)),
    db
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.workspaceId, workspaceId), eq(member.role, 'owner')))
      .limit(1),
  ]);
  const plan = owner ? await getUserPlan(owner.userId) : 'free';
  return { used: Number(usage?.used ?? 0), limit: PLAN_DETAILS[plan].storageBytes };
}

/** The message when `incoming` more bytes won't fit, or null when they will. */
export async function storageProblem(workspaceId: string, incoming: number): Promise<string | null> {
  const { used, limit } = await workspaceStorage(workspaceId);
  if (used + incoming <= limit) return null;
  return 'This workspace is out of file storage. Delete files you no longer need, or ask the owner to upgrade the plan.';
}

export interface TaskFileCtx {
  session: { user: { id: string } };
  role: string;
  task: { id: string; title: string };
  project: { id: string };
  workspace: { id: string };
}

/**
 * Records a file already in storage at `key` as listed on the task. Images
 * whose bytes prove their type are kept as that type (so they can show
 * inline); everything else is stored as a plain download. A client's own
 * uploads are visible to the client; the team's start internal.
 */
export async function recordTaskFile(
  ctx: TaskFileCtx,
  file: { id: string; key: string; name: string; size: number },
) {
  const head = await readFirstBytes(file.key, 16);
  const contentType = sniffImageType(head) ?? 'application/octet-stream';
  const [row] = await db
    .insert(attachment)
    .values({
      id: file.id,
      projectId: ctx.project.id,
      taskId: ctx.task.id,
      uploadedById: ctx.session.user.id,
      storageKey: file.key,
      name: file.name,
      contentType,
      size: file.size,
      listed: true,
      clientVisible: ctx.role === 'guest',
    })
    .onConflictDoNothing()
    .returning({ id: attachment.id });
  if (!row) return null;
  await insertActivity({
    workspaceId: ctx.workspace.id,
    actorId: ctx.session.user.id,
    action: 'task.file_added',
    projectId: ctx.project.id,
    taskId: ctx.task.id,
    metadata: { taskTitle: ctx.task.title, fileName: file.name },
  });
  return row;
}
