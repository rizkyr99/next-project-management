# Runbook: rolling back a deploy

Production deploys from `main`. Rolling back points the domain at an earlier deployment; nothing is rebuilt, so it takes seconds.

## Roll back

1. Vercel → project → **Deployments**, filter **Production**.
2. On the last good deployment: **⋯ → Instant Rollback** (or **Promote**).
3. Confirm the domain serves it: `GET /api/health` shows its commit.

While rolled back, Vercel stops promoting new `main` builds automatically. When the fix is merged, promote that deployment (⋯ → Promote) to resume.

## Then fix forward

Revert or fix on a branch → PR to `develop` → release PR to `main`, as usual. Don't force-push `main`.

## Schema changes need care

A rollback doesn't undo migrations. Old code usually works with a newer schema if migrations only **add** things (new tables, nullable columns). If the bad release dropped or renamed a column the old code uses, rolling back breaks too: restore the data/schema first ([backups.md](backups.md)), or fix forward. Keep migrations additive, and remove old columns in a later release.

## Environment variable changes

Changing an env var in Vercel doesn't affect running deployments. Redeploy (⋯ → Redeploy) the current production deployment to apply it, and to undo a bad change, set the old value and redeploy again.
