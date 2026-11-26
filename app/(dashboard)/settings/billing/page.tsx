import { Badge } from '@/components/ui/badge';
import { db } from '@/db/drizzle';
import { member, subscription, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { PLAN_DETAILS } from '@/lib/plans';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Billing' };

const PAID = ['active', 'trialing', 'past_due'] as const;

/**
 * E1: plans belong to workspaces, so billing is per workspace (Settings →
 * Billing there). This page lists the workspaces you're on and their plans.
 */
export default async function BillingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/login');

  const rows = await db
    .select({
      slug: workspace.slug,
      name: workspace.name,
      role: member.role,
      subPlan: subscription.plan,
      paid: sql<boolean>`coalesce(${inArray(subscription.status, [...PAID])}, false)`,
      teamMembers: sql<number>`(select count(*)::int from ${member} m where m.workspace_id = ${workspace.id} and m.role <> 'guest')`,
    })
    .from(member)
    .innerJoin(workspace, eq(workspace.id, member.workspaceId))
    .leftJoin(subscription, eq(subscription.workspaceId, workspace.id))
    .where(and(eq(member.userId, session.user.id), ne(member.role, 'guest')))
    .orderBy(asc(workspace.name));

  return (
    <div className='mx-auto max-w-3xl space-y-8 px-4 py-8'>
      <div>
        <Link
          href='/'
          className='mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground'>
          <ArrowLeft className='size-4' />
          Back to dashboard
        </Link>
        <h1 className='text-2xl font-semibold'>Billing</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Each workspace has its own plan. Pro is ${PLAN_DETAILS.pro.priceMonthly} per team member per month, and
          clients are always free. The owner manages billing in the workspace&apos;s settings.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className='text-sm text-muted-foreground'>You aren&apos;t on any team workspace yet.</p>
      ) : (
        <ul aria-label='Your workspaces' className='divide-y rounded-lg border'>
          {rows.map((w) => {
            // The same rule as getWorkspacePlan (lib/subscription.ts).
            const plan = w.paid && w.subPlan === 'pro' ? 'pro' : 'free';
            const canManage = w.role === 'owner' || w.role === 'admin';
            const body = (
              <>
                <span className='min-w-0 flex-1'>
                  <span className='block truncate text-sm font-medium'>{w.name}</span>
                  <span className='block text-xs text-muted-foreground'>
                    {w.teamMembers} team {w.teamMembers === 1 ? 'member' : 'members'}
                    {w.role === 'owner' ? ', you own it' : ''}
                  </span>
                </span>
                <Badge variant={plan === 'pro' ? 'default' : 'secondary'}>{PLAN_DETAILS[plan].name}</Badge>
                {canManage && <ChevronRight className='size-4 text-muted-foreground' aria-hidden />}
              </>
            );
            return (
              <li key={w.slug}>
                {canManage ? (
                  <Link
                    href={`/workspaces/${w.slug}/settings?tab=billing`}
                    className='flex items-center gap-3 px-4 py-3 hover:bg-muted/50'>
                    {body}
                  </Link>
                ) : (
                  <div className='flex items-center gap-3 px-4 py-3'>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
