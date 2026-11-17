import type { Metadata } from 'next';
import { PricingTable } from '../_components/pricing-table';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Every Tide plan includes every feature. Free for one workspace; Pro and Business for more.',
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  return (
    <div className='mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24'>
      <h1 className='font-display text-4xl font-bold tracking-[-0.035em] sm:text-5xl'>Pricing</h1>
      <p className='mt-4 max-w-[60ch] text-lg text-muted-foreground'>
        Every plan includes every feature and unlimited members. You pay for the number of workspaces
        you own. Upgrade, downgrade or cancel from Billing whenever you like.
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
