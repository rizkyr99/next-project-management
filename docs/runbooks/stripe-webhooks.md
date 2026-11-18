# Runbook: Stripe webhooks

`/api/stripe/webhook` keeps the `subscription` table in step with Stripe (checkout completed, subscription updated/deleted, payment failed).

## Alerts

- **"Stripe webhook signature verification failed"** (warning, grouped): requests with a bad signature. A few are just noise; a steady stream after a deploy or rotation means `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint's signing secret. **Every** event is being dropped; fix the secret ([secrets.md](secrets.md)), then replay (below).
- **Handler errors** (tag `area:stripe-webhook`, with `stripe_event_type` and `extra.stripeEventId`): the event was valid but applying it failed. The route answered 500, so Stripe retries automatically with backoff for up to 3 days. Fix the cause; the retries usually finish the job.

## Replay events

Stripe → Developers → **Webhooks** → the production endpoint → **Event deliveries** → pick the event → **Resend**. Or with the CLI: `stripe events resend evt_… --webhook-endpoint we_…`.

Applying an event again is safe (each one sets the row to the state it describes). But **order matters**: an older `customer.subscription.updated` replayed after a newer one would put the old state back. When several events failed for the same subscription, replay only the **latest**, or compare the row with the subscription in Stripe and resend the event matching Stripe's current state.

## Check a customer by hand

Find their `subscription` row (`user_id`, `stripe_subscription_id`), open the subscription in Stripe, and compare `status`, price and period end. If they differ, resend that subscription's latest event.
