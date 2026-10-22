import { describe, expect, it } from 'vitest';
import {
  applyAction,
  applyTimeout,
  createTable,
  getLegalActions,
  joinTable,
  leaveTable,
  rebuy,
  removePlayer,
  seatPlayer,
  setSittingOut,
  startBettingRound,
  startHand,
  totalChips,
  viewFor,
  type HandEvent,
  type TableState,
} from './index.js';

function table(
  stacks = [500, 500],
  maxSeats = Math.max(2, stacks.length),
): TableState {
  let state = createTable({
    maxSeats,
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 1,
    maxBuyIn: 2000,
    actionSeconds: 30,
    assistAllowed: false,
  });
  for (let seat = 0; seat < stacks.length; seat++)
    state = seatPlayer(
      state,
      seat,
      { id: `p${seat}`, name: `Player ${seat}` },
      stacks[seat]!,
    );
  return state;
}
const rng = (bound: number) => bound - 1;
function finish(state: TableState) {
  const events: HandEvent[] = [];
  for (let i = 0; i < 100; i++) {
    if (state.hand!.settled) return { state, events };
    const actor = state.round!.actor!;
    const legal = getLegalActions(state, actor)!;
    const result = applyAction(state, actor, {
      type: legal.canCheck ? 'check' : 'call',
    });
    state = result.state;
    events.push(...result.events);
  }
  throw new Error('Hand did not finish');
}

describe('timeout and sit-out policy', () => {
  it('folds only the current seat after the injected deadline, and emits timeout feedback', () => {
    const state = startHand(table(), rng, 1000).state;
    expect(() => applyTimeout(state, 0, 30999)).toThrowError(
      expect.objectContaining({ code: 'TIMEOUT_NOT_DUE' }),
    );
    expect(() => applyTimeout(state, 1, 31000)).toThrowError(
      expect.objectContaining({ code: 'NOT_YOUR_TURN' }),
    );
    expect(() => applyTimeout(state, 0, NaN)).toThrowError(
      expect.objectContaining({ code: 'INVALID_TIME' }),
    );
    const result = applyTimeout(state, 0, 31000);
    expect(result.state.hand!.settled).toBe(true);
    expect(result.events).toContainEqual({ type: 'timeoutFold', seat: 0 });
    expect(result.events).toContainEqual({
      type: 'playerTimedOut',
      seat: 0,
      action: 'fold',
      consecutive: 1,
    });
    expect(result.state.seats[0]?.timeoutCount).toBe(1);
    expect(state.seats[0]?.timeoutCount).toBe(0);
    const raw = startBettingRound(table()).state;
    expect(() => applyTimeout(raw, 0, 31000)).toThrowError(
      expect.objectContaining({ code: 'TIMEOUT_NOT_DUE' }),
    );
    const noDeadline = { ...state, hand: { ...state.hand!, deadlineMs: null } };
    expect(() => applyTimeout(noDeadline, 0, 31000)).toThrowError(
      expect.objectContaining({ code: 'TIMEOUT_NOT_DUE' }),
    );
  });
  it('auto-checks when possible and sits out repeated timeouts on the next hand', () => {
    let state = startHand(table([500, 500, 500]), rng).state;
    // Three seats make it possible to skip the timed-out player in the next hand.
    state = applyAction(state, 0, { type: 'call' }).state;
    state = applyAction(state, 1, { type: 'call' }).state;
    const check = applyTimeout(state, 2, state.hand!.deadlineMs!);
    state = check.state;
    expect(check.events.some((event) => event.type === 'timeoutFold')).toBe(
      false,
    );
    expect(state.seats[2]?.timeoutCount).toBe(1);
    while (!state.hand!.settled) {
      const actor = state.round!.actor!;
      const result =
        actor === 2
          ? applyTimeout(state, actor, state.hand!.deadlineMs!)
          : applyAction(state, actor, { type: 'check' });
      state = result.state;
    }
    expect(state.seats[2]?.status).toBe('sitting_out');
    expect(state.seats[2]!.timeoutCount).toBeGreaterThanOrEqual(2);
    const next = startHand(state, rng).state;
    expect(next.hand!.holeCards[2]).toBeNull();
    expect(next.seats[2]?.bet).toBe(0);
  });
  it('resets consecutive timeouts when the player acts manually', () => {
    let state = startHand(table(), rng).state;
    state = applyAction(state, 0, { type: 'call' }).state;
    state = applyTimeout(state, 1, state.hand!.deadlineMs!).state;
    state = applyAction(state, 1, { type: 'check' }).state; // Heads-up BB acts first on the flop too.
    expect(state.seats[1]?.timeoutCount).toBe(0);
    expect(finish(state).state.seats[1]?.status).toBe('waiting');
  });
  it('applies voluntary sit-out after the current hand, and sit-in resets timeout policy', () => {
    const state = startHand(table(), rng).state;
    const pending = setSittingOut(state, 0, true);
    expect(pending.events[0]).toMatchObject({
      type: 'playerSitOutChanged',
      appliesNextHand: true,
    });
    expect(pending.state.seats[0]?.status).toBe('active');
    expect(viewFor(pending.state, 0).you?.pendingSitOut).toBe(true);
    expect(finish(pending.state).state.seats[0]?.status).toBe('sitting_out');
    const settled = finish(state).state;
    settled.seats[0]!.timeoutCount = 2;
    const resumed = setSittingOut(settled, 0, false).state;
    expect(resumed.seats[0]).toMatchObject({
      timeoutCount: 0,
      sitOutNext: false,
      status: 'waiting',
    });
    const seated = setSittingOut(table(), 0, true).state;
    expect(seated.seats[0]?.status).toBe('sitting_out');
    expect(setSittingOut(seated, 0, false).state.seats[0]?.status).toBe(
      'waiting',
    );
    const busted = table();
    busted.seats[0]!.stack = 0;
    busted.seats[0]!.status = 'busted';
    expect(setSittingOut(busted, 0, false).state.seats[0]?.status).toBe(
      'busted',
    );
    expect(() => setSittingOut(table([100], 3), 1, true)).toThrowError(
      expect.objectContaining({ code: 'INVALID_SEAT' }),
    );
  });
});

