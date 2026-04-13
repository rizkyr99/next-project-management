import { InviteMemberForm } from '@/features/workspaces/components/invite-member-form';
import { UpdateWorkspaceForm } from '@/features/workspaces/components/update-workspace-form';
import { MemberList } from '@/features/workspaces/components/member-list';
import { PendingInvitesList } from '@/features/workspaces/components/pending-invites-list';
import { DeleteWorkspaceButton } from '@/features/workspaces/components/delete-workspace-button';
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
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ readonly workspaceSlug: string }>;
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
      workspaceSlug: workspace.slug,
      workspaceDescription: workspace.description,
      workspaceCreatedAt: workspace.createdAt,
      role: member.role,
      memberId: member.id,
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

  const canManage = membership.role === 'owner' || membership.role === 'admin';

  const members = await db
    .select({
      id: member.id,
      userId: member.userId,
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
      <div className='max-w-3xl space-y-6 p-4 md:p-8'>
        <div>
          <h1 className='text-2xl font-semibold'>Settings</h1>
          <p className='text-sm text-muted-foreground'>
            Manage settings for{' '}
            <span className='font-medium text-foreground'>
              {membership.workspaceName}
            </span>
            .
          </p>
        </div>

        <Tabs defaultValue='general'>
          <TabsList>
            <TabsTrigger value='general'>General</TabsTrigger>
            <TabsTrigger value='members'>
              Members{' '}
              <span className='ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground'>
                {members.length}
              </span>
            </TabsTrigger>
            {membership.role === 'owner' && (
              <TabsTrigger value='danger' className='text-destructive data-[state=active]:text-destructive'>
                Danger zone
              </TabsTrigger>
            )}
          </TabsList>

          {/* ── General ─────────────────────────────────── */}
          <TabsContent value='general' className='mt-6 space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle>Workspace details</CardTitle>
                <CardDescription>
                  Update your workspace name and description.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UpdateWorkspaceForm
                  workspaceSlug={workspaceSlug}
                  defaultValues={{
                    name: membership.workspaceName,
                    description: membership.workspaceDescription,
                  }}
                  canEdit={canManage}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Workspace URL</CardTitle>
                <CardDescription>
                  Your workspace is accessible at this URL slug.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm'>
                  <span className='text-muted-foreground'>/workspaces/</span>
                  <span className='font-medium'>{workspaceSlug}</span>
                </div>
                <p className='mt-2 text-xs text-muted-foreground'>
                  The URL slug cannot be changed after creation.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Workspace info</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3 text-sm'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Created</span>
                  <span>
                    {membership.workspaceCreatedAt.toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <Separator />
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Your role</span>
                  <span className='capitalize'>{membership.role}</span>
                </div>
                <Separator />
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Total members</span>
                  <span>{members.length}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Members ─────────────────────────────────── */}
          <TabsContent value='members' className='mt-6 space-y-6'>
            {canManage && (
              <Card>
                <CardHeader>
                  <CardTitle>Invite members</CardTitle>
                  <CardDescription>
                    Add teammates by email and assign their role.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <InviteMemberForm
                    workspaceSlug={workspaceSlug}
                    canInvite={canManage}
                  />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Members</CardTitle>
                <CardDescription>
                  {members.length} member{members.length === 1 ? '' : 's'} in
                  this workspace.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MemberList
                  members={members.map((m) => ({
                    id: m.id,
                    name: m.name,
                    email: m.email,
                    role: m.role as 'owner' | 'admin' | 'member',
                    createdAt: m.createdAt,
                  }))}
                  workspaceSlug={workspaceSlug}
                  currentUserId={membership.memberId}
                  currentUserRole={membership.role as 'owner' | 'admin' | 'member'}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pending invites</CardTitle>
                <CardDescription>
                  {pendingInvites.length} pending invite
                  {pendingInvites.length === 1 ? '' : 's'}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PendingInvitesList
                  invites={pendingInvites.map((i) => ({
                    id: i.id,
                    email: i.email,
                    role: i.role as 'owner' | 'admin' | 'member',
                    expiresAt: i.expiresAt,
                  }))}
                  workspaceSlug={workspaceSlug}
                  canRevoke={canManage}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Danger Zone ─────────────────────────────── */}
          {membership.role === 'owner' && (
            <TabsContent value='danger' className='mt-6'>
              <Card className='border-destructive/40'>
                <CardHeader>
                  <CardTitle className='text-destructive'>
                    Delete workspace
                  </CardTitle>
                  <CardDescription>
                    Permanently delete this workspace, all its projects, tasks,
                    and remove all members. This action cannot be undone.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DeleteWorkspaceButton
                    workspaceSlug={workspaceSlug}
                    workspaceName={membership.workspaceName}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
