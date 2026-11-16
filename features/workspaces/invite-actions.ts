'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db/drizzle';
import { member, notification, user, workspace, workspaceInvite } from '@/db/schema';
import { insertActivity } from '@/lib/activity';
import { AuthzError, requireSession, toActionError, type ActionResult } from '@/lib/authz';
import { APP_URL, sendWorkspaceInviteEmail } from '@/lib/email';
import {
  evaluateInvite,
  generateInviteToken,
  inviteExpiry,
  maskEmail,
  type InviteState,
} from '@/lib/invite-token';
import { findInviteById, findInviteByToken, type InviteRow } from '@/lib/invites';

const inviteSchema = z.object({
  email: z
    .email('Enter a valid email')
    .max(254, 'Email is too long')
    .transform((e) => e.trim().toLowerCase()),
  // Owners can't be invited: ownership is never granted by invite.
  role: z.enum(['member', 'admin']),
});

const inviteRefSchema = z.union([
  z.object({ token: z.string().min(1).max(100) }),
  z.object({ inviteId: z.string().min(1).max(100) }),
]);
export type InviteRef = z.infer<typeof inviteRefSchema>;

type InviteSent = { success: true; email: string; inviteUrl: string; emailSent: boolean };

function inviteUrlFor(token: string) {
  return `${APP_URL}/invite/${token}`;
}

/** The caller must be an owner or admin of the workspace with this slug. */
async function requireInviteManager(workspaceSlug: string) {
  const session = await requireSession();
  const [row] = await db
    .select({ id: workspace.id, name: workspace.name, slug: workspace.slug, role: member.role })
    .from(workspace)
    .innerJoin(
      member,
      and(eq(member.workspaceId, workspace.id), eq(member.userId, session.user.id)),
    )
    .where(eq(workspace.slug, workspaceSlug))
    .limit(1);

  if (!row) throw new AuthzError();
  if (row.role !== 'owner' && row.role !== 'admin') {
    throw new AuthzError('Only workspace owners and admins can manage invites.');
  }
  return { session, workspace: row };
}

function managerError(error: unknown, fallback: string) {
  if (error instanceof AuthzError && error.message !== 'Not found') {
    return { error: error.message };
  }
  return toActionError(error, fallback);
}

export async function inviteUserToWorkspace(
  workspaceSlug: string,
  values: { email: string; role: 'member' | 'admin' },
): Promise<ActionResult<InviteSent>> {
  try {
    const { email, role } = inviteSchema.parse(values);
    const { session, workspace: ws } = await requireInviteManager(workspaceSlug);

    if (email === session.user.email.toLowerCase()) {
      return { error: "You're already a member of this workspace." };
    }

    const [existingMember] = await db
      .select({ id: member.id })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.workspaceId, ws.id), sql`lower(${user.email}) = ${email}`))
      .limit(1);
    if (existingMember) {
      return { error: `${email} is already a member of this workspace.` };
    }

    // TODO(plan-limits): count pending invites + members against a member cap
    // if plans ever get one.

    // Re-inviting the same email refreshes the pending invite (new token, new
    // expiry, new role) instead of creating a duplicate, so old links stop working.
    const { token, hash } = generateInviteToken();
    await db
      .insert(workspaceInvite)
      .values({
        workspaceId: ws.id,
        email,
        role,
        status: 'pending',
        token: hash,
        invitedByUserId: session.user.id,
        expiresAt: inviteExpiry(),
      })
      .onConflictDoUpdate({
        target: [workspaceInvite.workspaceId, workspaceInvite.email],
        targetWhere: sql`status = 'pending'`,
        set: {
          role,
          token: hash,
          invitedByUserId: session.user.id,
          expiresAt: inviteExpiry(),
          createdAt: new Date(),
        },
      });

    // People who already have an account also get an in-app notification. It
    // links to /invites rather than carrying the token.
    // Only verified accounts: an unverified account could have been registered
    // by someone who doesn't own the mailbox.
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(and(sql`lower(${user.email}) = ${email}`, eq(user.emailVerified, true)))
      .limit(1);
    if (existingUser) {
      await db.insert(notification).values({
        userId: existingUser.id,
        type: 'workspace_invite',
        actorName: session.user.name,
        workspaceName: ws.name,
      });
    }

    const inviteUrl = inviteUrlFor(token);
    const { sent } = await sendWorkspaceInviteEmail({
      to: email,
      inviterName: session.user.name,
      workspaceName: ws.name,
      role,
      inviteUrl,
    });

    await insertActivity({
      workspaceId: ws.id,
      actorId: session.user.id,
      action: 'member.invited',
      metadata: { inviteEmail: email, role },
    });

    revalidatePath(`/workspaces/${ws.slug}/settings`);
    return { success: true, email, inviteUrl, emailSent: sent };
  } catch (error) {
    return managerError(error, 'Failed to send invite.');
  }
}

