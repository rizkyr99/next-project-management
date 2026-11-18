import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { ZodError } from 'zod';
import { db } from '@/db/drizzle';
import { comment, member, project, task, taskStatus, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { RateLimitError } from '@/lib/rate-limit';
import { tagSentryUser } from '@/lib/sentry-user';

/**
 * Authorization helpers for Server Actions and Route Handlers.
 *
 * Every helper resolves the resource *through* the caller's membership row in
 * a single joined query. If the resource does not exist, or exists in a
 * workspace the caller does not belong to, the helper throws `AuthzError`.
 * Both cases surface as the same "Not found" so callers cannot probe for the
 * existence of resources in other tenants.
 */

export type Role = 'owner' | 'admin' | 'member';

export interface AccessOptions {
  /** Restrict access to these roles. Omit to allow any member. */
  roles?: Role[];
}

/** No valid session. Thrown so callers fail loudly, as before. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthenticatedError';
  }
}

/** The resource doesn't exist or the caller may not access it. */
export class AuthzError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'AuthzError';
  }
}

function assertRole(role: Role, opts?: AccessOptions) {
  if (opts?.roles && !opts.roles.includes(role)) {
    throw new AuthzError();
  }
}

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new UnauthenticatedError();
  tagSentryUser(session.user);
  return session;
}

export type Session = Awaited<ReturnType<typeof requireSession>>;

export async function requireWorkspaceMember(
  workspaceId: string,
  opts?: AccessOptions,
) {
  const session = await requireSession();

  const [row] = await db
    .select({
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      role: member.role,
    })
    .from(workspace)
    .innerJoin(
      member,
      and(eq(member.workspaceId, workspace.id), eq(member.userId, session.user.id)),
    )
    .where(eq(workspace.id, workspaceId))
    .limit(1);

  if (!row) throw new AuthzError();
  assertRole(row.role, opts);

  const { role, ...ws } = row;
  return { session, workspace: ws, role };
}

export async function requireProjectAccess(projectId: string, opts?: AccessOptions) {
  const session = await requireSession();

  const [row] = await db
    .select({
      projectId: project.id,
      projectName: project.name,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      role: member.role,
    })
    .from(project)
    .innerJoin(workspace, eq(workspace.id, project.workspaceId))
    .innerJoin(
      member,
      and(eq(member.workspaceId, project.workspaceId), eq(member.userId, session.user.id)),
    )
    .where(eq(project.id, projectId))
    .limit(1);

  if (!row) throw new AuthzError();
  assertRole(row.role, opts);

  return {
    session,
    role: row.role,
    project: { id: row.projectId, name: row.projectName },
    workspace: { id: row.workspaceId, slug: row.workspaceSlug },
  };
}

export async function requireTaskAccess(taskId: string, opts?: AccessOptions) {
  const session = await requireSession();

  const [row] = await db
    .select({
      taskId: task.id,
      taskTitle: task.title,
      statusId: task.statusId,
      projectId: project.id,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      role: member.role,
    })
    .from(task)
    .innerJoin(project, eq(project.id, task.projectId))
    .innerJoin(workspace, eq(workspace.id, project.workspaceId))
    .innerJoin(
      member,
      and(eq(member.workspaceId, project.workspaceId), eq(member.userId, session.user.id)),
    )
    .where(eq(task.id, taskId))
    .limit(1);

  if (!row) throw new AuthzError();
  assertRole(row.role, opts);

  return {
    session,
    role: row.role,
    task: { id: row.taskId, title: row.taskTitle, statusId: row.statusId },
    project: { id: row.projectId },
    workspace: { id: row.workspaceId, slug: row.workspaceSlug },
  };
}

export async function requireCommentAccess(commentId: string, opts?: AccessOptions) {
  const session = await requireSession();

  const [row] = await db
    .select({
      commentId: comment.id,
      authorId: comment.authorId,
      taskId: comment.taskId,
      projectId: project.id,
      workspaceId: project.workspaceId,
      role: member.role,
    })
    .from(comment)
    .innerJoin(task, eq(task.id, comment.taskId))
    .innerJoin(project, eq(project.id, task.projectId))
    .innerJoin(
      member,
      and(eq(member.workspaceId, project.workspaceId), eq(member.userId, session.user.id)),
    )
    .where(eq(comment.id, commentId))
    .limit(1);

  if (!row) throw new AuthzError();
  assertRole(row.role, opts);

  return {
    session,
    role: row.role,
    comment: { id: row.commentId, authorId: row.authorId, taskId: row.taskId },
    project: { id: row.projectId },
    workspace: { id: row.workspaceId },
  };
}

