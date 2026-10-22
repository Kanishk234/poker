import { describe, expect, it } from 'vitest';
import {
  createTable,
  seatPlayer,
  removePlayer,
  startBettingRound,
  totalChips,
  type TableConfig,
} from './index.js';
import { assertSeat, nextSeat } from './table.js';

const config: TableConfig = {
  maxSeats: 6,
  smallBlind: 10,
  bigBlind: 20,
  minBuyIn: 1,
  maxBuyIn: 2000,
  actionSeconds: 30,
  assistAllowed: false,
};

describe('table configuration and seating', () => {
  it('creates isolated empty state and copies configuration', () => {
    const input = { ...config };
    const state = createTable(input);
    input.bigBlind = 50;
    expect(state.config.bigBlind).toBe(20);
    expect(state.seats).toEqual([null, null, null, null, null, null]);
    expect(state.round).toBeNull();
    expect(state.dealerSeat).toBeNull();
    expect(totalChips(state)).toBe(0);
  });
  it.each([
    { maxSeats: 1 },
    { maxSeats: 10 },
    { maxSeats: 2.5 },
    { smallBlind: 0 },
    { smallBlind: 20 },
    { bigBlind: NaN },
    { bigBlind: 1.5 },
    { minBuyIn: 0 },
    { maxBuyIn: 0 },
    { minBuyIn: 2001 },
    { maxBuyIn: 19 },
    { maxBuyIn: Number.MAX_SAFE_INTEGER },
    { actionSeconds: 0 },
    { actionSeconds: Infinity },
    { assistAllowed: 'yes' as unknown as boolean },
  ])('rejects invalid config %j', (patch) => {
    expect(() => createTable({ ...config, ...patch })).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIG' }),
    );
  });
  it('seats a player immutably, trims names, and accounts for buy-in and departure', () => {
    const original = createTable(config);
    const state = seatPlayer(original, 2, { id: 'p1', name: '  Alex  ' }, 500);
    expect(original.seats[2]).toBeNull();
    expect(state.seats[2]).toMatchObject({
      name: 'Alex',
      stack: 500,
      bet: 0,
      committed: 0,
      status: 'waiting',
    });
    expect(totalChips(state)).toBe(500);
    const removed = removePlayer(state, 2);
    expect(totalChips(removed)).toBe(0);
    expect(state.seats[2]?.stack).toBe(500);
    expect(removePlayer(original, 2)).toEqual(original);
  });
  it('rejects invalid seats, duplicate players, occupied seats, invalid names and buy-ins', () => {
    const empty = createTable(config);
    for (const seat of [-1, 6, 1.2, NaN]) {
      expect(() =>
        seatPlayer(empty, seat, { id: 'x', name: 'Sam' }, 100),
      ).toThrowError(expect.objectContaining({ code: 'INVALID_SEAT' }));
      expect(() => removePlayer(empty, seat)).toThrowError(
        expect.objectContaining({ code: 'INVALID_SEAT' }),
      );
    }
    const state = seatPlayer(empty, 0, { id: 'p1', name: 'Sam' }, 100);
    expect(() =>
      seatPlayer(state, 0, { id: 'p2', name: 'Alex' }, 100),
    ).toThrowError(expect.objectContaining({ code: 'SEAT_TAKEN' }));
    expect(() =>
      seatPlayer(state, 1, { id: 'p1', name: 'Sam' }, 100),
    ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_PLAYER' }));
    for (const player of [
      { id: ' ', name: 'Sam' },
      { id: 'x'.repeat(129), name: 'Sam' },
      { id: 'x', name: ' ' },
      { id: 'x', name: 's'.repeat(25) },
    ])
      expect(() => seatPlayer(empty, 0, player, 100)).toThrowError(
        expect.objectContaining({ code: 'INVALID_PLAYER' }),
      );
    for (const amount of [0, -1, 2001, 1.5, NaN, Infinity])
      expect(() =>
        seatPlayer(empty, 0, { id: 'x', name: 'Sam' }, amount),
      ).toThrowError(expect.objectContaining({ code: 'BAD_BUY_IN' }));
  });
  it('lets new arrivals wait but defers removing players until pending chips are settled', () => {
    let state = seatPlayer(createTable(config), 0, { id: 'a', name: 'A' }, 100);
    state = seatPlayer(state, 3, { id: 'b', name: 'B' }, 100);
    const started = startBettingRound(state).state;
    const joined = seatPlayer(started, 2, { id: 'c', name: 'C' }, 100);
    expect(joined.seats[2]?.status).toBe('waiting');
    expect(totalChips(joined)).toBe(totalChips(started) + 100);
    expect(joined.round).toEqual(started.round);
    expect(joined.round).not.toBe(started.round);
    expect(joined.round!.acted).not.toBe(started.round!.acted);
    expect(() => removePlayer(joined, 0)).toThrowError(
      expect.objectContaining({ code: 'HAND_IN_PROGRESS' }),
    );
  });
  it('finds seats clockwise and wraps across gaps', () => {
    const state = createTable(config);
    expect(nextSeat(state, 4, [1, 3])).toBe(1);
    expect(nextSeat(state, 1, [1, 3])).toBe(3);
    expect(nextSeat(state, 3, [3])).toBe(3);
    expect(() => nextSeat(state, 0, [])).toThrowError(
      expect.objectContaining({ code: 'NOT_ENOUGH_PLAYERS' }),
    );
    expect(() => assertSeat(state, 0)).not.toThrow();
  });
});