/** Issues a fresh link and expiry for a pending invite and emails it again. */
export async function resendInvite(
  workspaceSlug: string,
  inviteId: string,
): Promise<ActionResult<InviteSent>> {
  try {
    const { session, workspace: ws } = await requireInviteManager(workspaceSlug);
    const { token, hash } = generateInviteToken();

    const [updated] = await db
      .update(workspaceInvite)
      .set({ token: hash, expiresAt: inviteExpiry(), invitedByUserId: session.user.id })
      .where(
        and(
          eq(workspaceInvite.id, inviteId),
          eq(workspaceInvite.workspaceId, ws.id),
          eq(workspaceInvite.status, 'pending'),
        ),
      )
      .returning({ email: workspaceInvite.email, role: workspaceInvite.role });

    if (!updated) return { error: 'Invite not found.' };

    const inviteUrl = inviteUrlFor(token);
    const { sent } = await sendWorkspaceInviteEmail({
      to: updated.email,
      inviterName: session.user.name,
      workspaceName: ws.name,
      role: updated.role === 'admin' ? 'admin' : 'member',
      inviteUrl,
    });

    revalidatePath(`/workspaces/${ws.slug}/settings`);
    return { success: true, email: updated.email, inviteUrl, emailSent: sent };
  } catch (error) {
    return managerError(error, 'Failed to resend invite.');
  }
}

export async function revokeInvite(
  workspaceSlug: string,
  inviteId: string,
): Promise<ActionResult> {
  try {
    const { workspace: ws } = await requireInviteManager(workspaceSlug);
    const [revoked] = await db
      .update(workspaceInvite)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(workspaceInvite.id, inviteId),
          eq(workspaceInvite.workspaceId, ws.id),
          eq(workspaceInvite.status, 'pending'),
        ),
      )
      .returning({ id: workspaceInvite.id });

    if (!revoked) return { error: 'Invite not found.' };

    revalidatePath(`/workspaces/${ws.slug}/settings`);
    return { success: true };
  } catch (error) {
    return managerError(error, 'Failed to revoke invite.');
  }
}

/** User-facing copy for every state that isn't "go ahead". */
function stateMessage(state: Exclude<InviteState, { kind: 'valid' }>): string {
  switch (state.kind) {
    case 'wrong_account':
      return `This invite was sent to ${maskEmail(state.inviteEmail)}. Sign in with that account to accept it.`;
    case 'expired':
      return 'This invite has expired. Ask the workspace admin to send a new one.';
    case 'revoked':
      return 'This invite was revoked.';
    case 'accepted':
      return 'This invite has already been accepted.';
    case 'declined':
      return 'This invite was declined.';
  }
}

const VERIFY_FIRST =
  'To accept from here, your email must be verified. Open the invite link from your email instead.';

/**
 * The token proves the caller can read the invited mailbox. The invite ID
 * doesn't, so the ID path (used by /invites) also requires a verified email.
 * Email/password sign-ups aren't verified yet (P3), and anyone could register
 * someone else's address.
 */
