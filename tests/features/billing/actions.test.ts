import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
const stripe = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
}));

vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/stripe', () => ({ stripe, PLANS: { free: { priceId: null }, pro: { priceId: 'price_pro' } } }));
vi.mock('@/lib/subscription', () => ({ getWorkspacePlan: vi.fn(), teamMemberCount: vi.fn() }));

import { auth } from '@/lib/auth';
import { getWorkspacePlan, teamMemberCount } from '@/lib/subscription';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createCheckoutSession, createPortalSession } from '@/features/billing/actions';

const session = { user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' } };
const EXPIRED = { error: 'Your session has expired. Log in again to continue.' };
const ws = { id: 'ws-1', name: 'Northwind', slug: 'northwind' };

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
  vi.mocked(getWorkspacePlan).mockResolvedValue('free');
  vi.mocked(teamMemberCount).mockResolvedValue(4);
});

describe('createCheckoutSession (E1: per workspace, per team member)', () => {
  it('needs a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(await createCheckoutSession('northwind')).toEqual(EXPIRED);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('is for the owner only', async () => {
    db.select.mockReturnValueOnce(chain([]));
    expect(await createCheckoutSession('northwind')).toEqual({ error: 'Not found.' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('bills Pro for each team member, reusing the workspace’s customer', async () => {
    db.select.mockReturnValueOnce(chain([ws])).mockReturnValueOnce(chain([{ stripeCustomerId: 'cus_1' }]));
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.test/s' });

    await createCheckoutSession('northwind');

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_1',
      mode: 'subscription',
      line_items: [{ price: 'price_pro', quantity: 4 }],
      subscription_data: { metadata: { workspaceId: 'ws-1' } },
      success_url: 'https://tide.test/workspaces/northwind/settings?tab=billing&success=true',
      cancel_url: 'https://tide.test/workspaces/northwind/settings?tab=billing&canceled=true',
      metadata: { workspaceId: 'ws-1' },
    });
    expect(redirect).toHaveBeenCalledWith('https://checkout.stripe.test/s');
  });

  it('creates and stores a customer for the workspace the first time', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.tide.test';
    db.select.mockReturnValueOnce(chain([ws])).mockReturnValueOnce(chain([]));
    stripe.customers.create.mockResolvedValue({ id: 'cus_new' });
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.test/n' });
    const { values, onConflictDoUpdate } = captureInsert();

    await createCheckoutSession('northwind');

    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: 'alice@example.com',
      name: 'Northwind',
      metadata: { workspaceId: 'ws-1', ownerUserId: 'user-1' },
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', userId: 'user-1', stripeCustomerId: 'cus_new', plan: 'free' }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it('bills at least one seat', async () => {
    vi.mocked(teamMemberCount).mockResolvedValue(0);
    db.select.mockReturnValueOnce(chain([ws])).mockReturnValueOnce(chain([{ stripeCustomerId: 'cus_1' }]));
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.test/s' });
    await createCheckoutSession('northwind');
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: 'price_pro', quantity: 1 }] }),
    );
  });

  it('says so when the workspace is already on Pro', async () => {
    db.select.mockReturnValueOnce(chain([ws]));
    vi.mocked(getWorkspacePlan).mockResolvedValue('pro');
    expect(await createCheckoutSession('northwind')).toEqual({ error: 'This workspace is already on Pro.' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('reports a checkout session without a URL, and Stripe failures, kindly', async () => {
    db.select.mockReturnValueOnce(chain([ws])).mockReturnValueOnce(chain([{ stripeCustomerId: 'cus_1' }]));
    stripe.checkout.sessions.create.mockResolvedValueOnce({ url: null });
    expect(await createCheckoutSession('northwind')).toEqual({ error: 'Failed to create checkout session' });

    db.select.mockReturnValueOnce(chain([ws])).mockReturnValueOnce(chain([{ stripeCustomerId: 'cus_1' }]));
    stripe.checkout.sessions.create.mockRejectedValueOnce(new Error('stripe down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await createCheckoutSession('northwind')).toEqual({ error: 'Could not start checkout. Please try again.' });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('createPortalSession', () => {
  it('needs a session, and ownership', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    expect(await createPortalSession('northwind')).toEqual(EXPIRED);
    db.select.mockReturnValueOnce(chain([]));
    expect(await createPortalSession('northwind')).toEqual({ error: 'Not found.' });
  });

  it('needs a billing account', async () => {
    db.select.mockReturnValueOnce(chain([ws])).mockReturnValueOnce(chain([]));
    expect(await createPortalSession('northwind')).toEqual({ error: 'No billing account found' });
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('redirects to the portal, returning to the workspace’s billing tab', async () => {
    db.select.mockReturnValueOnce(chain([ws])).mockReturnValueOnce(chain([{ stripeCustomerId: 'cus_1' }]));
    stripe.billingPortal.sessions.create.mockResolvedValue({ url: 'https://portal.stripe.test/p' });
    await createPortalSession('northwind');
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://tide.test/workspaces/northwind/settings?tab=billing',
    });
    expect(redirect).toHaveBeenCalledWith('https://portal.stripe.test/p');
  });
});
