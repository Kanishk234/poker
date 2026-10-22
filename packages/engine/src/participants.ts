import {
  assertSeat,
  copyTable,
  seatPlayer,
  totalChips,
  type TableState,
} from './table.js';
import { leaveHand, type HandResult } from './hand.js';
import { EngineError } from './errors.js';

/** Eventful seating command for transport adapters; seatPlayer remains a state-only helper. */
export function joinTable(
  state: TableState,
  seat: number,
  player: { id: string; name: string },
  buyIn: number,
): HandResult {
  return {
    state: seatPlayer(state, seat, player, buyIn),
    events: [
      { type: 'playerSeated', seat, playerId: player.id, amount: buyIn },
    ],
  };
}
export const leaveTable = leaveHand;
/** Compatibility with the original state-only API; transports should use leaveTable for events. */
export function removePlayer(state: TableState, seat: number): TableState {
  return leaveTable(state, seat).state;
}

export function rebuy(
  state: TableState,
  seat: number,
  amount: number,
): HandResult {
  assertSeat(state, seat);
  if (state.round)
    throw new EngineError('HAND_IN_PROGRESS', 'Rebuy only between hands.');
  const player = state.seats[seat];
  if (!player)
    throw new EngineError('INVALID_SEAT', 'No player occupies this seat.');
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    player.stack + amount < state.config.minBuyIn ||
    player.stack + amount > state.config.maxBuyIn ||
    !Number.isSafeInteger(totalChips(state) + amount)
  )
    throw new EngineError('BAD_BUY_IN', 'Rebuy is outside table limits.');
  const next = copyTable(state);
  const changed = next.seats[seat]!;
  changed.stack += amount;
  changed.status =
    changed.sitOutNext ||
    changed.timeoutCount >= 2 ||
    player.status === 'sitting_out'
      ? 'sitting_out'
      : 'waiting';
  return { state: next, events: [{ type: 'playerRebought', seat, amount }] };
}

export function setSittingOut(
  state: TableState,
  seat: number,
  sittingOut: boolean,
): HandResult {
  assertSeat(state, seat);
  if (!state.seats[seat])
    throw new EngineError('INVALID_SEAT', 'No player occupies this seat.');
  const next = copyTable(state);
  const player = next.seats[seat]!;
  player.sitOutNext = sittingOut;
  if (!sittingOut) player.timeoutCount = 0;
  const inHand =
    !!state.round && ['active', 'allin', 'folded'].includes(player.status);
  if (!inHand)
    player.status = sittingOut
      ? 'sitting_out'
      : player.stack > 0
        ? 'waiting'
        : 'busted';
  return {
    state: next,
    events: [
      {
        type: 'playerSitOutChanged',
        seat,
        sittingOut,
        appliesNextHand: inHand,
      },
    ],
  };
}
