'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db/drizzle';
import { member, notification, project, user, workspace, workspaceInvite } from '@/db/schema';
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
import { enforceRateLimit } from '@/lib/rate-limit';
import { memberLimitProblem, planGateProblem, syncSeats } from '@/lib/subscription';
import { after } from 'next/server';

const inviteSchema = z
  .object({
    email: z
    .email('Enter a valid email')
      .max(254, 'Email is too long')
      .transform((e) => e.trim().toLowerCase()),
    // Owners can't be invited: ownership is never granted by invite.
    role: z.enum(['member', 'admin', 'guest']),
    /** Guests only: the projects to share (at least one). */
    projectIds: z.array(z.uuid()).max(50).optional(),
  })
  .refine((v) => v.role !== 'guest' || (v.projectIds?.length ?? 0) > 0, {
    message: 'Choose at least one project to share.',
    path: ['projectIds'],
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
  values: { email: string; role: 'member' | 'admin' | 'guest'; projectIds?: string[] },
): Promise<ActionResult<InviteSent>> {
  try {
    const { email, role, projectIds: requested } = inviteSchema.parse(values);
    const { session, workspace: ws } = await requireInviteManager(workspaceSlug);
    await enforceRateLimit('invites', session.user.id);

    // A guest's projects must all be in this workspace (a foreign id is "not found").
    let projectIds: string[] | null = null;
    let projectNames: string[] = [];
    if (role === 'guest') {
      const ids = [...new Set(requested)];
      const found = await db
        .select({ id: project.id, name: project.name })
        .from(project)
        .where(and(eq(project.workspaceId, ws.id), inArray(project.id, ids)));
      if (found.length !== ids.length) throw new AuthzError();
      projectIds = found.map((p) => p.id);
      projectNames = found.map((p) => p.name);
    }

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
      return {
        error:
          role === 'guest'
            ? `${email} is already in this workspace. Change a guest’s projects under Members.`
            : `${email} is already a member of this workspace.`,
      };
    }

    // E1: clients are a Pro feature; team seats are limited on Free, with
    // pending invites counted (a refreshed invite for this email isn't new).
    const planProblem =
      role === 'guest'
        ? await planGateProblem(ws.id, 'clientGuests')
        : await memberLimitProblem(ws.id, { exceptInviteEmail: email });
    if (planProblem) return { error: planProblem };

    // Re-inviting the same email refreshes the pending invite (new token, new
    // expiry, new role) instead of creating a duplicate, so old links stop working.
    const { token, hash } = generateInviteToken();
    await db
      .insert(workspaceInvite)
      .values({
        workspaceId: ws.id,
        email,
        role,
        projectIds,
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
          projectIds,
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
        workspaceId: ws.id,
        href: '/invites',
      });
    }

    const inviteUrl = inviteUrlFor(token);
    const { sent } = await sendWorkspaceInviteEmail({
      to: email,
      inviterName: session.user.name,
      workspaceName: ws.name,
      role,
      projectNames,
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
    await enforceRateLimit('invites', session.user.id);

    // Resending can bring an expired invite back, so it passes the plan's limits again.
    const [current] = await db
      .select({ email: workspaceInvite.email, role: workspaceInvite.role })
      .from(workspaceInvite)
      .where(
        and(eq(workspaceInvite.id, inviteId), eq(workspaceInvite.workspaceId, ws.id), eq(workspaceInvite.status, 'pending')),
      )
      .limit(1);
    if (!current) return { error: 'Invite not found.' };
    const planProblem =
      current.role === 'guest'
        ? await planGateProblem(ws.id, 'clientGuests')
        : await memberLimitProblem(ws.id, { exceptInviteEmail: current.email });
    if (planProblem) return { error: planProblem };

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
      .returning({ email: workspaceInvite.email, role: workspaceInvite.role, projectIds: workspaceInvite.projectIds });

    if (!updated) return { error: 'Invite not found.' };

    const inviteUrl = inviteUrlFor(token);
    const { sent } = await sendWorkspaceInviteEmail({
      to: updated.email,
      inviterName: session.user.name,
      workspaceName: ws.name,
      role: updated.role === 'owner' ? 'member' : updated.role,
      projectNames: updated.projectIds?.length
        ? (
            await db
              .select({ name: project.name })
              .from(project)
              .where(and(eq(project.workspaceId, ws.id), inArray(project.id, updated.projectIds)))
          ).map((p) => p.name)
        : undefined,
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
/**
 * A team seat on a Free workspace may have filled up since the invite was
 * sent. The invite itself was counted then, so only members count now.
 */
async function seatProblem(invite: InviteRow): Promise<string | null> {
  if (invite.role === 'guest') return null;
  const full = await memberLimitProblem(invite.workspaceId, { includePendingInvites: false });
  if (!full) return null;
  return `${invite.workspaceName} has no room for another team member on the Free plan. Ask ${invite.inviterName ?? 'whoever invited you'} to upgrade it or free a seat.`;
}

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
      const full = await seatProblem(invite);
      if (full) return { error: full };
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
          returning "workspace_id", "role", "project_ids"
        ), joined as (
          insert into ${member} ("id", "workspace_id", "user_id", "role")
          select ${crypto.randomUUID()}, "workspace_id", ${session.user.id}, "role" from claimed
          on conflict ("workspace_id", "user_id") do nothing
        ), shared as (
          -- Guests get the invite's projects, if they're still in that workspace.
          insert into "project_guest" ("project_id", "user_id")
          select p."id", ${session.user.id}
          from claimed c
          join "project" p on p."workspace_id" = c."workspace_id" and p."id" = any(c."project_ids")
          where c."role" = 'guest'
          on conflict do nothing
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

      // Accepting does NOT verify the email: the inviter also sees the invite
      // link, so the token doesn't prove the invitee reads this mailbox.
      // Verification only comes from Better Auth's own emailed link.

      await insertActivity({
        workspaceId: invite.workspaceId,
        actorId: session.user.id,
        action: 'member.joined',
        metadata: { memberName: session.user.name, role: invite.role },
      });
      // One more seat on a paid plan. A guest leaves the count as it is, so
      // the sync does nothing for them.
      const workspaceId = invite.workspaceId;
      after(() => syncSeats(workspaceId));
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
