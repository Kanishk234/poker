import { createDeck, shuffleDeck, type Card, type Rng } from './cards.js';
import { evaluateHand } from './evaluator.js';
import {
  applyAction as applyBettingAction,
  advanceBettingRound,
  startBettingRound,
  type Action,
  type BettingEvent,
} from './betting.js';
import { buildPots, splitPot, type Pot, type UncalledReturn } from './pots.js';
import {
  copyTable,
  type PlayerSeat,
  type Street,
  type TableState,
} from './table.js';
import { EngineError } from './errors.js';

export type HandEvent =
  | BettingEvent
  | {
      type: 'handStarted';
      handId: string;
      handNumber: number;
      dealerSeat: number;
    }
  | {
      type: 'holeCardsDealt';
      seat: number;
      playerId: string;
      handId: string;
      cards: [Card, Card];
    }
  | { type: 'boardDealt'; street: Street; cards: Card[] }
  | { type: 'showdown'; hands: { seat: number; cards: [Card, Card] }[] }
  | { type: 'uncalledReturned'; seat: number; amount: number }
  | {
      type: 'potAwarded';
      potIndex: number;
      seats: number[];
      amount: number;
      shares: { seat: number; amount: number }[];
    }
  | { type: 'playerBusted'; seat: number }
  | { type: 'handEnded'; handId: string };
export interface HandResult {
  state: TableState;
  events: HandEvent[];
}

function dealBoard(state: TableState, events: HandEvent[]): void {
  const hand = state.hand!;
  hand.burned.push(hand.deck.shift()!);
  const street =
    hand.board.length === 0
      ? 'flop'
      : hand.board.length === 3
        ? 'turn'
        : 'river';
  const cards = hand.deck.splice(0, street === 'flop' ? 3 : 1);
  hand.board.push(...cards);
  events.push({ type: 'boardDealt', street, cards: [...cards] });
}

function settle(state: TableState, events: HandEvent[]): void {
  const hand = state.hand!;
  const live = state.seats.filter(
    (seat): seat is PlayerSeat =>
      !!seat && (seat.status === 'active' || seat.status === 'allin'),
  );
  let pots: Pot[];
  let returns: UncalledReturn[];
  if (live.length === 1) {
    const paid = state.seats
      .filter((seat): seat is PlayerSeat => !!seat && seat.committed > 0)
      .sort((a, b) => b.committed - a.committed);
    const excess = paid[0]!.committed - (paid[1]?.committed ?? 0);
    returns = excess > 0 ? [{ seat: paid[0]!.seat, amount: excess }] : [];
    pots = [
      {
        amount: paid.reduce((sum, seat) => sum + seat.committed, 0) - excess,
        eligibleSeats: [live[0]!.seat],
      },
    ];
  } else {
    ({ pots, returns } = buildPots(state.seats));
    hand.revealedSeats = live.map((seat) => seat.seat);
    events.push({
      type: 'showdown',
      hands: live.map((seat) => ({
        seat: seat.seat,
        cards: [...hand.holeCards[seat.seat]!] as [Card, Card],
      })),
    });
  }
  for (const returned of returns) {
    state.seats[returned.seat]!.stack += returned.amount;
    events.push({ type: 'uncalledReturned', ...returned });
  }
  const scores = new Map(
    live.map((seat) => [
      seat.seat,
      live.length === 1
        ? 0
        : evaluateHand([...hand.board, ...hand.holeCards[seat.seat]!]).score,
    ]),
  );
  for (let index = 0; index < pots.length; index++) {
    const pot = pots[index]!;
    const best = Math.max(
      ...pot.eligibleSeats.map((seat) => scores.get(seat)!),
    );
    const winners = pot.eligibleSeats.filter(
      (seat) => scores.get(seat) === best,
    );
    const shares = splitPot(
      pot.amount,
      winners,
      state.dealerSeat!,
      state.config.maxSeats,
    );
    for (const share of shares) state.seats[share.seat]!.stack += share.amount;
    events.push({
      type: 'potAwarded',
      potIndex: index,
      seats: [...winners],
      amount: pot.amount,
      shares,
    });
  }
  hand.pots = pots;
  hand.settled = true;
  state.round = null;
  for (const seat of state.seats)
    if (seat) {
      seat.bet = 0;
      seat.committed = 0;
      if (hand.holeCards[seat.seat]) {
        seat.status = seat.stack === 0 ? 'busted' : 'waiting';
        if (seat.status === 'busted')
          events.push({ type: 'playerBusted', seat: seat.seat });
      }
    }
  events.push({ type: 'handEnded', handId: hand.id });
}

