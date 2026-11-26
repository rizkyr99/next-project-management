import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/rate-limit', async (orig) => ({ ...(await orig<typeof import('@/lib/rate-limit')>()), enforceRateLimit: vi.fn() }));
const email = vi.hoisted(() => ({ sendFeedbackEmail: vi.fn() }));
vi.mock('@/lib/email', () => ({ ...email, APP_URL: 'https://tide.test' }));

import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sendFeedback } from '@/features/feedback/actions';
import { feedbackSubject } from '@/emails/feedback';

const session = { user: { id: 'u-1', name: 'Fay', email: 'fay@gmail.com' } };

function captureInsert() {
  const values = vi.fn();
  db.insert.mockReturnValue({ values: (v: unknown) => (values(v), { returning: async () => [{ id: 'fb-1' }] }) });
  return values;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue(session as never);
  db.update.mockReturnValue(chain(undefined));
});

describe('sendFeedback (E5)', () => {
  it('saves first, then emails with the page and workspace, and marks it emailed', async () => {
    db.select.mockReturnValue(chain([{ id: 'ws-1', name: 'Northwind' }]));
    const values = captureInsert();
    email.sendFeedbackEmail.mockResolvedValue({ sent: true });

    expect(
      await sendFeedback({ message: '  Love it  ', page: '/workspaces/nw/projects/p?task=t', workspaceSlug: 'nw' }),
    ).toEqual({ success: true });
    expect(enforceRateLimit).toHaveBeenCalledWith('feedback', 'u-1');
    expect(values).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      page: '/workspaces/nw/projects/p?task=t',
      message: 'Love it',
    });
    expect(email.sendFeedbackEmail).toHaveBeenCalledWith({
      fromName: 'Fay',
      fromEmail: 'fay@gmail.com',
      workspaceName: 'Northwind',
      pageUrl: 'https://tide.test/workspaces/nw/projects/p?task=t',
      message: 'Love it',
    });
    expect(db.update).toHaveBeenCalled();
  });

  it('keeps feedback that couldn’t be emailed, unmarked', async () => {
    db.select.mockReturnValue(chain([]));
    captureInsert();
    email.sendFeedbackEmail.mockResolvedValue({ sent: false });
    expect(await sendFeedback({ message: 'Bug', workspaceSlug: 'not-mine' })).toEqual({ success: true });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('drops a page that isn’t a path on this site, and a workspace the sender isn’t in', async () => {
    db.select.mockReturnValue(chain([]));
    const values = captureInsert();
    email.sendFeedbackEmail.mockResolvedValue({ sent: true });
    await sendFeedback({ message: 'Hi', page: 'https://evil.example/x', workspaceSlug: 'other' });
    await sendFeedback({ message: 'Hi', page: '//evil.example/x' });
    expect(values).toHaveBeenNthCalledWith(1, expect.objectContaining({ page: null, workspaceId: null }));
    expect(values).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: null }));
  });

  it('refuses an empty message, and needs a session', async () => {
    expect((await sendFeedback({ message: '   ' })).error).toBe('Write a few words first.');
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    expect((await sendFeedback({ message: 'Hi' })).error).toMatch(/session has expired/);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('feedbackSubject', () => {
  it('uses the first line, shortened', () => {
    expect(feedbackSubject({ fromName: 'Fay', message: 'Short note\nmore' })).toBe('Feedback from Fay: Short note');
    expect(feedbackSubject({ fromName: 'Fay', message: 'x'.repeat(80) })).toBe(`Feedback from Fay: ${'x'.repeat(59)}…`);
  });
});
