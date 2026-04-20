import { db } from '@/db/drizzle';
import { subscription, workspace } from '@/db/schema';
import { count, eq } from 'drizzle-orm';
import { PLANS, PlanName } from './stripe';

export async function getUserSubscription(userId: string) {
  const [sub] = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId));
  return sub ?? null;
}

export async function getUserPlan(userId: string): Promise<PlanName> {
  const sub = await getUserSubscription(userId);
  if (!sub) return 'free';
  if (sub.status === 'canceled' || sub.status === 'unpaid') return 'free';
  return (sub.plan as PlanName) ?? 'free';
}

export async function checkWorkspaceLimit(userId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number | null;
}> {
  const [plan, [result]] = await Promise.all([
    getUserPlan(userId),
    db.select({ count: count() }).from(workspace).where(eq(workspace.userId, userId)),
  ]);
  const limit = PLANS[plan].maxWorkspaces;

  const current = result?.count ?? 0;

  return {
    allowed: limit === null || current < limit,
    current,
    limit,
  };
}
