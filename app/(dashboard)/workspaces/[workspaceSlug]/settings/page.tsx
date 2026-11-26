import { InviteMemberForm } from '@/features/workspaces/components/invite-member-form';
import { UpdateWorkspaceForm } from '@/features/workspaces/components/update-workspace-form';
import { MemberList } from '@/features/workspaces/components/member-list';
import { PendingInvitesList } from '@/features/workspaces/components/pending-invites-list';
import { DeleteWorkspaceButton } from '@/features/workspaces/components/delete-workspace-button';
import { LeaveWorkspaceButton } from '@/features/workspaces/components/leave-workspace-button';
import { db } from '@/db/drizzle';
import { label, member, project, projectGuest, taskLabel, user, workspace, workspaceInvite } from '@/db/schema';
import { LabelManager } from '@/features/labels/components/label-manager';
import { TemplateList } from '@/features/templates/components/template-list';
import { savedTemplatesForSettings } from '@/features/templates/queries';
import { auth } from '@/lib/auth';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
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
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Settings' };

const TABS = ['general', 'members', 'labels', 'templates', 'danger'] as const;

export default async function WorkspaceSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ readonly workspaceSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ workspaceSlug }, { tab }] = await Promise.all([params, searchParams]);
  // ?tab=members lets links (e.g. the onboarding checklist) open a tab directly.
  const initialTab = TABS.find((t) => t === tab) ?? 'general';
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

  // Guests (clients) see nothing of the workspace's people or setup, only
  // the way out. The member list would show other clients' names and emails.
  if (membership.role === 'guest') {
    return (
      <div className='flex-1'>
        <div className='max-w-3xl space-y-6 p-4 md:p-8'>
          <div>
            <h1 className='text-2xl font-semibold'>Settings</h1>
            <p className='text-sm text-muted-foreground'>
              You&apos;re a guest in <span className='font-medium text-foreground'>{membership.workspaceName}</span>.
            </p>
          </div>
          <Card className='border-destructive/40'>
            <CardHeader>
              <CardTitle className='text-destructive'>Leave workspace</CardTitle>
              <CardDescription>
                You&apos;ll lose access to the projects shared with you. They can invite you again.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LeaveWorkspaceButton workspaceId={membership.workspaceId} workspaceName={membership.workspaceName} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const canManage = membership.role === 'owner' || membership.role === 'admin';

  // Active projects (to share with guests) and what each guest can see.
  const [activeProjects, guestShares] = await Promise.all([
    db
      .select({ id: project.id, name: project.name })
      .from(project)
      .where(and(eq(project.workspaceId, membership.workspaceId), isNull(project.archivedAt)))
      .orderBy(asc(project.name)),
    db
      .select({ userId: projectGuest.userId, projectId: project.id, projectName: project.name })
      .from(projectGuest)
      .innerJoin(project, eq(project.id, projectGuest.projectId))
      .where(eq(project.workspaceId, membership.workspaceId))
      .orderBy(asc(project.name)),
  ]);
  const sharedWith = new Map<string, { id: string; name: string }[]>();
  for (const s of guestShares) {
    sharedWith.set(s.userId, [...(sharedWith.get(s.userId) ?? []), { id: s.projectId, name: s.projectName }]);
  }

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

  // Labels with how many tasks use each, for the Labels tab.
  const labels = await db
    .select({ id: label.id, name: label.name, color: label.color, taskCount: count(taskLabel.taskId) })
    .from(label)
    .leftJoin(taskLabel, eq(taskLabel.labelId, label.id))
    .where(eq(label.workspaceId, membership.workspaceId))
    .groupBy(label.id)
    .orderBy(asc(label.name));

  const templates = (await savedTemplatesForSettings(membership.workspaceId)).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    taskCount: t.taskCount,
    createdByName: t.createdByName,
    createdAt: t.createdAt,
    canDelete: canManage || t.createdById === session.user.id,
  }));

  const pendingInvites = await db
    .select({
      id: workspaceInvite.id,
      email: workspaceInvite.email,
      role: workspaceInvite.role,
      expiresAt: workspaceInvite.expiresAt,
      expired: sql<boolean>`${workspaceInvite.expiresAt} <= now()`,
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

        <Tabs defaultValue={initialTab}>
          <TabsList>
            <TabsTrigger value='general'>General</TabsTrigger>
            <TabsTrigger value='members'>
              Members{' '}
              <span className='ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground'>
                {members.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value='labels'>Labels</TabsTrigger>
            <TabsTrigger value='templates'>Templates</TabsTrigger>
            <TabsTrigger value='danger' className='text-red-700 data-[state=active]:text-red-700 dark:text-red-400 dark:data-[state=active]:text-red-400'>
              Danger zone
            </TabsTrigger>
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

          {/* ── Labels ──────────────────────────────────── */}
          <TabsContent value='labels' className='mt-6 space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle>Labels</CardTitle>
                <CardDescription>
                  Shared by every project in this workspace. Anyone can rename or recolour a label
                  {canManage ? '; owners and admins can delete one.' : '.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LabelManager labels={labels} canDelete={canManage} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Templates ───────────────────────────────── */}
          <TabsContent value='templates' className='mt-6 space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle>Project templates</CardTitle>
                <CardDescription>
                  Start new client jobs from a saved project. Anyone on the team can save one; the person who saved
                  it{canManage ? ', or an owner or admin,' : ' or an admin'} can delete it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TemplateList templates={templates} />
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
                    Add teammates by email and assign their role, or share projects with a client as a guest.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <InviteMemberForm
                    workspaceSlug={workspaceSlug}
                    canInvite={canManage}
                    projects={activeProjects}
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
                    role: m.role,
                    createdAt: m.createdAt,
                    ...(m.role === 'guest' && { projects: sharedWith.get(m.userId) ?? [] }),
                  }))}
                  projects={activeProjects}
                  workspaceSlug={workspaceSlug}
                  workspaceId={membership.workspaceId}
                  workspaceName={membership.workspaceName}
                  currentUserId={membership.memberId}
                  currentUserRole={membership.role}
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
                    role: i.role,
                    expiresAt: i.expiresAt,
                    expired: i.expired,
                  }))}
                  workspaceSlug={workspaceSlug}
                  canRevoke={canManage}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Danger Zone ─────────────────────────────── */}
          <TabsContent value='danger' className='mt-6 space-y-6'>
            <Card className='border-destructive/40'>
              <CardHeader>
                <CardTitle className='text-destructive'>Leave workspace</CardTitle>
                <CardDescription>
                  {membership.role === 'owner'
                    ? 'You own this workspace. Transfer ownership to another member (Members tab, member menu) before leaving, or delete the workspace.'
                    : 'Remove yourself from this workspace. You will be unassigned from its tasks.'}
                </CardDescription>
              </CardHeader>
              {membership.role !== 'owner' && (
                <CardContent>
                  <LeaveWorkspaceButton
                    workspaceId={membership.workspaceId}
                    workspaceName={membership.workspaceName}
                  />
                </CardContent>
              )}
            </Card>

            {membership.role === 'owner' && (
              <Card className='border-destructive/40'>
                <CardHeader>
                  <CardTitle className='text-destructive'>Delete workspace</CardTitle>
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
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