async function loadInvite(
  ref: InviteRef,
  session: { user: { emailVerified: boolean } },
): Promise<InviteRow | { error: string } | null> {
  if ('token' in ref) return findInviteByToken(ref.token);
  if (!session.user.emailVerified) return { error: VERIFY_FIRST };
  return findInviteById(ref.inviteId);
}

/**
 * Accepts an invite addressed to the signed-in user's email, then redirects
 * into the workspace. Works with the raw token (email link) or the invite ID
 * (/invites page, where the email match is the authorization).
 */
export async function acceptInvite(rawRef: InviteRef): Promise<ActionResult> {
  const session = await requireSession();
  let slug: string;

  try {
    const ref = inviteRefSchema.parse(rawRef);
    const invite = await loadInvite(ref, session);
    if (!invite) return { error: 'This invite link is invalid.' };
    if ('error' in invite) return { error: invite.error };

    const state = evaluateInvite(invite, session.user.email);
    if (state.kind !== 'valid') {
      // Accepting twice is harmless: just take them to the workspace.
      if (state.kind !== 'accepted') return { error: stateMessage(state) };
      const [already] = await db
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.workspaceId, invite.workspaceId), eq(member.userId, session.user.id)))
        .limit(1);
      if (!already) return { error: stateMessage(state) };
      slug = invite.workspaceSlug;
    } else {
      // A single statement, so the membership is inserted only from the row
      // *this* request claimed (pending and unexpired). A revoke, an expiry or
      // a concurrent accept leaves `claimed` empty and inserts nothing, even
      // if the member was removed in the meantime.
      const result = await db.execute<{ claimed: number }>(sql`
        with claimed as (
          update ${workspaceInvite}
          set "status" = 'accepted'
          where ${workspaceInvite.id} = ${invite.id}
            and ${workspaceInvite.status} = 'pending'
            and ${workspaceInvite.expiresAt} > now()
          returning "workspace_id", "role"
        ), joined as (
          insert into ${member} ("id", "workspace_id", "user_id", "role")
          select ${crypto.randomUUID()}, "workspace_id", ${session.user.id}, "role" from claimed
          on conflict ("workspace_id", "user_id") do nothing
        )
        select count(*)::int as claimed from claimed
      `);
      const claimed = Number(result.rows[0]?.claimed ?? 0);

      if (claimed === 0) {
        // Lost a race (revoked, expired or accepted in the meantime): re-read for the right message.
        const fresh = await findInviteById(invite.id);
        const freshState = fresh ? evaluateInvite(fresh, session.user.email) : null;
        return {
          error:
            freshState && freshState.kind !== 'valid'
              ? stateMessage(freshState)
              : 'This invite is no longer valid.',
        };
      }

      await insertActivity({
        workspaceId: invite.workspaceId,
        actorId: session.user.id,
        action: 'member.joined',
        metadata: { memberName: session.user.name, role: invite.role },
      });
      slug = invite.workspaceSlug;
    }
  } catch (error) {
    return toActionError(error, 'Failed to accept invite.');
  }

  revalidatePath('/', 'layout');
  redirect(`/workspaces/${slug}`);
}

export async function declineInvite(rawRef: InviteRef): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const ref = inviteRefSchema.parse(rawRef);
    const invite = await loadInvite(ref, session);
    if (!invite) return { error: 'This invite link is invalid.' };
    if ('error' in invite) return { error: invite.error };

    const state = evaluateInvite(invite, session.user.email);
    if (state.kind !== 'valid') return { error: stateMessage(state) };

    await db
      .update(workspaceInvite)
      .set({ status: 'declined' })
      .where(and(eq(workspaceInvite.id, invite.id), eq(workspaceInvite.status, 'pending')));

    revalidatePath('/invites');
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to decline invite.');
  }
}
