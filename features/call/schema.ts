import { z } from 'zod';

export const MAX_SIGNAL_PAYLOAD_BYTES = 64 * 1024;

export const callRoomSchema = z.object({
  projectId: z.uuid(),
});

export const signalSchema = z.object({
  projectId: z.uuid(),
  // Better Auth user IDs are not UUIDs.
  toUserId: z.string().min(1).max(64),
  type: z.enum(['offer', 'answer', 'ice-candidate']),
  payload: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .transform((p) => (typeof p === 'string' ? p : JSON.stringify(p)))
    // Measured in UTF-8 bytes, not UTF-16 code units: multi-byte characters
    // would otherwise let a payload exceed the limit up to 3x.
    .refine((p) => p.length > 0 && new TextEncoder().encode(p).length <= MAX_SIGNAL_PAYLOAD_BYTES, {
      message: 'Signal payload is empty or too large',
    }),
});

/**
 * Calls are a full mesh: every participant sends their video to every other
 * one, so upload grows with each person. Four keeps it usable on home
 * connections.
 */
export const MAX_CALL_PARTICIPANTS = 4;

/** A participant whose stream hasn't checked in for this long has left. */
export const CALL_STALE_SECONDS = 15;
