import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { db } from '@/db/drizzle';
import { member, subscription, workspace, workspaceInvite } from '@/db/schema';
import { and, count, eq, gt, isNotNull, ne, sql } from 'drizzle-orm';
import {
  memberLimitMessage,
  TRIAL_DAYS,
  PLAN_DETAILS,
  PLAN_GATE_MESSAGES,
  planAllows,
  type PlanFeature,
  type PlanName,
} from './plans';
import { stripe } from './stripe';

/**
 * E1: a workspace's plan and its limits. Plans belong to workspaces and are
 * billed per team member (owners, admins, members); client guests are free.
 * E2: a new workspace gets a 14-day Pro trial, kept in the app (no Stripe
 * until the owner upgrades).
 */

/** Statuses in which a paid plan's features stay on (a failed payment gets Stripe's retry window). */
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

export interface PlanState {
  plan: PlanName;
  /** Paying for Pro through Stripe. */
  paid: boolean;
  /** On the in-app Pro trial (and not paying). */
  onTrial: boolean;
  trialEndsAt: Date | null;
}

/** Pro when paid, or while an unexpired trial lasts; otherwise Free. */
export function planState(
  sub: { status: string | null; plan: string | null } | null,
  trialEndsAt: Date | null,
  now = new Date(),
): PlanState {
  const paid = Boolean(sub?.status && PAID_STATUSES.has(sub.status) && sub.plan === 'pro');
  const onTrial = !paid && trialEndsAt !== null && trialEndsAt > now;
  return { plan: paid || onTrial ? 'pro' : 'free', paid, onTrial, trialEndsAt };
}

export async function getWorkspaceSubscription(workspaceId: string) {
  const [sub] = await db.select().from(subscription).where(eq(subscription.workspaceId, workspaceId)).limit(1);
  return sub ?? null;
}

export async function getWorkspacePlanState(workspaceId: string): Promise<PlanState> {
  const [row] = await db
    .select({ status: subscription.status, plan: subscription.plan, trialEndsAt: workspace.trialEndsAt })
    .from(workspace)
    .leftJoin(subscription, eq(subscription.workspaceId, workspace.id))
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  return planState(row ?? null, row?.trialEndsAt ?? null);
}

export async function getWorkspacePlan(workspaceId: string): Promise<PlanName> {
  return (await getWorkspacePlanState(workspaceId)).plan;
}

/** Owners, admins and members: the people a workspace pays for. */
export async function teamMemberCount(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(member)
    .where(and(eq(member.workspaceId, workspaceId), ne(member.role, 'guest')));
  return row?.n ?? 0;
}

/**
 * A workspace's plan and team size in one query, looked up by slug so the
 * workspace layout can run it alongside its other queries (E3). Null when
 * there's no such workspace; the layout checks membership separately.
 */
export async function planSummaryBySlug(slug: string): Promise<(PlanState & { teamMembers: number }) | null> {
  const [row] = await db
    .select({
      status: subscription.status,
      plan: subscription.plan,
      trialEndsAt: workspace.trialEndsAt,
      teamMembers: sql<number>`(select count(*)::int from ${member} m where m.workspace_id = ${workspace.id} and m.role <> 'guest')`,
    })
    .from(workspace)
    .leftJoin(subscription, eq(subscription.workspaceId, workspace.id))
    .where(eq(workspace.slug, slug))
    .limit(1);
  if (!row) return null;
  return { ...planState(row, row.trialEndsAt), teamMembers: row.teamMembers };
}

/**
 * When a new workspace's trial should end: 14 days from now, unless its
 * owner has had a trial before (one per person, so new workspaces can't
 * extend it). Null: no trial.
 */
export async function trialEndForNewWorkspace(ownerUserId: string, now = new Date()): Promise<Date | null> {
  const [had] = await db
    .select({ id: workspace.id })
    .from(workspace)
    .where(and(eq(workspace.userId, ownerUserId), isNotNull(workspace.trialEndsAt)))
    .limit(1);
  return had ? null : new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

/** Null when the workspace's plan includes `feature`, otherwise the message to show. */
export async function planGateProblem(workspaceId: string, feature: PlanFeature): Promise<string | null> {
  return planAllows(await getWorkspacePlan(workspaceId), feature) ? null : PLAN_GATE_MESSAGES[feature];
}

/**
 * Null when `adding` more team members fit the workspace's plan, otherwise
 * the message to show. Pending team invites count as seats, so a Free
 * workspace can't invite past its limit and accept them all later.
 * `exceptInviteEmail` leaves out the invite being refreshed.
 */
export async function memberLimitProblem(
  workspaceId: string,
  { adding = 1, includePendingInvites = true, exceptInviteEmail }: {
    adding?: number;
    includePendingInvites?: boolean;
    exceptInviteEmail?: string;
  } = {},
): Promise<string | null> {
  const plan = await getWorkspacePlan(workspaceId);
  const max = PLAN_DETAILS[plan].maxMembers;
  if (max === null) return null;
  const [members, [pending]] = await Promise.all([
    teamMemberCount(workspaceId),
    includePendingInvites
      ? db
          .select({ n: count() })
          .from(workspaceInvite)
          .where(
            and(
              eq(workspaceInvite.workspaceId, workspaceId),
              eq(workspaceInvite.status, 'pending'),
              ne(workspaceInvite.role, 'guest'),
              gt(workspaceInvite.expiresAt, new Date()),
              exceptInviteEmail ? ne(workspaceInvite.email, exceptInviteEmail) : undefined,
            ),
          )
      : Promise.resolve([{ n: 0 }]),
  ]);
  return members + (pending?.n ?? 0) + adding > max ? memberLimitMessage(max) : null;
}

/**
 * Brings the Stripe subscription's quantity in line with the team member
 * count, prorated. Call after anyone joins, leaves or changes to or from
 * guest. Never throws: billing catches up on the next change, and a
 * failure goes to Sentry.
 */
export async function syncSeats(workspaceId: string): Promise<void> {
  try {
    const sub = await getWorkspaceSubscription(workspaceId);
    if (!sub?.stripeSubscriptionId || !sub.status || !PAID_STATUSES.has(sub.status)) return;
    const quantity = Math.max(1, await teamMemberCount(workspaceId));
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    const item = stripeSub.items.data[0];
    if (!item || item.quantity === quantity) return;
    await stripe.subscriptionItems.update(item.id, { quantity, proration_behavior: 'create_prorations' });
  } catch (error) {
    console.error('[billing] seat sync failed:', error);
    Sentry.captureException(error, { tags: { area: 'billing', step: 'sync-seats' }, extra: { workspaceId } });
  }
}

/**
 * Cancels a workspace's Stripe subscription now (the workspace is being
 * deleted). Throws, so the caller doesn't delete a workspace that would
 * keep being billed.
 */
export async function cancelWorkspaceSubscription(workspaceId: string): Promise<void> {
  const sub = await getWorkspaceSubscription(workspaceId);
  if (!sub?.stripeSubscriptionId || sub.status === 'canceled') return;
  await stripe.subscriptions.cancel(sub.stripeSubscriptionId, { prorate: true });
}
