import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/notifications', () => ({ deleteExpiredNotifications: vi.fn() }));
const email = vi.hoisted(() => ({ sendTrialNoticeEmail: vi.fn(), sendDailyDigestEmail: vi.fn() }));
vi.mock('@/lib/email', () => ({ ...email, APP_URL: 'https://tide.test' }));

import { sendTrialNotices } from '@/lib/jobs';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'ws-1',
  name: 'Northwind Studio',
  slug: 'northwind',
  trial_ends_at: '2026-12-10T09:00:00.000Z',
  email: 'owner@gmail.com',
  owner_name: 'Ada Lovelace',
  team: 3,
  ...over,
});

beforeEach(() => vi.resetAllMocks());

describe('sendTrialNotices (E2)', () => {
  it('emails the owner what Pro would cost and where to upgrade, for each claimed workspace', async () => {
    db.execute
      .mockResolvedValueOnce({ rows: [row()] }) // ending
      .mockResolvedValueOnce({ rows: [] }); // ended
    email.sendTrialNoticeEmail.mockResolvedValue({ sent: true });

    expect(await sendTrialNotices(new Date('2026-12-07T08:00:00Z'))).toEqual({ ending: 1, ended: 0 });
    expect(email.sendTrialNoticeEmail).toHaveBeenCalledWith('owner@gmail.com', {
      kind: 'ending',
      ownerName: 'Ada',
      workspaceName: 'Northwind Studio',
      endsOn: 'December 10',
      priceLine: '$27 a month (3 team members × $9)',
      billingUrl: 'https://tide.test/workspaces/northwind/settings?tab=billing',
    });
    // Claimed, sent, nothing released.
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it('releases the claim when the email isn’t sent, so the next run retries', async () => {
    db.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row({ team: 1 })] })
      .mockResolvedValueOnce({ rows: [] }); // the release
    email.sendTrialNoticeEmail.mockResolvedValue({ sent: false });

    expect(await sendTrialNotices(new Date('2026-12-11T08:00:00Z'))).toEqual({ ending: 0, ended: 0 });
    expect(email.sendTrialNoticeEmail).toHaveBeenCalledWith(
      'owner@gmail.com',
      expect.objectContaining({ kind: 'ended', priceLine: '$9 a month (1 team member × $9)' }),
    );
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it('treats a throwing send like a failed one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.execute
      .mockResolvedValueOnce({ rows: [row()] })
      .mockResolvedValueOnce({ rows: [] }) // the release
      .mockResolvedValueOnce({ rows: [] });
    email.sendTrialNoticeEmail.mockRejectedValue(new Error('resend down'));
    expect(await sendTrialNotices()).toEqual({ ending: 0, ended: 0 });
    expect(db.execute).toHaveBeenCalledTimes(3);
  });
});
