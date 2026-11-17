import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const db = vi.hoisted(() => ({ update: vi.fn(), select: vi.fn(), delete: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

import { auth } from '@/lib/auth';
import { chain } from '../../helpers/db-mock';
import { listNotifications, markAsRead } from '@/features/notifications/actions';
import { isSafeNotificationHref } from '@/features/notifications/href';
import { deleteExpiredNotifications, NOTIFICATIONS_PAGE_SIZE } from '@/lib/notifications';

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

describe('listNotifications', () => {
  it('ignores a malformed cursor without querying', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'user-1' } } as never);
    expect(await listNotifications('not-a-cursor')).toEqual({ items: [], nextCursor: null });
    expect(await listNotifications('garbage|n-1')).toEqual({ items: [], nextCursor: null });
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns a (createdAt, id) cursor only when there is another page', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'user-1' } } as never);
    const rows = Array.from({ length: NOTIFICATIONS_PAGE_SIZE + 1 }, (_, i) => ({
      id: `n-${i}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 100 - i)),
    }));
    db.select.mockReturnValueOnce(chain(rows));

    const page = await listNotifications();
    expect(page.items).toHaveLength(NOTIFICATIONS_PAGE_SIZE);
    const last = rows[NOTIFICATIONS_PAGE_SIZE - 1];
    expect(page.nextCursor).toBe(`${last.createdAt.toISOString()}|${last.id}`);

    db.select.mockReturnValueOnce(chain(rows.slice(0, 3)));
    expect((await listNotifications(page.nextCursor!)).nextCursor).toBeNull();
  });

  it('returns nothing without a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(await listNotifications()).toEqual({ items: [], nextCursor: null });
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('isSafeNotificationHref', () => {
  it('only allows app-relative paths', () => {
    expect(isSafeNotificationHref('/workspaces/acme/projects/p?task=t')).toBe(true);
    expect(isSafeNotificationHref('/invites')).toBe(true);
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '', null]) {
      expect(isSafeNotificationHref(bad)).toBe(false);
    }
  });
});

describe('deleteExpiredNotifications', () => {
  it('deletes rows older than 90 days', async () => {
    let condition: SQL | undefined;
    db.delete.mockReturnValue({
      where: (c: SQL) => {
        condition = c;
        return { returning: async () => [{ id: 'a' }, { id: 'b' }] };
      },
    });
    const now = new Date('2026-06-01T00:00:00Z');
    expect(await deleteExpiredNotifications(now)).toBe(2);
    const { sql, params } = new PgDialect().sqlToQuery(condition!);
    expect(sql).toContain('"created_at" <');
    expect(params).toEqual([new Date('2026-03-03T00:00:00Z').toISOString()]);
  });
});
