# Runbooks

What to do when something goes wrong in production, or when a routine change needs care.

| Runbook | When |
|---|---|
| [monitoring.md](monitoring.md) | Setting up or adjusting alerts and uptime checks; what each alert means |
| [rollback.md](rollback.md) | A deploy broke production |
| [migrations.md](migrations.md) | Changing the database schema |
| [backups.md](backups.md) | Data was lost or damaged and must be restored |
| [secrets.md](secrets.md) | A secret leaked or must be rotated |
| [stripe-webhooks.md](stripe-webhooks.md) | Subscriptions out of sync with Stripe, or webhook alerts |

Production: `tide.ramarizdev.web.id` (Vercel project `next-project-management`), database on Neon (production branch `br-small-wildflower-a14679rq`), errors in Sentry (`rizky-ramadhan/next-project-management`).
