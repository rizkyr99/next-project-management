# Runbook: monitoring and alerts

## What reports where

| Signal | Where | Notes |
|---|---|---|
| Server and browser errors | Sentry | Environment is `production`, `preview` or `development` (`lib/sentry-options.ts`); release is the commit SHA. Events carry the user's **ID only**: no email, cookies or IP (`sendDefaultPii: false`). |
| Session replays | Sentry | 10% of sessions, every session with an error. Text and inputs masked. |
| Stripe webhook failures | Sentry, tag `area:stripe-webhook` | Handler errors with `stripe_event_type` and the event ID; bad signatures as one grouped warning. See [stripe-webhooks.md](stripe-webhooks.md). |
| Daily job failures | Sentry, tag `area:cron` | Per part (`job:due-soon`, `digest`, `cleanup`); the route answers 500. |
| CSP violations | Sentry, under **Issues → type: CSP** | Report-Only for now (`lib/csp.ts`). |
| Uptime | `GET /api/health` | 200 `{status:"ok"}` when the database answers, 503 otherwise. |

## Alerts to set up (Sentry → Alerts → Create Alert)

Set each one's environment to **production**, with the action "send a notification to" your email.

1. **New issue**: Issues alert → "A new issue is created". This is the main one.
2. **Error spike**: Metric alert → "Number of errors" → critical above **20 in 5 minutes**. Raise it if it fires on normal traffic.
3. **Stripe webhooks**: Issues alert → "A new issue is created" **or** "The issue is seen more than 1 time in 1 hour" → filter: tag `area` equals `stripe-webhook`. Any of these means subscriptions may be out of sync.
4. **Daily job**: Issues alert → "The issue is seen more than 0 times" → filter: tag `area` equals `cron`.

## Uptime check

Sentry → **Insights → Uptime Monitors** → Add monitor:
- URL `https://next-project-management-three.vercel.app/api/health`, method GET, interval 5 minutes, environment `production`.
- It alerts when the check fails repeatedly. (Any external monitor, such as Better Stack, works the same way against this URL.)

## When an alert fires

1. Open the issue: release (which deploy), user ID, breadcrumbs and replay show what happened.
2. A deploy just went out and the issue is new? Roll back first, investigate after ([rollback.md](rollback.md)).
3. `/api/health` failing? Check Neon's status and the project's compute (Neon console). If the database is up, check Vercel's runtime logs for `[health]`.
