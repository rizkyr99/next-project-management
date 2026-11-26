'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createCheckoutSession, createPortalSession } from '@/features/billing/actions';
import { formatBytes, memberLimitLabel, PLAN_DETAILS, PLAN_FEATURES, type PlanName } from '@/lib/plans';
import { AlertCircle, Check } from 'lucide-react';
import { unstable_rethrow } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

export interface WorkspaceBillingProps {
  workspaceSlug: string;
  plan: PlanName;
  status: string | null;
  /** ISO date the paid period renews. */
  renewsOn: string | null;
  teamMembers: number;
  guests: number;
  hasBillingAccount: boolean;
  /** Only the owner can upgrade or manage billing. */
  isOwner: boolean;
}

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

/**
 * E1: a workspace's plan in Settings → Billing. Pro is billed per team
 * member; client guests are free. The owner upgrades through Stripe
 * Checkout and manages payment in Stripe's portal.
 */
export function WorkspaceBilling(props: Readonly<WorkspaceBillingProps>) {
  const { workspaceSlug, plan, status, renewsOn, teamMembers, guests, hasBillingAccount, isOwner } = props;
  const [isPending, startTransition] = useTransition();
  const pro = PLAN_DETAILS.pro;
  const free = PLAN_DETAILS.free;
  const seats = Math.max(1, teamMembers);

  const go = (action: () => Promise<{ error?: string } | undefined | void>, fallback: string) =>
    startTransition(async () => {
      try {
        // Redirects to Stripe on success; otherwise it returns { error }.
        const result = await action();
        if (result && 'error' in result && result.error) toast.error(result.error, { position: 'top-center' });
      } catch (error) {
        unstable_rethrow(error);
        toast.error(fallback, { position: 'top-center' });
      }
    });
  const upgrade = () => go(() => createCheckoutSession(workspaceSlug), 'Could not start checkout. Please try again.');
  const manage = () => go(() => createPortalSession(workspaceSlug), 'Could not open the billing portal. Please try again.');

  return (
    <div className='space-y-6'>
      {status === 'past_due' && (
        <div
          role='alert'
          className='flex flex-wrap items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive'>
          <AlertCircle className='size-4 shrink-0' aria-hidden />
          <span className='flex-1'>The last payment failed. Update the payment method to keep Pro.</span>
          {isOwner && (
            <Button variant='destructive' size='sm' onClick={manage} disabled={isPending}>
              Update payment
            </Button>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <CardTitle>Current plan</CardTitle>
              <CardDescription className='mt-1'>
                {plan === 'pro'
                  ? renewsOn
                    ? `Renews on ${new Date(renewsOn).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
                    : 'Billed monthly.'
                  : 'Free, with no billing.'}
              </CardDescription>
            </div>
            <Badge variant={plan === 'pro' ? 'default' : 'secondary'}>{PLAN_DETAILS[plan].name}</Badge>
          </div>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          <div className='flex justify-between gap-4'>
            <span className='text-muted-foreground'>Team members</span>
            <span>
              {teamMembers}
              {plan === 'free' && free.maxMembers !== null ? ` of ${free.maxMembers}` : ''}
            </span>
          </div>
          <div className='flex justify-between gap-4'>
            <span className='text-muted-foreground'>Client guests</span>
            <span>{guests === 0 ? 'None' : `${guests}, free`}</span>
          </div>
          {plan === 'pro' && (
            <div className='flex justify-between gap-4'>
              <span className='text-muted-foreground'>Monthly cost</span>
              <span>
                {seats} × {usd(pro.priceMonthly)} = {usd(seats * pro.priceMonthly)}
              </span>
            </div>
          )}
          {plan === 'pro' && isOwner && hasBillingAccount && (
            <Button variant='outline' onClick={manage} disabled={isPending}>
              Manage billing
            </Button>
          )}
        </CardContent>
      </Card>

      {plan === 'free' && (
        <Card>
          <CardHeader>
            <CardTitle>Pro</CardTitle>
            <CardDescription>
              {usd(pro.priceMonthly)} per team member per month. For this workspace today:{' '}
              {seats} × {usd(pro.priceMonthly)} = {usd(seats * pro.priceMonthly)} a month. Clients are always free.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <ul aria-label='What Pro adds' className='space-y-2 text-sm'>
              <li className='flex gap-2'>
                <Check className='mt-0.5 size-4 shrink-0 text-primary' aria-hidden />
                {memberLimitLabel(pro.maxMembers)}
              </li>
              {Object.values(PLAN_FEATURES).map((f) => (
                <li key={f.label} className='flex gap-2'>
                  <Check className='mt-0.5 size-4 shrink-0 text-primary' aria-hidden />
                  {f.label}
                </li>
              ))}
              <li className='flex gap-2'>
                <Check className='mt-0.5 size-4 shrink-0 text-primary' aria-hidden />
                {formatBytes(pro.storageBytes)} of files, up from {formatBytes(free.storageBytes)}
              </li>
            </ul>
            {isOwner ? (
              <Button onClick={upgrade} disabled={isPending}>
                {isPending ? 'Opening checkout…' : 'Upgrade to Pro'}
              </Button>
            ) : (
              <p className='text-sm text-muted-foreground'>Only the workspace owner can upgrade.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
