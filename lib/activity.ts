import { db } from '@/db/drizzle';
import { activityLog } from '@/db/schema';

export type ActivityAction =
  | 'task.created'
  | 'task.title_changed'
  | 'task.status_changed'
  | 'task.priority_changed'
  | 'task.due_date_changed'
  | 'task.assigned'
  | 'task.unassigned'
  | 'task.comment_added'
  | 'task.deleted'
  | 'project.created'
  | 'member.invited'
  | 'member.removed'
  | 'member.role_changed';

interface InsertActivityParams {
  workspaceId: string;
  actorId: string;
  action: ActivityAction;
  projectId?: string | null;
  taskId?: string | null;
  metadata?: Record<string, string>;
}

export async function insertActivity(params: InsertActivityParams) {
  try {
    await db.insert(activityLog).values({
      workspaceId: params.workspaceId,
      actorId: params.actorId,
      action: params.action,
      projectId: params.projectId ?? null,
      taskId: params.taskId ?? null,
      metadata: params.metadata,
    });
  } catch (error) {
    // Activity logging is non-critical — don't let it break the main action
    console.error('Failed to insert activity log:', error);
  }
}
