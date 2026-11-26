import { Button } from '@/components/ui/button';
import { PLAN_DETAILS, PLAN_ORDER, storageLimitLabel, workspaceLimitLabel } from '@/lib/plans';
import { Check } from 'lucide-react';
import Link from 'next/link';

const INCLUDED = [
  'Unlimited projects, tasks and members',
  'Board, list and table views',
  'Comments, @mentions and email notifications',
  'Due-date reminders and a daily summary',
];

/**
 * Prices come from lib/plans.ts, the same source as the in-app billing page.
 * Plans differ only in how many workspaces you can own, so that's the line
 * that leads each column.
 */
export function PricingTable({ headingLevel = 'h3' }: { headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel;
  return (
    <div className='grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-3'>
      {PLAN_ORDER.map((key) => {
        const plan = PLAN_DETAILS[key];
        const featured = key === 'pro';
        return (
          <section
            key={key}
            aria-labelledby={`plan-${key}`}
            className={`flex flex-col gap-6 bg-background p-6 sm:p-8 ${featured ? 'md:bg-mist [&_.text-muted-foreground]:md:text-mist-foreground' : ''}`}>
            <div className='space-y-1'>
              <Heading id={`plan-${key}`} className='font-display text-xl font-bold tracking-tight'>
                {plan.name}
              </Heading>
              <p className='text-sm text-muted-foreground'>{plan.tagline}</p>
            </div>
            <p className='flex items-baseline gap-1.5'>
              <span className='font-display text-5xl font-bold tracking-[-0.04em]'>${plan.priceMonthly}</span>
              <span className='text-sm text-muted-foreground'>per month</span>
            </p>
            <div>
              <p className='font-medium'>{workspaceLimitLabel(plan.maxWorkspaces)}</p>
              <p className='text-sm text-muted-foreground'>{storageLimitLabel(plan.storageBytes)}</p>
            </div>
            <ul className='space-y-2.5 text-sm text-muted-foreground'>
              {INCLUDED.map((item) => (
                <li key={item} className='flex gap-2'>
                  <Check className='mt-0.5 size-4 shrink-0 text-primary' aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <Button asChild variant={featured ? 'default' : 'outline'} className='mt-auto'>
              <Link href='/register'>
                {key === 'free' ? 'Sign up free' : `Sign up, then upgrade to ${plan.name}`}
              </Link>
            </Button>
          </section>
        );
      })}
    </div>
  );
}
