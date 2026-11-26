import { db } from '@/db/drizzle';
import { checklistItem, label, member, project, task, taskLabel, taskStatus, workspace } from '@/db/schema';
import { insertActivity } from '@/lib/activity';
import { requireSession, toErrorResponse } from '@/lib/authz';
import { enforceRateLimit, RateLimitError } from '@/lib/rate-limit';
import { importSchema, importToRows } from '@/features/import/shape';
import { safeTimeZone } from '@/features/templates/dates';
import { MAX_LABELS_PER_WORKSPACE } from '@/features/labels/schema';
import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

/** Vercel's request limit; a Trello export is read in the browser, so only its tasks are sent. */
const MAX_BODY_BYTES = 4_500_000;

/**
 * D4: a new project from a Trello board or a CSV file. The browser parses the
 * file (features/import/parse.ts) and posts the result here, checked again
 * and written in one batch. Team members only. Posted to a route rather than
 * a server action, whose body limit is 1 MB.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    // JSON only: a cross-site form can't send it without a CORS preflight.
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      return Response.json({ error: 'Send the import as JSON.' }, { status: 415 });
    }
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_BODY_BYTES) {
      return Response.json({ error: 'That file is too large to import. Split it into smaller projects.' }, { status: 413 });
    }

    const parsed = importSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? 'The file couldn’t be imported.' }, { status: 400 });
    }
    const data = parsed.data;
    const userId = session.user.id;

    const [membership] = await db
      .select({ workspaceId: workspace.id })
      .from(workspace)
      .innerJoin(member, eq(member.workspaceId, workspace.id))
      .where(and(eq(workspace.slug, data.workspaceSlug), eq(member.userId, userId), ne(member.role, 'guest')))
      .limit(1);
    if (!membership) return Response.json({ error: 'Workspace not found.' }, { status: 404 });

    await enforceRateLimit('templates', userId);

    const existingLabels = await db
      .select({ id: label.id, name: label.name })
      .from(label)
      .where(eq(label.workspaceId, membership.workspaceId));
    const projectId = crypto.randomUUID();
    const rows = importToRows(data, {
      projectId,
      workspaceId: membership.workspaceId,
      timeZone: safeTimeZone(data.timeZone),
      existingLabels,
      labelSlots: Math.max(0, MAX_LABELS_PER_WORKSPACE - existingLabels.length),
    });

    // Postgres takes up to 65535 parameters per statement; chunk the big inserts.
    const chunks = <T,>(list: T[], size: number) =>
      Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

    await db.batch([
      db
        .insert(project)
        .values({ id: projectId, name: data.name, description: data.description || null, workspaceId: membership.workspaceId }),
      db.insert(taskStatus).values(rows.statuses),
      ...(rows.labels.length ? [db.insert(label).values(rows.labels)] : []),
      ...chunks(rows.tasks, 500).map((c) => db.insert(task).values(c)),
      ...chunks(rows.taskLabels, 2000).map((c) => db.insert(taskLabel).values(c)),
      ...chunks(rows.checklist, 2000).map((c) => db.insert(checklistItem).values(c)),
    ]);

    await insertActivity({
      workspaceId: membership.workspaceId,
      actorId: userId,
      action: 'project.created',
      projectId,
      metadata: { projectName: data.name, importedFrom: data.source === 'trello' ? 'Trello' : 'CSV' },
    });

    revalidatePath(`/workspaces/${data.workspaceSlug}`, 'layout');
    return Response.json({
      projectId,
      tasks: rows.tasks.length,
      labelsLeftOff: rows.labelsLeftOff.length,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    return toErrorResponse(error);
  }
}

