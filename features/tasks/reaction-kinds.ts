/**
 * Reactions on comments: a quick "seen", "agreed" or "done" without another
 * comment or notification. The database enum (db/schema.ts) reads this list.
 */
export const REACTIONS = ['thumbs_up', 'check', 'eyes'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const reactionMeta: Record<Reaction, { emoji: string; label: string }> = {
  thumbs_up: { emoji: '👍', label: 'Thumbs up' },
  check: { emoji: '✅', label: 'Done' },
  eyes: { emoji: '👀', label: 'Looking' },
};

/** How a comment's reactions are shown: count, whether I reacted, and who did. */
export type ReactionSummary = { reaction: Reaction; count: number; mine: boolean; names: string[] };
