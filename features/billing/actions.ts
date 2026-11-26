'use server';

import { AuthzError, requireSession, runAction } from '@/lib/authz';

import { db } from '@/db/drizzle';
import { member, subscription, workspace } from '@/db/schema';
import { PLANS, stripe } from '@/lib/stripe';
import { getWorkspacePlan, teamMemberCount } from '@/lib/subscription';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

function getAppUrl(requestHeaders: Headers): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const host = requestHeaders.get('host') ?? 'localhost:3000';
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

/** The workspace (by slug), if the caller owns it: only owners handle billing (E1). */
async function requireOwner(workspaceSlug: string) {
  const session = await requireSession();
  const [ws] = await db
    .select({ id: workspace.id, name: workspace.name, slug: workspace.slug })
    .from(workspace)
    .innerJoin(member, and(eq(member.workspaceId, workspace.id), eq(member.userId, session.user.id)))
    .where(and(eq(workspace.slug, z.string().min(1).max(100).parse(workspaceSlug)), eq(member.role, 'owner')))
    .limit(1);
  if (!ws) throw new AuthzError();
  return { session, workspace: ws };
}

const billingUrl = (appUrl: string, slug: string) => `${appUrl}/workspaces/${slug}/settings?tab=billing`;

/**
 * Upgrade a workspace to Pro: a Stripe Checkout for the Pro price, one unit
 * per team member (guests are free). Later changes to the team adjust the
 * quantity (lib/subscription.ts, syncSeats).
 */
export async function createCheckoutSession(workspaceSlug: string) {
  return runAction('Could not start checkout. Please try again.', async () => {
    const requestHeaders = await headers();
    const { session, workspace: ws } = await requireOwner(workspaceSlug);
    if ((await getWorkspacePlan(ws.id)) === 'pro') return { error: 'This workspace is already on Pro.' };
    if (!PLANS.pro.priceId) return { error: 'Upgrades aren’t set up yet.' };

    const appUrl = getAppUrl(requestHeaders);
    const [existing] = await db
      .select({ stripeCustomerId: subscription.stripeCustomerId })
      .from(subscription)
      .where(eq(subscription.workspaceId, ws.id))
      .limit(1);

    let stripeCustomerId = existing?.stripeCustomerId;
    if (!stripeCustomerId) {
      // One Stripe customer per workspace: it's the workspace that pays.
      const customer = await stripe.customers.create({
        email: session.user.email,
        name: ws.name,
        metadata: { workspaceId: ws.id, ownerUserId: session.user.id },
      });
      stripeCustomerId = customer.id;
      await db
        .insert(subscription)
        .values({ workspaceId: ws.id, userId: session.user.id, stripeCustomerId, plan: 'free', updatedAt: new Date() })
        .onConflictDoUpdate({
          target: subscription.workspaceId,
          set: { stripeCustomerId, userId: session.user.id, updatedAt: new Date() },
        });
    }

    const quantity = Math.max(1, await teamMemberCount(ws.id));
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: PLANS.pro.priceId, quantity }],
      subscription_data: { metadata: { workspaceId: ws.id } },
      success_url: `${billingUrl(appUrl, ws.slug)}&success=true`,
      cancel_url: `${billingUrl(appUrl, ws.slug)}&canceled=true`,
      metadata: { workspaceId: ws.id },
    });

    if (!checkoutSession.url) {
      return { error: 'Failed to create checkout session' };
    }

    redirect(checkoutSession.url);
  });
}

/** Stripe's billing portal for a workspace: payment method, invoices, cancelling. Owner only. */
export async function createPortalSession(workspaceSlug: string) {
  return runAction('Could not open the billing portal. Please try again.', async () => {
    const requestHeaders = await headers();
    const { workspace: ws } = await requireOwner(workspaceSlug);
    const appUrl = getAppUrl(requestHeaders);

    const [sub] = await db
      .select({ stripeCustomerId: subscription.stripeCustomerId })
      .from(subscription)
      .where(eq(subscription.workspaceId, ws.id))
      .limit(1);
    if (!sub?.stripeCustomerId) {
      return { error: 'No billing account found' };
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: billingUrl(appUrl, ws.slug),
    });

    redirect(portalSession.url);
  });
}
