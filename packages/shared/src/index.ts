import { z } from 'zod';

export const PROTOCOL_VERSION = 2;
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const roomCodeSchema = z
  .string()
  .regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
const chips = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const seat = z.number().int().min(0).max(8);
const name = z.string().trim().min(1).max(24);
const id = z.string().min(1).max(128);
const token = z.string().uuid();
export const tableConfigSchema = z
  .object({
    maxSeats: z.number().int().min(2).max(9),
    smallBlind: chips.positive(),
    bigBlind: chips.positive(),
    minBuyIn: chips.positive(),
    maxBuyIn: chips.positive(),
    actionSeconds: z.number().int().min(5).max(120),
    assistAllowed: z.boolean(),
  })
  .strict()
  .refine(
    (c) =>
      c.smallBlind < c.bigBlind &&
      c.minBuyIn <= c.maxBuyIn &&
      c.maxBuyIn >= c.bigBlind &&
      c.maxBuyIn <= Math.floor(Number.MAX_SAFE_INTEGER / c.maxSeats),
    'Invalid table limits',
  );
export const createTableSchema = z
  .object({ config: tableConfigSchema })
  .strict();
export const createdTableSchema = z
  .object({ code: roomCodeSchema, roomId: id, creatorToken: token })
  .strict();
export const joinSchema = z
  .object({
    protocol: z.literal(PROTOCOL_VERSION),
    code: roomCodeSchema,
    displayName: name,
    creatorToken: token.optional(),
  })
  .strict();
const empty = z.object({}).strict();
const actionType = z.enum(['fold', 'check', 'call', 'bet', 'raise', 'allin']);
const actionBase = { handId: id, turnId: id };
export const actionIntentSchema = z.discriminatedUnion('type', [
  z.object({ ...actionBase, type: z.literal('fold') }).strict(),
  z.object({ ...actionBase, type: z.literal('check') }).strict(),
  z.object({ ...actionBase, type: z.literal('call') }).strict(),
  z.object({ ...actionBase, type: z.literal('allin') }).strict(),
  z
    .object({ ...actionBase, type: z.literal('bet'), amount: chips.positive() })
    .strict(),
  z
    .object({
      ...actionBase,
      type: z.literal('raise'),
      amount: chips.positive(),
    })
    .strict(),
]);
export const intentSchemas = {
  sit: z.object({ seat, buyIn: chips.positive() }).strict(),
  stand: empty,
  action: actionIntentSchema,
  sitOut: empty,
  sitIn: empty,
  rebuy: z.object({ amount: chips.positive() }).strict(),
  chat: z.object({ text: z.string().trim().min(1).max(200) }).strict(),
  host: z.object({ op: z.literal('start') }).strict(),
  resync: z.object({ lastSeq: chips }).strict(),
} as const;
export type IntentMap = {
  [K in keyof typeof intentSchemas]: z.infer<(typeof intentSchemas)[K]>;
};
export type IntentType = keyof IntentMap;
export type CardValue =
  `${'2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'}${'s' | 'h' | 'c' | 'd'}`;
export const cardSchema = z
  .string()
  .regex(/^[2-9TJQKA][shcd]$/)
  .transform((value) => value as CardValue);
const hole = z.tuple([cardSchema, cardSchema]);
const street = z.enum(['preflop', 'flop', 'turn', 'river']);
const pot = z
  .object({ amount: chips, eligibleSeats: z.array(seat).max(9) })
  .strict();
export const legalActionsSchema = z
  .object({
    canFold: z.boolean(),
    canCheck: z.boolean(),
    callAmount: chips,
    minRaiseTo: chips.nullable(),
    maxRaiseTo: chips,
    canAllIn: z.boolean(),
  })
  .strict();
export const seatViewSchema = z
  .object({
    seat,
    playerId: id,
    name,
    stack: chips,
    bet: chips,
    status: z.enum([
      'waiting',
      'active',
      'folded',
      'allin',
      'sitting_out',
      'busted',
    ]),
    connected: z.boolean(),
    isHost: z.boolean(),
    cards: z.union([z.literal('hidden'), hole, z.null()]),
  })
  .strict();
