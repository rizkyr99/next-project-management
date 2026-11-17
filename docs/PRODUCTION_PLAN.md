# Production Readiness Plan

> Goal: take Tide from "works on Vercel" to a finished product that a real team could sign up for, invite colleagues into, and rely on.
>
> Audit date: 2026-11-16 · Baseline: `d858a74` (`feat/mobile-header-improvements`)

---

## 0. How to use this document

- Phases are ordered by **risk**, not by how fun they are. Do not start Phase N+1 until Phase N's exit criteria are met. The exception is Phase 4.1 (landing page), which has no dependencies and can run in parallel.
- Each work item has an **ID** (e.g. `P0.2`) so it can be referenced in branch names, commits and PRs: `fix/p0-2-task-authz`, `fix(tasks): enforce workspace membership (P0.2)`.
- Every item lists **Files**, **Steps**, and **Done when** (acceptance criteria). An item is not done until its "Done when" boxes are checked *and* typecheck, lint, unit tests and E2E all pass.
- Branching follows the existing flow: `feature/*` / `fix/*` → `develop` → `main`. Keep one PR per work item where practical.
- Estimates assume one developer working part-time. They are there to support sequencing decisions, not to set deadlines.

### Summary

| Phase | Theme | Items | Est. |
|---|---|---|---|
| **P0** | Security: tenant isolation | 6 | 2–3 days |
| **P1** | Production blockers (DB, email, invites, rate limiting) | 6 | 3–4 days |
| **P2** | Missing CRUD and core UX | 6 | 4–5 days |
| **P3** | Auth and lifecycle | 4 | 2–3 days |
| **P4** | Product polish (landing page, errors, onboarding, a11y) | 6 | 4–5 days |
| **P5** | Hardening (real-time, calls, CI, CSP, docs) | 6 | 3–4 days |

---

## 1. Audit findings

### What is already solid
- Clean feature-module structure (`features/*` co-locates actions, schemas, components).
- `tsc --noEmit` and `eslint` both pass with zero errors.
- Workspace-level actions (`features/workspaces/actions.ts`) correctly check membership and role.
- Search (`features/search/actions.ts`) verifies membership before querying.
- The Stripe webhook verifies signatures, plan limits are enforced server-side, and Sentry, Speed Insights, security headers and CI (typecheck, lint, unit) are in place.
- Comment edit/delete check authorship.

### Gaps, by severity

| # | Severity | Finding | Where |
|---|---|---|---|
| F1 | 🔴 Critical | **Cross-tenant access (IDOR).** Task, comment and activity actions only check that a session exists, not that the user belongs to the task's workspace. Any logged-in user who has (or guesses) an ID can create, edit, move or delete tasks, read comments and read activity in *any* workspace. `bulkDeleteTasks` deletes by `taskIds` without even scoping to `projectId`. | `features/tasks/actions.ts` (all exports), `features/activity/actions.ts` |
| F2 | 🔴 Critical | **The project page doesn't check access.** It loads a project by `projectId` without checking that the project belongs to `workspaceSlug` or that the viewer is a member. | `app/(dashboard)/workspaces/[workspaceSlug]/projects/[projectId]/page.tsx` |
| F3 | 🔴 Critical | **The API routes don't check access.** `/api/tasks/stream`, `/api/call/{join,leave,signal,stream}` accept any `projectId`. A user can join someone else's call room or send them signaling messages. | `app/api/tasks/stream`, `app/api/call/*` |
| F4 | 🟠 High | **The migrations don't match the schema.** The migrations create 13 tables, but `comment`, `activity_log`, `call_participant` and `webrtc_signal` exist only in `schema.ts` (they were likely added with `drizzle-kit push`). A fresh environment can't be rebuilt from migrations. | `db/migrations/*` |
| F5 | 🟠 High | **Emails only go to the account owner.** `FROM` is `onboarding@resend.dev`, Resend's sandbox sender, which only delivers to the account owner. | `lib/email.ts` |
| F6 | 🟠 High | **The invite flow is unfinished.** You can only "invite" users who already have accounts (they are added immediately). The `workspace_invite` table and token, plus `PendingInvitesList` and `revokeInvite`, exist but nothing creates or accepts token invites. | `features/workspaces/actions.ts` |
| F7 | 🟠 High | **The rate limiter does nothing on Vercel.** It stores counts in memory, which isn't shared between serverless instances. | `lib/rate-limit.ts`, `proxy.ts` |
| F8 | 🟠 High | **Server actions skip input validation.** Task actions accept typed params but never call `schema.parse()`, so Zod schemas exist but aren't enforced on the server. | `features/tasks/actions.ts` |
| F9 | 🟡 Medium | **Missing CRUD.** Projects can't be renamed or deleted. Board columns can't be added, renamed, reordered or deleted. There is no single-task delete. Task `description` can't be viewed or edited. | `features/projects/actions.ts`, `features/tasks/*` |
| F10 | 🟡 Medium | **Missing account lifecycle.** There's no forgot/reset password, no email verification, no leaving a workspace, no ownership transfer and no account deletion. | `lib/auth.ts`, `features/account`, `features/workspaces` |
| F11 | 🟡 Medium | **Wrong cache revalidation paths.** Task actions revalidate `/projects/:id`, but the real route is `/workspaces/:slug/projects/:id`, so revalidation never hits. | `features/tasks/actions.ts:52,85,118…` |
| F12 | 🟡 Medium | **Real-time board misses edits.** The SSE change detection only uses `count` + `max(createdAt)`, so edits, moves and reassignments aren't pushed to collaborators. There's no `maxDuration` on stream routes. | `app/api/tasks/stream/route.ts` |
| F13 | 🟡 Medium | **Unused notification type.** Nothing ever creates `due_soon` notifications, because there is no cron. | `db/schema.ts` |
| F14 | 🟡 Medium | **No TURN server for calls.** Video calls will fail behind symmetric NAT or corporate firewalls. | `features/call/hooks/use-webrtc.ts` |
| F15 | 🟡 Medium | **Multi-step writes aren't atomic.** The `neon-http` driver doesn't support interactive transactions. For example, `createWorkspace` inserts the workspace and then the member separately, so a failure can leave orphans. | `db/drizzle.ts`, `features/*/actions.ts` |
| F16 | 🔵 Polish | **Leftover scaffolding.** Root metadata is still "Create Next App". There's no landing page, no `not-found.tsx` and no route `error.tsx`. `public/` holds default Next/Vercel SVGs. There's no `robots`/`sitemap`/OG image. `/api/sentry-example-api` throws on purpose. `.env.example` lists an unused `ABLY_API_KEY`. The README says Next.js 15 (the app runs 16). | various |
| F17 | 🔵 Polish | **Duplicated invite form.** The invite form exists twice (`components/header.tsx` and `features/workspaces/components/invite-member-form.tsx`). | — |

---

## Phase 0: Security: tenant isolation 🔴

**Why first:** F1–F3 mean any user can read or destroy other customers' data. Nothing else matters until this is fixed. Ship this phase before telling anyone about the app.

### P0.1 Central authorization helpers

**Files:** new `lib/authz.ts`, plus tests in `tests/lib/authz.test.ts`

