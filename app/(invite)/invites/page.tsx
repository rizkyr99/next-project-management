import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getSession } from '@/lib/auth-session';
import { listPendingInvitesForEmail } from '@/lib/invites';
import { InviteResponse } from '@/features/workspaces/components/invite-response';

export const metadata: Metadata = { title: 'Invites' };

/** Every pending invite for the signed-in user's email. In-app notifications link here. */
export default async function InvitesPage() {
  const session = await getSession();
  if (!session) redirect('/login?callbackURL=%2Finvites');

  const invites = await listPendingInvitesForEmail(session.user.email);

  if (invites.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No pending invites</CardTitle>
          <CardDescription>
            When someone invites {session.user.email} to a workspace, it shows up here.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant='outline'>
            <Link href='/'>Go to Tide</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className='space-y-4'>
      <h1 className='text-xl font-semibold text-center'>
        You have {invites.length} pending {invites.length === 1 ? 'invite' : 'invites'}
      </h1>
      {invites.map((invite) => (
        <Card key={invite.id}>
          <CardHeader>
            <CardTitle>{invite.workspaceName}</CardTitle>
            <CardDescription>
              {invite.inviterName ?? 'Someone'} invited you as{' '}
              {invite.role === 'admin' ? 'an admin' : 'a member'}.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <InviteResponse inviteRef={{ inviteId: invite.id }} workspaceName={invite.workspaceName} />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
