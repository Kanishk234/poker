import { EngineError } from './errors.js';
import type { Card } from './cards.js';
import type { Pot } from './pots.js';

export interface TableConfig {
  maxSeats: number;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  actionSeconds: number;
  assistAllowed: boolean;
}
export type PlayerStatus =
  'waiting' | 'active' | 'folded' | 'allin' | 'sitting_out' | 'busted';
export interface PlayerSeat {
  seat: number;
  id: string;
  name: string;
  stack: number;
  bet: number;
  /** Hand-total contribution, INCLUDING the current street's bet. */
  committed: number;
  status: PlayerStatus;
}
export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type RoundCompletion = 'matched' | 'uncontested' | 'runout' | 'showdown';
export interface BettingRound {
  street: Street;
  actor: number | null;
  currentBet: number;
  lastFullRaiseSize: number;
  acted: boolean[];
  actedAtBet: (number | null)[];
  completion: RoundCompletion | null;
}
/** Internal engine state. Never serialize this to a client; viewFor comes in a later group. */
export interface TableState {
  config: TableConfig;
  seats: (PlayerSeat | null)[];
  dealerSeat: number | null;
  round: BettingRound | null;
  handNumber: number;
  hand: HandState | null;
}
export interface HandState {
  id: string;
  deck: Card[];
  burned: Card[];
  board: Card[];
  holeCards: ([Card, Card] | null)[];
  playerIds: (string | null)[];
  revealedSeats: number[];
  pots: Pot[];
  settled: boolean;
  actionNumber: number;
  now: number;
  deadlineMs: number | null;
}

const positiveInteger = (value: number) =>
  Number.isSafeInteger(value) && value > 0;

export function createTable(config: TableConfig): TableState {
  if (
    !Number.isInteger(config.maxSeats) ||
    config.maxSeats < 2 ||
    config.maxSeats > 9 ||
    !positiveInteger(config.smallBlind) ||
    !positiveInteger(config.bigBlind) ||
    config.smallBlind >= config.bigBlind ||
    !positiveInteger(config.minBuyIn) ||
    !positiveInteger(config.maxBuyIn) ||
    config.minBuyIn > config.maxBuyIn ||
    config.maxBuyIn < config.bigBlind ||
    config.maxBuyIn > Math.floor(Number.MAX_SAFE_INTEGER / config.maxSeats) ||
    !positiveInteger(config.actionSeconds) ||
    typeof config.assistAllowed !== 'boolean'
  ) {
    throw new EngineError('INVALID_CONFIG', 'Invalid table limits or blinds.');
  }
  return {
    config: { ...config },
    seats: Array.from({ length: config.maxSeats }, () => null),
    dealerSeat: null,
    round: null,
    handNumber: 0,
    hand: null,
  };
}

export function assertSeat(state: TableState, seat: number): void {
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.config.maxSeats)
    throw new EngineError('INVALID_SEAT', 'Seat is outside the table.');
}

export function copyTable(state: TableState): TableState {
  return {
    config: { ...state.config },
    seats: state.seats.map((seat) => (seat ? { ...seat } : null)),
    dealerSeat: state.dealerSeat,
    handNumber: state.handNumber,
    hand: state.hand
      ? {
          ...state.hand,
          deck: [...state.hand.deck],
          burned: [...state.hand.burned],
          board: [...state.hand.board],
          holeCards: state.hand.holeCards.map((cards) =>
            cards ? ([...cards] as [Card, Card]) : null,
          ),
          playerIds: [...state.hand.playerIds],
          revealedSeats: [...state.hand.revealedSeats],
          pots: state.hand.pots.map((pot) => ({
            ...pot,
            eligibleSeats: [...pot.eligibleSeats],
          })),
        }
      : null,
    round: state.round
      ? {
          ...state.round,
          acted: [...state.round.acted],
          actedAtBet: [...state.round.actedAtBet],
        }
      : null,
  };
}

export function seatPlayer(
  state: TableState,
  seat: number,
  player: { id: string; name: string },
  buyIn: number,
): TableState {
  assertSeat(state, seat);
  if (state.seats[seat])
    throw new EngineError('SEAT_TAKEN', 'Seat is occupied.');
  if (
    !player.id.trim() ||
    player.id.length > 128 ||
    !player.name.trim() ||
    player.name.trim().length > 24
  )
    throw new EngineError(
      'INVALID_PLAYER',
      'Player identity or name is invalid.',
    );
  if (state.seats.some((occupant) => occupant?.id === player.id))
    throw new EngineError('DUPLICATE_PLAYER', 'Player is already seated.');
  if (
    !Number.isSafeInteger(buyIn) ||
    buyIn < state.config.minBuyIn ||
    buyIn > state.config.maxBuyIn
  )
    throw new EngineError('BAD_BUY_IN', 'Buy-in is outside table limits.');
  const next = copyTable(state);
  next.seats[seat] = {
    seat,
    id: player.id,
    name: player.name.trim(),
    stack: buyIn,
    bet: 0,
    committed: 0,
    status: 'waiting',
  };
  return next;
}

export function removePlayer(state: TableState, seat: number): TableState {
  assertSeat(state, seat);
  if (state.round)
    throw new EngineError(
      'HAND_IN_PROGRESS',
      'Settle the hand before removing a player.',
    );
  const next = copyTable(state);
  next.seats[seat] = null;
  return next;
}

/** Clockwise selection including wraparound; the starting seat itself is considered last. */
export function nextSeat(
  state: TableState,
  after: number,
  candidates: readonly number[],
): number {
  for (let offset = 1; offset <= state.config.maxSeats; offset++) {
    const seat = (after + offset) % state.config.maxSeats;
    if (candidates.includes(seat)) return seat;
  }
  throw new EngineError('NOT_ENOUGH_PLAYERS', 'No eligible player.');
}

export function totalChips(state: TableState): number {
  return state.seats.reduce(
    (total, seat) => total + (seat ? seat.stack + seat.committed : 0),
    0,
  );
}
