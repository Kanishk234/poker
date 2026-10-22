import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  applyAction,
  buildPots,
  createDeck,
  createTable,
  eventsFor,
  getLegalActions,
  seatPlayer,
  removePlayer,
  splitPot,
  startHand,
  totalChips,
  viewFor,
  type Action,
  type Card,
  type HandEvent,
  type PlayerSeat,
  type Rng,
  type TableState,
} from './index.js';

function table(stacks: number[], smallBlind = 10, bigBlind = 20): TableState {
  let state = createTable({
    maxSeats: stacks.length,
    smallBlind,
    bigBlind,
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
function seeded(seed: number): Rng {
  let value = seed >>> 0;
  return (bound) => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return Math.floor((value / 2 ** 32) * bound);
  };
}
function rigged(prefix: string): Rng {
  const first = prefix.split(' ') as Card[];
  const target = [
    ...first,
    ...createDeck().filter((card) => !first.includes(card)),
  ];
  const working = createDeck();
  return (bound) => {
    const i = bound - 1;
    const j = working.indexOf(target[i]!);
    [working[i], working[j]] = [working[j]!, working[i]!];
    return j;
  };
}
function act(state: TableState, type: Action['type'], amount?: number) {
  return applyAction(
    state,
    state.round!.actor!,
    amount === undefined ? { type } : { type, amount },
  );
}
function finish(state: TableState): { state: TableState; events: HandEvent[] } {
  const events: HandEvent[] = [];
  while (!state.hand!.settled) {
    const legal = getLegalActions(state, state.round!.actor!)!;
    const result = act(state, legal.canCheck ? 'check' : 'call');
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

describe('dealing and complete hands', () => {
  it('deals clockwise in two passes and burns before every board street', () => {
    const original = table([500, 500]);
    let state = startHand(
      original,
      rigged('Kc As Kd Ah 2c 3h 4d 9s 2d Js 2h Qc'),
      1000,
    ).state;
    expect(original.hand).toBeNull();
    expect(original.handNumber).toBe(0);
    expect(state.hand!.holeCards).toEqual([
      ['As', 'Ah'],
      ['Kc', 'Kd'],
    ]);
    expect(state.hand!.deadlineMs).toBe(31000);
    expect(viewFor(state, 0).turn?.turnId).toBe('hand-1:0');
    state = act(state, 'call').state;
    state = act(state, 'check').state;
    expect(state.round?.street).toBe('flop');
    expect(state.hand!.board).toEqual(['3h', '4d', '9s']);
    expect(state.hand!.burned).toEqual(['2c']);
    state = act(state, 'check').state;
    state = act(state, 'check').state;
    expect(state.hand!.board).toEqual(['3h', '4d', '9s', 'Js']);
    const result = finish(state);
    state = result.state;
    expect(state.hand!.board).toEqual(['3h', '4d', '9s', 'Js', 'Qc']);
    expect(state.hand!.burned).toEqual(['2c', '2d', '2h']);
    expect(state.seats.map((seat) => seat!.stack)).toEqual([520, 480]);
    expect(totalChips(state)).toBe(1000);
    expect(state.round).toBeNull();
    expect(viewFor(state, 'spectator').phase).toBe('handOver');
    expect(result.events.map((event) => event.type)).toContain('handEnded');
    expect(state.hand!.revealedSeats).toEqual([0, 1]);
    const all = [
      ...state.hand!.board,
      ...state.hand!.burned,
      ...state.hand!.deck,
      ...state.hand!.holeCards.flatMap((cards) => cards ?? []),
    ];
    expect(all).toHaveLength(52);
    expect(new Set(all).size).toBe(52);
    const next = startHand(state, seeded(4)).state;
    expect(next.handNumber).toBe(2);
    expect(next.dealerSeat).toBe(1);
    expect(next.hand!.board).toEqual([]);
    expect(state.hand!.board).toHaveLength(5);
  });
  it('settles a fold win immediately, returning uncalled chips without revealing cards', () => {
    const result = act(startHand(table([100, 100]), seeded(1)).state, 'fold');
    expect(result.state.seats.map((seat) => seat!.stack)).toEqual([90, 110]);
    expect(result.events).toContainEqual({
      type: 'uncalledReturned',
      seat: 1,
      amount: 10,
    });
    expect(
      result.events.filter((event) => event.type === 'potAwarded')[0],
    ).toMatchObject({ amount: 20, seats: [1] });
    expect(result.state.hand!.board).toEqual([]);
    expect(result.state.hand!.revealedSeats).toEqual([]);
    expect(
      viewFor(result.state, 'spectator').seats.map((seat) => seat!.cards),
    ).toEqual(['hidden', 'hidden']);
    expect(result.events.some((event) => event.type === 'showdown')).toBe(
      false,
    );
  });
  it('builds the 100/300/500 main pot, side pot and uncalled return and awards independently', () => {
    let state = startHand(
      table([500, 100, 300]),
      rigged('As Kc Qc Ah Kd Qd 2c 3h 4d 9s 2d Js 2h 7c'),
    ).state;
    state = act(state, 'allin').state;
    state = act(state, 'call').state;
    const result = act(state, 'call');
    state = result.state;
    expect(state.seats.map((seat) => seat!.stack)).toEqual([200, 300, 400]);
    expect(state.hand!.pots).toEqual([
      { amount: 300, eligibleSeats: [0, 1, 2] },
      { amount: 400, eligibleSeats: [0, 2] },
    ]);
    expect(result.events).toContainEqual({
      type: 'uncalledReturned',
      seat: 0,
      amount: 200,
    });
    expect(
      result.events
        .filter((event) => event.type === 'potAwarded')
        .map((event) => event.shares),
    ).toEqual([[{ seat: 1, amount: 300 }], [{ seat: 2, amount: 400 }]]);
    expect(totalChips(state)).toBe(900);
    expect(viewFor(state, 0).pots).toEqual([]);
  });
  it('splits a board-playing pot with its odd chip left of the button and retains folded money', () => {
    let state = startHand(
      table([100, 100, 100], 5, 10),
      rigged('2c 3c 4c 2d 3d 4d 5c As Kd Qh 5d Jc 5h Ts'),
    ).state;
    state = act(state, 'call').state;
    state = act(state, 'fold').state;
    state = act(state, 'check').state;
    expect(viewFor(state, 0).pots).toEqual([
      { amount: 25, eligibleSeats: [0, 2] },
    ]);
    const result = finish(state);
    expect(result.state.seats.map((seat) => seat!.stack)).toEqual([
      102, 95, 103,
    ]);
    expect(
      result.events.filter((event) => event.type === 'potAwarded')[0],
    ).toMatchObject({
      amount: 25,
      shares: [
        { seat: 2, amount: 13 },
        { seat: 0, amount: 12 },
      ],
    });
    expect(viewFor(result.state, 'spectator').seats[1]!.cards).toBe('hidden');
  });
  it('runs out blind all-ins immediately and marks a loser busted', () => {
    const result = startHand(
      table([5, 5]),
      rigged('Kc As Kd Ah 2c 3h 4d 9s 2d Js 2h Qc'),
    );
    expect(result.state.hand!.settled).toBe(true);
    expect(result.state.hand!.board).toHaveLength(5);
    expect(result.state.seats[1]).toMatchObject({ stack: 0, status: 'busted' });
    expect(result.events).toContainEqual({ type: 'playerBusted', seat: 1 });
    expect(totalChips(result.state)).toBe(10);
    expect(() => startHand(result.state, seeded(1))).toThrowError(
      expect.objectContaining({ code: 'NOT_ENOUGH_PLAYERS' }),
    );
  });
  it('rejects starting over and invalid clocks, and copies returned views and filtered events', () => {
    const result = startHand(table([100, 100]), seeded(7));
    expect(() => startHand(result.state, seeded(8))).toThrowError(
      expect.objectContaining({ code: 'HAND_IN_PROGRESS' }),
    );
    for (const now of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER])
      expect(() => startHand(table([100, 100]), seeded(1), now)).toThrowError(
        expect.objectContaining({ code: 'INVALID_TIME' }),
      );
    const view = viewFor(result.state, 0);
    view.config.bigBlind = 999;
    view.you!.holeCards!.pop();
    expect(result.state.config.bigBlind).toBe(20);
    expect(result.state.hand!.holeCards[0]).toHaveLength(2);
    const privateEvents = eventsFor(result.events, 0, result.state);
    expect(
      privateEvents.filter((event) => event.type === 'holeCardsDealt'),
    ).toHaveLength(1);
    expect(
      eventsFor(result.events, 'spectator', result.state).some(
        (event) => event.type === 'holeCardsDealt',
      ),
    ).toBe(false);
    const dealt = privateEvents.find(
      (event) => event.type === 'holeCardsDealt',
    )!;
    dealt.cards[0] = dealt.cards[0] === '2c' ? 'As' : '2c';
    expect(
      result.events.find(
        (event) => event.type === 'holeCardsDealt' && event.seat === 0,
      ),
    ).not.toEqual(dealt);
    const empty = createTable(table([100, 100]).config);
    expect(viewFor(empty, 'spectator')).toMatchObject({
      phase: 'waiting',
      handId: null,
      you: null,
      turn: null,
    });
    expect(viewFor(empty, 0).you).toBeNull();
    expect(() => viewFor(empty, 9)).toThrowError(
      expect.objectContaining({ code: 'INVALID_SEAT' }),
    );
    const completed = finish(result.state);
    const copies = eventsFor(completed.events, 'spectator', completed.state);
    const showdown = copies.find((event) => event.type === 'showdown')!;
    showdown.hands[0]!.cards[0] = '2c';
    const award = copies.find((event) => event.type === 'potAwarded')!;
    award.shares[0]!.amount = 999;
    expect(completed.events).not.toEqual(copies);
    const replacement = seatPlayer(
      removePlayer(completed.state, 0),
      0,
      { id: 'new-player', name: 'New player' },
      100,
    );
    expect(viewFor(replacement, 0).you?.holeCards).toBeNull();
    expect(viewFor(replacement, 0).seats[0]?.cards).toBeNull();
    expect(
      eventsFor(result.events, 0, replacement).some(
        (event) => event.type === 'holeCardsDealt',
      ),
    ).toBe(false);
    const next = startHand(replacement, seeded(2)).state;
    expect(
      eventsFor(result.events, 0, next).some(
        (event) => event.type === 'holeCardsDealt',
      ),
    ).toBe(false);
  });
});

describe('pot arithmetic', () => {
  const seat = (
    index: number,
    committed: number,
    folded = false,
  ): PlayerSeat => ({
    seat: index,
    id: `p${index}`,
    name: 'Player',
    stack: 0,
    bet: 0,
    committed,
    status: folded ? 'folded' : 'allin',
    timeoutCount: 0,
    sitOutNext: false,
    leavePending: false,
  });
  it('uses contributor count for uncalled returns rather than the number of eligible winners', () => {
    expect(buildPots([seat(0, 100), seat(1, 100, true)])).toEqual({
      pots: [{ amount: 200, eligibleSeats: [0] }],
      returns: [],
    });
    expect(buildPots([null, seat(1, 100), seat(2, 300), seat(3, 500)])).toEqual(
      {
        pots: [
          { amount: 300, eligibleSeats: [1, 2, 3] },
          { amount: 400, eligibleSeats: [2, 3] },
        ],
        returns: [{ seat: 3, amount: 200 }],
      },
    );
    expect(buildPots([seat(0, 50, true), seat(1, 100), seat(2, 100)])).toEqual({
      pots: [{ amount: 250, eligibleSeats: [1, 2] }],
      returns: [],
    });
    expect(buildPots([])).toEqual({ pots: [], returns: [] });
    expect(buildPots([seat(0, 0)])).toEqual({ pots: [], returns: [] });
  });
  it('checks invalid contributions, impossible empty eligibility and invalid splits', () => {
    for (const amount of [-1, NaN, Infinity, 1.5])
      expect(() => buildPots([seat(0, amount)])).toThrowError(
        expect.objectContaining({ code: 'INVALID_POT' }),
      );
    expect(() =>
      buildPots([seat(0, 100, true), seat(1, 100, true)]),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_POT' }));
    const invalid: [number, number[], number, number][] = [
      [Number.MAX_SAFE_INTEGER + 1, [0], 0, 2],
      [-1, [0], 0, 2],
      [NaN, [0], 0, 2],
      [10, [], 0, 2],
      [10, [0, 0], 0, 2],
      [10, [2], 0, 2],
      [10, [0.5], 0, 2],
      [10, [0], -1, 2],
      [10, [0], 2, 2],
      [10, [0], 0.5, 2],
      [10, [0], 0, 1],
      [10, [0], 0, 10],
      [10, [0], 0, 2.5],
    ];
    for (const args of invalid)
      expect(() => splitPot(...args)).toThrowError(
        expect.objectContaining({ code: 'INVALID_POT' }),
      );
    expect(splitPot(5, [0, 2], 1, 3)).toEqual([
      { seat: 2, amount: 3 },
      { seat: 0, amount: 2 },
    ]);
  });
});

describe('10,000 full-hand simulations', () => {
  it('conserves chips through payout, terminates, repeats, and never leaks private cards', () => {
    const allCards = new Set<string>(createDeck());
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 300 }), {
          minLength: 2,
          maxLength: 9,
        }),
        fc.integer(),
        (stacks, seed) => {
          function simulate(checkViews: boolean) {
            const rng = seeded(seed);
            let result = startHand(table(stacks), rng);
            let state = result.state;
            const trail: HandEvent[][] = [result.events];
            const total = stacks.reduce((sum, value) => sum + value, 0);
            for (let step = 0; step < 400; step++) {
              if (totalChips(state) !== total)
                throw new Error('Chip conservation failed');
              if (checkViews)
                for (const viewer of [
                  'spectator' as const,
                  ...stacks.map((_, index) => index),
                ]) {
                  const allowed = new Set<Card>([
                    ...state.hand!.board,
                    ...state.hand!.holeCards.flatMap((cards, index) =>
                      index === viewer ||
                      state.hand!.revealedSeats.includes(index)
                        ? (cards ?? [])
                        : [],
                    ),
                  ]);
                  JSON.stringify(
                    {
                      view: viewFor(state, viewer),
                      events: eventsFor(result.events, viewer, state),
                    },
                    (_key, value: unknown) => {
                      if (
                        typeof value === 'string' &&
                        allCards.has(value) &&
                        !allowed.has(value as Card)
                      )
                        throw new Error('Private card leaked');
                      return value;
                    },
                  );
                }
              for (const seat of state.seats)
                if (
                  seat &&
                  (seat.stack < 0 ||
                    seat.bet < 0 ||
                    seat.committed < seat.bet ||
                    !Number.isSafeInteger(seat.stack + seat.committed))
                )
                  throw new Error('Invalid chip ledger');
              if (state.hand!.settled) return { state, trail };
              const actor = state.round!.actor!;
              const legal = getLegalActions(state, actor)!;
              const choices: Action[] = [
                { type: 'fold' },
                legal.canCheck ? { type: 'check' } : { type: 'call' },
              ];
              if (legal.canAllIn) choices.push({ type: 'allin' });
              if (legal.minRaiseTo !== null)
                choices.push({ type: 'raise', amount: legal.minRaiseTo });
              const snapshot = JSON.stringify(state);
              result = applyAction(state, actor, choices[rng(choices.length)]!);
              if (JSON.stringify(state) !== snapshot)
                throw new Error('Input mutated');
              state = result.state;
              trail.push(result.events);
            }
            throw new Error('Hand failed to terminate');
          }
          return (
            JSON.stringify(simulate(true)) === JSON.stringify(simulate(false))
          );
        },
      ),
      { numRuns: 10_000, seed: 20261024 },
    );
  }, 120000);
});
