import { InviteMemberForm } from '@/features/workspaces/components/invite-member-form';
import { db } from '@/db/drizzle';
import { member, user, workspace, workspaceInvite } from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const [membership] = await db
    .select({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      role: member.role,
    })
    .from(workspace)
    .innerJoin(member, eq(member.workspaceId, workspace.id))
    .where(
      and(
        eq(workspace.slug, workspaceSlug),
        eq(member.userId, session.user.id),
      ),
    );

  if (!membership) {
    redirect('/create-workspace');
  }

  const canInvite = membership.role === 'owner' || membership.role === 'admin';

  const members = await db
    .select({
      id: member.id,
      role: member.role,
      name: user.name,
      email: user.email,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.workspaceId, membership.workspaceId))
    .orderBy(desc(member.createdAt));

  const pendingInvites = await db
    .select({
      id: workspaceInvite.id,
      email: workspaceInvite.email,
      role: workspaceInvite.role,
      expiresAt: workspaceInvite.expiresAt,
      createdAt: workspaceInvite.createdAt,
    })
    .from(workspaceInvite)
    .where(
      and(
        eq(workspaceInvite.workspaceId, membership.workspaceId),
        eq(workspaceInvite.status, 'pending'),
      ),
    )
    .orderBy(desc(workspaceInvite.createdAt));

  return (
    <div className='flex-1'>
      <div className='max-w-5xl space-y-6 p-4'>
        <div>
          <h1 className='text-2xl font-semibold'>Workspace Settings</h1>
          <p className='text-sm text-muted-foreground'>
            Manage members and invites for {membership.workspaceName}.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Invite Members</CardTitle>
            <CardDescription>
              Invite teammates by email and assign their role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm
              workspaceSlug={workspaceSlug}
              canInvite={canInvite}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              {members.length} member{members.length === 1 ? '' : 's'} currently
              in this workspace.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className='divide-y rounded-md border'>
              {members.map((workspaceMember) => (
                <div
                  key={workspaceMember.id}
                  className='flex items-center justify-between gap-4 px-4 py-3'>
                  <div className='min-w-0 flex items-center gap-3'>
                    <Avatar>
                      <AvatarFallback>
                        {workspaceMember.name?.charAt(0).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className='truncate text-sm font-medium'>
                        {workspaceMember.name}
                      </div>
                      <div className='truncate text-xs text-muted-foreground'>
                        {workspaceMember.email}
                      </div>
                    </div>
                  </div>
                  <Badge>{workspaceMember.role.toUpperCase()}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending Invites</CardTitle>
            <CardDescription>
              {pendingInvites.length} pending invite
              {pendingInvites.length === 1 ? '' : 's'}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingInvites.length ? (
              <div className='divide-y rounded-md border'>
                {pendingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className='flex items-center justify-between gap-4 px-4 py-3'>
                    <div className='min-w-0'>
                      <div className='truncate text-sm font-medium'>
                        {invite.email}
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        Expires{' '}
                        {invite.expiresAt.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    </div>
                    <div className='shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                      {invite.role}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
                No pending invites.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
