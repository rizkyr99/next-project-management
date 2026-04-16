import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-03-25.dahlia',
});

export const PLANS = {
  free: {
    maxWorkspaces: 1,
    priceId: null,
  },
  pro: {
    maxWorkspaces: 5,
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? '',
  },
  business: {
    maxWorkspaces: null,
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID ?? '',
  },
} as const;

export type PlanName = keyof typeof PLANS;

export function getPlanFromPriceId(priceId: string): PlanName {
  for (const [name, plan] of Object.entries(PLANS)) {
    if (plan.priceId === priceId) return name as PlanName;
  }
  return 'free';
}
