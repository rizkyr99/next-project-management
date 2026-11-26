'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createCheckoutSession } from '@/features/billing/actions';
import {
  formatBytes,
  memberLimitLabel,
  PLAN_DETAILS,
  PLAN_FEATURES,
  planAllows,
  upgradeReasonFor,
  UPGRADE_TITLES,
  type PlanFeature,
  type PlanName,
  type UpgradeReason,
} from '@/lib/plans';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';

/**
 * E3: upgrade moments. The workspace layout provides its plan; gated
 * controls ask `canUse()` and open the upgrade prompt instead of failing,
 * and a gate's error from the server opens it too (`showError`).
 */

interface WorkspacePlan {
  workspaceSlug: string;
  plan: PlanName;
  isOwner: boolean;
  teamMembers: number;
  /** E2: "12 days left" while on the Pro trial; null otherwise. Worked out on the server. */
  trialLabel: string | null;
}

interface UpgradeApi extends WorkspacePlan {
  canUse: (feature: PlanFeature) => boolean;
  openUpgrade: (reason: UpgradeReason) => void;
  /** Opens the upgrade prompt for a gate's message; shows any other error as a toast. */
  showError: (message: string) => void;
}

const UpgradeContext = createContext<UpgradeApi | null>(null);

/** Outside a workspace there's no plan to check: everything is allowed and errors are toasts. */
const fallback: UpgradeApi = {
  workspaceSlug: '',
  plan: 'pro',
  isOwner: false,
  teamMembers: 0,
  trialLabel: null,
  canUse: () => true,
  openUpgrade: () => {},
  showError: (message) => toast.error(message, { position: 'top-center' }),
};

export function useUpgrade(): UpgradeApi {
  return useContext(UpgradeContext) ?? fallback;
}

export function UpgradeProvider({ children, ...value }: Readonly<WorkspacePlan & { children: ReactNode }>) {
  const [reason, setReason] = useState<UpgradeReason | null>(null);
  const { workspaceSlug, plan, isOwner, teamMembers, trialLabel } = value;
  const openUpgrade = useCallback((r: UpgradeReason) => setReason(r), []);
  const api = useMemo<UpgradeApi>(
    () => ({
      workspaceSlug,
      plan,
      isOwner,
      teamMembers,
      trialLabel,
      canUse: (feature) => planAllows(plan, feature),
      openUpgrade,
      showError: (message) => {
        const r = upgradeReasonFor(message);
        if (r) setReason(r);
        else toast.error(message, { position: 'top-center' });
      },
    }),
    [workspaceSlug, plan, isOwner, teamMembers, trialLabel, openUpgrade],
  );

  return (
    <UpgradeContext.Provider value={api}>
      {children}
      <UpgradeDialog reason={reason} onClose={() => setReason(null)} api={api} />
    </UpgradeContext.Provider>
  );
}

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

function UpgradeDialog({
  reason,
  onClose,
  api,
}: Readonly<{ reason: UpgradeReason | null; onClose: () => void; api: UpgradeApi }>) {
  const [pending, start] = useTransition();
  const pro = PLAN_DETAILS.pro;
  const seats = Math.max(1, api.teamMembers);
  const upgrade = () =>
    start(async () => {
      try {
        // Redirects to Stripe Checkout; returns { error } otherwise.
        const result = await createCheckoutSession(api.workspaceSlug);
        if (result && 'error' in result && result.error) toast.error(result.error, { position: 'top-center' });
      } catch (error) {
        unstable_rethrow(error);
        toast.error('Could not start checkout. Please try again.', { position: 'top-center' });
      }
    });

  // What was asked for first, then the rest of what Pro adds.
  const items: { key: UpgradeReason | 'storage'; label: string }[] = [
    { key: 'members', label: memberLimitLabel(pro.maxMembers) },
    ...(Object.entries(PLAN_FEATURES) as [PlanFeature, (typeof PLAN_FEATURES)[PlanFeature]][]).map(([key, f]) => ({
      key,
      label: f.label,
    })),
    { key: 'storage', label: `${formatBytes(pro.storageBytes)} of files` },
  ];
  const ordered = [...items].sort((a, b) => Number(b.key === reason) - Number(a.key === reason));

  return (
    <Dialog open={reason !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {reason && (
          <>
            <DialogHeader>
              <DialogTitle>{UPGRADE_TITLES[reason]}</DialogTitle>
              <DialogDescription>
                Pro is {usd(pro.priceMonthly)} per team member per month. For this workspace that’s {seats} ×{' '}
                {usd(pro.priceMonthly)} = {usd(seats * pro.priceMonthly)} a month, and your clients join free.
              </DialogDescription>
            </DialogHeader>
            <ul aria-label='Pro includes' className='space-y-2 text-sm'>
              {ordered.map((item) => (
                <li key={item.key} className={cn('flex gap-2', item.key === reason && 'font-medium')}>
                  <Check className='mt-0.5 size-4 shrink-0 text-primary' aria-hidden />
                  {item.label}
                </li>
              ))}
            </ul>
            <DialogFooter className='items-center gap-2 sm:justify-between'>
              <Link
                href={`/workspaces/${api.workspaceSlug}/settings?tab=billing`}
                onClick={onClose}
                className='text-sm text-muted-foreground underline-offset-4 hover:underline'>
                Compare plans
              </Link>
              {api.isOwner ? (
                <Button onClick={upgrade} disabled={pending}>
                  {pending ? 'Opening checkout…' : 'Upgrade to Pro'}
                </Button>
              ) : (
                <p className='text-sm text-muted-foreground'>Ask the workspace owner to upgrade.</p>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A small "Pro" mark on a control the current plan doesn't include. */
export function ProBadge({ className }: Readonly<{ className?: string }>) {
  return (
    <Badge variant='secondary' className={cn('ml-auto px-1.5 py-0 text-[10px] font-semibold', className)}>
      Pro
    </Badge>
  );
}

/**
 * E2: "Pro trial, 12 days left" in the sidebar, linking to Billing; the
 * owner also gets the way to upgrade. Shown to the team, never to clients.
 */
export function TrialNotice() {
  const { trialLabel, workspaceSlug, isOwner } = useUpgrade();
  if (!trialLabel) return null;
  return (
    <Link
      href={`/workspaces/${workspaceSlug}/settings?tab=billing`}
      aria-label={`Pro trial, ${trialLabel}${isOwner ? '. Upgrade to keep Pro' : ''}`}
      className='block rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-muted/50'>
      <span className='flex items-center justify-between gap-2'>
        <span className='font-medium'>Pro trial</span>
        <span className='text-xs text-muted-foreground'>{trialLabel}</span>
      </span>
      <span className='mt-0.5 block text-xs text-muted-foreground'>
        {isOwner ? 'Upgrade to keep client features.' : 'Client features are on during the trial.'}
      </span>
    </Link>
  );
}
