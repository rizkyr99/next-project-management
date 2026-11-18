import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  query: { subscription: { findFirst: vi.fn() } },
  insert: vi.fn(),
}));
const stripe = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
}));

vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/stripe', () => ({
  stripe,
  PLANS: { pro: { priceId: 'price_pro' }, business: { priceId: 'price_biz' } },
}));

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createCheckoutSession, createPortalSession } from '@/features/billing/actions';

const session = { user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' } };
const EXPIRED = { error: 'Your session has expired. Log in again to continue.' };

function captureInsert() {
  const values = vi.fn();
  const onConflictDoUpdate = vi.fn(async () => undefined);
  db.insert.mockReturnValue({ values: (v: unknown) => (values(v), { onConflictDoUpdate }) });
  return { values, onConflictDoUpdate };
}

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.NEXT_PUBLIC_APP_URL;
  vi.mocked(headers).mockResolvedValue(new Headers({ host: 'tide.test', 'x-forwarded-proto': 'https' }) as never);
  vi.mocked(auth.api.getSession).mockResolvedValue(session as never);
});

describe('createCheckoutSession', () => {
  it('needs a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(await createCheckoutSession('pro')).toEqual(EXPIRED);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('reuses an existing Stripe customer and redirects to checkout', async () => {
    db.query.subscription.findFirst.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.test/s' });

    await createCheckoutSession('business');

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_1',
        mode: 'subscription',
        line_items: [{ price: 'price_biz', quantity: 1 }],
        success_url: 'https://tide.test/settings/billing?success=true',
        cancel_url: 'https://tide.test/settings/billing?canceled=true',
        metadata: { userId: 'user-1' },
      }),
    );
    expect(redirect).toHaveBeenCalledWith('https://checkout.stripe.test/s');
  });

  it('creates and stores a customer the first time', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.tide.test';
    db.query.subscription.findFirst.mockResolvedValue(undefined);
    stripe.customers.create.mockResolvedValue({ id: 'cus_new' });
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.test/n' });
    const { values, onConflictDoUpdate } = captureInsert();

    await createCheckoutSession('pro');

    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: 'alice@example.com',
      name: 'Alice',
      metadata: { userId: 'user-1' },
    });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', stripeCustomerId: 'cus_new', plan: 'free' }));
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_new',
        line_items: [{ price: 'price_pro', quantity: 1 }],
        success_url: 'https://app.tide.test/settings/billing?success=true',
      }),
    );
  });

  it('reports a checkout session without a URL', async () => {
    db.query.subscription.findFirst.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    stripe.checkout.sessions.create.mockResolvedValue({ url: null });
    expect(await createCheckoutSession('pro')).toEqual({ error: 'Failed to create checkout session' });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('turns a Stripe failure into a friendly error', async () => {
    db.query.subscription.findFirst.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    stripe.checkout.sessions.create.mockRejectedValue(new Error('stripe down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await createCheckoutSession('pro')).toEqual({ error: 'Could not start checkout. Please try again.' });
  });
});

describe('createPortalSession', () => {
  it('needs a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(await createPortalSession()).toEqual(EXPIRED);
  });

  it('needs a billing account', async () => {
    db.query.subscription.findFirst.mockResolvedValue({ stripeCustomerId: null });
    expect(await createPortalSession()).toEqual({ error: 'No billing account found' });
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('redirects to the portal, returning to billing settings', async () => {
    db.query.subscription.findFirst.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    stripe.billingPortal.sessions.create.mockResolvedValue({ url: 'https://portal.stripe.test/p' });
    await createPortalSession();
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://tide.test/settings/billing',
    });
    expect(redirect).toHaveBeenCalledWith('https://portal.stripe.test/p');
  });
});