describe('join, rebuy and departure commands', () => {
  it('emits seating/rebuy/removal events and changes the bankroll only by explicit amounts', () => {
    const initial = table([100], 3);
    const joined = joinTable(initial, 1, { id: 'new', name: ' New ' }, 200);
    expect(joined.events).toEqual([
      { type: 'playerSeated', seat: 1, playerId: 'new', amount: 200 },
    ]);
    const bought = rebuy(joined.state, 1, 100);
    expect(totalChips(bought.state)).toBe(400);
    expect(bought.events).toEqual([
      { type: 'playerRebought', seat: 1, amount: 100 },
    ]);
    expect(joined.state.seats[1]?.stack).toBe(200);
    const removed = leaveTable(bought.state, 1);
    expect(removed.events).toEqual([
      { type: 'playerRemoved', seat: 1, amount: 300 },
    ]);
    expect(totalChips(removed.state)).toBe(100);
    expect(leaveTable(removed.state, 1).events).toEqual([]);
    expect(removePlayer(initial, 0).seats[0]).toBeNull();
  });
  it('enforces between-hand rebuy limits, pending sit-out, and total safe-integer precision', () => {
    const state = table([100, 100]);
    for (const amount of [0, -1, NaN, Infinity, 1.5, 2000])
      expect(() => rebuy(state, 0, amount)).toThrowError(
        expect.objectContaining({ code: 'BAD_BUY_IN' }),
      );
    expect(() => rebuy(table([100], 3), 1, 100)).toThrowError(
      expect.objectContaining({ code: 'INVALID_SEAT' }),
    );
    expect(() => rebuy(startHand(state, rng).state, 0, 100)).toThrowError(
      expect.objectContaining({ code: 'HAND_IN_PROGRESS' }),
    );
    const out = setSittingOut(state, 0, true).state;
    expect(rebuy(out, 0, 100).state.seats[0]?.status).toBe('sitting_out');
    const timed = table();
    timed.seats[0]!.timeoutCount = 2;
    expect(rebuy(timed, 0, 10).state.seats[0]?.status).toBe('sitting_out');
    const oldOut = table();
    oldOut.seats[0]!.status = 'sitting_out';
    expect(rebuy(oldOut, 0, 10).state.seats[0]?.status).toBe('sitting_out');
    const busted = table([100, 100]);
    busted.seats[0]!.stack = 0;
    busted.seats[0]!.status = 'busted';
    expect(rebuy(busted, 0, 100).state.seats[0]).toMatchObject({
      stack: 100,
      status: 'waiting',
    });
    const min = { ...busted, config: { ...busted.config, minBuyIn: 100 } };
    expect(() => rebuy(min, 0, 50)).toThrowError(
      expect.objectContaining({ code: 'BAD_BUY_IN' }),
    );
    const rich = table([100], 3);
    rich.seats[0]!.stack = Number.MAX_SAFE_INTEGER;
    expect(() => joinTable(rich, 1, { id: 'x', name: 'X' }, 100)).toThrowError(
      expect.objectContaining({ code: 'BAD_BUY_IN' }),
    );
    const overflow = table([100, 10]);
    overflow.seats[0]!.stack = Number.MAX_SAFE_INTEGER - 20;
    expect(() => rebuy(overflow, 1, 20)).toThrowError(
      expect.objectContaining({ code: 'BAD_BUY_IN' }),
    );
  });
  it('folds a leaving actor but retains contributions and removes stacks only after award', () => {
    const state = startHand(table([500, 500, 500]), rng).state;
    const first = leaveTable(state, 0);
    expect(first.state.seats[0]).toMatchObject({
      status: 'folded',
      leavePending: true,
    });
    expect(totalChips(first.state)).toBe(1500);
    const last = leaveTable(first.state, 1);
    expect(last.state.hand!.settled).toBe(true);
    expect(last.state.seats[0]).toBeNull();
    expect(last.state.seats[1]).toBeNull();
    const removed = last.events
      .filter((event) => event.type === 'playerRemoved')
      .reduce((sum, event) => sum + event.amount, 0);
    expect(totalChips(last.state) + removed).toBe(1500);
    expect(viewFor(last.state, 'spectator').seats[2]?.cards).toBe('hidden');
  });
  it('queues nonacting departures, preserves the current deadline, and folds at the next legal turn', () => {
    let state = startHand(table([500, 500, 500]), rng, 1000).state;
    state = applyAction(state, 0, { type: 'raise', amount: 100 }, 2000).state;
    const deadline = state.hand!.deadlineMs;
    state = leaveTable(state, 0, 3000).state;
    expect(state.seats[0]).toMatchObject({
      status: 'active',
      leavePending: true,
      committed: 100,
    });
    expect(state.hand!.deadlineMs).toBe(deadline);
    expect(viewFor(state, 0).you?.leavingAfterHand).toBe(true);
    state = applyAction(state, 1, { type: 'call' }).state;
    state = applyAction(state, 2, { type: 'call' }).state;
    state = applyAction(state, 1, { type: 'check' }).state;
    state = applyAction(state, 2, { type: 'check' }).state;
    expect(state.seats[0]?.status).toBe('folded');
    const result = finish(state);
    const removed = result.events.find(
      (event) => event.type === 'playerRemoved',
    )!;
    expect(removed).toMatchObject({ seat: 0, amount: 400 });
    expect(totalChips(result.state)).toBe(1100);
  });
  it('retains an all-in leaver in showdown and withdraws their actual awarded stack', () => {
    let state = startHand(table([50, 200, 200]), rng).state;
    state = applyAction(state, 0, { type: 'allin' }).state;
    state = applyAction(state, 1, { type: 'call' }).state;
    state = leaveTable(state, 0).state;
    expect(state.seats[0]?.status).toBe('allin');
    state = applyAction(state, 2, { type: 'call' }).state;
    const result = finish(state);
    expect(
      result.events
        .find((event) => event.type === 'showdown')!
        .hands.some((hand) => hand.seat === 0),
    ).toBe(true);
    const removed = result.events.find(
      (event) => event.type === 'playerRemoved',
    )!;
    expect(totalChips(result.state) + removed.amount).toBe(450);
    expect(result.state.seats[0]).toBeNull();
  });
  it('lets a waiting newcomer leave immediately without touching the active hand', () => {
    let state = startHand(table([100, 100], 3), rng).state;
    state = joinTable(state, 2, { id: 'late', name: 'Late' }, 200).state;
    expect(state.hand!.holeCards[2]).toBeNull();
    expect(viewFor(state, 2).you?.holeCards).toBeNull();
    const result = leaveTable(state, 2);
    expect(result.events).toEqual([
      { type: 'playerRemoved', seat: 2, amount: 200 },
    ]);
    expect(result.state.round).toEqual(state.round);
    expect(totalChips(result.state)).toBe(200);
    expect(() => leaveTable(startBettingRound(table()).state, 0)).toThrowError(
      expect.objectContaining({ code: 'HAND_IN_PROGRESS' }),
    );
  });
});
