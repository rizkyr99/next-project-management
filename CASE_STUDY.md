# Case study: taking Tide from demo to production

Tide started as a feature-rich demo: workspaces, kanban boards, comments, live updates, video calls, Stripe billing. It looked finished. An audit found that it wasn't safe to put real teams on it. This is an account of the problems that taught the most, how each was found, and what fixed it. The full audit and plan are in [docs/PRODUCTION_PLAN.md](docs/PRODUCTION_PLAN.md).

---

## 1. Any user could edit any workspace

**The problem.** Server Actions for tasks, comments and activity checked that *a* user was signed in, never that they belonged to the task's workspace. Anyone holding an ID could read, change or delete another company's tasks. `bulkDeleteTasks` didn't even scope its IDs to a project. The project page loaded any project by ID, and the stream and call routes accepted any project ID, so a stranger could listen to another team's board or push signaling messages into their call.

**Why it was easy to miss.** The UI never offered another workspace's data, so manual testing looked fine. Server Actions *feel* private because they're called like functions, but each one is a public HTTP endpoint.

**The fix.** One module, [`lib/authz.ts`](lib/authz.ts), with helpers per resource: `requireProjectAccess`, `requireTaskAccess`, `requireCommentAccess`. Each resolves the resource **and** the caller's membership in a single query, joining from the resource to the caller's `member` row. Rules applied everywhere:
- **Not found, never forbidden.** Another tenant's resource is indistinguishable from one that doesn't exist, so IDs can't be probed.
- **Never trust client relations.** A column ID, assignee or @mention sent by the client is re-checked against the task's own project or workspace.
- **Validate first.** Zod parses every input before the database is touched.

**Proof.** Unit tests for every helper and action, plus `e2e/tenant-isolation.spec.ts`: a second user tries the real endpoints with the first user's IDs and gets 404s.

**Lesson.** Authorization belongs in one place that every entry point has to go through, and the tests should attack it from outside, not click through the UI.

---

## 2. The database couldn't be rebuilt from its own history

**The problem.** Four tables existed in production but in no migration. They had been created with `drizzle-kit push`, which changes the schema without recording anything. A fresh environment built from migrations was missing them.

**The fix.**
1. Snapshot production as a Neon branch, which is free and instant to roll back to.
2. Generate the missing migration, and check it against a fresh database by diffing `pg_dump --schema-only` with production.
3. **Baseline** production: insert the migration's ledger row by hand, so `migrate` treats tables that already exist as applied instead of failing on `CREATE TYPE`.
4. A CI job builds Postgres from migrations alone, and fails if `schema.ts` changed without a migration.

**Lesson.** Drizzle's migrator decides what to apply by the latest `created_at` in its ledger, not by hashes. Knowing exactly how the tool decides turned a scary production change into a single, reviewed `INSERT`. The procedure is in [docs/runbooks/migrations.md](docs/runbooks/migrations.md).

---

## 3. Transactions without transactions

**The problem.** The neon-http driver has no interactive transactions. Creating a workspace inserted the workspace, then the owner's membership, as separate requests. A failure in between left an orphan. Membership changes could also race: an admin removing a member, or changing their role, while ownership was being transferred at the same moment.

**The fix.** `db.batch()` sends several statements as one transaction. Where a decision depends on current data, the batch starts by locking the row (`select … for update` on the workspace or project), and the write itself carries the condition. For example, the delete only removes a member who still has the expected role. The action then checks what the guarded statement returned, and reports "Roles changed while you were doing this" instead of writing based on stale data.

**Lesson.** Without interactive transactions, put the check *inside* the write and lock first, then read the result. The same pattern later enforced the 4-person call limit without a race.

---

## 4. Live updates: a wrong theory, disproved by a test

**The problem.** The board's live stream detected changes with `count(*)` and `max(created_at)`, so edits, moves and reassignments never reached other viewers. It was replaced with an md5 **content snapshot** of everything the board shows: tasks, columns, assignees, comments and project details.