export const tableViewSchema = z
  .object({
    tableId: roomCodeSchema,
    config: tableConfigSchema,
    phase: z.enum(['waiting', 'preflop', 'flop', 'turn', 'river', 'handOver']),
    handId: id.nullable(),
    handNumber: chips,
    dealerSeat: seat.nullable(),
    board: z.array(cardSchema).max(5),
    pots: z.array(pot).max(9),
    seats: z.array(seatViewSchema.nullable()).min(2).max(9),
    turn: z.object({ seat, turnId: id, deadlineMs: chips }).strict().nullable(),
    you: z
      .object({
        seat,
        holeCards: hole.nullable(),
        legal: legalActionsSchema.nullable(),
        pendingSitOut: z.boolean(),
        leavingAfterHand: z.boolean(),
      })
      .strict()
      .nullable(),
    paused: z.boolean(),
    hostId: id.nullable(),
    started: z.boolean(),
  })
  .strict();
const share = z.object({ seat, amount: chips }).strict();
export const tableEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('handStarted'),
      handId: id,
      handNumber: chips,
      dealerSeat: seat,
    })
    .strict(),
  z.object({ type: z.literal('buttonMoved'), seat }).strict(),
  z
    .object({
      type: z.literal('blindPosted'),
      seat,
      blind: z.enum(['small', 'big']),
      amount: chips,
    })
    .strict(),
  z.object({ type: z.literal('roundStarted'), street }).strict(),
  z
    .object({
      type: z.literal('playerActed'),
      seat,
      action: actionType,
      amount: chips,
      raiseTo: chips,
    })
    .strict(),
  z
    .object({
      type: z.literal('streetEnded'),
      street,
      reason: z.enum(['matched', 'uncontested', 'runout', 'showdown']),
    })
    .strict(),
  z
    .object({
      type: z.literal('holeCardsDealt'),
      seat,
      playerId: id,
      handId: id,
      cards: hole,
    })
    .strict(),
  z
    .object({
      type: z.literal('boardDealt'),
      street,
      cards: z.array(cardSchema).max(3),
    })
    .strict(),
  z
    .object({
      type: z.literal('showdown'),
      hands: z.array(z.object({ seat, cards: hole }).strict()).max(9),
    })
    .strict(),
  z
    .object({ type: z.literal('uncalledReturned'), seat, amount: chips })
    .strict(),
  z
    .object({
      type: z.literal('potAwarded'),
      potIndex: chips,
      seats: z.array(seat).max(9),
      amount: chips,
      shares: z.array(share).max(9),
    })
    .strict(),
  z.object({ type: z.literal('playerBusted'), seat }).strict(),
  z.object({ type: z.literal('handEnded'), handId: id }).strict(),
  z
    .object({
      type: z.literal('playerSeated'),
      seat,
      playerId: id,
      amount: chips,
    })
    .strict(),
  z.object({ type: z.literal('playerRemoved'), seat, amount: chips }).strict(),
  z.object({ type: z.literal('playerLeaving'), seat }).strict(),
  z.object({ type: z.literal('playerRebought'), seat, amount: chips }).strict(),
  z
    .object({
      type: z.literal('playerSitOutChanged'),
      seat,
      sittingOut: z.boolean(),
      appliesNextHand: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('playerTimedOut'),
      seat,
      action: z.enum(['check', 'fold']),
      consecutive: chips,
    })
    .strict(),
  z.object({ type: z.literal('timeoutFold'), seat }).strict(),
]);
export const updateSchema = z
  .object({
    seq: chips,
    view: tableViewSchema,
    events: z.array(tableEventSchema).max(200),
    serverTime: chips,
  })
  .strict();
export const welcomeSchema = z
  .object({ protocol: z.literal(PROTOCOL_VERSION), playerId: id })
  .strict();
export const chatSchema = z
  .object({ playerId: id, name, text: z.string().max(200), ts: chips })
  .strict();
export const errorSchema = z
  .object({
    code: z.string().min(1).max(50),
    message: z.string().max(200),
    refType: z.string().max(40).optional(),
  })
  .strict();
export type TableConfig = z.infer<typeof tableConfigSchema>;
export type TableView = z.infer<typeof tableViewSchema>;
export type TableEvent = z.infer<typeof tableEventSchema>;
export type SeatView = z.infer<typeof seatViewSchema>;
export type LegalActions = z.infer<typeof legalActionsSchema>;
export type Update = z.infer<typeof updateSchema>;
export type Chat = z.infer<typeof chatSchema>;
