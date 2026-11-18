import { sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { callRoomSchema, MAX_CALL_PARTICIPANTS } from '@/features/call/schema';
import { requireProjectAccess, toErrorResponse } from '@/lib/authz';
import { staleBefore } from '@/lib/call-presence';

export async function POST(request: Request) {
  try {
    const { projectId } = callRoomSchema.parse(await request.json());
    const { session, project } = await requireProjectAccess(projectId);
    const userId = session.user.id;

    // Under a lock on the project row, so two people joining at once can't
    // both take the last place. Someone already in the call (e.g. rejoining
    // after a network blip) always gets back in.
    const [, , refreshed, inserted] = await db.batch([
      db.execute(sql`select id from project where id = ${project.id} for update`),
      db.execute(sql`delete from call_participant where project_id = ${project.id} and last_seen < ${staleBefore}`),
      db.execute(sql`
        update call_participant set last_seen = now()
        where project_id = ${project.id} and user_id = ${userId}
        returning id`),
      db.execute(sql`
        insert into call_participant (id, project_id, user_id, joined_at, last_seen)
        select ${crypto.randomUUID()}, ${project.id}, ${userId}, now(), now()
        where not exists (
          select 1 from call_participant where project_id = ${project.id} and user_id = ${userId}
        )
        and (select count(*) from call_participant where project_id = ${project.id}) < ${MAX_CALL_PARTICIPANTS}
        returning id`),
    ]);

    if (refreshed.rows.length === 0 && inserted.rows.length === 0) {
      return Response.json(
        { error: `This call is full (${MAX_CALL_PARTICIPANTS} people max). Try again when someone leaves.` },
        { status: 409 },
      );
    }
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
