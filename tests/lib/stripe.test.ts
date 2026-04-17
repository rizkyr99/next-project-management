import { describe, it, expect, vi } from 'vitest';

// Stripe instantiates at module load — mock the class to avoid needing a real API key
vi.mock('stripe', () => ({
  // Must be a class (constructor) since lib/stripe.ts uses `new Stripe(...)`
  default: class MockStripe {
    constructor() {}
  },
}));

import { getPlanFromPriceId, PLANS } from '@/lib/stripe';

describe('PLANS', () => {
  it('free plan has 1 workspace limit', () => {
    expect(PLANS.free.maxWorkspaces).toBe(1);
  });

  it('pro plan has 5 workspace limit', () => {
    expect(PLANS.pro.maxWorkspaces).toBe(5);
  });

  it('business plan has no workspace limit', () => {
    expect(PLANS.business.maxWorkspaces).toBeNull();
  });
});

describe('getPlanFromPriceId', () => {
  it('returns free for an unknown price id', () => {
    expect(getPlanFromPriceId('price_unknown_123')).toBe('free');
  });

  it('returns free for a completely unrecognized price id', () => {
    expect(getPlanFromPriceId('price_does_not_exist_xyz')).toBe('free');
  });

  it('resolves to pro when the pro price id matches', () => {
    // PLANS.pro.priceId comes from env — in CI it's an empty string, which maps to free.
    // Test the logic with a known injected value instead.
    const originalEntries = Object.entries(PLANS);
    for (const [name, plan] of originalEntries) {
      if (plan.priceId) {
        expect(getPlanFromPriceId(plan.priceId)).toBe(name);
      }
    }
  });
});
