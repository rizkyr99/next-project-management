import Stripe from 'stripe';
import type { PlanName } from './plans';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-03-25.dahlia',
});

/**
 * Each plan's Stripe price. Pro's is a licensed, per-unit monthly price, and
 * a workspace's subscription quantity is its team member count (E1).
 */
export const PLANS = {
  free: { priceId: null },
  pro: { priceId: process.env.STRIPE_PRO_PRICE_ID ?? '' },
} as const;

export type { PlanName };

/**
 * Pro for the current Pro price or any legacy Pro price (subscribers who
 * joined at an older rate keep Pro). Anything else is Free.
 */
export function getPlanFromPriceId(priceId: string): PlanName {
  if (!priceId) return 'free';
  if (priceId === PLANS.pro.priceId) return 'pro';
  const legacy = (process.env.STRIPE_PRO_LEGACY_PRICE_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return legacy.includes(priceId) ? 'pro' : 'free';
}
