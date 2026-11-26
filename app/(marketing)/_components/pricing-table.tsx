import { Button } from '@/components/ui/button';
import { PLAN_DETAILS, PLAN_FEATURES, PLAN_ORDER, TRIAL_DAYS, memberLimitLabel, storageLimitLabel, type PlanName } from '@/lib/plans';
import { Check } from 'lucide-react';
import Link from 'next/link';

/** On every plan. */
const INCLUDED = [
  'Unlimited projects and tasks',
  'Board, list and table views, labels and checklists',
  'Comments, @mentions and email notifications',
  'Built-in project templates and the studio overview',
];

/** Each plan's list: what everyone gets, plus what only that plan adds. */
function includes(key: PlanName) {
  const extra = Object.values(PLAN_FEATURES)
    .filter((f) => (f.plans as readonly PlanName[]).includes(key))
    .map((f) => f.label);
  return key === 'free' ? INCLUDED : ['Everything in Free', ...extra];
}

/**
 * Prices, limits and features come from lib/plans.ts, the same source as
 * in-app billing and the server's plan gates. Pro is priced per team
 * member; client guests are free on it.
 */
export function PricingTable({ headingLevel = 'h3' }: Readonly<{ headingLevel?: 'h2' | 'h3' }>) {
  const Heading = headingLevel;
  return (
    <div className='grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-2'>
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
              <span className='text-sm text-muted-foreground'>
                {plan.perMember ? 'per team member, per month' : 'forever'}
              </span>
            </p>
            <div>
              <p className='font-medium'>{memberLimitLabel(plan.maxMembers)}</p>
              <p className='text-sm text-muted-foreground'>
                {featured ? 'Clients join free. ' : ''}
                {storageLimitLabel(plan.storageBytes)}
              </p>
            </div>
            <ul className='space-y-2.5 text-sm text-muted-foreground'>
              {includes(key).map((item) => (
                <li key={item} className='flex gap-2'>
                  <Check className='mt-0.5 size-4 shrink-0 text-primary' aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <Button asChild variant={featured ? 'default' : 'outline'} className='mt-auto'>
              <Link href='/register'>
                {key === 'free' ? 'Sign up free' : `Try ${plan.name} free for ${TRIAL_DAYS} days`}
              </Link>
            </Button>
          </section>
        );
      })}
    </div>
  );
}
