import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../helpers/db-mock';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
const db = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/db/drizzle', () => ({ db }));
const stripe = vi.hoisted(() => ({
  webhooks: { constructEvent: vi.fn() },
  subscriptions: { retrieve: vi.fn() },
}));
vi.mock('@/lib/stripe', () => ({ stripe, getPlanFromPriceId: () => 'pro' }));

import * as Sentry from '@sentry/nextjs';
import { POST } from '@/app/api/stripe/webhook/route';

const req = (sig: string | null = 't=1,v1=x') =>
  new Request('http://t/api/stripe/webhook', {
    method: 'POST',
    body: '{}',
    headers: sig ? { 'stripe-signature': sig } : {},
  });

const deleted = { id: 'evt_1', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } };

beforeEach(() => vi.clearAllMocks());

describe('POST /api/stripe/webhook', () => {
  it('rejects a request without a signature, without reporting it', async () => {
    expect((await POST(req(null))).status).toBe(400);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('reports bad signatures as one grouped warning (e.g. a mismatched secret)', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });
    expect((await POST(req())).status).toBe(400);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'Stripe webhook signature verification failed',
      expect.objectContaining({ level: 'warning', fingerprint: ['stripe-webhook-signature'] }),
    );
  });

  it('applies a handled event and answers 200', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(deleted);
    db.update.mockReturnValue(chain(undefined));
    expect((await POST(req())).status).toBe(200);
    expect(db.update).toHaveBeenCalledOnce();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports a failing handler with the event, and answers 500 so Stripe retries', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(deleted);
    const boom = new Error('db down');
    db.update.mockImplementation(() => {
      throw boom;
    });
    expect((await POST(req())).status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalledWith(boom, {
      tags: { area: 'stripe-webhook', stripe_event_type: 'customer.subscription.deleted' },
      extra: { stripeEventId: 'evt_1' },
    });
  });
});
