import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  advanceBettingRound,
  applyAction,
  createTable,
  getLegalActions,
  seatPlayer,
  startBettingRound,
  totalChips,
  type Action,
  type TableState,
} from './index.js';

function table(stacks: number[], maxSeats = stacks.length): TableState {
  let state = createTable({
    maxSeats,
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 1,
    maxBuyIn: 2000,
    actionSeconds: 30,
    assistAllowed: false,
  });
  for (let i = 0; i < stacks.length; i++)
    state = seatPlayer(
      state,
      i,
      { id: `p${i}`, name: `Player ${i}` },
      stacks[i]!,
    );
  return state;
}
const start = (stacks = [500, 500, 500]) =>
  startBettingRound(table(stacks)).state;
function act(
  state: TableState,
  type: Action['type'],
  amount?: number,
): TableState {
  return applyAction(
    state,
    state.round!.actor!,
    amount === undefined ? { type } : { type, amount },
  ).state;
}
function callAround(state: TableState): TableState {
  while (!state.round!.completion) {
    const legal = getLegalActions(state, state.round!.actor!)!;
    state = act(state, legal.canCheck ? 'check' : 'call');
  }
  return state;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('button, blinds, and order', () => {
  it('heads-up button posts small blind, acts first preflop and last postflop', () => {
    const result = startBettingRound(table([500, 500]));
    const state = result.state;
    expect(state.dealerSeat).toBe(0);
    expect(state.round?.actor).toBe(0);
    expect(state.seats[0]?.bet).toBe(10);
    expect(state.seats[1]?.bet).toBe(20);
    expect(result.events).toContainEqual({
      type: 'blindPosted',
      seat: 0,
      blind: 'small',
      amount: 10,
    });
    expect(getLegalActions(state, 0)).toMatchObject({
      callAmount: 10,
      minRaiseTo: 40,
      maxRaiseTo: 500,
    });
    const flop = advanceBettingRound(callAround(state)).state;
    expect(flop.round).toMatchObject({
      street: 'flop',
      actor: 1,
      currentBet: 0,
      lastFullRaiseSize: 20,
    });
    expect(flop.seats.map((seat) => seat?.bet)).toEqual([0, 0]);
    expect(flop.seats.map((seat) => seat?.committed)).toEqual([20, 20]);
    expect(act(flop, 'check').round?.actor).toBe(0);
    expect(totalChips(flop)).toBe(1000);
  });
  it('multiway blinds and action skip empty, sitting-out, and busted seats', () => {
    let state = table([500, 500, 500], 6);
    state = {
      ...state,
      seats: state.seats.map((seat) =>
        seat?.seat === 1 ? { ...seat, status: 'sitting_out' } : seat,
      ),
    };
    state = seatPlayer(state, 4, { id: 'extra', name: 'Extra' }, 500);
    state = seatPlayer(state, 5, { id: 'busted', name: 'Busted' }, 1);
    state = {
      ...state,
      seats: state.seats.map((seat) =>
        seat?.seat === 5 ? { ...seat, status: 'busted', stack: 0 } : seat,
      ),
    };
    const result = startBettingRound(state).state;
    expect(result.dealerSeat).toBe(0);
    expect(result.seats[2]?.bet).toBe(10);
    expect(result.seats[4]?.bet).toBe(20);
    expect(result.round?.actor).toBe(0);
    expect(result.seats[1]?.bet).toBe(0);
    expect(
      startBettingRound({ ...state, dealerSeat: 4 }).state.dealerSeat,
    ).toBe(0);
    expect(
      startBettingRound({ ...state, dealerSeat: 0 }).state.dealerSeat,
    ).toBe(2);
  });
  it('preserves the big blind option when everyone limps', () => {
    let state = start();
    expect(state.round?.actor).toBe(0);
    state = act(state, 'call');
    state = act(state, 'call');
    expect(state.round?.actor).toBe(2);
    expect(getLegalActions(state, 2)).toMatchObject({
      canCheck: true,
      minRaiseTo: 40,
    });
    state = act(state, 'raise', 60);
    expect(state.round).toMatchObject({
      actor: 0,
      currentBet: 60,
      lastFullRaiseSize: 40,
    });
    expect(getLegalActions(state, 0)?.minRaiseTo).toBe(100);
  });
  it('posts short blinds and retains the nominal big blind with multiple actors', () => {
    const state = start([500, 7, 5]);
    expect(state.seats[1]).toMatchObject({ stack: 0, bet: 7, status: 'allin' });
    // Only one player can act: call the actual wager, without an uncallable raise.
    expect(getLegalActions(state, 0)).toMatchObject({
      callAmount: 7,
      minRaiseTo: null,
      canAllIn: false,
    });
    expect(act(state, 'call').round?.completion).toBe('runout');
    const multi = start([500, 500, 5]);
    expect(multi.round?.currentBet).toBe(20);
    expect(getLegalActions(multi, 0)?.callAmount).toBe(20);
  });
  it('immediately closes all-in blind rounds when no further call is needed', () => {
    expect(start([5, 7]).round?.completion).toBe('runout');
    expect(start([500, 5]).round?.completion).toBe('runout');
    expect(start([5, 500]).round?.completion).toBe('runout');
  });
  it('requires two players and never restarts an unsettled hand', () => {
    expect(() =>
      startBettingRound(createTable(table([100, 100]).config)),
    ).toThrowError(expect.objectContaining({ code: 'NOT_ENOUGH_PLAYERS' }));
    expect(() => startBettingRound(table([100], 2))).toThrowError(
      expect.objectContaining({ code: 'NOT_ENOUGH_PLAYERS' }),
    );
    expect(() => startBettingRound(start())).toThrowError(
      expect.objectContaining({ code: 'HAND_IN_PROGRESS' }),
    );
  });
});

describe('wagers, all-ins, and round completion', () => {
  it('tracks full raise increments, raise-to totals, and reopens earlier actors', () => {
    let state = start();
    state = act(state, 'raise', 70);
    expect(state.round).toMatchObject({
      currentBet: 70,
      lastFullRaiseSize: 50,
    });
    expect(getLegalActions(state, 1)).toMatchObject({
      callAmount: 60,
      minRaiseTo: 120,
    });
    state = act(state, 'raise', 150);
    expect(state.round?.lastFullRaiseSize).toBe(80);
    state = act(state, 'call');
    expect(state.round?.actor).toBe(0);
    expect(getLegalActions(state, 0)?.minRaiseTo).toBe(230);
    expect(totalChips(state)).toBe(1500);
  });
  it('does not reopen raising after a short all-in, while unacted players retain their rights', () => {
    let state = start([500, 500, 90]);
    state = act(state, 'raise', 60);
    state = act(state, 'call');
    state = act(state, 'allin');
    expect(state.round).toMatchObject({
      actor: 0,
      currentBet: 90,
      lastFullRaiseSize: 40,
    });
    expect(getLegalActions(state, 0)).toMatchObject({
      callAmount: 30,
      minRaiseTo: null,
      canAllIn: false,
    });
    expect(() => act(state, 'raise', 130)).toThrowError(
      expect.objectContaining({ code: 'ILLEGAL_ACTION' }),
    );
    expect(() => act(state, 'allin')).toThrowError(
      expect.objectContaining({ code: 'ILLEGAL_ACTION' }),
    );
    expect(callAround(state).round?.completion).toBe('matched');
    let unacted = start([500, 35, 500]);
    unacted = act(unacted, 'call');
    unacted = act(unacted, 'allin');
    expect(getLegalActions(unacted, 2)).toMatchObject({
      callAmount: 15,
      minRaiseTo: 55,
      canAllIn: true,
    });
    unacted = act(unacted, 'raise', 55);
    expect(getLegalActions(unacted, 0)?.minRaiseTo).toBe(75);
  });
  it('a full all-in raise reopens action; a short stack may call all-in', () => {
    let state = start([500, 500, 100]);
    state = act(state, 'raise', 60);
    state = act(state, 'call');
    state = act(state, 'allin');
    expect(getLegalActions(state, 0)).toMatchObject({
      callAmount: 40,
      minRaiseTo: 140,
      canAllIn: true,
    });
    let short = start([25, 500, 500]);
    short = act(short, 'call');
    short = act(short, 'raise', 100);
    short = act(short, 'call');
    expect(getLegalActions(short, 0)).toMatchObject({
      callAmount: 5,
      minRaiseTo: null,
      canAllIn: true,
    });
    const called = act(short, 'allin');
    expect(called.seats[0]).toMatchObject({
      stack: 0,
      committed: 25,
      status: 'allin',
    });
    expect(called.round?.completion).toBe('matched');
  });
  it('reopens cumulative short all-ins only for players facing a full raise since their own last action', () => {
    let state = start([100, 500, 500, 500, 75, 500]);
    expect(state.round?.actor).toBe(3);
    state = act(state, 'raise', 60);
    state = act(state, 'allin'); // Seat 4: 75, a short raise of 15.
    state = act(state, 'call'); // Seat 5 has now acted at 75.
    state = act(state, 'allin'); // Seat 0: 100, another short raise of 25.
    state = act(state, 'call');
    state = act(state, 'call');
    expect(state.round).toMatchObject({
      actor: 3,
      currentBet: 100,
      lastFullRaiseSize: 40,
    });
    expect(getLegalActions(state, 3)).toMatchObject({
      minRaiseTo: 140,
      canAllIn: true,
    });
    state = act(state, 'call');
    expect(state.round?.actor).toBe(5);
    expect(getLegalActions(state, 5)).toMatchObject({
      callAmount: 25,
      minRaiseTo: null,
      canAllIn: false,
    });
    expect(() => act(state, 'allin')).toThrowError(
      expect.objectContaining({ code: 'ILLEGAL_ACTION' }),
    );
    expect(act(state, 'call').round?.completion).toBe('matched');
    let short = start([75, 90, 500, 500, 500]);
    short = act(short, 'raise', 60);
    short = act(short, 'call');
    short = act(short, 'allin');
    short = act(short, 'allin');
    short = act(short, 'call');
    expect(getLegalActions(short, 3)).toMatchObject({
      minRaiseTo: null,
      canAllIn: false,
    });
  });
  it('handles a short postflop opening all-in and preserves full-bet sizing', () => {
    let state = advanceBettingRound(callAround(start([500, 25, 500]))).state;
    expect(state.round?.actor).toBe(1);
    expect(getLegalActions(state, 1)).toMatchObject({
      minRaiseTo: null,
      canAllIn: true,
      maxRaiseTo: 5,
    });
    state = act(state, 'allin');
    expect(getLegalActions(state, 2)).toMatchObject({
      callAmount: 5,
      minRaiseTo: 25,
    });
    state = act(state, 'raise', 25);
    expect(state.round?.lastFullRaiseSize).toBe(20);
    expect(getLegalActions(state, 0)?.minRaiseTo).toBe(45);
  });
  it('accepts an explicit short all-in raise, but rejects a non-all-in underraise', () => {
    let state = start([500, 35, 500]);
    state = act(state, 'call');
    expect(getLegalActions(state, 1)).toMatchObject({
      minRaiseTo: null,
      maxRaiseTo: 35,
      canAllIn: true,
    });
    const raised = act(state, 'raise', 35);
    expect(raised.seats[1]).toMatchObject({
      stack: 0,
      bet: 35,
      status: 'allin',
    });
    expect(raised.round?.lastFullRaiseSize).toBe(20);
    expect(() => act(state, 'raise', 30)).toThrowError(
      expect.objectContaining({ code: 'ILLEGAL_ACTION' }),
    );
    expect(() => act(start(), 'raise', 30)).toThrowError(
      expect.objectContaining({ code: 'ILLEGAL_ACTION' }),
    );
  });
  it('normalizes bet/raise names and emits the chips moved, not a duplicate total', () => {
    const flop = advanceBettingRound(callAround(start())).state;
    const result = applyAction(flop, flop.round!.actor!, {
      type: 'raise',
      amount: 50,
    });
    expect(result.events[0]).toMatchObject({
      type: 'playerActed',
      action: 'bet',
      amount: 50,
      raiseTo: 50,
    });
    const preflop = applyAction(start(), 0, { type: 'bet', amount: 60 });
    expect(preflop.events[0]).toMatchObject({
      action: 'raise',
      amount: 60,
      raiseTo: 60,
    });
    const caller = applyAction(preflop.state, 1, { type: 'call' });
    expect(caller.events[0]).toMatchObject({
      action: 'call',
      amount: 50,
      raiseTo: 60,
    });
  });
  it('ends uncontested rounds without awarding or deleting committed chips', () => {
    let state = start();
    state = act(state, 'fold');
    const result = applyAction(state, 1, { type: 'fold' });
    expect(result.state.round).toMatchObject({
      completion: 'uncontested',
      actor: null,
    });
    expect(result.events).toContainEqual({
      type: 'streetEnded',
      street: 'preflop',
      reason: 'uncontested',
    });
    expect(totalChips(result.state)).toBe(1500);
    expect(result.state.seats[2]?.stack).toBe(480);
    expect(result.state.seats[1]?.committed).toBe(10);
    expect(getLegalActions(result.state, 2)).toBeNull();
  });
  it('runs out when only one actor matches an all-in and forbids uncallable raises', () => {
    let state = start([500, 100]);
    state = act(state, 'call');
    state = act(state, 'allin');
    expect(getLegalActions(state, 0)).toMatchObject({
      callAmount: 80,
      minRaiseTo: null,
      canAllIn: false,
    });
    expect(() => act(state, 'raise', 200)).toThrowError(
      expect.objectContaining({ code: 'ILLEGAL_ACTION' }),
    );
    expect(act(state, 'call').round?.completion).toBe('runout');
  });
  it('progresses four completed betting streets and ends at showdown', () => {
    let state = start([500, 500]);
    for (const street of ['preflop', 'flop', 'turn', 'river']) {
      expect(state.round?.street).toBe(street);
      state = callAround(state);
      expect(totalChips(state)).toBe(1000);
      if (street !== 'river') state = advanceBettingRound(state).state;
    }
    expect(state.round?.completion).toBe('showdown');
    expect(() => advanceBettingRound(state)).toThrowError(
      expect.objectContaining({ code: 'ROUND_NOT_COMPLETE' }),
    );
  });
  it('rejects wrong turns, illegal checks/calls, bad amounts, unknown actions and premature advancement', () => {
    const state = start();
    expect(getLegalActions(state, 1)).toBeNull();
    expect(getLegalActions(table([500, 500]), 0)).toBeNull();
    expect(() => applyAction(state, 1, { type: 'fold' })).toThrowError(
      expect.objectContaining({ code: 'NOT_YOUR_TURN' }),
    );
    expect(() => act(state, 'check')).toThrowError(
      expect.objectContaining({ code: 'ILLEGAL_ACTION' }),
    );
    for (const amount of [undefined, NaN, Infinity, 40.5, 20, 600, -1])
      expect(() =>
        applyAction(
          state,
          0,
          amount === undefined ? { type: 'raise' } : { type: 'raise', amount },
        ),
      ).toThrowError(expect.objectContaining({ code: 'ILLEGAL_ACTION' }));
    expect(() =>
      applyAction(state, 0, { type: 'fold', amount: 1 }),
    ).toThrowError(expect.objectContaining({ code: 'ILLEGAL_ACTION' }));
    expect(() =>
      applyAction(state, 0, { type: 'bogus' } as unknown as Action),
    ).toThrowError(expect.objectContaining({ code: 'ILLEGAL_ACTION' }));
    const checked = act(act(state, 'call'), 'call');
    expect(() => act(checked, 'call')).toThrowError(
      expect.objectContaining({ code: 'ILLEGAL_ACTION' }),
    );
    expect(() => advanceBettingRound(state)).toThrowError(
      expect.objectContaining({ code: 'ROUND_NOT_COMPLETE' }),
    );
    expect(() => advanceBettingRound(table([100, 100]))).toThrowError(
      expect.objectContaining({ code: 'ROUND_NOT_COMPLETE' }),
    );
  });
  it('never mutates a frozen input, even on a rejected action', () => {
    const original = freeze(table([500, 500]));
    const state = freeze(startBettingRound(original).state);
    const snapshot = JSON.stringify(state);
    expect(() => act(state, 'check')).toThrow();
    const next = act(state, 'call');
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(next.seats[0]?.stack).toBe(480);
  });
});

describe('random legal betting sequences', () => {
  it('preserves chips, terminates, and repeats deterministically across 10,000 seeded tables', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 500 }), {
          minLength: 2,
          maxLength: 9,
        }),
        fc.integer(),
        (stacks, seed) => {
          function simulate(): { state: TableState; trail: unknown[] } {
            let random = seed >>> 0;
            const pick = (bound: number) => {
              random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
              return Math.floor((random / 2 ** 32) * bound);
            };
            let state = start(stacks);
            const total = totalChips(state);
            const trail: unknown[] = [];
            for (let steps = 0; steps < 400; steps++) {
              if (state.round!.completion) {
                if (state.round!.completion !== 'matched')
                  return { state, trail };
                const next = advanceBettingRound(state);
                state = next.state;
                trail.push(next.events);
                continue;
              }
              const actor = state.round!.actor!;
              const legal = getLegalActions(state, actor)!;
              const options: Action[] = [
                { type: 'fold' },
                legal.canCheck ? { type: 'check' } : { type: 'call' },
              ];
              if (legal.canAllIn) options.push({ type: 'allin' });
              if (legal.minRaiseTo !== null)
                options.push(
                  { type: 'raise', amount: legal.minRaiseTo },
                  {
                    type: 'bet',
                    amount:
                      legal.minRaiseTo +
                      pick(legal.maxRaiseTo - legal.minRaiseTo + 1),
                  },
                );
              const snapshot = JSON.stringify(state);
              for (const option of options) applyAction(state, actor, option);
              const result = applyAction(
                state,
                actor,
                options[pick(options.length)]!,
              );
              if (JSON.stringify(state) !== snapshot)
                throw new Error('Input state mutated');
              state = result.state;
              trail.push(result.events);
              if (totalChips(state) !== total)
                throw new Error('Chip conservation failed');
              for (const seat of state.seats)
                if (seat) {
                  if (
                    seat.stack < 0 ||
                    seat.bet < 0 ||
                    seat.committed < seat.bet ||
                    !Number.isSafeInteger(seat.stack + seat.committed)
                  )
                    throw new Error('Invalid chip ledger');
                }
            }
            throw new Error('Betting did not terminate in 400 transitions');
          }
          return JSON.stringify(simulate()) === JSON.stringify(simulate());
        },
      ),
      { numRuns: 10_000, seed: 20261023 },
    );
  }, 120000);
});
