import { EngineError } from './errors.js';
import {
  assertSeat,
  copyTable,
  nextSeat,
  type PlayerSeat,
  type RoundCompletion,
  type Street,
  type TableState,
} from './table.js';

export type Action = {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
  amount?: number;
};
export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  callAmount: number;
  minRaiseTo: number | null;
  maxRaiseTo: number;
  canAllIn: boolean;
}
export type BettingEvent =
  | { type: 'buttonMoved'; seat: number }
  | {
      type: 'blindPosted';
      seat: number;
      blind: 'small' | 'big';
      amount: number;
    }
  | { type: 'roundStarted'; street: Street }
  | {
      type: 'playerActed';
      seat: number;
      action: Action['type'];
      amount: number;
      raiseTo: number;
    }
  | { type: 'streetEnded'; street: Street; reason: RoundCompletion };
export interface BettingResult {
  state: TableState;
  events: BettingEvent[];
}

function liveSeats(state: TableState): PlayerSeat[] {
  return state.seats.filter(
    (seat): seat is PlayerSeat =>
      !!seat && (seat.status === 'active' || seat.status === 'allin'),
  );
}
function activeSeats(state: TableState): PlayerSeat[] {
  return liveSeats(state).filter((seat) => seat.status === 'active');
}
function contribute(player: PlayerSeat, amount: number): void {
  player.stack -= amount;
  player.bet += amount;
  player.committed += amount;
  if (player.stack === 0) player.status = 'allin';
}

function chooseActor(
  state: TableState,
  after: number,
  events: BettingEvent[],
): void {
  const round = state.round!;
  const live = liveSeats(state);
  const active = activeSeats(state);
  // With no further betting opponent, only an actual outstanding wager needs a call.
  if (active.length === 1)
    round.currentBet = Math.max(...live.map((seat) => seat.bet));
  let reason: RoundCompletion | null = null;
  if (live.length === 1) reason = 'uncontested';
  else if (
    active.length === 0 ||
    (active.length === 1 && active[0]!.bet >= round.currentBet)
  )
    reason = 'runout';
  else if (
    active.every(
      (seat) => round.acted[seat.seat] && seat.bet >= round.currentBet,
    )
  )
    reason = round.street === 'river' ? 'showdown' : 'matched';
  if (reason) {
    round.actor = null;
    round.completion = reason;
    events.push({ type: 'streetEnded', street: round.street, reason });
    return;
  }
  const pending = active
    .filter((seat) => !round.acted[seat.seat] || seat.bet < round.currentBet)
    .map((seat) => seat.seat);
  round.actor = nextSeat(state, after, pending);
}

/** Opens the first betting round. It does not shuffle, deal, expose cards, or award chips. */
export function startBettingRound(state: TableState): BettingResult {
  if (state.round)
    throw new EngineError('HAND_IN_PROGRESS', 'A hand is already in progress.');
  const eligible = state.seats
    .filter(
      (seat): seat is PlayerSeat =>
        !!seat &&
        seat.stack > 0 &&
        seat.status !== 'sitting_out' &&
        seat.status !== 'busted',
    )
    .map((seat) => seat.seat);
  if (eligible.length < 2)
    throw new EngineError(
      'NOT_ENOUGH_PLAYERS',
      'At least two eligible players are required.',
    );
  const next = copyTable(state);
  const dealer = nextSeat(
    next,
    next.dealerSeat ?? next.config.maxSeats - 1,
    eligible,
  );
  next.dealerSeat = dealer;
  for (const index of eligible) next.seats[index]!.status = 'active';
  const small =
    eligible.length === 2 ? dealer : nextSeat(next, dealer, eligible);
  const big = nextSeat(next, small, eligible);
  const events: BettingEvent[] = [{ type: 'buttonMoved', seat: dealer }];
  for (const [index, blind, requested] of [
    [small, 'small', next.config.smallBlind],
    [big, 'big', next.config.bigBlind],
  ] as const) {
    const player = next.seats[index]!;
    const amount = Math.min(player.stack, requested);
    contribute(player, amount);
    events.push({ type: 'blindPosted', seat: index, blind, amount });
  }
  next.round = {
    street: 'preflop',
    actor: null,
    currentBet: next.config.bigBlind,
    lastFullRaiseSize: next.config.bigBlind,
    acted: next.seats.map(() => false),
    actedAtBet: next.seats.map(() => null),
    completion: null,
  };
  events.push({ type: 'roundStarted', street: 'preflop' });
  chooseActor(next, big, events);
  return { state: next, events };
}

