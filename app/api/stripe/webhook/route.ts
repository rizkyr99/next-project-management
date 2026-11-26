import * as Sentry from '@sentry/nextjs';
import { db } from '@/db/drizzle';
import { subscription } from '@/db/schema';
import { getPlanFromPriceId, stripe } from '@/lib/stripe';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';

type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'unpaid';

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    // One bad request is noise, but a stream of them usually means
    // STRIPE_WEBHOOK_SECRET doesn't match the endpoint in Stripe (e.g. after
    // rotating it), and every subscription change is being dropped. Grouped
    // into one Sentry issue so an alert can watch its rate.
    Sentry.captureMessage('Stripe webhook signature verification failed', {
      level: 'warning',
      tags: { area: 'stripe-webhook' },
      fingerprint: ['stripe-webhook-signature'],
    });
    return new Response('Webhook signature verification failed', {
      status: 400,
    });
  }

  try {
    await handleEvent(event);
  } catch (error) {
    // A 500 makes Stripe retry with backoff for up to 3 days. Each failure
    // is reported with the event, so it can be replayed by hand once fixed
    // (docs/runbooks/stripe-webhooks.md).
    Sentry.captureException(error, {
      tags: { area: 'stripe-webhook', stripe_event_type: event.type },
      extra: { stripeEventId: event.id },
    });
    return new Response('Webhook handler failed', { status: 500 });
  }

  return new Response(null, { status: 200 });
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // E1: subscriptions belong to workspaces (features/billing/actions.ts).
      const workspaceId = session.metadata?.workspaceId;
      if (!workspaceId || !session.subscription) break;

      const stripeSub = await stripe.subscriptions.retrieve(
        session.subscription as string,
      );
      const priceId = stripeSub.items.data[0]?.price.id ?? '';
      const plan = getPlanFromPriceId(priceId);
      const periodEnd = stripeSub.items.data[0]?.current_period_end;

      await db
        .update(subscription)
        .set({
          stripeSubscriptionId: stripeSub.id,
          stripePriceId: priceId,
          status: stripeSub.status as SubscriptionStatus,
          plan,
          stripeCurrentPeriodEnd: periodEnd
            ? new Date(periodEnd * 1000)
            : null,
          updatedAt: new Date(),
        })
        .where(eq(subscription.workspaceId, workspaceId));
      break;
    }

    case 'customer.subscription.updated': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const priceId = stripeSub.items.data[0]?.price.id ?? '';
      const plan = getPlanFromPriceId(priceId);
      const periodEnd = stripeSub.items.data[0]?.current_period_end;

      await db
        .update(subscription)
        .set({
          stripePriceId: priceId,
          status: stripeSub.status as SubscriptionStatus,
          plan,
          stripeCurrentPeriodEnd: periodEnd
            ? new Date(periodEnd * 1000)
            : null,
          updatedAt: new Date(),
        })
        .where(eq(subscription.stripeSubscriptionId, stripeSub.id));
      break;
    }

    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription;

      await db
        .update(subscription)
        .set({
          stripeSubscriptionId: null,
          stripePriceId: null,
          status: 'canceled',
          plan: 'free',
          stripeCurrentPeriodEnd: null,
          updatedAt: new Date(),
        })
        .where(eq(subscription.stripeSubscriptionId, stripeSub.id));
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      // In Stripe SDK v22, subscription ref is at invoice.parent.subscription_details.subscription
      const subId =
        typeof invoice.parent?.subscription_details?.subscription === 'string'
          ? invoice.parent.subscription_details.subscription
          : invoice.parent?.subscription_details?.subscription?.id;

      if (!subId) break;

      await db
        .update(subscription)
        .set({ status: 'past_due', updatedAt: new Date() })
        .where(eq(subscription.stripeSubscriptionId, subId));
      break;
    }
  }
}
