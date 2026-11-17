import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactLine, LegalPage } from '../_components/legal-page';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms for using Tide.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage title='Terms of service'>
      <p>
        These terms apply when you use Tide. By creating an account you agree to them. Questions go to{' '}
        <ContactLine />.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Give accurate details, keep your password safe, and tell us if you think someone else has access.</li>
        <li>You’re responsible for what happens in workspaces you own, including who you invite.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You own what you put into Tide. You give us permission to store and display it to the people in your
        workspace, only so we can run the service. You can delete it at any time.
      </p>

      <h2>Acceptable use</h2>
      <p>Don’t use Tide to:</p>
      <ul>
        <li>break the law or infringe anyone else’s rights;</li>
        <li>send spam, including through invites or @mentions;</li>
        <li>try to access workspaces or accounts that aren’t yours, or disrupt the service.</li>
      </ul>
      <p>We may suspend accounts that do.</p>

      <h2>Plans and payment</h2>
      <ul>
        <li>
          The Free plan costs nothing. Paid plans are billed monthly in advance through Stripe, at the prices
          on the <Link href='/pricing' className='underline underline-offset-4'>pricing page</Link>.
        </li>
        <li>
          You can cancel from Billing at any time. You keep the paid plan until the end of the period you’ve
          paid for; we don’t refund partial months unless the law requires it.
        </li>
        <li>If we change prices, we’ll tell you at least 30 days before your next renewal.</li>
      </ul>

      <h2>Availability</h2>
      <p>
        We work to keep Tide running and your data safe, but the service is provided “as is”, without
        guarantees of uninterrupted availability. To the extent the law allows, we aren’t liable for indirect
        losses, and our total liability is limited to what you paid us in the 12 months before a claim.
      </p>

      <h2>Ending</h2>
      <p>
        You can stop using Tide and delete your account whenever you like. We may end the service or an
        account with notice, except in cases of abuse. We’ll give you a reasonable chance to export your data
        if we shut the service down.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. If a change matters, we’ll update the date above and tell signed-in users in
        the app before it takes effect.
      </p>
    </LegalPage>
  );
}