**The follow-up.** E2E tests in CI then showed people's own changes landing late. The obvious theory was that a refresh started before your change arrives after it and paints the old board back over yours. A deterministic test proved that theory wrong: it held one refresh back in the browser for 4 seconds while adding a column, and the column stayed. Next.js applies router updates in order.

The real cause was smaller. Next queues a Server Action behind any refresh already in flight, so **your next action waited for the previous refresh**. And every save of yours triggered a *second*, redundant refresh about 5 seconds later, when the stream noticed your own change. The fix: the page knows the snapshot it rendered, and the stream skips any change the page already shows. A test counts refresh requests after a save, and expects none.

**Lesson.** Write the test that would prove the theory before fixing what the theory says.

---

## 5. Watching a project put you in its call

**The problem.** Found while adding TURN and a size limit to calls. The call stream's heartbeat re-created a participant's row if it was missing, which was meant as self-healing after a network blip. But every visitor to a project page has that stream open. So **viewing a project made you a call participant**: "Join call (3)" counted people who were just looking at the board, and "Leave" never stuck, because the next heartbeat added you back.

**The fix.** Only `/api/call/join` adds people, and that's where the 4-person limit is enforced, under a row lock. The stream only refreshes existing rows. A client whose place timed out notices it's missing from the list and rejoins through `join`. That respects the limit, and says "the call is now full" if it is. An E2E test opens two browsers with Chromium's fake camera, checks both see each other's video, and that leaving sticks.

**Lesson.** "Self-healing" writes in a loop need to know *who* the loop runs for.

---

## 6. A security header that worked everywhere except production

**The problem.** The Content Security Policy moved to per-request nonces: Next marks each of its scripts with a random value, and the policy allows only those. Every local test passed against a production build. On Vercel, **no script carried a nonce.**

**Finding it.** A throwaway preview deployment with a debug page reporting which request headers the renderer received showed a `content-security-policy` *request* header that the proxy had never set. On Vercel, the response's CSP header is also present on the request the page renders with. Next takes the nonce from that request header. It found the enforced policy, which had no nonce, and never looked at the Report-Only header that did.

**The fix.** The proxy sets both policies itself, with the same nonce in each. The enforced policy keeps `'unsafe-inline'` only as a fallback for very old browsers. Verified on a preview before merging, and a test now checks that the two headers carry the same nonce.

**A second surprise.** Removing `'unsafe-eval'` exposed Zod v4 trying `new Function("")` to decide whether it may compile validators. Nothing broke, but it was a CSP violation on every page with a form. Setting `jitless` on the client fixes it.

**Lesson.** Platform behavior is part of the system. If a local production build can't reproduce a hosting quirk, test on a real preview, with a probe that reports facts rather than guesses.

---

## 7. Keeping end-to-end tests worth running

**The progression.**
- **First run:** E2E in CI against `next dev` took over 10 minutes, with timeouts.
- **Production build:** switching to `next start` exposed real bugs. Sign-ups hit the production-only rate limiter, because the auth library keyed it on `x-forwarded-for`.
- **Shards:** three shards, each on its own short-lived Neon branch, brought it to about 4 minutes.
- **On demand:** E2E now runs on release PRs and on PRs with an `e2e` label, so routine changes aren't blocked.
- **Slow again:** a day later, shards took up to 11 minutes. The tests hadn't slowed down: installing Chromium's system packages took 3–7 minutes on slow mirrors. Running the job in Playwright's own container image removed that step.
- **Branch limit:** two PRs testing at once then exceeded Neon's branch limit. The branch is now created through a small script that waits and retries instead of failing.

**Lesson.** Measure step by step before tuning. The slow part was rarely the tests.

---

## What "production-ready" ended up meaning here

- No cross-tenant access, with E2E proof.
- A database rebuildable from migrations, enforced in CI.
- Atomic writes and race-safe role changes.
- Real email, invites, password reset and verification, account deletion.
- Rate limits that hold across serverless instances.
- A nonce-based CSP, and a stricter Report-Only policy collecting evidence.
- Error tracking with alerts, uptime checks, and runbooks for the bad days.
- CI that runs the whole app in a real browser against a real database.
