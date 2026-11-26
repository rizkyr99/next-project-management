import type { Metadata } from 'next';
import { PricingTable } from '../_components/pricing-table';
import { TRIAL_DAYS } from '@/lib/plans';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Tide is free for a team of up to three. Pro is priced per team member, and clients are always free.',
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  return (
    <div className='mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24'>
      <h1 className='font-display text-4xl font-bold tracking-[-0.035em] sm:text-5xl'>Pricing</h1>
      <p className='mt-4 max-w-[60ch] text-lg text-muted-foreground'>
        Every new workspace starts with {TRIAL_DAYS} days of Pro, no card. After that it&apos;s free for a
        team of up to three, or Pro at a price per team member, with what working with clients needs; the
        clients themselves join free. The owner can upgrade or cancel from the workspace&apos;s settings
        whenever they like.
      </p>
      <div className='mt-12'>
        <PricingTable headingLevel='h2' />
      </div>
      <p className='mt-8 text-sm text-muted-foreground'>
        Prices are in US dollars per month and are billed through Stripe. Taxes may apply depending on
        where you are.
      </p>
    </div>
  );
}
