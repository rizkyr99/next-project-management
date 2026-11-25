'use server';

import { db } from '@/db/drizzle';
import { comment, member, project, task, taskStatus, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import { headers } from 'next/headers';

export interface SearchResult {
  type: 'task' | 'project' | 'comment';
  id: string;
  title: string;
  subtitle: string;
  projectId: string;
  /** Set for tasks and comments: opens that task's sheet. */
  taskId?: string;
  workspaceSlug: string;
}

export async function searchWorkspace(query: string, workspaceSlug: string): Promise<SearchResult[]> {
  if (!query.trim() || query.length < 2) return [];

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return [];

  const term = `%${query.trim()}%`;

  // Resolve workspace and verify membership
  const [ws] = await db
    .select({ id: workspace.id })
    .from(workspace)
    .innerJoin(member, and(eq(member.workspaceId, workspace.id), eq(member.userId, session.user.id)))
    .where(eq(workspace.slug, workspaceSlug))
    .limit(1);

  if (!ws) return [];

  const workspaceProjects = await db
    .select({ id: project.id, name: project.name })
    .from(project)
    .where(eq(project.workspaceId, ws.id));

  const projectIds = workspaceProjects.map((p) => p.id);
  if (projectIds.length === 0) return [];

  const projectMap = Object.fromEntries(workspaceProjects.map((p) => [p.id, p.name]));

  const [tasks, projects, comments] = await Promise.all([
    db
      .select({
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        statusName: taskStatus.name,
      })
      .from(task)
      .innerJoin(taskStatus, eq(task.statusId, taskStatus.id))
      .where(and(inArray(task.projectId, projectIds), or(ilike(task.title, term), ilike(task.description, term))))
      .limit(8),

    db
      .select({ id: project.id, name: project.name, archived: project.archivedAt })
      .from(project)
      .where(and(eq(project.workspaceId, ws.id), ilike(project.name, term)))
      .limit(5),

    db
      .select({
        id: comment.id,
        body: comment.body,
        taskId: comment.taskId,
        taskTitle: task.title,
        projectId: task.projectId,
      })
      .from(comment)
      .innerJoin(task, eq(comment.taskId, task.id))
      .where(and(inArray(task.projectId, projectIds), ilike(comment.body, term)))
      .limit(5),
  ]);

  // Both queries are scoped to this workspace's projects in SQL.
  const taskResults: SearchResult[] = tasks.map((t) => ({
    type: 'task',
    id: t.id,
    title: t.title,
    subtitle: `${projectMap[t.projectId] ?? 'Unknown project'} · ${t.statusName}`,
    projectId: t.projectId,
    taskId: t.id,
    workspaceSlug,
  }));

  const projectResults: SearchResult[] = projects.map((p) => ({
    type: 'project',
    id: p.id,
    title: p.name,
    subtitle: p.archived ? 'Archived project' : 'Project',
    projectId: p.id,
    workspaceSlug,
  }));

  const commentResults: SearchResult[] = comments.map((c) => ({
    type: 'comment',
    id: c.id,
    title: c.body.length > 60 ? c.body.slice(0, 60) + '…' : c.body,
    subtitle: `Comment on: ${c.taskTitle}`,
    projectId: c.projectId,
    taskId: c.taskId,
    workspaceSlug,
  }));

  return [...taskResults, ...projectResults, ...commentResults];
}
