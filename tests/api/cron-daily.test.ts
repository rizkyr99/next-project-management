import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/jobs', () => ({
  sendDueSoonReminders: vi.fn(),
  sendDailyDigests: vi.fn(),
  runCleanup: vi.fn(),
  sendTrialNotices: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';
import { runCleanup, sendDailyDigests, sendDueSoonReminders, sendTrialNotices } from '@/lib/jobs';
import { GET } from '@/app/api/cron/daily/route';

const SECRET = 'a-very-long-cron-secret-value';
const call = (authorization?: string) =>
  GET(new Request('http://localhost/api/cron/daily', authorization ? { headers: { authorization } } : {}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

const cleanup = {
  invitesExpired: 1,
  signalsDeleted: 0,
  staleParticipantsDeleted: 0,
  verificationsDeleted: 2,
  notificationsDeleted: 3,
};

describe('GET /api/cron/daily', () => {
  it('refuses a missing or wrong secret without running anything', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer nope')).status).toBe(401);
    expect((await call(SECRET)).status).toBe(401); // missing "Bearer "
    expect(sendDueSoonReminders).not.toHaveBeenCalled();
    expect(runCleanup).not.toHaveBeenCalled();
  });

  it('fails closed when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(401);
    expect(sendDueSoonReminders).not.toHaveBeenCalled();
  });

  it('runs every job and reports their counts', async () => {
    vi.mocked(sendDueSoonReminders).mockResolvedValue(4);
    vi.mocked(sendTrialNotices).mockResolvedValue({ ending: 1, ended: 0 });
    vi.mocked(sendDailyDigests).mockResolvedValue({ checked: 2, sent: 1 });
    vi.mocked(runCleanup).mockResolvedValue(cleanup);
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      dueSoonReminders: 4,
      digests: { checked: 2, sent: 1 },
      cleanup,
      trialNotices: { ending: 1, ended: 0 },
    });
    // Reminders finish before the digest is built, so they can be included.
    expect(vi.mocked(sendDueSoonReminders).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(sendDailyDigests).mock.invocationCallOrder[0],
    );
  });

  it('still runs cleanup when reminders fail, and reports the failure', async () => {
    vi.mocked(sendDueSoonReminders).mockRejectedValue(new Error('db down'));
    vi.mocked(sendTrialNotices).mockResolvedValue({ ending: 0, ended: 0 });
    vi.mocked(sendDailyDigests).mockResolvedValue({ checked: 0, sent: 0 });
    vi.mocked(runCleanup).mockResolvedValue(cleanup);
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      dueSoonReminders: null,
      digests: { checked: 0, sent: 0 },
      cleanup,
      trialNotices: { ending: 0, ended: 0 },
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { area: 'cron', job: 'due-soon' },
    });
  });
});
