import { z } from 'zod';

export const PROTOCOL_VERSION = 1;
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const roomCodeSchema = z
  .string()
  .regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);

// M0 is a transport probe. Real table admission and identity arrive in M3.
export const probeJoinSchema = z
  .object({
    protocol: z.literal(PROTOCOL_VERSION),
  })
  .strict();
export const helloIntentSchema = z
  .object({
    text: z.string().trim().min(1).max(80),
  })
  .strict();
export const helloSchema = z
  .object({
    protocol: z.literal(PROTOCOL_VERSION),
    message: z.string().max(100),
  })
  .strict();
export const errorSchema = z
  .object({
    code: z.enum(['VERSION_MISMATCH', 'INVALID_MESSAGE']),
    message: z.string(),
    refType: z.string().optional(),
  })
  .strict();
export type Hello = z.infer<typeof helloSchema>;
