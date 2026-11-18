# Runbook: rotating secrets

General steps: create the new value at the provider → set it in Vercel (Settings → Environment Variables, for each environment that uses it) → **redeploy** (env changes only apply to new deployments) → check the app → revoke the old value.

Never paste secrets into chats, issues or commits. `lib/env.ts` validates them at build and startup.

| Secret | Where to rotate | Effect / notes |
|---|---|---|
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` | Signs sessions: rotating **signs everyone out**. Do it if it leaked. |
| `DATABASE_URL` | Neon → Roles → `neondb_owner` → Reset password | The old URL stops working immediately: set the new one in Vercel and redeploy right away. Also update local `.env` (dev branch). |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Roll | Stripe can keep the old key valid for a while; set an expiry long enough to redeploy. |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → endpoint → Roll secret | Same overlap option. A mismatch drops every webhook: watch the `stripe-webhook-signature` warning in Sentry after rotating. |
| `GOOGLE_CLIENT_SECRET` | Google Cloud → Credentials → OAuth client → Add secret | Add the new one, deploy, then disable the old. |
| `RESEND_API_KEY` | Resend → API Keys | Create new, deploy, delete old. |
| `CRON_SECRET` | `openssl rand -base64 32` | Vercel Cron sends the current value; just redeploy. |
| `UPSTASH_REDIS_REST_TOKEN` / `KV_*` | Upstash → database → Reset token | Rate limits fall back to per-instance memory if unreachable. |
| `CLOUDFLARE_TURN_API_TOKEN` | Cloudflare → Realtime → TURN | Without it, calls fall back to STUN only. |
| `NEON_API_KEY` (GitHub Actions secret) | Neon → Account → API keys | Used only by E2E CI to create test branches. |
