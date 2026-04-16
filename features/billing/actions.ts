'use server';

import { db } from '@/db/drizzle';
import { subscription } from '@/db/schema';
import { auth } from '@/lib/auth';
import { PLANS, stripe } from '@/lib/stripe';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function createCheckoutSession(plan: 'pro' | 'business') {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  const userId = session.user.id;
  const priceId = PLANS[plan].priceId;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // Get or create Stripe customer
  const sub = await db.query.subscription.findFirst({
    where: eq(subscription.userId, userId),
  });

  let stripeCustomerId: string;

  if (sub?.stripeCustomerId) {
    stripeCustomerId = sub.stripeCustomerId;
  } else {
    const customer = await stripe.customers.create({
      email: session.user.email,
      name: session.user.name,
      metadata: { userId },
    });
    stripeCustomerId = customer.id;

    await db
      .insert(subscription)
      .values({
        userId,
        stripeCustomerId,
        plan: 'free',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: subscription.userId,
        set: { stripeCustomerId, updatedAt: new Date() },
      });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/settings/billing?success=true`,
    cancel_url: `${appUrl}/settings/billing?canceled=true`,
    metadata: { userId },
  });

  if (!checkoutSession.url) {
    return { error: 'Failed to create checkout session' };
  }

  redirect(checkoutSession.url);
}

export async function createPortalSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const sub = await db.query.subscription.findFirst({
    where: eq(subscription.userId, session.user.id),
  });

  if (!sub?.stripeCustomerId) {
    return { error: 'No billing account found' };
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${appUrl}/settings/billing`,
  });

  redirect(portalSession.url);
}