/** Resets street-local bets after a matched round; committed chips remain hand totals. */
export function advanceBettingRound(state: TableState): BettingResult {
  const streets: Street[] = ['preflop', 'flop', 'turn', 'river'];
  if (!state.round || state.round.completion !== 'matched')
    throw new EngineError(
      'ROUND_NOT_COMPLETE',
      'Only a matched betting round can advance.',
    );
  const next = copyTable(state);
  const street = streets[streets.indexOf(state.round.street) + 1]!;
  for (const seat of next.seats) if (seat) seat.bet = 0;
  next.round = {
    street,
    actor: null,
    currentBet: 0,
    lastFullRaiseSize: next.config.bigBlind,
    acted: next.seats.map(() => false),
    actedAtBet: next.seats.map(() => null),
    completion: null,
  };
  const events: BettingEvent[] = [{ type: 'roundStarted', street }];
  chooseActor(next, next.dealerSeat!, events);
  return { state: next, events };
}

export function getLegalActions(
  state: TableState,
  seat: number,
): LegalActions | null {
  assertSeat(state, seat);
  const round = state.round;
  const player = state.seats[seat];
  if (
    !round ||
    round.completion ||
    round.actor !== seat ||
    !player ||
    player.status !== 'active'
  )
    return null;
  const maximum = player.bet + player.stack;
  const reopened =
    !round.acted[seat] ||
    round.currentBet - round.actedAtBet[seat]! >= round.lastFullRaiseSize;
  const canRaise = reopened && activeSeats(state).length > 1;
  const minimum = round.currentBet + round.lastFullRaiseSize;
  return {
    canFold: true,
    canCheck: player.bet === round.currentBet,
    callAmount: Math.min(round.currentBet - player.bet, player.stack),
    minRaiseTo: canRaise && maximum >= minimum ? minimum : null,
    maxRaiseTo: maximum,
    canAllIn: maximum <= round.currentBet || canRaise,
  };
}

export function applyAction(
  state: TableState,
  seat: number,
  action: Action,
): BettingResult {
  const legal = getLegalActions(state, seat);
  if (!legal)
    throw new EngineError('NOT_YOUR_TURN', 'This seat cannot act now.');
  const player = state.seats[seat]!;
  const round = state.round!;
  let amount = 0;
  let normalized = action.type;
  if (
    action.type !== 'bet' &&
    action.type !== 'raise' &&
    action.amount !== undefined
  )
    throw new EngineError(
      'ILLEGAL_ACTION',
      'Only bet or raise accepts an amount.',
    );
  switch (action.type) {
    case 'fold':
      break;
    case 'check':
      if (!legal.canCheck)
        throw new EngineError('ILLEGAL_ACTION', 'Cannot check facing a wager.');
      break;
    case 'call':
      if (legal.canCheck)
        throw new EngineError(
          'ILLEGAL_ACTION',
          'Check instead of calling zero.',
        );
      amount = legal.callAmount;
      break;
    case 'allin':
      if (!legal.canAllIn)
        throw new EngineError('ILLEGAL_ACTION', 'Betting has not reopened.');
      amount = player.stack;
      break;
    case 'bet':
    case 'raise': {
      const target = action.amount;
      if (
        !Number.isSafeInteger(target) ||
        target! <= round.currentBet ||
        target! > legal.maxRaiseTo ||
        (legal.minRaiseTo === null &&
          !(legal.canAllIn && target === legal.maxRaiseTo)) ||
        (legal.minRaiseTo !== null &&
          target! < legal.minRaiseTo &&
          target !== legal.maxRaiseTo)
      )
        throw new EngineError(
          'ILLEGAL_ACTION',
          'Raise-to amount is outside legal bounds.',
        );
      amount = target! - player.bet;
      normalized = round.currentBet === 0 ? 'bet' : 'raise';
      break;
    }
    default:
      throw new EngineError('ILLEGAL_ACTION', 'Unknown action.');
  }
  const next = copyTable(state);
  const actor = next.seats[seat]!;
  const nextRound = next.round!;
  if (action.type === 'fold') actor.status = 'folded';
  else contribute(actor, amount);
  if (actor.bet > nextRound.currentBet) {
    const increase = actor.bet - nextRound.currentBet;
    if (increase >= nextRound.lastFullRaiseSize) {
      nextRound.lastFullRaiseSize = increase;
      nextRound.acted.fill(false);
    }
    nextRound.currentBet = actor.bet;
  }
  nextRound.acted[seat] = true;
  nextRound.actedAtBet[seat] = nextRound.currentBet;
  const events: BettingEvent[] = [
    {
      type: 'playerActed',
      seat,
      action: normalized,
      amount,
      raiseTo: actor.bet,
    },
  ];
  chooseActor(next, seat, events);
  return { state: next, events };
}
