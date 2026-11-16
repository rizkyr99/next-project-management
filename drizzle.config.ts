import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env' });

// Migrations in ./db/migrations are the source of truth for the schema.
// Workflow: edit schema.ts -> `npm run db:generate` -> review SQL -> commit -> `npm run db:migrate`.
// Do NOT run `drizzle-kit push` against a shared or production database: it
// changes the schema without recording a migration, so a fresh database can
// no longer be rebuilt from history. See docs/runbooks/migrations.md.
export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
