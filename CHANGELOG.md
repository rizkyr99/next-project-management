# Changelog

Notable changes to Tide. Dates are when a release reached production. The plan items (P0.1, P5.4, …) refer to [docs/PRODUCTION_PLAN.md](docs/PRODUCTION_PLAN.md).

## Unreleased

- **Planned:** enforce the strict Content Security Policy (now Report-Only) once Sentry shows a week without violations.

## 1.0.0 (2026-11-18)

The first production-ready release: the app was audited, then hardened over five phases.

### Security
- **Tenant isolation (P0):** every action, page, stream and call route now checks workspace membership through `lib/authz.ts`, in one query. Another workspace's resources answer "not found". Inputs are validated with Zod. Multi-row writes are atomic.
- **Rate limits across instances (P1.4):** limits are counted in Upstash Redis, for auth endpoints per IP and for invites, comments and task creation per user.
- **Content Security Policy (P5.4):**
  - no `eval`;
  - per-request nonces on dynamic pages;
  - a stricter `'strict-dynamic'` policy in Report-Only, with reports in Sentry.
- **Environment checks (P1.5):** a production build or server refuses to start with a missing or malformed secret.
- **Monitoring privacy:** Sentry no longer receives cookies, headers or IP addresses, and identifies users by ID only.

### Features
- **Invites by email (P1.3):** token links that work for people without an account.
- **Email from a verified domain (P1.2)**, with React Email templates.
- **Projects, columns and tasks (P2):**
  - rename and delete projects;
  - manage board columns;
  - a task detail sheet with description and deep links;
  - delete single tasks.
- **Membership lifecycle (P2.4):** leave a workspace, transfer ownership, and assignments removed when a member leaves.
- **Notifications (P2.5, P3.4):** clickable notifications, a notifications page, email preferences, and a daily digest.
- **Accounts (P2.6, P3.1, P3.2):**
  - delete your account;
  - reset your password;
  - verify your email.
- **Due-soon reminders (P3.3)**, from a daily scheduled job.
- **Public site (P4.1):** landing, pricing, privacy and terms pages, plus brand assets and share images.
- **Onboarding (P4.3):** a Getting started project, a first-run checklist, and empty states.
- **Board filters and sorting (P4.4).**
- **Live updates (P5.1):** for edits, moves, assignments, comments and columns, in every board view, catching up after a hidden tab.
- **Calls (beta) (P5.2):**
  - TURN relay;
  - a 4-person limit;
  - fixed: viewing a project no longer joins its call, and leaving now sticks.

### Quality
- **Error handling (P4.2):** 404, error and loading states everywhere, and actions never crash the page.
- **Accessibility (P4.5):** axe checks, screen-reader drag announcements, and focus restored after dialogs.
- **Mobile layouts (P4.6)** and touch-sized controls.
- **Migrations (P1.1):** `db/migrations/` is now the source of truth, and CI rebuilds a database from it.
- **CI (P5.3):**
  - a production build;
  - an 80% coverage gate on actions and authorization;
  - Playwright E2E against a fresh Neon branch per shard.
- **Operations (P5.5):**
  - Sentry environments and alerts;
  - a health endpoint with uptime monitoring;
  - runbooks for rollback, backups, secret rotation and Stripe webhooks.

## 0.1.0 (2026-04-20)

The original app:
- workspaces, projects, kanban/list/table boards, tasks, comments and mentions;
- search, notifications and calls;
- Stripe billing, Google sign-in;
- Sentry and unit-test CI.
