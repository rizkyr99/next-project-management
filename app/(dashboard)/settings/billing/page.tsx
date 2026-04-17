import { db } from '@/db/drizzle';
import { subscription, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { PLANS, PlanName } from '@/lib/stripe';
import { count, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BillingContent } from './billing-content';

export default async function BillingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/login');

  const userId = session.user.id;

  const [sub] = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId));

  const [workspaceCount] = await db
    .select({ count: count() })
    .from(workspace)
    .where(eq(workspace.userId, userId));

  const plan = (sub?.plan ?? 'free') as PlanName;
  const status = sub?.status ?? null;
  const currentPeriodEnd = sub?.stripeCurrentPeriodEnd ?? null;
  const current = workspaceCount?.count ?? 0;
  const limit = PLANS[plan].maxWorkspaces;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Link>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your subscription and workspace limits.
        </p>
      </div>
      <BillingContent
        plan={plan}
        status={status}
        currentPeriodEnd={currentPeriodEnd?.toISOString() ?? null}
        workspaceCount={current}
        workspaceLimit={limit}
        hasBillingAccount={!!sub?.stripeCustomerId}
      />
    </div>
  );
}
