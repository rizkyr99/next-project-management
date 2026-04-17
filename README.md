# Tide

A full-featured project management app built with Next.js 15 App Router. Manage workspaces, projects, and tasks with your team — with real-time notifications, role-based access control, and subscription billing.

**Live demo:** https://next-project-management-three.vercel.app/

![CI](https://github.com/rizkyr99/next-project-management/actions/workflows/ci.yml/badge.svg)

---

## Features

- **Workspaces** — Create isolated workspaces for different teams or clients, each with its own projects and members
- **Role-based access control** — Three roles (owner, admin, member) with enforced permission boundaries in every Server Action
- **Projects & task boards** — Kanban, table, and list views with drag-and-drop reordering via `@dnd-kit`
- **Task management** — Assignees, priority levels, due dates, bulk actions, and inline editing
- **Comments & mentions** — Thread comments on tasks with `@mention` support
- **Real-time notifications** — Server-Sent Events stream new notifications without polling overhead
- **Activity log** — Full audit trail of workspace events (task changes, member activity, status updates)
- **Subscription billing** — Free / Pro / Business tiers via Stripe with enforced workspace limits
- **Authentication** — Email/password and Google OAuth via Better Auth
- **Dark mode** — System-aware theme with manual toggle

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server Actions eliminate a dedicated API layer for mutations |
| Database | PostgreSQL via [Neon](https://neon.tech) | Serverless-compatible, branching for preview envs |
| ORM | Drizzle ORM | Type-safe queries with zero-overhead SQL; schema-as-code |
| Auth | Better Auth | Modern session management, built-in OAuth adapters |
| Payments | Stripe | Industry-standard, webhook-driven subscription lifecycle |
| Email | Resend | Developer-friendly transactional email with React templates |
| UI | Radix UI + Tailwind CSS v4 | Accessible headless components with utility styling |
| Forms | React Hook Form + Zod | Performant form state with end-to-end type-safe validation |
| Drag & drop | @dnd-kit | Accessible, modular DnD without heavy dependencies |
| Testing | Vitest | Fast unit/integration tests with first-class ESM support |

---

## Architecture

```
app/                    # Next.js App Router pages and API routes
  api/
    auth/               # Better Auth handler
    notifications/stream/  # SSE endpoint for real-time notifications
    stripe/webhook/     # Stripe webhook handler
  workspaces/[slug]/    # Workspace-scoped pages (projects, tasks, activity)
  settings/             # Profile and billing pages

features/               # Feature modules (co-locate actions, schemas, components)
  tasks/
  projects/
  workspaces/
  notifications/
  activity/

lib/                    # Shared utilities (auth, stripe, email, subscription)
db/
  schema.ts             # Single source of truth for all Drizzle table definitions
  migrations/           # Drizzle migration history
```

**Key architectural decisions:**
- **Server Actions over REST** — Mutations live as typed server functions, eliminating a round-trip API layer and enabling direct DB access with session context
- **Feature-based modules** — Each feature owns its actions, schemas, and components to keep related code co-located and avoid cross-feature coupling
- **Subscription enforcement at the action layer** — Plan limits are checked in Server Actions before any DB write, not just in UI, so they cannot be bypassed

---

## Local Setup

### Prerequisites

- Node.js 20+
- A PostgreSQL database (Neon free tier works)
- Stripe account (for billing features)
- Google OAuth credentials (for social login)
- Resend account (for invite emails)

### 1. Clone and install

```bash
git clone https://github.com/rizkyr99/next-project-management.git
cd next-project-management
npm install
```

### 2. Configure environment variables

Copy the example and fill in your values:

```bash
cp .env.example .env
```

See the [Environment Variables](#environment-variables) section below for details on each variable.

### 3. Run database migrations

```bash
npx drizzle-kit push
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (e.g. Neon) |
| `BETTER_AUTH_SECRET` | Random secret for session signing — generate with `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Base URL of your app (e.g. `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `RESEND_API_KEY` | Resend API key for sending invite emails |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` for development) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_PRO_PRICE_ID` | Stripe Price ID for the Pro plan |
| `STRIPE_BUSINESS_PRICE_ID` | Stripe Price ID for the Business plan |
| `NEXT_PUBLIC_APP_URL` | Publicly accessible base URL (used in emails and OAuth redirects) |

> **Stripe webhooks in development:** Use the [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward events locally:
> ```bash
> stripe listen --forward-to localhost:3000/api/stripe/webhook
> ```

---

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint
npm test             # Run unit tests (Vitest)
npm run test:watch   # Watch mode
npm run test:coverage  # Coverage report
npx drizzle-kit push      # Push schema changes to the database
npx drizzle-kit studio    # Open Drizzle Studio (visual DB browser)
```

---

## Subscription Plans

| Feature | Free | Pro | Business |
|---|---|---|---|
| Workspaces | 1 | 5 | Unlimited |
| Projects per workspace | Unlimited | Unlimited | Unlimited |
| Members per workspace | Unlimited | Unlimited | Unlimited |
| Activity log | ✓ | ✓ | ✓ |
| Priority support | — | ✓ | ✓ |

Plan limits are enforced server-side in `lib/subscription.ts` — upgrading or downgrading takes effect immediately via Stripe webhooks.

---

## Testing

Unit and integration tests live in `tests/`, mirroring the `features/` and `lib/` structure. Tests use mocked DB and Next.js server modules — no database required to run them.

```bash
npm test
```

CI runs typecheck, lint, and tests on every push and pull request via GitHub Actions.
