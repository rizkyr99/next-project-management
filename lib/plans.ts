/**
 * Plan details shown to people: the pricing page, the landing page and the
 * billing settings all read from here, so prices and limits can't drift.
 * Stripe price IDs stay server-side in lib/stripe.ts.
 */
export type PlanName = 'free' | 'pro' | 'business';

export interface PlanDetails {
  name: string;
  /** US dollars per month. */
  priceMonthly: number;
  /** null means unlimited. */
  maxWorkspaces: number | null;
  tagline: string;
}

export const PLAN_DETAILS: Record<PlanName, PlanDetails> = {
  free: { name: 'Free', priceMonthly: 0, maxWorkspaces: 1, tagline: 'For one team getting organised' },
  pro: { name: 'Pro', priceMonthly: 9, maxWorkspaces: 5, tagline: 'For people who run a few teams or clients' },
  business: { name: 'Business', priceMonthly: 29, maxWorkspaces: null, tagline: 'For agencies and larger organisations' },
};

export const PLAN_ORDER: PlanName[] = ['free', 'pro', 'business'];

export function workspaceLimitLabel(limit: number | null) {
  if (limit === null) return 'Unlimited workspaces';
  return limit === 1 ? '1 workspace' : `Up to ${limit} workspaces`;
}
