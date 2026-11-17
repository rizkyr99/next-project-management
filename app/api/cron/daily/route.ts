import * as Sentry from '@sentry/nextjs';
import { timingSafeEqual } from 'node:crypto';
import { runCleanup, sendDueSoonReminders } from '@/lib/jobs';

export const dynamic = 'force-dynamic';
// Plenty for these set-based statements; well under Hobby's function limit.
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Fail closed: without a secret configured, nobody can trigger the job.
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily job (vercel.json, 08:00 UTC). Vercel Cron calls it with
 * `Authorization: Bearer $CRON_SECRET`. Each part runs independently, so one
 * failing doesn't skip the other.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const [reminders, cleanup] = await Promise.allSettled([sendDueSoonReminders(now), runCleanup(now)]);

  for (const [job, outcome] of [['due-soon', reminders], ['cleanup', cleanup]] as const) {
    if (outcome.status === 'rejected') {
      console.error(`[cron] ${job} failed:`, outcome.reason);
      Sentry.captureException(outcome.reason, { tags: { area: 'cron', job } });
    }
  }

  const body = {
    dueSoonReminders: reminders.status === 'fulfilled' ? reminders.value : null,
    cleanup: cleanup.status === 'fulfilled' ? cleanup.value : null,
  };
  console.info('[cron] daily', JSON.stringify(body));
  const failed = reminders.status === 'rejected' || cleanup.status === 'rejected';
  return Response.json(body, { status: failed ? 500 : 200 });
}
