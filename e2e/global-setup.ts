import { testDb } from './helpers/db';

/** Fails the whole run up front if .env points at the production database. */
export default async function globalSetup() {
  await testDb();
}
