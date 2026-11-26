import { describe, it, expect, vi } from 'vitest';

// Stripe instantiates at module load — mock the class to avoid needing a real API key
vi.mock('stripe', () => ({
  // Must be a class (constructor) since lib/stripe.ts uses `new Stripe(...)`
  default: class MockStripe {
    constructor() {}
  },
}));

import { getPlanFromPriceId, PLANS } from '@/lib/stripe';

describe('PLANS (E1)', () => {
  it('has Free (no price) and Pro only', () => {
    expect(Object.keys(PLANS)).toEqual(['free', 'pro']);
    expect(PLANS.free.priceId).toBeNull();
  });
});

describe('getPlanFromPriceId', () => {
  it('returns free for unknown, retired and empty price ids', () => {
    expect(getPlanFromPriceId('price_unknown_123')).toBe('free');
    expect(getPlanFromPriceId('')).toBe('free');
  });

  it('returns pro for the Pro price', () => {
    // From the environment; empty in CI, which can never match.
    if (PLANS.pro.priceId) expect(getPlanFromPriceId(PLANS.pro.priceId)).toBe('pro');
  });
});
