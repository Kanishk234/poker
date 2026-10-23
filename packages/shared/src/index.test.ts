import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  joinSchema,
  intentSchemas,
  PROTOCOL_VERSION,
  roomCodeSchema,
  ROOM_CODE_ALPHABET,
  createTableSchema,
  reconnectSchema,
  savedSessionSchema,
} from './index.js';

describe('gameplay protocol', () => {
  it('validates private reconnect credentials without accepting forged options or old versions', () => {
    const token = 'secure_session_token';
    expect(
      reconnectSchema.safeParse({ reconnectionToken: token }).success,
    ).toBe(true);
    for (const payload of [
      { reconnectionToken: token, playerId: 'forged' },
      { reconnectionToken: '' },
      { reconnectionToken: 'x'.repeat(129) },
      { reconnectionToken: '../other-room' },
    ])
      expect(reconnectSchema.safeParse(payload).success).toBe(false);
    const saved = {
      protocol: PROTOCOL_VERSION,
      code: 'ABCDEF',
      playerId: 'player-1',
      reconnectionToken: `room-1:${token}`,
    };
    expect(savedSessionSchema.safeParse(saved).success).toBe(true);
    expect(
      savedSessionSchema.safeParse({ ...saved, protocol: PROTOCOL_VERSION - 1 })
        .success,
    ).toBe(false);
    expect(
      savedSessionSchema.safeParse({
        ...saved,
        reconnectionToken: 'https://another-host/token',
      }).success,
    ).toBe(false);
  });
  it('validates every intent and rejects forged identity, fractional chips, unknown fields and unbounded input', () => {
    const valid = {
      sit: { seat: 0, buyIn: 100 },
      stand: {},
      action: {
        handId: 'hand-1',
        turnId: 'hand-1:0',
        type: 'raise',
        amount: 20,
      },
      sitOut: {},
      sitIn: {},
      rebuy: { amount: 100 },
      chat: { text: 'hello' },
      host: { op: 'start' },
      resync: { lastSeq: 0 },
    };
    for (const type of Object.keys(
      intentSchemas,
    ) as (keyof typeof intentSchemas)[]) {
      expect(intentSchemas[type].safeParse(valid[type]).success).toBe(true);
      expect(
        intentSchemas[type].safeParse({ ...valid[type], playerId: 'forged' })
          .success,
      ).toBe(false);
      for (const payload of [null, [], 'bad'])
        expect(intentSchemas[type].safeParse(payload).success).toBe(false);
    }
    for (const payload of [
      { seat: 9, buyIn: 100 },
      { seat: 0, buyIn: 1.5 },
      { seat: 0, buyIn: Number.MAX_SAFE_INTEGER + 1 },
    ])
      expect(intentSchemas.sit.safeParse(payload).success).toBe(false);
    for (const payload of [
      { handId: 'h', turnId: 't', type: 'fold', amount: 10 },
      { handId: 'h', turnId: 't', type: 'raise' },
      { handId: 'h', turnId: 't', type: 'raise', amount: -1 },
    ])
      expect(intentSchemas.action.safeParse(payload).success).toBe(false);
    expect(
      createTableSchema.safeParse({
        config: {
          maxSeats: 2,
          smallBlind: 1,
          bigBlind: 2,
          minBuyIn: 100,
          maxBuyIn: Number.MAX_SAFE_INTEGER,
          actionSeconds: 30,
          assistAllowed: false,
        },
      }).success,
    ).toBe(false);
  });
  it('rejects mismatched versions and extra fields', () => {
    expect(
      joinSchema.safeParse({
        protocol: PROTOCOL_VERSION,
        code: 'ABCDEF',
        displayName: 'Friend',
      }).success,
    ).toBe(true);
    expect(
      joinSchema.safeParse({
        protocol: PROTOCOL_VERSION + 1,
        code: 'ABCDEF',
        displayName: 'Friend',
      }).success,
    ).toBe(false);
    expect(
      intentSchemas.chat.safeParse({ text: 'hello', cards: ['As'] }).success,
    ).toBe(false);
    expect(intentSchemas.chat.safeParse({ text: ' ' }).success).toBe(false);
    expect(
      intentSchemas.chat.safeParse({ text: 'x'.repeat(201) }).success,
    ).toBe(false);
  });

  it('accepts six-character room codes from the unambiguous alphabet', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...ROOM_CODE_ALPHABET), {
          minLength: 6,
          maxLength: 6,
        }),
        (characters) => {
          expect(roomCodeSchema.safeParse(characters.join('')).success).toBe(
            true,
          );
        },
      ),
    );
    for (const code of ['O12345', 'ABC', 'abcdef', 'ABCDEF!']) {
      expect(roomCodeSchema.safeParse(code).success).toBe(false);
    }
  });
});
