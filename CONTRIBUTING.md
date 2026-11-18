# Contributing

## Branches

| Branch | Purpose |
|---|---|
| `main` | Production. Changes arrive only through release pull requests from `develop`. |
| `develop` | Integration. Every feature or fix branch merges here first. |
| `feat/…`, `fix/…`, `ci/…`, `docs/…`, `test/…`, `chore/…` | One change each, branched from `develop`, e.g. `feat/p5-2-calls`, `fix/csp-nonce-vercel`. |

Pull requests are merged with a merge commit (no squash, no rebase), so the history shows what shipped together. Don't force-push shared branches.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, in the imperative, under ~72 characters.

- Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `ci`, `chore`.
- Scope: the area (`tasks`, `calls`, `security`, `realtime`, …). Add the plan item when there is one: `feat(calls): TURN and a 4-person limit (P5.2)`.
- The body says **why**, and anything a reviewer couldn't guess from the diff.

## Pull requests

Open against `develop`. Before asking for review:

- [ ] `npx tsc --noEmit`, `npm run lint` and `npm test` pass.
- [ ] New or changed server actions and routes check access through `lib/authz.ts` and validate input with Zod. A resource in another workspace answers "not found".
- [ ] Schema changes ship with a generated migration (`npm run db:generate`), reviewed and committed. Never `drizzle-kit push`.
- [ ] New environment variables are added to `lib/env.ts`, `.env.example` and the README table (a test checks).
- [ ] User-facing changes have a unit or E2E test; bug fixes have a test that failed before the fix.
- [ ] Add the **`e2e`** label to run the Playwright suite when the change touches pages, streams, auth or the proxy.
- [ ] `docs/PRODUCTION_PLAN.md` is updated if the change completes or alters a plan item.

The description says what changed, why, how it was tested, and anything to do on deploy (migrations, env vars, dashboard settings).

## Releases

1. Open a pull request from `develop` into `main` titled `Release: …`, listing the included pull requests and deploy notes. E2E runs automatically.
2. If it includes a migration, apply it to production first, after a Neon snapshot branch: [docs/runbooks/migrations.md](docs/runbooks/migrations.md).
3. Merge. Vercel deploys `main`; check the deployment and `GET /api/health`.
4. Add the changes to [CHANGELOG.md](CHANGELOG.md).

If a deploy breaks production, roll back first: [docs/runbooks/rollback.md](docs/runbooks/rollback.md).

## Local databases

Point `.env` at a Neon **dev** branch. The E2E tests write data and refuse to run against the production branch; don't work around that.
