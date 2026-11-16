import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const db = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

import { auth } from '@/lib/auth';
import { markAsRead } from '@/features/notifications/actions';

beforeEach(() => vi.resetAllMocks());

describe('markAsRead', () => {
  it("scopes the update to the caller's own notifications", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'user-1' } } as never);
    let condition: SQL | undefined;
    db.update.mockReturnValue({
      set: () => ({
        where: (c: SQL) => {
          condition = c;
          return Promise.resolve();
        },
      }),
    });

    await markAsRead('n-1');

    const { sql, params } = new PgDialect().sqlToQuery(condition!);
    expect(sql).toContain('"user_id"');
    expect(params).toEqual(['n-1', 'user-1']);
  });

  it('does nothing without a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await markAsRead('n-1');
    expect(db.update).not.toHaveBeenCalled();
  });
});
