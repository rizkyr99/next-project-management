import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { db } from '@/db/drizzle';
import { member } from '@/db/schema';
import { getSession } from '@/lib/auth-session';
import { evaluateInvite, maskEmail } from '@/lib/invite-token';
import { findInviteByToken } from '@/lib/invites';
import {
  InviteResponse,
  SwitchAccountButton,
} from '@/features/workspaces/components/invite-response';

export const metadata: Metadata = {
  title: 'Workspace invite',
  // The URL carries a secret: keep it out of search engines and Referer headers.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function Notice({
  title,
  description,
  action,
}: {
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter className='gap-2'>
        {action ?? (
          <Button asChild variant='outline'>
            <Link href='/'>Go to Tide</Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [session, invite] = await Promise.all([getSession(), findInviteByToken(token)]);
  const selfPath = `/invite/${token}`;

  if (!invite) {
    return (
      <Notice
        title='Invalid invite link'
        description='This link is incomplete or no longer exists. Check that you copied the whole link, or ask for a new invite.'
      />
    );
  }

  const state = evaluateInvite(invite, session?.user.email ?? null);
  const roleLabel = invite.role === 'admin' ? 'an admin' : 'a member';

  switch (state.kind) {
    case 'expired':
      return (
        <Notice
          title='This invite has expired'
          description={`Ask an admin of ${invite.workspaceName} to send you a new invite.`}
        />
      );
    case 'revoked':
      return (
        <Notice
          title='This invite was revoked'
          description={`It can no longer be used to join ${invite.workspaceName}.`}
        />
      );
    case 'declined':
      return (
        <Notice
          title='Invite declined'
          description={`You declined the invite to ${invite.workspaceName}.`}
        />
      );
    case 'accepted': {
      const isMember =
        session &&
        (
          await db
            .select({ id: member.id })
            .from(member)
            .where(and(eq(member.workspaceId, invite.workspaceId), eq(member.userId, session.user.id)))
            .limit(1)
        ).length > 0;
      return (
        <Notice
          title='Invite already accepted'
          description={isMember ? `You're already in ${invite.workspaceName}.` : 'This invite has already been used.'}
          action={
            isMember ? (
              <Button asChild>
                <Link href={`/workspaces/${invite.workspaceSlug}`}>Open {invite.workspaceName}</Link>
              </Button>
            ) : undefined
          }
        />
      );
    }
    case 'wrong_account':
      return (
        <Notice
          title='This invite is for a different account'
          description={
            <>
              It was sent to <span className='font-medium text-foreground'>{maskEmail(invite.email)}</span>,
              but you&apos;re signed in as{' '}
              <span className='font-medium text-foreground'>{session?.user.email}</span>. Switch to the
              invited account to accept it.
            </>
          }
          action={<SwitchAccountButton callbackURL={selfPath} />}
        />
      );
    case 'valid':
      break;
  }

  const callback = encodeURIComponent(selfPath);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join {invite.workspaceName}</CardTitle>
        <CardDescription>
          {invite.inviterName ? (
            <>
              <span className='font-medium text-foreground'>{invite.inviterName}</span> invited you
            </>
          ) : (
            'You were invited'
          )}{' '}
          to collaborate on Tide as {roleLabel}.
        </CardDescription>
      </CardHeader>
      {session ? (
        <CardFooter>
          <InviteResponse inviteRef={{ token }} workspaceName={invite.workspaceName} />
        </CardFooter>
      ) : (
        <>
          <CardContent className='text-sm text-muted-foreground'>
            Sign in or create an account with{' '}
            <span className='font-medium text-foreground'>{maskEmail(invite.email)}</span> to accept.
          </CardContent>
          <CardFooter className='gap-2'>
            <Button asChild>
              <Link href={`/register?callbackURL=${callback}`}>Create account</Link>
            </Button>
            <Button asChild variant='outline'>
              <Link href={`/login?callbackURL=${callback}`}>Sign in</Link>
            </Button>
          </CardFooter>
        </>
      )}
    </Card>
  );
}
