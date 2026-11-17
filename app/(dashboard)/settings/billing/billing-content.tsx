'use client';

import { PLAN_DETAILS, workspaceLimitLabel } from '@/lib/plans';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { createCheckoutSession, createPortalSession } from '@/features/billing/actions';
import type { PlanName } from '@/lib/stripe';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { unstable_rethrow } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

interface BillingContentProps {
  plan: PlanName;
  status: string | null;
  currentPeriodEnd: string | null;
  workspaceCount: number;
  workspaceLimit: number | null;
  hasBillingAccount: boolean;
}

const PLAN_LABELS: Record<PlanName, string> = {
  free: PLAN_DETAILS.free.name,
  pro: PLAN_DETAILS.pro.name,
  business: PLAN_DETAILS.business.name,
};

const PLAN_BADGE_VARIANTS: Record<PlanName, 'secondary' | 'default' | 'destructive'> = {
  free: 'secondary',
  pro: 'default',
  business: 'default',
};

export function BillingContent({
  plan,
  status,
  currentPeriodEnd,
  workspaceCount,
  workspaceLimit,
  hasBillingAccount,
}: BillingContentProps) {
  const [isPending, startTransition] = useTransition();

  function handleUpgrade(targetPlan: 'pro' | 'business') {
    startTransition(async () => {
      try {
        // Redirects to Stripe on success; otherwise it returns { error }.
        const result = await createCheckoutSession(targetPlan);
        if (result && 'error' in result) toast.error(result.error, { position: 'top-center' });
      } catch (error) {
        unstable_rethrow(error);
        toast.error('Failed to start checkout. Please try again.', { position: 'top-center' });
      }
    });
  }

  function handleManageBilling() {
    startTransition(async () => {
      try {
        const result = await createPortalSession();
        if (result && 'error' in result) toast.error(result.error, { position: 'top-center' });
      } catch (error) {
        unstable_rethrow(error);
        toast.error('Failed to open billing portal. Please try again.', { position: 'top-center' });
      }
    });
  }

  const progressValue =
    workspaceLimit !== null
      ? Math.min((workspaceCount / workspaceLimit) * 100, 100)
      : 0;

  return (
    <div className="space-y-6">
      {status === 'past_due' && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            Payment failed — please update your payment method to keep your
            subscription active.
          </span>
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto"
            onClick={handleManageBilling}
            disabled={isPending}
          >
            Update Payment
          </Button>
        </div>
      )}

      {/* Current plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Current Plan</CardTitle>
              <CardDescription className="mt-1">
                {currentPeriodEnd
                  ? `Renews on ${new Date(currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                  : 'Free plan — no billing required'}
              </CardDescription>
            </div>
            <Badge variant={PLAN_BADGE_VARIANTS[plan]}>
              {PLAN_LABELS[plan]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Workspaces</span>
              <span className="font-medium">
                {workspaceCount}
                {workspaceLimit !== null ? ` / ${workspaceLimit}` : ' / Unlimited'}
              </span>
            </div>
            {workspaceLimit !== null ? (
              <Progress value={progressValue} className="h-2" />
            ) : (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                Unlimited workspaces
              </div>
            )}
          </div>

          {plan !== 'free' && hasBillingAccount && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleManageBilling}
              disabled={isPending}
            >
              Manage Billing
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Upgrade options */}
      {plan !== 'business' && (
        <div>
          <h2 className="text-sm font-medium mb-3">Upgrade Plan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {plan === 'free' && (
              <Card className="border-primary/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    Pro
                    <span className="text-sm font-normal text-muted-foreground">
                      ${PLAN_DETAILS.pro.priceMonthly} / mo
                    </span>
                  </CardTitle>
                  <CardDescription>For growing teams</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="text-sm space-y-1.5 text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      {workspaceLimitLabel(PLAN_DETAILS.pro.maxWorkspaces)}
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      All Free features
                    </li>
                  </ul>
                  <Button
                    className="w-full"
                    onClick={() => handleUpgrade('pro')}
                    disabled={isPending}
                  >
                    Upgrade to Pro
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card className="border-primary/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  Business
                  <span className="text-sm font-normal text-muted-foreground">
                    ${PLAN_DETAILS.business.priceMonthly} / mo
                  </span>
                </CardTitle>
                <CardDescription>For large organizations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="text-sm space-y-1.5 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    {workspaceLimitLabel(PLAN_DETAILS.business.maxWorkspaces)}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    All Pro features
                  </li>
                </ul>
                <Button
                  className="w-full"
                  onClick={() => handleUpgrade('business')}
                  disabled={isPending}
                >
                  Upgrade to Business
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
