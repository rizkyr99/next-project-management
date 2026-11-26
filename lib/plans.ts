/**
 * Plans (E1): what each costs, what it includes and its limits. The pricing
 * page, the landing page, billing settings and every server-side gate read
 * from here, so prices, limits and gates can't drift. Stripe price IDs stay
 * server-side in lib/stripe.ts.
 *
 * Pricing is per team member: owners, admins and members count; client
 * guests never do. A plan belongs to a workspace.
 */
export type PlanName = 'free' | 'pro';

export interface PlanDetails {
  name: string;
  /** US dollars per month, per team member when `perMember`. */
  priceMonthly: number;
  perMember: boolean;
  /** Team members (not guests) allowed; null means unlimited. */
  maxMembers: number | null;
  /** File storage per workspace (B3). */
  storageBytes: number;
  tagline: string;
}

const GB = 1024 ** 3;

export const PLAN_DETAILS: Record<PlanName, PlanDetails> = {
  free: {
    name: 'Free',
    priceMonthly: 0,
    perMember: false,
    maxMembers: 3,
    storageBytes: 1 * GB,
    tagline: 'For a small team getting organised',
  },
  pro: {
    name: 'Pro',
    priceMonthly: 9,
    perMember: true,
    maxMembers: null,
    storageBytes: 100 * GB,
    tagline: 'For studios that work with clients',
  },
};

export const PLAN_ORDER: PlanName[] = ['free', 'pro'];

/** Features only some plans include. Everything not listed here is on every plan. */
export const PLAN_FEATURES = {
  clientGuests: { label: 'Client guests on chosen projects, free of charge', plans: ['pro'] },
  approvals: { label: 'Client approvals', plans: ['pro'] },
  shareLinks: { label: 'Read-only share links', plans: ['pro'] },
  savedTemplates: { label: 'Your own project templates', plans: ['pro'] },
} as const satisfies Record<string, { label: string; plans: readonly PlanName[] }>;

export type PlanFeature = keyof typeof PLAN_FEATURES;

export function planAllows(plan: PlanName, feature: PlanFeature): boolean {
  return (PLAN_FEATURES[feature].plans as readonly PlanName[]).includes(plan);
}

const UPGRADE_HINT = 'The workspace owner can upgrade in Settings, under Billing.';

/** What to tell someone a gate stopped. */
export const PLAN_GATE_MESSAGES: Record<PlanFeature, string> = {
  clientGuests: `Inviting clients is part of Pro. ${UPGRADE_HINT}`,
  approvals: `Client approvals are part of Pro. ${UPGRADE_HINT}`,
  shareLinks: `Share links are part of Pro. ${UPGRADE_HINT}`,
  savedTemplates: `Saving your own templates is part of Pro; the built-in ones are free. ${UPGRADE_HINT}`,
};

export function memberLimitMessage(max: number) {
  return `Free workspaces have up to ${max} team members (clients don’t count). ${UPGRADE_HINT}`;
}

/** "Up to 3 team members" / "Unlimited team members". */
export function memberLimitLabel(max: number | null) {
  return max === null ? 'Unlimited team members' : `Up to ${max} team members`;
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
