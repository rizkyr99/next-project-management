import { beforeEach, describe, expect, it, vi } from 'vitest';

const values = vi.hoisted(() => vi.fn());
const onConflictDoUpdate = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

import { auth } from '@/lib/auth';
import { updateEmailPreferences } from '@/features/notifications/preferences';

beforeEach(() => {
  vi.resetAllMocks();
  onConflictDoUpdate.mockResolvedValue(undefined);
  values.mockReturnValue({ onConflictDoUpdate });
  db.insert.mockReturnValue({ values });
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
});

describe('updateEmailPreferences', () => {
  it("upserts only the caller's own row with just the changed fields", async () => {
    expect(await updateEmailPreferences({ emailDigest: true })).toEqual({ success: true });
    expect(values).toHaveBeenCalledWith({ userId: 'u1', emailDigest: true });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ set: expect.objectContaining({ emailDigest: true }) }),
    );
  });

  it('rejects an empty update and non-boolean values', async () => {
    expect((await updateEmailPreferences({})).error).toBe('Nothing to update.');
    expect((await updateEmailPreferences({ emailOnAssign: 'yes' as never })).error).toBeDefined();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(await updateEmailPreferences({ emailDigest: true })).toEqual({ error: 'Your session has expired. Log in again to continue.' });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
