import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../helpers/db-mock';

const db = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
const stripe = vi.hoisted(() => ({
  subscriptions: { retrieve: vi.fn(), cancel: vi.fn() },
  subscriptionItems: { update: vi.fn() },
}));
vi.mock('@/lib/stripe', () => ({ stripe }));

import * as Sentry from '@sentry/nextjs';
import {
  cancelWorkspaceSubscription,
  getWorkspacePlan,
  memberLimitProblem,
  planGateProblem,
  syncSeats,
} from '@/lib/subscription';
import { memberLimitMessage, PLAN_GATE_MESSAGES, planAllows, upgradeReasonFor } from '@/lib/plans';

describe('upgradeReasonFor (E3)', () => {
  it('recognises each gate’s message and the member limit, and nothing else', () => {
    expect(upgradeReasonFor(PLAN_GATE_MESSAGES.shareLinks)).toBe('shareLinks');
    expect(upgradeReasonFor(PLAN_GATE_MESSAGES.clientGuests)).toBe('clientGuests');
    expect(upgradeReasonFor(memberLimitMessage(3))).toBe('members');
    expect(upgradeReasonFor('Not found.')).toBeNull();
    expect(upgradeReasonFor(undefined)).toBeNull();
  });
});

/** Queue the rows each successive db.select() resolves to. */
function rows(...results: unknown[][]) {
  for (const r of results) db.select.mockReturnValueOnce(chain(r));
}

const pro = { plan: 'pro', status: 'active', stripeSubscriptionId: 'sub_1' };

beforeEach(() => vi.resetAllMocks());

describe('getWorkspacePlan', () => {
  it('is Free without a subscription, or when it ended', async () => {
    rows([]);
    expect(await getWorkspacePlan('ws')).toBe('free');
    rows([{ ...pro, status: 'canceled' }]);
    expect(await getWorkspacePlan('ws')).toBe('free');
    rows([{ ...pro, status: 'unpaid' }]);
    expect(await getWorkspacePlan('ws')).toBe('free');
  });

  it('stays Pro while active, trialing, or retrying a failed payment', async () => {
    for (const status of ['active', 'trialing', 'past_due']) {
      rows([{ ...pro, status }]);
      expect(await getWorkspacePlan('ws')).toBe('pro');
    }
  });
});

describe('plan gates', () => {
  it('puts client features and saved templates on Pro only', () => {
    for (const f of ['clientGuests', 'approvals', 'shareLinks', 'savedTemplates'] as const) {
      expect(planAllows('free', f)).toBe(false);
      expect(planAllows('pro', f)).toBe(true);
    }
  });

  it('explains a stopped gate, and lets Pro through', async () => {
    rows([]);
    expect(await planGateProblem('ws', 'approvals')).toBe(PLAN_GATE_MESSAGES.approvals);
    rows([pro]);
    expect(await planGateProblem('ws', 'approvals')).toBeNull();
  });
});

describe('memberLimitProblem', () => {
  it('counts members and pending team invites against Free’s 3 seats', async () => {
    // plan, members, pending invites
    rows([], [{ n: 2 }], [{ n: 0 }]);
    expect(await memberLimitProblem('ws')).toBeNull();
    rows([], [{ n: 2 }], [{ n: 1 }]);
    expect(await memberLimitProblem('ws')).toMatch(/up to 3 team members/);
  });

  it('can leave pending invites out (when one is being accepted)', async () => {
    rows([], [{ n: 2 }]);
    expect(await memberLimitProblem('ws', { includePendingInvites: false })).toBeNull();
    rows([], [{ n: 3 }]);
    expect(await memberLimitProblem('ws', { includePendingInvites: false })).toMatch(/clients don’t count/);
  });

  it('has no limit on Pro', async () => {
    rows([pro]);
    expect(await memberLimitProblem('ws', { adding: 50 })).toBeNull();
  });
});

describe('syncSeats', () => {
  it('sets the Stripe quantity to the team member count, prorated', async () => {
    rows([pro], [{ n: 4 }]);
    stripe.subscriptions.retrieve.mockResolvedValue({ items: { data: [{ id: 'si_1', quantity: 3 }] } });
    await syncSeats('ws');
    expect(stripe.subscriptionItems.update).toHaveBeenCalledWith('si_1', {
      quantity: 4,
      proration_behavior: 'create_prorations',
    });
  });

  it('leaves Stripe alone when nothing changed, or there’s no paid plan', async () => {
    rows([pro], [{ n: 3 }]);
    stripe.subscriptions.retrieve.mockResolvedValue({ items: { data: [{ id: 'si_1', quantity: 3 }] } });
    await syncSeats('ws');
    rows([]);
    await syncSeats('ws');
    rows([{ ...pro, status: 'canceled' }]);
    await syncSeats('ws');
    expect(stripe.subscriptionItems.update).not.toHaveBeenCalled();
  });

  it('never throws; failures go to Sentry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    rows([pro], [{ n: 2 }]);
    stripe.subscriptions.retrieve.mockRejectedValue(new Error('stripe down'));
    await expect(syncSeats('ws')).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe('cancelWorkspaceSubscription', () => {
  it('cancels a live subscription and skips ended or missing ones', async () => {
    rows([pro]);
    await cancelWorkspaceSubscription('ws');
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1', { prorate: true });
    rows([{ ...pro, status: 'canceled' }]);
    await cancelWorkspaceSubscription('ws');
    rows([]);
    await cancelWorkspaceSubscription('ws');
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
  });
});
