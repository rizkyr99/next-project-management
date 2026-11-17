import Stripe from 'stripe';
import { PLAN_DETAILS, type PlanName } from './plans';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-03-25.dahlia',
});

export const PLANS = {
  free: {
    maxWorkspaces: PLAN_DETAILS.free.maxWorkspaces,
    priceId: null,
  },
  pro: {
    maxWorkspaces: PLAN_DETAILS.pro.maxWorkspaces,
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? '',
  },
  business: {
    maxWorkspaces: PLAN_DETAILS.business.maxWorkspaces,
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID ?? '',
  },
} as const;

export type { PlanName };

export function getPlanFromPriceId(priceId: string): PlanName {
  for (const [name, plan] of Object.entries(PLANS)) {
    if (plan.priceId === priceId) return name as PlanName;
  }
  return 'free';
}
