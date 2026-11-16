import 'server-only';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { user, workspace, workspaceInvite } from '@/db/schema';
import { hashInviteToken, isWellFormedInviteToken } from '@/lib/invite-token';

const inviteFields = {
  id: workspaceInvite.id,
  email: workspaceInvite.email,
  role: workspaceInvite.role,
  status: workspaceInvite.status,
  expiresAt: workspaceInvite.expiresAt,
  workspaceId: workspace.id,
  workspaceName: workspace.name,
  workspaceSlug: workspace.slug,
  inviterName: user.name,
};

export type InviteRow = {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | 'declined';
  expiresAt: Date;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  inviterName: string | null;
};

function baseQuery() {
  return db
    .select(inviteFields)
    .from(workspaceInvite)
    .innerJoin(workspace, eq(workspace.id, workspaceInvite.workspaceId))
    .leftJoin(user, eq(user.id, workspaceInvite.invitedByUserId));
}

/** Looks an invite up by the raw token from a link. Malformed tokens never hit the DB. */
export async function findInviteByToken(token: string): Promise<InviteRow | null> {
  if (!isWellFormedInviteToken(token)) return null;
  const [row] = await baseQuery()
    .where(eq(workspaceInvite.token, hashInviteToken(token)))
    .limit(1);
  return row ?? null;
}

export async function findInviteById(inviteId: string): Promise<InviteRow | null> {
  const [row] = await baseQuery().where(eq(workspaceInvite.id, inviteId)).limit(1);
  return row ?? null;
}

/**
 * Pending, unexpired invites addressed to this account's email (for the
 * /invites page). Unverified accounts get nothing: anyone can register any
 * address, so only the emailed token link proves mailbox ownership for them.
 */
export async function listPendingInvitesForUser(user: {
  email: string;
  emailVerified: boolean;
}): Promise<InviteRow[]> {
  if (!user.emailVerified) return [];
  const email = user.email;
  return baseQuery()
    .where(
      and(
        sql`lower(${workspaceInvite.email}) = ${email.toLowerCase()}`,
        eq(workspaceInvite.status, 'pending'),
        gt(workspaceInvite.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(workspaceInvite.createdAt));
}
