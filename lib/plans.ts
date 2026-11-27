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
    priceMonthly: 6,
    perMember: true,
    maxMembers: null,
    storageBytes: 100 * GB,
    tagline: 'For studios that work with clients',
  },
};

export const PLAN_ORDER: PlanName[] = ['free', 'pro'];

/** E2: a new workspace's Pro trial, no card. One per owner. */
export const TRIAL_DAYS = 14;
/** The "your trial ends soon" email goes out this many days before. */
export const TRIAL_REMINDER_DAYS = 3;

/** "14 days left", "1 day left", "Ends today". Whole days, rounding up. */
export function trialDaysLeftLabel(trialEndsAt: Date | string, now = new Date()): string {
  const days = Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Ends today';
  return days === 1 ? '1 day left' : `${days} days left`;
}

/** Features only some plans include. Everything not listed here is on every plan. */
export const PLAN_FEATURES = {
  clientGuests: { label: 'Client guests on chosen projects, free of charge', plans: ['pro'] },
  approvals: { label: 'Client approvals', plans: ['pro'] },
  shareLinks: { label: 'Read-only share links', plans: ['pro'] },
  savedTemplates: { label: 'Your own project templates', plans: ['pro'] },
  calendar: { label: 'Calendar view, with drag to reschedule', plans: ['pro'] },
  workload: { label: 'Workload: who’s busy, week by week', plans: ['pro'] },
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
  calendar: `The calendar view is part of Pro. ${UPGRADE_HINT}`,
  workload: `The workload view is part of Pro. ${UPGRADE_HINT}`,
};

export function memberLimitMessage(max: number) {
  return `Free workspaces have up to ${max} team members (clients don’t count). ${UPGRADE_HINT}`;
}

/** What an upgrade prompt is about: a gated feature, or the team member limit. */
export type UpgradeReason = PlanFeature | 'members';

/**
 * Which gate a server error came from, so the browser can offer the upgrade
 * instead of a bare message (E3). Null for any other error.
 */
export function upgradeReasonFor(message: string | undefined | null): UpgradeReason | null {
  if (!message) return null;
  const feature = (Object.keys(PLAN_GATE_MESSAGES) as PlanFeature[]).find((f) => PLAN_GATE_MESSAGES[f] === message);
  if (feature) return feature;
  return message.startsWith('Free workspaces have up to ') ? 'members' : null;
}

/** The upgrade prompt's title for each reason. */
export const UPGRADE_TITLES: Record<UpgradeReason, string> = {
  clientGuests: 'Invite clients with Pro',
  approvals: 'Ask clients for approval with Pro',
  shareLinks: 'Share read-only links with Pro',
  savedTemplates: 'Save your own templates with Pro',
  calendar: 'Plan by date with the calendar in Pro',
  workload: 'See who’s busy before you assign, with Pro',
  members: 'Grow your team with Pro',
};

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
