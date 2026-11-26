import 'server-only';
import { db } from '@/db/drizzle';
import { comment, member, project, task, taskApproval, taskAssignee, taskStatus, user } from '@/db/schema';
import type { ApprovalState } from '@/features/approvals/states';
import type { ProjectStatus } from '@/features/projects/details';
import type { Priority } from '@/features/tasks/priority';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';
import type { OverviewProject } from './attention';

/**
 * D1: what the studio overview shows, for the team (never for clients).
 * Times aren't grouped here: the browser does that in the viewer's time
 * zone, so the server sends a little more than a week ahead.
 */

const LOOKAHEAD_DAYS = 8;
const FEEDBACK_DAYS = 14;
const MAX_DUE_TASKS = 200;

/** A task is done when it's in its project's last column (lib/jobs.ts uses the same rule). */
const lastColumnId = sql`(select s.id from ${taskStatus} s where s.project_id = ${task.projectId} order by s."order" desc limit 1)`;

export interface DueTask {
  id: string;
  title: string;
  priority: Priority;
  dueDate: Date;
  dueHasTime: boolean;
  projectId: string;
  projectName: string;
  assignees: { id: string; name: string; image: string | null }[];
}

export interface WaitingApproval {
  taskId: string;
  title: string;
  projectId: string;
  projectName: string;
  requestedAt: Date;
}

export interface FeedbackItem {
  key: string;
  kind: 'approved' | 'changes_requested' | 'comment';
  who: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  text: string | null;
  at: Date;
}

export async function studioOverview(workspaceId: string, now = new Date()) {
  const until = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const since = new Date(now.getTime() - FEEDBACK_DAYS * 24 * 60 * 60 * 1000);
  const active = and(eq(project.workspaceId, workspaceId), isNull(project.archivedAt));

  const [projects, progress, dueRows, waiting, answered, clientComments] = await Promise.all([
    db
      .select({
        id: project.id,
        name: project.name,
        description: project.description,
        clientName: project.clientName,
        deadline: project.deadline,
        status: project.status,
      })
      .from(project)
      .where(active)
      .orderBy(asc(project.name)),
    db
      .select({
        projectId: task.projectId,
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${task.statusId} = ${lastColumnId})::int`,
      })
      .from(task)
      .innerJoin(project, eq(project.id, task.projectId))
      .where(active)
      .groupBy(task.projectId),
    // Open tasks due within the look-ahead, overdue ones included.
    db
      .select({
        id: task.id,
        title: task.title,
        priority: task.priority,
        dueDate: task.dueDate,
        dueHasTime: task.dueHasTime,
        projectId: project.id,
        projectName: project.name,
      })
      .from(task)
      .innerJoin(project, eq(project.id, task.projectId))
      .where(and(active, isNotNull(task.dueDate), lte(task.dueDate, until), ne(task.statusId, lastColumnId)))
      .orderBy(asc(task.dueDate))
      .limit(MAX_DUE_TASKS),
    db
      .select({
        taskId: task.id,
        title: task.title,
        projectId: project.id,
        projectName: project.name,
        requestedAt: taskApproval.createdAt,
      })
      .from(taskApproval)
      .innerJoin(task, eq(task.id, taskApproval.taskId))
      .innerJoin(project, eq(project.id, task.projectId))
      .where(and(active, eq(taskApproval.status, 'pending')))
      .orderBy(asc(taskApproval.createdAt))
      .limit(20),
    db
      .select({
        id: taskApproval.id,
        status: taskApproval.status,
        note: taskApproval.responseNote,
        at: taskApproval.respondedAt,
        who: user.name,
        taskId: task.id,
        taskTitle: task.title,
        projectId: project.id,
        projectName: project.name,
      })
      .from(taskApproval)
      .innerJoin(task, eq(task.id, taskApproval.taskId))
      .innerJoin(project, eq(project.id, task.projectId))
      .leftJoin(user, eq(user.id, taskApproval.respondedById))
      .where(
        and(
          active,
          inArray(taskApproval.status, ['approved', 'changes_requested']),
          gte(taskApproval.respondedAt, since),
        ),
      )
      .orderBy(desc(taskApproval.respondedAt))
      .limit(10),
    // Comments the client wrote (a guest's comments are always client-visible).
    db
      .select({
        id: comment.id,
        body: comment.body,
        at: comment.createdAt,
        who: user.name,
        taskId: task.id,
        taskTitle: task.title,
        projectId: project.id,
        projectName: project.name,
      })
      .from(comment)
      .innerJoin(task, eq(task.id, comment.taskId))
      .innerJoin(project, eq(project.id, task.projectId))
      .innerJoin(user, eq(user.id, comment.authorId))
      .innerJoin(member, and(eq(member.userId, comment.authorId), eq(member.workspaceId, workspaceId)))
      .where(and(active, eq(member.role, 'guest'), gte(comment.createdAt, since)))
      .orderBy(desc(comment.createdAt))
      .limit(10),
  ]);

  const assigneeRows =
    dueRows.length === 0
      ? []
      : await db
          .select({ taskId: taskAssignee.taskId, id: user.id, name: user.name, image: user.image })
          .from(taskAssignee)
          .innerJoin(user, eq(user.id, taskAssignee.userId))
          .where(inArray(taskAssignee.taskId, dueRows.map((t) => t.id)));
  const assigneesByTask = new Map<string, DueTask['assignees']>();
  for (const { taskId, ...a } of assigneeRows) {
    assigneesByTask.set(taskId, [...(assigneesByTask.get(taskId) ?? []), a]);
  }

  const progressByProject = new Map(progress.map((p) => [p.projectId, p]));
  const overviewProjects: (OverviewProject & { description: string | null })[] = projects.map((p) => ({
    ...p,
    status: p.status as ProjectStatus | null,
    totalTasks: progressByProject.get(p.id)?.total ?? 0,
    doneTasks: progressByProject.get(p.id)?.done ?? 0,
  }));

  const feedback: FeedbackItem[] = [
    ...answered.map((a) => ({
      key: `approval-${a.id}`,
      kind: a.status as Extract<ApprovalState, 'approved' | 'changes_requested'>,
      who: a.who ?? 'The client',
      taskId: a.taskId,
      taskTitle: a.taskTitle,
      projectId: a.projectId,
      projectName: a.projectName,
      text: a.note,
      at: a.at ?? now,
    })),
    ...clientComments.map((c) => ({
      key: `comment-${c.id}`,
      kind: 'comment' as const,
      who: c.who,
      taskId: c.taskId,
      taskTitle: c.taskTitle,
      projectId: c.projectId,
      projectName: c.projectName,
      text: c.body,
      at: c.at,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);

  const dueTasks: DueTask[] = dueRows.map((t) => ({
    ...t,
    dueDate: t.dueDate!,
    assignees: assigneesByTask.get(t.id) ?? [],
  }));

  return { projects: overviewProjects, dueTasks, waiting: waiting as WaitingApproval[], feedback };
}

export type StudioOverviewData = Awaited<ReturnType<typeof studioOverview>>;
