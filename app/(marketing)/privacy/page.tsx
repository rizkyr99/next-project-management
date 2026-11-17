import type { Metadata } from 'next';
import { ContactLine, LegalPage } from '../_components/legal-page';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What Tide collects, why, who processes it, and how to delete it.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage title='Privacy policy'>
      <p>
        This policy explains what information Tide collects when you use it, why, who helps us process
        it, and the choices you have. If anything here is unclear, write to <ContactLine />.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name, email address, profile picture if you sign in with
          Google, and a securely hashed password if you use one.
        </li>
        <li>
          <strong>What you put into Tide:</strong> workspaces, projects, columns, tasks, descriptions,
          comments, assignments and due dates, and the activity log of changes to them.
        </li>
        <li>
          <strong>Billing:</strong> if you upgrade, Stripe collects your payment details. We store only your
          Stripe customer reference, plan and renewal date, never your card number.
        </li>
        <li>
          <strong>Technical data:</strong> session cookies that keep you signed in, your IP address (used to
          limit abuse such as password guessing), error reports, and anonymous page performance metrics.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run Tide: show your workspaces to you and the people you invite, and keep them in sync.</li>
        <li>
          To send email you asked for or need: invites, password resets, email verification, and the
          notification emails you can switch off in your email preferences.
        </li>
        <li>To keep Tide secure and working: rate limiting, fixing errors and improving performance.</li>
      </ul>
      <p>We don’t sell your information, show ads, or use your content to train AI models.</p>

      <h2>Who processes it for us</h2>
      <ul>
        <li>Vercel: hosting and anonymous performance metrics.</li>
        <li>Neon: the database that stores your account and workspace data.</li>
        <li>Resend: sending email.</li>
        <li>Stripe: payments, for paid plans.</li>
        <li>Upstash: short-lived rate-limit counters keyed by IP address or account.</li>
        <li>Sentry: error reports, which can include the page and account involved.</li>
        <li>Google: sign-in, if you choose “Continue with Google”.</li>
      </ul>
      <p>Each processes data only to provide its service to us.</p>

      <h2>Who can see your workspace</h2>
      <p>
        Only members of a workspace can see its projects, tasks and comments. Owners and admins can invite
        and remove members. Invites are sent to a specific email address and expire after seven days.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account and workspace data: until you delete them.</li>
        <li>Notifications: 90 days.</li>
        <li>Password reset links: one hour. Email verification links: 24 hours.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Change which emails you get in your email preferences.</li>
        <li>Edit your name and password in Account settings.</li>
        <li>
          Delete your account in Account settings. This permanently deletes your account, your comments,
          and the workspaces only you belong to. Workspaces you share must be handed to someone else first,
          so your team keeps its work.
        </li>
        <li>
          Ask for a copy of your data or for anything else about your information by writing to{' '}
          <ContactLine />.
        </li>
      </ul>

      <h2>Changes</h2>
      <p>
        If we change this policy in a way that matters, we’ll update the date above and tell signed-in users
        in the app before the change takes effect.
      </p>
    </LegalPage>
  );
}