**Steps**
1. Create `server-only` helpers that return the context the action needs, or throw a typed `AuthzError`:
   ```ts
   requireSession(): Promise<Session>
   requireWorkspaceMember(workspaceIdOrSlug, opts?: { roles?: Role[] }): Promise<{ session, workspace, membership }>
   requireProjectAccess(projectId, opts?): Promise<{ session, project, workspace, membership }>
   requireTaskAccess(taskId, opts?): Promise<{ session, task, project, workspace, membership }>
   requireCommentAccess(commentId): Promise<...>
   ```
   Each helper resolves the chain with **one joined query**, e.g. `task → project → member where member.userId = session.user.id`. It should not take several round-trips.
2. Keep the result shape the UI already uses, `{ success | data } | { error }`, typed as `ActionResult<T>` in `lib/authz.ts`. `toActionError()` maps `AuthzError` to `{ error: 'Not found.' }` and Zod errors to their first message, and hides unexpected errors behind a fallback. Missing sessions still throw. Return "not found" rather than "forbidden" so the response doesn't reveal whether the resource exists. *(Decided during implementation: switching to `{ ok }` would have meant rewriting every caller with no security benefit.)*
3. Wrap helpers in React `cache()` where they're called from RSC, the same way `lib/workspace-context.ts` already does.

**Done when**
- [x] Unit tests cover member / non-member / wrong-role / nonexistent cases for each helper. (`tests/lib/authz.test.ts`)

### P0.2 Lock down task, comment and activity actions

**Files:** `features/tasks/actions.ts`, `features/activity/actions.ts`, `features/tasks/schema.ts`

**Steps**
1. Every exported action starts with `schema.parse(input)` (fixes F8) followed by the relevant `require*Access` helper:
   - `createTask` → `requireProjectAccess(projectId)`. Also verify `statusId` belongs to that project.
   - `updateTaskStatus`, `updateTaskTitle`, `updateTaskPriority`, `updateTaskDueDate`, `updateTaskAssignees` → `requireTaskAccess(taskId)`. For status changes, verify the target `statusId` belongs to the same project. For assignees, verify every `userId` is a member of the workspace.
   - `bulkUpdateStatus`, `bulkDeleteTasks`, `reorderTasks` → `requireProjectAccess(projectId)`, and add `AND task.project_id = projectId` to every `WHERE`. If the number of affected rows ≠ `taskIds.length`, reject.
   - `getComments`, `addComment` → `requireTaskAccess`. `addComment` must **derive the mention candidates on the server** from the workspace's members instead of trusting the `workspaceMembers` array the client sends.
   - `getWorkspaceActivity` → `requireWorkspaceMember(workspaceId)`. `getTaskActivity` → `requireTaskAccess`.
2. Add Zod schemas for the actions that lack them (title, priority, due date, assignees, comment body with a max length, e.g. 5 000 chars).
3. Fix revalidation paths (F11): revalidate `/workspaces/${slug}/projects/${projectId}`. The helper context already has the slug.

**Done when**
- [x] Unit tests for each action include a "user from another workspace gets `Not found` and the DB is untouched" case.
- [x] `bulkDeleteTasks` with a task ID from another project deletes nothing.
- [x] Mentioning a non-member in a comment creates no notification. (Also fixed a mention-parsing bug: `@Name` followed by more text never matched.)

### P0.3 Lock down the project page and other RSC data loaders

**Files:** `app/(dashboard)/workspaces/[workspaceSlug]/projects/[projectId]/page.tsx`, `.../my-tasks/page.tsx`, `.../activity/page.tsx`, `.../settings/page.tsx`, `.../account/page.tsx`

**Steps**
1. Resolve access with `requireProjectAccess(projectId)` and assert `project.workspaceId === workspace.id` for the slug in the URL. Call `notFound()` on failure.
2. Audit every page under `[workspaceSlug]` to confirm the data it loads is scoped through `getActiveWorkspace` (which joins `member`).

**Done when**
- [x] An E2E test logs in as user B, opens user A's project URL, and sees a 404. (`e2e/tenant-isolation.spec.ts`, passing. A project ID pasted under B's *own* slug renders the not-found UI with HTTP 200, because `[workspaceSlug]/loading.tsx` has already started streaming; the test asserts on the rendered page.) The workspace layout had the same leak: its sidebar listed projects for any slug. That's fixed too.

### P0.4 Lock down API route handlers

**Files:** `app/api/tasks/stream/route.ts`, `app/api/call/{join,leave,signal,stream}/route.ts`, `app/api/notifications/stream/route.ts`

**Steps**
1. Every handler calls `requireProjectAccess(projectId)` (or for notifications, scopes to `session.user.id`, which should already be the case; verify it).
2. `/api/call/signal`: validate the body with Zod (`type` ∈ enum, `payload` max size such as 64 KB) and verify `toUserId` is currently a participant in the same project's call.
3. Return `404` on access failure.

**Done when**
- [x] A non-member gets `404` from each route. (`tests/api/call-routes.test.ts`, plus API checks in `e2e/tenant-isolation.spec.ts`.) `/api/call/leave` only needs a session, because it deletes only the caller's own rows.

### P0.5 Atomic multi-step writes

**Files:** `db/drizzle.ts`, `features/workspaces/actions.ts`, `features/projects/actions.ts`

**Steps**
1. Use `db.batch([...])` (supported by `neon-http`) for writes that must succeed or fail together: workspace + owner membership, project + default statuses + welcome task.
2. If a flow needs read-then-write inside a transaction, add a second client using `drizzle-orm/neon-serverless` (WebSocket `Pool`) and export it as `dbTx`. Only use it where it's needed, because it's slower on cold start.

**Done when**
- [x] A forced failure in the second statement leaves no orphan rows. `createWorkspace` and `createProject` generate IDs up front and write through `db.batch()`, which `neon-http` runs as a single `client.transaction()`. The second `dbTx` client wasn't needed. Also added along the way: server-side slug/name validation, a "URL already taken" message (via `lib/db-errors.ts`), persisting project descriptions, and fixing the create-project dialog, which navigated to `/projects/undefined` on error.

### P0.6 Fix the README's security claim

The README says "enforced permission boundaries in every Server Action". Once P0.1–P0.4 have landed, that will be true. Add a short **Security model** section explaining the `require*Access` helpers.

- [x] Done: README now has a **Security Model** section, and the Next.js version is corrected to 16.

**Phase 0 exit criteria:** every server action and route handler that takes an ID goes through a `require*` helper (verify recursively with `find features -name '*actions.ts' -o -path 'app/api/*' -name route.ts | xargs grep -L require`, because a plain `**` glob in bash only matches one level), and the cross-tenant E2E test passes.

---

## Phase 1: Production blockers 🟠

### P1.1 Make migrations the source of truth (F4)

**Context:** production was likely built with `drizzle-kit push`, so prod already has all 17 tables, but the migration history only knows about 13.