export async function requireStatusAccess(statusId: string, opts?: AccessOptions) {
  const session = await requireSession();

  const [row] = await db
    .select({
      statusId: taskStatus.id,
      statusName: taskStatus.name,
      isDefault: taskStatus.isDefault,
      projectId: project.id,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      role: member.role,
    })
    .from(taskStatus)
    .innerJoin(project, eq(project.id, taskStatus.projectId))
    .innerJoin(workspace, eq(workspace.id, project.workspaceId))
    .innerJoin(
      member,
      and(eq(member.workspaceId, project.workspaceId), eq(member.userId, session.user.id)),
    )
    .where(eq(taskStatus.id, statusId))
    .limit(1);

  if (!row) throw new AuthzError();
  assertRole(row.role, opts);

  return {
    session,
    role: row.role,
    status: { id: row.statusId, name: row.statusName, isDefault: row.isDefault ?? false },
    project: { id: row.projectId },
    workspace: { id: row.workspaceId, slug: row.workspaceSlug },
  };
}

/** Throws unless `statusId` is a column of `projectId`. */
export async function assertStatusInProject(statusId: string, projectId: string) {
  const [row] = await db
    .select({ id: taskStatus.id })
    .from(taskStatus)
    .where(and(eq(taskStatus.id, statusId), eq(taskStatus.projectId, projectId)))
    .limit(1);
  if (!row) throw new AuthzError();
}

/** Throws unless every task in `taskIds` belongs to `projectId`. */
export async function assertTasksInProject(taskIds: string[], projectId: string) {
  const unique = [...new Set(taskIds)];
  if (unique.length === 0) return;
  const rows = await db
    .select({ id: task.id })
    .from(task)
    .where(and(inArray(task.id, unique), eq(task.projectId, projectId)));
  if (rows.length !== unique.length) throw new AuthzError();
}

/** Throws unless every user in `userIds` is a member of `workspaceId`. */
export async function assertWorkspaceMembers(userIds: string[], workspaceId: string) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const rows = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.workspaceId, workspaceId), inArray(member.userId, unique)));
  if (rows.length !== unique.length) throw new AuthzError();
}

export function projectPath(workspaceSlug: string, projectId: string) {
  return `/workspaces/${workspaceSlug}/projects/${projectId}`;
}

/**
 * Return type for mutations: either the success payload or `{ error }`.
 * Each side declares the other's keys as optional `undefined`, so callers can
 * read `result.error` (or `result.success`) without narrowing first.
 */
export type ActionResult<T extends object = { success: true }> =
  | (T & { error?: undefined })
  | ({ error: string } & { [K in keyof T]?: undefined });

/**
 * Converts an error thrown inside a Server Action into the `{ error }` shape
 * the UI already understands. Missing sessions are re-thrown, and unexpected
 * errors are logged and replaced with `fallback` so internals never leak.
 */
/** What a server action returns when the caller's session has gone. */
export const SESSION_EXPIRED = 'Your session has expired. Log in again to continue.';

/**
 * Maps any error from a server action to a message the UI can show as a toast.
 * Actions never throw to the client: a thrown action error makes Next.js show
 * its generic "An error occurred in the Server Components render" screen.
 */
export function toActionError(error: unknown, fallback: string): { error: string } {
  if (error instanceof UnauthenticatedError) return { error: SESSION_EXPIRED };
  if (error instanceof AuthzError) return { error: 'Not found.' };
  if (error instanceof RateLimitError) return { error: error.message };
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? 'Invalid input.' };
  }
  console.error(fallback, error);
  return { error: fallback };
}

/**
 * Runs a server action body and returns `{ error }` instead of throwing.
 * Next.js control flow (redirect(), notFound()) still passes through.
 */
export async function runAction<T>(fallback: string, body: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await body();
  } catch (error) {
    unstable_rethrow(error);
    return toActionError(error, fallback);
  }
}

/**
 * Converts an error thrown inside a Route Handler into an HTTP response:
 * 401 without a session, 400 for invalid input, 404 for anything the caller
 * may not access. Unexpected errors are re-thrown so Sentry captures them.
 */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof UnauthenticatedError) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return new Response('Invalid request', { status: 400 });
  }
  if (error instanceof AuthzError) {
    return new Response('Not found', { status: 404 });
  }
  throw error;
}
