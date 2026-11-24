# Runbook: database migrations

Migrations in `db/migrations/` are the **source of truth** for the database schema. `db/schema.ts` describes the schema in TypeScript, and every change to it must ship with a generated migration.

## Day-to-day workflow

```bash
# 1. Edit db/schema.ts
# 2. Generate a migration and review the SQL it writes
npm run db:generate -- --name short_description
# 3. Commit schema.ts + the new files in db/migrations/ together
# 4. Apply to your database
npm run db:migrate
```

- **Never run `drizzle-kit push` against a shared or production database.** It changes the schema without recording a migration, which is how the history drifted before (see "Baseline: 0002" below).
- `npm run db:check` checks that the migration history is internally consistent.
- CI (`Migrations` job) builds a fresh Postgres from migrations alone, then runs `db:generate` and fails if it produces anything. That catches a `schema.ts` change that was committed without its migration.

## How drizzle decides what to apply

`drizzle-kit migrate` keeps a ledger in `drizzle.__drizzle_migrations` (`id`, `hash`, `created_at`). It reads the **latest `created_at`** in that table and applies every local migration whose journal `when` (in `db/migrations/meta/_journal.json`) is newer. It doesn't compare hashes. Each migration runs in a transaction, so a failing migration rolls back cleanly.

So "baselining" a database whose tables already exist means inserting a ledger row for that migration with `created_at` equal to its journal `when`.

## Baseline: 0002_sync_missing_tables (one-time)

**Background.** The `comment`, `activity_log`, `call_participant` and `webrtc_signal` tables and the `signal_type` enum were created with `drizzle-kit push`, so the history only covered 13 of 17 tables. `0002_sync_missing_tables` adds them, which lets a fresh database be rebuilt from history. Databases that already have these tables must be **baselined** (marked as applied) rather than migrated. Otherwise `migrate` fails on `CREATE TYPE "signal_type"` (it already exists) and the deploy breaks.

**State found on 2026-11-16** (Neon DB in local `.env`):

| id | hash | created_at | file |
|---|---|---|---|
| 1 | `a48817d9…3cba8` | 1776218174343 | `0000_open_stone_men` |
| 2 | `f4fb30b4…2c823` | 1776331283379 | `0001_watery_wendell_vaughn` |
| 3 | `e64d999c…00723` | 1776400000000 | *no matching file.* Likely a hand-inserted baseline from April. Leave it alone; it's harmless. |

**Verified locally before touching Neon:** Neon's schema was restored into Postgres 17 together with the ledger above. `migrate` without the baseline row exited 1 and changed nothing. With the row, it reported success and made no changes. A database built from zero via migrations matches Neon's schema, except for six primary-key constraint names: Neon has `users_pkey`, `projects_pkey`, `sessions_pkey`, `accounts_pkey`, `verifications_pkey` and `workspaces_pkey`, where a fresh DB has the singular forms. These are left over from old table renames. Drizzle doesn't track PK names, so this is cosmetic and intentionally left as is.

### Steps (run once per existing environment: production, plus any long-lived preview/dev DB)

1. **Snapshot.** In the Neon console, create a branch of the database named `pre-migration-baseline`. It's free and gives you an instant rollback.
2. **Check the ledger** (in the Neon SQL editor or `psql`):
   ```sql
   SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;
   SELECT to_regtype('public.signal_type'), to_regclass('public.comment');  -- both non-null = tables exist
   ```
   Continue only if the latest `created_at` is **below** `1794837097833` and the four tables exist.
3. **Insert the baseline row:**
   ```sql
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
   VALUES ('3d3363a08cc4dd2d2eace08b58c66a0ae516e1e16daa78f89b0eb9133779aa31', 1794837097833);
   ```
   The hash is `sha256` of `db/migrations/0002_sync_missing_tables.sql` (`shasum -a 256 <file>`), and `created_at` is its journal `when`.
4. **Verify:** `DATABASE_URL=<that db> npm run db:migrate` reports success. It makes no changes *for 0002*, but it **applies any newer migration**, such as `0003_token_invites` (which expires legacy pending invites and adds three unique indexes). Review newer migrations before running this, and take the snapshot first.

**Production history:** baselined `0002` on 2026-11-16, then applied `0003` the same day after the Neon snapshot `pre-migration-0003`. `0008_attachments` (additive) applied on 2026-11-18 after the snapshot `pre-migration-0008`, with a guarded script (stops unless production is exactly at `0007`) run in the Neon SQL Editor; verified: table present, ledger at `0008`. `0009_priorities_reactions_favorites` (additive) applied the same day after the snapshot `pre-migration-0009`, same guarded procedure; verified: both new tables and `task.due_has_time` present, ledger at `0009`. Pre-checks: no duplicate memberships or invite tokens, and 2 legacy pending invites, which were expired.

If a database has **no** `drizzle` schema at all, it was built only with `push`. Restore a copy of it locally (`pg_dump --schema-only`), then work out which rows to insert using the same method before you touch it.