**Steps**
1. **Snapshot first.** In the Neon console, create a branch of production named `pre-migration-baseline`. It costs nothing and gives an instant rollback.
2. Run `npx drizzle-kit generate --name sync_missing_tables` against the current `schema.ts`. Review the SQL: it should create `comment`, `activity_log`, `call_participant`, `webrtc_signal`, the `signal_type` enum and their indexes/FKs, and nothing else.
3. Verify against a **fresh, empty** Neon branch: `drizzle-kit migrate` from zero must produce a schema identical to prod. Compare with `drizzle-kit pull` output or `pg_dump --schema-only` diff.
4. **Baseline production** (whose tables already exist): check whether `drizzle.__drizzle_migrations` exists in prod.
   - If it does and has rows for 0000/0001, insert the row for the new migration manually (hash + `created_at` exactly as drizzle-kit would) so `migrate` treats it as applied.
   - If it doesn't exist, run `migrate` against a *copy* of prod first to see what happens, then baseline all three.
   - Write the exact commands used into `docs/runbooks/migrations.md`.
5. Add scripts to `package.json`: `db:generate`, `db:migrate`, `db:studio`. Ban `push` against prod: add a comment in `drizzle.config.ts` and a line in the README.
6. Add a CI job: spin up Postgres (service container), run `db:migrate` from zero, then `drizzle-kit check`. This catches future drift.

**Done when**
- [x] A fresh database built purely from migrations matches prod's schema. (Diffed `pg_dump --schema-only` of the `.env` Neon DB against a fresh Postgres 17 built from migrations: identical apart from six legacy PK constraint names, which are cosmetic. See `docs/runbooks/migrations.md`.)
- [x] CI fails if `schema.ts` changes without a migration. (`Migrations` job: migrate from zero, then `db:check`, then `db:generate` must produce nothing. CI now also runs on `develop`.)
- [ ] Production ledger baselined (insert the `0002` row; exact SQL in the runbook). Needs the Neon snapshot first.

### P1.2 Production email (F5)

**Files:** `lib/email.ts`, new `emails/` directory, `.env.example`

**Steps**
1. Verify a sending domain in Resend (SPF/DKIM DNS records). The Vercel domain can't be used, so this needs a custom domain (also useful for P4.1).
2. Move `FROM` into `EMAIL_FROM` (e.g. `Tide <notifications@yourdomain.com>`) and `APP_URL` into `NEXT_PUBLIC_APP_URL`. Today there are two different env vars for the same thing (`BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL`), so pick one.
3. Adopt **React Email** (`@react-email/components`) with a shared `EmailLayout` (logo, footer, unsubscribe/help link). Templates: `workspace-invite`, `password-reset`, `verify-email`, `due-soon-digest`.
4. **Escape user content.** `inviterName` and `workspaceName` are interpolated into HTML unescaped today. React Email escapes them automatically.
5. Email failures must not fail the action: wrap sends, log to Sentry, and still return success with a `warning` the UI can show.

