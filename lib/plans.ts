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
  /** File storage per workspace (B3), counted against the workspace owner's plan. */
  storageBytes: number;
  tagline: string;
}

const GB = 1024 ** 3;

export const PLAN_DETAILS: Record<PlanName, PlanDetails> = {
  free: { name: 'Free', priceMonthly: 0, maxWorkspaces: 1, storageBytes: 1 * GB, tagline: 'For one team getting organised' },
  pro: { name: 'Pro', priceMonthly: 9, maxWorkspaces: 5, storageBytes: 20 * GB, tagline: 'For people who run a few teams or clients' },
  business: { name: 'Business', priceMonthly: 29, maxWorkspaces: null, storageBytes: 100 * GB, tagline: 'For agencies and larger organisations' },
};

export const PLAN_ORDER: PlanName[] = ['free', 'pro', 'business'];

export function workspaceLimitLabel(limit: number | null) {
  if (limit === null) return 'Unlimited workspaces';
  return limit === 1 ? '1 workspace' : `Up to ${limit} workspaces`;
}

/** "1 GB of files per workspace". */
export function storageLimitLabel(bytes: number) {
  return `${formatBytes(bytes)} of files per workspace`;
}

/** "820 KB", "4.2 MB", "1 GB". Binary units, as file managers show them. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = value >= 10 || Number.isInteger(value) ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
