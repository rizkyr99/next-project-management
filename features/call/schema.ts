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
    .refine((p) => p.length > 0 && p.length <= MAX_SIGNAL_PAYLOAD_BYTES, {
      message: 'Signal payload is empty or too large',
    }),
});