**Done when**
- [x] An invite sent to an outside Gmail address arrives in the inbox (not spam), with working links. (2026-11-17: sent from `notifications@tide.ramarizdev.web.id`, Resend reported `delivered`, and it landed in the Gmail **Inbox**. Live in production since release PR #24.)

*Progress:* sending domain `tide.ramarizdev.web.id` verified in Resend (SPF/DKIM). `EMAIL_FROM` is required in production by `lib/env.ts`. Templates live in `emails/` (React Email, shared `EmailLayout`, auto-escaped), with a plain-text part. Email failures never fail the action (since P1.3). `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` are unified behind `siteUrl()` (since P1.6). The `password-reset`, `verify-email` and `due-soon-digest` templates will come with their features (P3 and the due-soon cron).

### P1.3 Token-based invites (F6)

**Files:** `features/workspaces/actions.ts`, new `app/invite/[token]/page.tsx`, `features/workspaces/components/invite-member-form.tsx`, `components/header.tsx`, `db/schema.ts`

**Design**
- Inviting always creates a `workspace_invite` row (status `pending`, `expiresAt = now + 7 days`), whether or not the email has an account. Adding users directly is removed: being added to a workspace without consent isn't something users expect.
- **Token:** 32 random bytes, base64url. Store **only a SHA-256 hash** in `workspace_invite.token`; the raw token goes only in the email. Add a unique index on `token` and a partial unique index on `(workspace_id, lower(email)) WHERE status = 'pending'` to prevent duplicate pending invites.
- The existing user still gets an in-app `workspace_invite` notification linking to `/invite/[token]`.

**Steps**
1. Rewrite `inviteUserToWorkspace`: permission check (owner/admin; admins can't invite owners), duplicate-member check, upsert pending invite (re-inviting refreshes the token and expiry), send the email.
2. Add `acceptInvite(token)` and `declineInvite(token)` actions:
   - hash the token, then look up the pending, unexpired invite
   - require the session email to match the invite email (case-insensitive); otherwise show "This invite was sent to x@… — switch account"
   - in one batch: insert `member` with the invite role and mark the invite `accepted`
   - write activity `member.joined` and redirect to the workspace.
3. `/invite/[token]` page states: valid (logged in) → accept/decline card; valid (logged out) → "Sign in or create an account to join *Workspace*" with `?callbackURL=/invite/[token]` carried through login and register; expired / revoked / already accepted / invalid → friendly message.
4. Add `/invite` to the public paths in `proxy.ts` so logged-out users can see the page.
5. Add a "Resend" action next to "Revoke" in `PendingInvitesList`.
6. Remove the duplicated invite form in `components/header.tsx` and reuse `InviteMemberForm` (F17).
7. Count pending invites + members toward a member cap if plans gain one later. Leave a `// TODO(plan-limits)` note, nothing more.

**Done when**
- [x] E2E: owner invites a brand-new email → that person registers via the link → lands in the workspace as the invited role. (`e2e/invites.spec.ts`)
- [x] Expired, revoked and wrong-account tokens all show the right message. Malformed tokens do too, and re-inviting invalidates the old link.
- [x] The raw token never appears in the database. (The E2E test asserts the stored value is the SHA-256 hash and that no row matches the raw token.)

*Implementation notes:* in-app notifications link to `/invites`, which lists pending invites for the signed-in email, so the raw token is never stored anywhere. After sending, the inviter sees a copyable link (the only time it can be shown), which also covers email failure until P1.2. A user with no workspace who has pending invites is routed to `/invites` instead of "create workspace". Migration `0003_token_invites` adds `declined` status, a unique `(workspace_id, user_id)` on `member`, a unique token index and a partial unique pending-email index, and expires legacy pending invites that hold raw tokens. E2E refuses to run against the production Neon branch (`e2e/global-setup.ts`).

### P1.4 Distributed rate limiting (F7)

**Files:** `lib/rate-limit.ts`, `proxy.ts`, `.env.example`

**Steps**
1. Add Upstash Redis through the Vercel Marketplace (free tier) and `@upstash/ratelimit`.
2. Keep the existing `rateLimit(key, opts)` signature so callers don't change. Implement it with `Ratelimit.slidingWindow`, and fall back to the in-memory version when the `UPSTASH_*` env vars are missing (local development).
3. Apply limits:
   - `/api/auth/*`: 20/min per IP (already exists).
   - Invites: 20/hour per user.
   - Comments: 30/min per user.
   - Task creation: 120/min per user.
   - Password reset: 5/hour per email.
4. Use `x-real-ip` / `request.ip` rather than the first `x-forwarded-for` entry, which a client can spoof.

**Done when**
- [x] Hammering login from two different serverless instances is limited consistently. Verified against the real Upstash database: two separate Node processes each fired 15 concurrent requests at one key with a 20/min limit, and exactly **20 of 30** were allowed in total (10 and 10). The old in-memory limiter would have allowed all 30.

*Implementation notes:* `lib/rate-limit.ts` uses an Upstash sliding window with a 1s timeout and **fails open**, logging to Sentry, so a Redis hiccup can't lock users out. Keys are prefixed per environment (`tide:<env>:rl:…`), so dev and preview runs sharing the free-tier database never touch production counters. Without credentials it falls back to in-memory. IP comes from `x-real-ip` (set by Vercel), never the client-controlled first `x-forwarded-for` entry. **Pre-existing bug found:** the proxy `matcher` excluded `/api/*`, so auth endpoints had **never** been rate limited. `/api/auth/:path*` is now matched. Limits: credential endpoints (sign-in, sign-up, password reset/change, verification email) 20/min per IP. Other `/api/auth` traffic (background session reads) 300/min per IP, so an office behind one NAT isn't locked out. Invites and resends 20/hour, comments 30/min, task creation 120/min, all per user. Password reset 5/hour per email waits for the reset flow (P3); the endpoint is already covered by the per-IP limit. *E2E note:* done in P2.2. `registerAndLogin` gives each simulated user its own `x-real-ip`.

### P1.5 Environment hygiene

**Steps**
1. Validate env at boot with a `lib/env.ts` (Zod or `@t3-oss/env-nextjs`) so a missing `STRIPE_SECRET_KEY` fails the build instead of failing at runtime. Today `lib/stripe.ts` falls back to `''`.
2. Clean up `.env.example`: remove `ABLY_API_KEY`; add `EMAIL_FROM`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CRON_SECRET`, `NEXT_PUBLIC_TURN_*` (see P5.2).
3. Delete `app/api/sentry-example-api/route.ts`.
4. Confirm `.env` and `.env.sentry-build-plugin` are in `.gitignore` (they currently exist locally).

**Done when**
- [x] `lib/env.ts` validates required server vars (presence and format). A production build on Vercel fails (`next.config.ts`), and a production server refuses to start (`instrumentation.ts`). Development only warns. Verified: a simulated `VERCEL_ENV=production` build with a blank `RESEND_API_KEY` exits 1 with `RESEND_API_KEY: missing`. `SKIP_ENV_VALIDATION=1` is the escape hatch.
- [x] `.env.example` added. It didn't exist before; `.gitignore`'s `.env*` blocked it, so it's now whitelisted. It has no `ABLY_API_KEY`, and the future vars are listed as commented placeholders.
- [x] `app/api/sentry-example-api` deleted.
- [x] `.env` and `.env.sentry-build-plugin` confirmed ignored.

### P1.6 Real app metadata

**Files:** `app/layout.tsx`

Set `metadata` with `title: { default: 'Tide', template: '%s · Tide' }`, a real description, `metadataBase`, `openGraph` and `twitter`. Add per-page `generateMetadata` for workspace and project pages (e.g. "Website Redesign · Acme · Tide").

- [x] Done. The root has a title template, description, `metadataBase` (`lib/site.ts`), OpenGraph/Twitter, and a generated `app/opengraph-image.tsx`, which the proxy makes reachable while logged out, for link-preview crawlers. The workspace layout and project page use `generateMetadata` resolved through membership, so a foreign slug or project ID leaks no names via `<title>`. Workspace pages are `noindex`. Every page now has a title (`e2e/metadata.spec.ts`). Found along the way: `/settings/profile` is a placeholder that renders "TEst" and nothing links to it (candidate for P2/P4).

**Phase 1 exit criteria:** a stranger can be invited by email, receive it, sign up and land in the workspace. A fresh database can be built from migrations. Rate limits hold across instances.

---

## Phase 2: Missing CRUD and core UX 🟡

All new actions here must use the Phase 0 `require*` helpers and Zod validation from the start.

### P2.1 Project settings: rename, describe, delete

**Files:** `features/projects/actions.ts`, `features/projects/schema.ts`, new `features/projects/components/project-settings-dialog.tsx`, project page header

**Steps**
1. Add `updateProject({ projectId, name, description })` (any member) and `deleteProject({ projectId })` (owner/admin only).
2. Add a settings dialog reachable from a "⋯" menu in the project header. Delete uses `AlertDialog` with type-the-name confirmation, the same pattern as `delete-workspace-button.tsx`.
3. `createProject` currently ignores `description`, even though the dialog collects it. Persist it.
4. Show projects in the sidebar with a hover menu (rename, delete).
5. Activity: `project.updated`, `project.deleted`.

**Done when**
- [x] Renaming updates the sidebar and breadcrumbs without a reload. Deleting redirects to the workspace home and removes the project from the sidebar. (`e2e/projects.spec.ts` proves no full reload with a window marker. There are no breadcrumbs, but the header, sidebar and `<title>` all update. The project description now shows under the title. `createProject` has persisted `description` since P0.5.)

### P2.2 Board column (status) management

**Files:** new `features/projects/status-actions.ts` (or extend `actions.ts`), `features/tasks/components/board-column.tsx`, `features/projects/components/board-view.tsx`

**Steps**
1. Actions: `createStatus`, `renameStatus`, `reorderStatuses`, `deleteStatus({ statusId, moveTasksTo })`.
2. Rules: a project always keeps ≥ 1 status. Deleting the default status requires choosing a new default. Deleting a non-empty column requires a target column, with all tasks moved in the same batch. **Change the FK `task.status_id` from `onDelete: cascade` to `restrict`** (migration) so tasks can never be silently deleted with a column.
3. UI: "+ Add column" at the end of the board, a column header menu (rename inline, set as default, delete), and drag-to-reorder columns with `@dnd-kit/sortable` (horizontal).
4. Add an optional `color` column on `task_status` for the column dot. Keep it small.

**Done when**
- [x] Deleting a column with tasks prompts for a destination, and no task is lost.
- [x] Column order persists across reloads and for other users. (`e2e/columns.spec.ts` covers add, inline rename, deleting the default column that holds a task (the destination becomes the default and the task is moved), keyboard reorder, and reload.)

*Implementation notes:* `task.status_id` uses **`NO ACTION`**, not `RESTRICT`. Both refuse to delete a column that still holds tasks, which was verified on dev with `23503 foreign_key_violation`. But RESTRICT is checked immediately, even inside a cascade, so deleting a project (which cascades to columns and tasks in one statement) could fail. NO ACTION is checked at the end of the statement, and the project cascade was verified to leave 0 rows. `deleteStatus` moves tasks with a `CASE` on order (preserving their relative order, appended after the destination's tasks), reassigns the default and deletes, all in one `db.batch`. Other rules: at least one column, at most 20, and reorder must list exactly the project's columns. Any member can shape the board, since deleting a column never deletes tasks. **Accessibility:** columns reorder by drag (header grip) or keyboard (Space, then arrows, then Space). During a column drag, collision detection and keyboard stepping only consider columns; otherwise the tasks inside a neighbouring column swallowed each arrow press. **Hydration fix (P2.1):** the project header passed a server-rendered `<Button>` as a prop into the client menu, which intermittently caused a hydration mismatch (3 in 5 runs, then 0 in 5 after the fix). *E2E:* `registerAndLogin` gives each simulated user its own `x-real-ip` (198.18.0.0/15), so the suite's sign-ups don't trip the real 20/min per-IP limit when runs go back-to-back.

### P2.3 Task detail view

**Files:** `features/tasks/components/task-card.tsx` (565 lines, so split it), new `features/tasks/components/task-detail/*`, `features/tasks/actions.ts`

**Steps**
1. Extract the existing task dialog from `task-card.tsx` into `TaskDetailSheet`, a right-side `Sheet` on desktop and full-screen on mobile. It shows: title (inline edit), status, priority, assignees, due date, **description**, comments and activity.
2. Description: start with an auto-growing `Textarea` that saves on blur / ⌘↵, with Markdown rendered in read mode (`react-markdown` + `rehype-sanitize`). A rich text editor is out of scope for now.
3. Add `updateTaskDescription` and a single `deleteTask` action (with an undo toast: delay the delete for 5 s client-side, or soft-delete via `deletedAt`, whichever is simpler).
4. **Deep linking:** the open task is reflected in the URL as `?task=<id>`. The project page reads it and opens the sheet. Notifications, search results, activity items and emails all link to `/workspaces/:slug/projects/:pid?task=:tid`.
5. Allow an optional `description` in `createTaskSchema`, and show a small "has description" icon on board cards.

**Done when**
- [x] Opening a task from search, activity, My tasks or a pasted URL opens the right task. Notifications follow in P2.5, which adds the `taskId`/`href` columns they need.
- [x] `task-card.tsx` is under ~200 lines (now ~100; the sheet lives in `task-detail/`).

**Notes:** delete uses a client-side 5 s undo window (the server delete runs only after it), so Undo needs no restore path. A link to a missing task shows "That task no longer exists." No task emails exist yet, so there were none to update.

### P2.4 Membership lifecycle

**Files:** `features/workspaces/actions.ts`, `features/workspaces/components/member-list.tsx`, workspace settings page

**Steps**
1. `leaveWorkspace`: any non-owner. Unassigns them from tasks in that workspace.
2. `transferOwnership(toMemberId)`: owner only. In one batch: new owner → `owner`, old owner → `admin`, and update `workspace.userId` (used for billing limits). Confirm with a dialog.
3. When a member is removed, also unassign their tasks (today their assignee rows remain).
4. Guard: the last owner can't leave or be demoted.

**Done when**
- [x] Unit tests cover the last-owner guard and transfer.

**Notes:** a workspace has exactly one owner, so "last owner" means "the owner": they can't leave until they transfer, and the owner's role can't be changed (only moved by transfer). Transfer also refuses if the new owner's plan is already at its workspace limit, since `workspace.userId` counts toward it. Unassigning lives in `lib/membership.ts` and runs in the same batch as the membership delete.

### P2.5 Actionable notifications

**Files:** `db/schema.ts`, `features/notifications/*`, `components/notifications-popover.tsx`

**Steps**
1. Notifications currently store only display strings. Add nullable `workspaceId`, `projectId` and `taskId` columns plus an `href` column (migration) so each notification can link somewhere. Never store raw invite tokens here. Invite notifications link to a new `/invites` page that lists the signed-in user's pending invites, matched by verified email, with accept/decline buttons.
2. Clicking a notification marks it read and navigates there.
3. Add an empty state, a "view all" page (`/notifications`) with pagination, and delete notifications older than 90 days in the P3.3 cron.

**Status:** done. Migration `0005_notification_links` adds `workspace_id`, `project_id` and `task_id` (all `ON DELETE CASCADE`, so a notification never outlives what it links to), `href`, and a `(user_id, created_at desc)` index. Task notifications link to `?task=`; invites link to `/invites`. Rows from before the migration have no link (invite rows still fall back to `/invites`). `deleteExpiredNotifications()` in `lib/notifications.ts` is ready for the P3.3 cron to call.

### P2.6 Account deletion

**Files:** `features/account/actions.ts`, `app/(dashboard)/settings/profile/page.tsx`

**Steps**
1. Block deletion while the user is sole owner of any workspace that has other members: list those workspaces and require a transfer or deletion first.
2. Cancel the Stripe subscription (`stripe.subscriptions.cancel`) before deleting.
3. Delete the user. Cascades handle the rest. Sign out and redirect to `/`.
4. Required for Google OAuth verification and good practice for GDPR.

**Status:** done. The delete button lives on the Account page (`/workspaces/:slug/account`, Danger zone); `/settings/profile`, a placeholder until now, forwards there. Confirmation is the account email plus the password for credential accounts (rate limited, 5 per 15 min). Workspaces the user owns alone are listed in the dialog and deleted with the account; shared ones block deletion and link to their settings. If the Stripe cancel fails, nothing is deleted.

**Phase 2 exit criteria:** every entity a user can create, they can also edit and delete. Every notification is clickable.

---

## Phase 3: Auth and lifecycle

### P3.1 Password reset

**Files:** `lib/auth.ts`, new `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`, login form

**Steps**
1. Configure Better Auth `emailAndPassword.sendResetPassword` to send the `password-reset` React Email template.
2. Pages: request form (always answers "If an account exists, we've sent a link" so it doesn't reveal which emails are registered), and a reset form that reads `?token=`.
3. Add a "Forgot password?" link on the login form. Rate limit per P1.4.
4. Revoke other sessions on reset (`revokeSessionsOnPasswordReset: true`).

**Status:** done. Links expire after 1 hour and work once. The email is sent after the response (`after()`), so "account exists" and "no account" answer equally fast. Both pages are public in `proxy.ts`. Google-only accounts can use the flow to add a password, since they prove mailbox ownership.

### P3.2 Email verification

**Steps**
1. Configure `emailVerification.sendVerificationEmail` and `sendOnSignUp: true`.
2. Use a **soft gate**: unverified users can use the app, but see a banner ("Verify your email to receive invites and notifications") and **can't accept invites or receive email notifications** until verified. A hard gate adds friction for portfolio visitors.
3. Google OAuth users are already verified.

**Status:** done. Links expire after 24 h and sign the user in on success. They always land on `/email-verified`, which also explains expired or invalid links and offers a resend. The banner sits under the header in every workspace. Accepting an invite through its emailed token also marks the account verified, since the token proves the mailbox. No notification emails exist yet; P3.4 must only send them to verified addresses.

### P3.3 Scheduled jobs (due-soon notifications) (F13)

**Files:** new `app/api/cron/due-soon/route.ts`, `vercel.json`

**Steps**
1. Add a cron route secured with `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron sends this automatically).
2. Run it hourly: find tasks with `dueDate` within the next 24 h, not in the project's last ("done") column, and with assignees. Insert one `due_soon` notification per assignee per task. Make the job **idempotent** with a `due_soon_notified_at` column on `task_assignee`, or a unique key on `(user_id, task_id, type)`.
3. Run a daily digest email at 08:00 UTC (opt-in, see P3.4).
4. Also clean up: expire `pending` invites past `expiresAt`, delete stale `webrtc_signal` rows (> 1 h) and `call_participant` rows with `lastSeen` > 2 min, and delete notifications older than 90 days.
5. Note: Vercel Hobby limits crons to once per day. Hourly needs Pro, or else use daily due-soon checks with a 48 h window.

**Status:** done, as one daily job: `/api/cron/daily` at 08:00 UTC (`vercel.json`), with a 48 h due-soon window because the project is on Hobby. Reminders are idempotent through `task_assignee.due_soon_notified_for` (migration 0006), and moving a due date re-arms them. Reminders go only to current members, and skip tasks in the project's last column. Cleanup expires pending invites, deletes `webrtc_signal` older than 1 h and `call_participant` not seen for 2 min, deletes expired `verification` rows (reset tokens), and deletes notifications older than 90 days. The daily digest email (step 3) moves to P3.4, since it needs the preferences. **Deploy:** set `CRON_SECRET` in Vercel (production); without it the route refuses every call.

### P3.4 Notification preferences

**Steps**
1. Add a `user_preferences` table (or a JSON column on `user`): `emailOnAssign`, `emailOnMention`, `emailDigest`.
2. Settings UI under `/settings/profile` → "Notifications".
3. Every email send checks preferences. Every email footer links to this page.

**Status:** done. Preferences live in a `user_preferences` table (migration 0007; a missing row means the defaults: assign and mention emails on, digest off). They're edited at `/settings/notifications`, linked from the Account page and from every notification email's footer. Assignment and @mention emails go out via `after()`, and only to verified addresses with that preference on. The daily digest (moved here from P3.3) runs in the daily cron after the due-soon reminders. It lists up to 10 unread notifications since the last digest, and each user is claimed once per 20 h so retries never double-send. Sentry is now enabled only in production builds; dev and E2E traffic had been flooding the `/monitoring` tunnel.

**Phase 3 exit criteria:** a user who forgets their password can recover. Due dates trigger notifications. Users control which emails they receive.

---

## Phase 4: Product polish 🔵

### P4.1 Public marketing surface *(can start any time)*

**Files:** `app/(marketing)/page.tsx`, `app/(marketing)/pricing/page.tsx`, `app/(marketing)/{privacy,terms}/page.tsx`, `proxy.ts`, `app/(dashboard)/page.tsx`

**Steps**
1. Move the current redirect logic out of `/`: logged-in users visiting `/` go to their workspace, logged-out visitors see the landing page. Update `proxy.ts` so the marketing routes are public. Also remove the `session!` non-null assertion in `app/(dashboard)/page.tsx`.
2. Landing page sections:
   - hero (one-line value proposition, "Get started free" / "Live demo" CTAs)
   - real product screenshots (board, task detail, dark mode)
   - feature grid
   - pricing generated from `PLANS` in `lib/stripe.ts` (single source of truth)
   - FAQ and footer.
3. Privacy policy and terms. Both are required for Google OAuth production verification and for Stripe.
4. Brand assets: logo SVG, `app/icon.svg`, `app/apple-icon.png`, `app/opengraph-image.tsx` (dynamic OG with `next/og`). Delete the default `public/*.svg` files.
5. `app/robots.ts` and `app/sitemap.ts` (marketing pages only; disallow `/workspaces`).
6. Optional: a **demo account** button that signs into a seeded read-mostly workspace. This is very useful for a portfolio project. It needs a seed script (`scripts/seed-demo.ts`) and a nightly reset in the P3.3 cron.

**Done when**
- [ ] Lighthouse ≥ 95 for Performance, Accessibility, Best Practices and SEO on `/`. Measured on a local production build: **desktop 100 / 100 / 96 / 100**; **mobile 87 / 100 / 96 / 100**. Best Practices is 96 only because Speed Insights' script 404s off Vercel. Mobile Performance is held back by client JS start-up under simulated slow 4G (LCP ~3.9 s, mostly "render delay" after the 18 KB hero image has loaded). The remaining lever is shipping less JS on public pages (root-layout providers, Sentry core); see the follow-up below.
- [x] Sharing the URL in Slack/Twitter shows the OG card (`app/opengraph-image.tsx`, from P1.6).

**Status:** shipped except the demo account (step 6, optional; not started). `/` is a static landing page, and the proxy sends signed-in visitors to `/home` (the old dashboard redirect). Prices live in `lib/plans.ts`, shared with in-app billing. Screenshots are real, captured from a seeded demo workspace on the dev branch. The legal pages read `NEXT_PUBLIC_CONTACT_EMAIL`. Found and fixed along the way: the proxy redirected Sentry's `/monitoring` tunnel to `/login` for logged-out visitors (their errors were lost); the CSP blocked Replay's worker (`worker-src blob:`); Replay is now lazy-loaded from Sentry's CDN (about 120 KB less JS on every page); comment @mention highlighting swallowed the rest of the sentence; stacked avatar initials were clipped.

**Follow-up:** trim client JS on public pages to reach 95 on mobile.

### P4.2 Error, 404 and loading states

**Steps**
1. `app/not-found.tsx` (global) and `app/(dashboard)/workspaces/[workspaceSlug]/not-found.tsx` (in-app shell with "Back to workspace").
2. `error.tsx` for `[workspaceSlug]` and `projects/[projectId]`, with a "Try again" (`reset()`) button that reports to Sentry.
3. `loading.tsx` skeletons for project, my-tasks, activity and settings, matching the real layouts so content doesn't jump when it loads.
4. Server actions: replace `throw new Error('Unauthorized')` with returned errors, and show every `{ ok: false }` as a toast. No action should surface the generic Next.js "An error occurred in the Server Components render".

**Status:** done.
- **404s:** a global `app/not-found.tsx`, and an in-app one inside the workspace shell with "Back to workspace".
- **Error boundaries:** `error.tsx` for the workspace and project routes (shared `RouteError`: Sentry, "Try again", a way out, the error digest). `global-error.tsx` replaces Next's bare default.
- **Loading:** skeletons matched to each page (workspace home, project board, my tasks, activity, settings) replace the spinner.
- **Server actions:** `runAction()` wraps the 10 actions that used to throw, and `toActionError` returns *"Your session has expired. Log in again to continue."* instead of rethrowing.
- **Proxy:** it no longer redirects server-action POSTs to `/login`. That redirect produced "An unexpected response was received from the server". Every action checks the session itself; this was audited.
- **Callers:** they now toast returned errors (profile, delete workspace, billing).

### P4.3 Onboarding and empty states

**Steps**
1. Seed a new workspace with a "Getting started" project containing 5–6 tasks that teach the app (drag me, assign yourself, try ⌘K, invite a teammate…). This replaces the single "Welcome to your new project!" task created for every project, so new projects start empty.
2. Design empty states for: no projects, empty column, no tasks assigned (my-tasks), no activity, no search results, no notifications. Each one gets an illustration/icon, a sentence and a primary action.
3. Add a first-run checklist on the workspace home: create project → add task → invite teammate. Dismissible, and the completion state is derived from data rather than stored separately.

**Status:** done.
- **Getting started:** every new workspace gets a "Getting started" project (`lib/onboarding.ts`), written in the same batch as the workspace. It has 7 tasks, each teaching one thing. New projects now start empty.
- **Checklist:** owners and admins see it on the workspace home. Completion is derived from the activity log (the seed logs none, so it counts *your* first project and task) and from members or pending invites. "Hide" is kept in a cookie, so it never flashes, and the checklist disappears once all three steps are done.
- **Empty states:** a shared `EmptyState` for workspace projects, My tasks (and filtered-empty), activity, search and the notifications page. Empty board columns get a hint in the default column only.
- **Related fixes:**
  - The board no longer remounts on every data refresh, so open forms survive a refresh.
  - The task panel refreshes once before reporting "no longer exists", so a just-created task opens.

**Noticed, not changed:** brand-new free users see "Workspace limit reached" in the sidebar straight away, because the Free plan allows one workspace. Worth softening in a billing pass.

### P4.4 Board filtering and sorting

**Steps**
1. Add a filter bar on the project page: assignee (including "Me" and "Unassigned"), priority, due (overdue / this week / none), and text search.
2. Keep state in the URL (`?assignee=me&priority=high`) so filters are shareable and survive reloads. Use `nuqs` or a small helper around `useSearchParams`.
3. In list and table views, columns can be sorted.
4. Filter on the client (data is already loaded per project). Revisit if projects exceed ~1 000 tasks.

**Status:** done.
- **Filter bar:** text, assignee (Anyone / Me / Unassigned / a member), priority and due date (overdue, this week, none). The pure logic lives in `features/tasks/filters.ts`.
- **URL state:** filters are kept in the URL via `history.replaceState`, so there's no server round trip, and switching views keeps them.
- **Board:** shows "N of M" while filtered, and disables card dragging (columns still reorder), because reordering a subset would scramble the hidden cards.
- **List and table:** filter, then sort by task, status, priority and due date (`?sort=…&dir=…`). Bulk selection only covers visible tasks.

### P4.5 Accessibility pass

**Steps**
1. Run the `design:accessibility-review` skill and axe DevTools on: login, board, task detail, settings.
2. Make drag-and-drop work from the keyboard: configure `KeyboardSensor` with `sortableKeyboardCoordinates` and add screen-reader announcements in `@dnd-kit`.
3. Check focus is restored after closing dialogs, every icon-only button has an `aria-label`, and colour contrast meets AA in both themes (priority badges especially).
4. Add `@axe-core/playwright` to the E2E suite for the main pages.

**Status:** done.
- **Automated checks:** `e2e/a11y.spec.ts` runs axe (WCAG 2.1 A/AA) on 6 public pages, and on 13 app screens in both light and dark mode. Set `A11Y_OUT=file.jsonl` to dump the failing nodes while fixing.
- **What it found, now fixed:**
  - 30+ unlabelled buttons and comboboxes: row menus, status selects in list and table, comment send/edit/delete.
  - An unnamed progress bar on create-workspace.
  - Contrast: `--muted-foreground` darkened to 0.5 L so it clears 4.5:1 on grey surfaces too; the dark-mode upgrade card; the Danger zone tab.
  - Auth links that relied on colour alone, now brand colour plus underline.
- **Drag and drop:** dnd-kit announcements use task and column names instead of ids, and there are clear instructions.
- **Focus:** closing the task panel returns focus to the card or row that opened it.
- **Not in scope:** a manual screen-reader walkthrough (VoiceOver/NVDA) is still worth doing before a public launch.

### P4.6 Mobile pass

Also collapse the project filter bar (P4.4) behind a single "Filters" button on phones; today its four controls wrap onto three rows.

Continue the work on `feat/mobile-header-improvements`: the board scrolls horizontally with snap, the task sheet goes full-screen, touch targets are ≥ 44 px, and `TouchSensor` with a press delay is configured so scrolling doesn't start drags.

**Status:** done.
- **Board:** on phones, columns are 85vw wide (up to 320 px) and the board scrolls with snap, so the next column peeks in. From `sm` up there is no snap and columns stay 256 px.
- **Dragging:** `MouseSensor` (5 px) and `TouchSensor` (250 ms press, 8 px tolerance) replace `PointerSensor`, so a swipe scrolls and a long press drags.
- **Touch targets:** on coarse pointers, icon buttons and the sheet's Close button get an invisible hit area of at least 44 px, without changing the layout.
- **Filters:** on phones, the three selects fold behind a "Filters (n)" toggle next to the search box.
- **Smaller fixes:**
  - The verify-email banner uses a one-line text on phones.
  - "Start call" shrinks to its icon and keeps its accessible name.
  - The setup checklist's action buttons drop below the step text.
  - The task panel is already full-screen.
- **Also fixed:** the task stream route no longer throws "Controller is already closed" when a client disconnects before the first snapshot.
- **Tests:** `e2e/mobile.spec.ts` (390×844, touch) checks:
  - no horizontal page scroll
  - column widths
  - the full-screen panel
  - the filter toggle
  - the icon-only call button
  - the 44 px hit area

**Phase 4 exit criteria:** a first-time visitor understands the product from `/`, can sign up, and sees a guided workspace. No raw error screens appear.

---

## Phase 5: Hardening

### P5.1 Real-time correctness (F12)

**Steps**
1. Change the snapshot to `count(*) || max(coalesce(updated_at, created_at))`, and make sure `task.updatedAt` is set on every mutation, including status, reorder and assignee changes. Assignee changes don't touch `task` today, so bump `task.updatedAt` explicitly.
2. Add `export const maxDuration = 300` (or the plan maximum) to the stream routes. The client already uses `EventSource`; make sure it reconnects with backoff and refetches on `visibilitychange`.
3. Add an **optimistic update** layer with TanStack Query mutations for drag-and-drop and status changes (with rollback on error) if it isn't fully there already.
4. Longer-term note (not in scope): if real-time grows, swap DB polling for a pub/sub provider (Ably, Pusher, Supabase Realtime, or Postgres `LISTEN/NOTIFY` via a long-lived worker). Polling Neon every 5 s per open tab keeps the compute from scaling to zero, which costs money.

**Status:** done, with a different approach to step 1.
- **Snapshot (step 1):** `features/tasks/snapshot.ts` hashes what the views show instead of relying on `updated_at`: task fields, columns, assignees, comments, and the project name. Every kind of change now registers, including:
  - assignee changes
  - column renames
  - a delete and a create inside the same poll

  No migration, and no mutation path has to remember to bump a timestamp.
- **Every view (new):** before this, only the board listened. Live updates now sit on the project page, so the list and table refresh too. The page passes its render-time snapshot, so a change between the render and the first poll isn't missed.
- **Streams (step 2):** `lib/sse.ts` is a shared polling stream for the task and notification streams. It has these properties:
  - `maxDuration = 300`; the stream closes itself cleanly at 240 s with a `retry` hint, so there are no timeout errors.
  - Polls never overlap.
  - There are no writes after the client leaves, which also fixes "Controller is already closed".
- **Reconnects:** events carry the snapshot as their id, and a reconnect sends it back as `Last-Event-ID` or `?since=`, so nothing is lost when a stream recycles.
- **Hidden tabs:**
  - The task stream closes, which saves Neon polling.
  - When the tab is visible again, the stream reopens from the last snapshot and catches up at once.
  - If the server refuses the stream, reconnects back off up to 60 s.
- **Step 3 (TanStack Query):** skipped. The board, list and table already apply edits optimistically and roll back on error.
- **Call stream:** not changed here; it belongs with P5.2.
- **Tests:**
  - `tests/lib/sse.test.ts`: retry hint, ids, self-close, no late writes, no overlap.
  - `e2e/realtime.spec.ts`: the change kinds above, list view, hidden-tab catch-up.

### P5.2 Calls: TURN and limits (F14)

**Steps**
1. Add a TURN provider (Cloudflare Calls TURN or Metered.ca free tier). Get short-lived credentials from a new `/api/call/ice` route (behind `requireProjectAccess`) and pass them as `config.iceServers` to `simple-peer`.
2. Cap the mesh at 4–6 participants, since a full-mesh connection scales O(n²). Show "Room full".
3. Label the feature "Beta" in the UI.

### P5.3 CI and test coverage

**Files:** `.github/workflows/ci.yml`, `playwright.config.ts`, `e2e/*`

**Steps**
1. Use `npm ci` instead of `npm install`, cache with `actions/setup-node`, and use Node from `.nvmrc`.
2. Add a **build** job (`next build`) so build-only errors are caught in PRs.
3. Add an **E2E job** against a Neon branch created per PR (the `neondatabase/create-branch-action` GitHub Action), migrated with `db:migrate`, then deleted afterwards.
4. New E2E specs:
   - cross-tenant isolation (P0)
   - invite → register → join (P1.3)
   - column CRUD (P2.2)
   - task deep link (P2.3)
   - password reset with a mock email sink (P3.1)
   - Stripe checkout with test clocks/test card (happy path).
5. Coverage target: ≥ 80 % on `features/*/actions.ts` and `lib/authz.ts`. Report it in the PR summary.

**Status:** done. The E2E job turns on once the Neon secret and variable are set.
- **Workflow:**
  - All jobs use `npm ci` and Node from `.nvmrc` (24), with the npm cache.
  - A newer push cancels the run in progress.
  - A new **Build** job runs `next build` with placeholder env. It catches invalid segment config, which tsc misses (see #53).
- **E2E workflow (`e2e.yml`):**
  - **When it runs:** always on release PRs into `main`. On other PRs only with the `e2e` label, because it's slower than the 1-minute checks.
  - **Shards:** 3 in parallel. Each shard creates its own Neon branch from the **dev** branch (never production), expiring after a day.
  - **Each shard:** runs `db:migrate`, builds, and runs Playwright against `next start`. It uploads its report on failure, then deletes its branch.
  - **Why a production build:** the dev server compiled pages on first visit, which made CI slow (10+ min) and caused timeout failures.
  - **Sentry:** `NEXT_PUBLIC_SENTRY_DISABLED` keeps CI's production build from reporting to it.
  - **The daily-job spec:** runs last in shard 3, on that shard's own branch.
  - **Ubuntu 24.04:** Playwright has no browser builds for 26.04 yet.
- **Build fixes the new jobs exposed:**
  - **Lock file:** the npm bundled with Node 24.11.1 rejected `package-lock.json`, so `.nvmrc` moves to 24.22.3.
  - **Fonts:** builds failed when Google Fonts served URLs Turbopack couldn't map. Geist, Geist Mono and Schibsted Grotesk are now self-hosted (`app/fonts/`, latin, variable weight) through `next/font/local`.
- **Coverage:** `scripts/coverage-summary.mjs` writes a per-file table to the job summary. It fails the Unit Tests job below 80 %.
  - Now 87.3 %, up from 70.4 %.
  - New tests for billing, search, and workspace admin actions (update, remove member, change role, delete).
- **Specs (step 4):** isolation, invites, columns, deep link and password reset already exist (`e2e/`).
  - Stripe checkout is not covered: it needs real Stripe test keys and a webhook forwarder in CI. It's left for when billing goes live.

### P5.4 Content Security Policy

**Files:** `next.config.ts`

**Steps**
1. Remove `'unsafe-eval'` in production (keep it in dev only).
2. Move to a nonce-based `script-src` generated in `proxy.ts`, which Next 16 supports, so `'unsafe-inline'` can go too.
3. Add the missing allowances: the Sentry tunnel (`/monitoring` is same-origin, fine), Vercel Speed Insights (`https://va.vercel-scripts.com`), TURN/STUN in `connect-src` if needed, and Google avatars (already allowed).
4. Ship as `Content-Security-Policy-Report-Only` for a week with Sentry's CSP report endpoint, then enforce.

### P5.5 Observability and operations

**Steps**
1. Sentry: set `release` from `VERCEL_GIT_COMMIT_SHA`, `environment` from `VERCEL_ENV`, and attach the user ID (not email) on the server and client. The `sentry:sentry-setup-releases` skill covers this.
2. Alerts: new issue in production, error rate spike, and Stripe webhook failures.
3. Add a `/api/health` route that runs a `select 1` check, plus an uptime monitor (Better Stack / Vercel checks).
4. Write runbooks in `docs/runbooks/`: migrations, rolling back a deploy, rotating secrets, replaying a Stripe webhook.
5. Enable Neon point-in-time restore and document the retention window.

### P5.6 Documentation

**Steps**
1. README: correct versions (Next 16), architecture diagram, **security model**, env var table (generated from `lib/env.ts`), local setup with `db:migrate` + seed, test commands, deployment notes.
2. `CONTRIBUTING.md`: branch naming, commit conventions, PR checklist.
3. `CHANGELOG.md` starting at `v1.0.0` once Phases 0–4 ship. Bump `package.json` version from `0.1.0`.
4. Update `CASE_STUDY.md` with the security and migration stories. They make good case-study material.

**Phase 5 exit criteria:** CI runs build + unit + E2E on every PR. The CSP is enforced without violations. Production errors reach an alert.

---

## Out of scope for v1.0 (backlog)

Recorded so they don't creep in:
- Subtasks / checklists, labels/tags, task attachments (needs Blob storage).
- Rich text editor (Tiptap) for descriptions and comments.
- Recurring tasks, time tracking, calendar/timeline (Gantt) view.
- Workspace-level member caps per plan, usage-based billing, annual plans.
- Public REST API / webhooks, Slack integration.
- i18n.
- Full offline support / PWA.

---

## Definition of "finished product" (v1.0 release checklist)

- [ ] No cross-tenant access is possible (P0, with E2E proof).
- [ ] A database can be rebuilt purely from migrations, and CI enforces it.
- [ ] Every create has a matching edit and delete.
- [ ] A stranger can be invited by email, sign up and collaborate.
- [ ] A user can reset their password, verify their email, control their emails and delete their account.
- [ ] The public landing, pricing, privacy and terms pages are live on a custom domain, with OG images.
- [ ] No placeholder text, default assets or debug routes remain.
- [ ] 404/error/loading states exist on every route group.
- [ ] Lighthouse ≥ 95 on `/`, and axe reports no serious issues on main app pages.
- [ ] CI: typecheck, lint, unit, build and E2E all pass on every PR.
- [ ] Sentry releases and alerts are configured, and runbooks are written.
- [ ] The README and CASE_STUDY describe the app as it actually is.
