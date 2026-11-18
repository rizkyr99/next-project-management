# Runbook: backups and restores

Neon keeps the database's history, so it can be restored to any moment inside the **history retention window** (point-in-time restore). Check and set the window in the Neon console → project → **Settings → Storage / History retention**; on the free plan it's short (hours, not days), so act quickly after an incident.

## Restore without losing what happened since

Prefer this: it doesn't touch production until you choose.

1. Neon console → **Branches → Create branch** from the production branch (`br-small-wildflower-a14679rq`) at a **past point in time** (just before the incident).
2. Inspect it (SQL editor, or point a local `.env` at it, **never** the other way round).
3. Copy back only what's needed, e.g. a deleted workspace's rows, into production with SQL.
4. Delete the temporary branch.

## Restore the whole database

Neon console → production branch → **Restore** to a point in time. Everything written after that point is lost (Neon keeps a backup branch of the pre-restore state). Take the app offline first if writes must not land in between.

## Before risky operations

Before a migration that rewrites or drops data, or a manual bulk fix, create a branch of production **now** as a named snapshot. It costs nothing until it diverges.