/** Orchestrates deterministic card progression/settlement around completed betting rounds. */
function progress(result: HandResult): HandResult {
  let state = result.state;
  const events = result.events;
  while (state.round?.completion) {
    if (state.round.completion === 'matched') {
      const next = advanceBettingRound(state);
      state = next.state;
      dealBoard(state, events);
      events.push(...next.events);
    } else {
      if (state.round.completion !== 'uncontested')
        while (state.hand!.board.length < 5) dealBoard(state, events);
      settle(state, events);
    }
  }
  return { state, events };
}

export function startHand(state: TableState, rng: Rng, now = 0): HandResult {
  assertTime(state, now);
  if (state.round || (state.hand && !state.hand.settled))
    throw new EngineError(
      'HAND_IN_PROGRESS',
      'Settle the existing hand first.',
    );
  const clean = copyTable(state);
  clean.hand = null;
  const started = startBettingRound(clean);
  const next = started.state;
  next.handNumber++;
  next.hand = {
    id: `hand-${next.handNumber}`,
    deck: shuffleDeck(createDeck(), rng),
    burned: [],
    board: [],
    holeCards: next.seats.map(() => null),
    playerIds: next.seats.map(() => null),
    revealedSeats: [],
    pots: [],
    settled: false,
    actionNumber: 0,
    now,
    deadlineMs: null,
  };
  const participants = next.seats
    .filter(
      (seat): seat is PlayerSeat =>
        !!seat && (seat.status === 'active' || seat.status === 'allin'),
    )
    .map((seat) => seat.seat);
  const ordered = [...participants].sort(
    (a, b) =>
      ((a - next.dealerSeat! - 1 + next.config.maxSeats) %
        next.config.maxSeats) -
      ((b - next.dealerSeat! - 1 + next.config.maxSeats) %
        next.config.maxSeats),
  );
  const dealt = new Map<number, Card[]>(ordered.map((seat) => [seat, []]));
  for (let round = 0; round < 2; round++)
    for (const seat of ordered) dealt.get(seat)!.push(next.hand.deck.shift()!);
  const events: HandEvent[] = [
    {
      type: 'handStarted',
      handId: next.hand.id,
      handNumber: next.handNumber,
      dealerSeat: next.dealerSeat!,
    },
    ...started.events.filter((event) => event.type !== 'streetEnded'),
  ];
  for (const seat of ordered) {
    const cards = dealt.get(seat)! as [Card, Card];
    next.hand.holeCards[seat] = cards;
    next.hand.playerIds[seat] = next.seats[seat]!.id;
    events.push({
      type: 'holeCardsDealt',
      seat,
      playerId: next.seats[seat]!.id,
      handId: next.hand.id,
      cards: [...cards],
    });
  }
  events.push(
    ...started.events.filter((event) => event.type === 'streetEnded'),
  );
  return schedule(progress({ state: next, events }), now);
}

export function applyAction(
  state: TableState,
  seat: number,
  action: Action,
  now = state.hand?.now ?? 0,
): HandResult {
  assertTime(state, now);
  const result = applyBettingAction(state, seat, action);
  if (!state.hand) return result;
  result.state.hand!.actionNumber++;
  return schedule(
    progress({ state: result.state, events: [...result.events] }),
    now,
  );
}

function assertTime(state: TableState, now: number): void {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isSafeInteger(now + state.config.actionSeconds * 1000)
  )
    throw new EngineError(
      'INVALID_TIME',
      'Inject a safe nonnegative timestamp.',
    );
}
function schedule(result: HandResult, now: number): HandResult {
  result.state.hand!.now = now;
  result.state.hand!.deadlineMs =
    result.state.round?.actor !== null && result.state.round
      ? now + result.state.config.actionSeconds * 1000
      : null;
  return result;
}
