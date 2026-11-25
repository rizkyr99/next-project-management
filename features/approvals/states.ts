/** An approval round: waiting on the client, then answered (or withdrawn by the team). */
export const APPROVAL_STATUSES = ['pending', 'approved', 'changes_requested', 'cancelled'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** What a card shows: the latest round that wasn't withdrawn. */
export type ApprovalState = Exclude<ApprovalStatus, 'cancelled'>;

export const approvalStateLabel: Record<ApprovalState, string> = {
  pending: 'Awaiting approval',
  approved: 'Approved',
  changes_requested: 'Changes requested',
};

/** A request's message and a client's note: short, like a comment. */
export const MAX_APPROVAL_NOTE = 2000;
