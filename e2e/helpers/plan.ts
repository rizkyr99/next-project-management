import { testDb } from './db';

/**
 * Puts a test workspace on Pro (E1) without Stripe: an active subscription
 * row with no Stripe subscription ID, so seat syncing never calls Stripe.
 * Specs that use client guests, approvals, share links or saved templates
 * call this right after creating their workspace.
 */
/**
 * Ends a test workspace's Pro trial (E2), so it's on Free: a new workspace
 * starts on a 14-day trial. Specs that check Free's limits call this first.
 */
export async function endTrial(slug: string) {
  const sql = await testDb();
  await sql`update workspace set trial_ends_at = now() - interval '1 day' where slug = ${slug}`;
}

export async function makePro(slug: string) {
  const sql = await testDb();
  await sql`
    insert into subscription (id, workspace_id, stripe_customer_id, status, plan, updated_at)
    select gen_random_uuid()::text, w.id, 'cus_e2e_' || w.id, 'active', 'pro', now()
    from workspace w where w.slug = ${slug}
    on conflict (workspace_id) do update set status = 'active', plan = 'pro'
  `;
}
