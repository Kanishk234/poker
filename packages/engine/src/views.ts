import type { Card } from './cards.js';
import { getLegalActions } from './betting.js';
import { assertSeat, type TableState } from './table.js';
import { buildPots } from './pots.js';
import type { HandEvent } from './hand.js';

export function viewFor(state: TableState, viewer: number | 'spectator') {
  if (viewer !== 'spectator') assertSeat(state, viewer);
  const hand = state.hand;
  const own = viewer === 'spectator' ? null : state.seats[viewer];
  const prior = state.seats.map((seat) =>
    seat ? { ...seat, committed: seat.committed - seat.bet } : null,
  );
  const breakdown =
    hand && !hand.settled ? buildPots(prior) : { pots: [], returns: [] };
  return {
    config: { ...state.config },
    phase: hand?.settled ? 'handOver' : (state.round?.street ?? 'waiting'),
    handId: hand?.id ?? null,
    handNumber: state.handNumber,
    dealerSeat: state.dealerSeat,
    board: [...(hand?.board ?? [])],
    pots: [
      ...breakdown.pots.map((pot) => ({
        ...pot,
        eligibleSeats: [...pot.eligibleSeats],
      })),
      ...breakdown.returns.map((returned) => ({
        amount: returned.amount,
        eligibleSeats: [returned.seat],
      })),
    ],
    seats: state.seats.map((seat) => {
      if (!seat) return null;
      const cards =
        hand?.playerIds[seat.seat] === seat.id
          ? hand.holeCards[seat.seat]
          : null;
      const visible =
        viewer === seat.seat || hand?.revealedSeats.includes(seat.seat);
      return {
        seat: seat.seat,
        playerId: seat.id,
        name: seat.name,
        stack: seat.stack,
        bet: seat.bet,
        status: seat.status,
        cards: cards
          ? visible
            ? ([...cards] as [Card, Card])
            : ('hidden' as const)
          : null,
      };
    }),
    turn:
      state.round?.actor !== null && state.round
        ? {
            seat: state.round.actor,
            turnId: `${hand?.id ?? 'betting'}:${hand?.actionNumber ?? 0}`,
            deadlineMs: hand?.deadlineMs ?? 0,
          }
        : null,
    you:
      own && viewer !== 'spectator'
        ? {
            seat: viewer,
            pendingSitOut: own.sitOutNext || own.timeoutCount >= 2,
            leavingAfterHand: own.leavePending,
            holeCards:
              hand?.playerIds[viewer] === own.id && hand?.holeCards[viewer]
                ? ([...hand.holeCards[viewer]!] as [Card, Card])
                : null,
            legal: getLegalActions(state, viewer),
          }
        : null,
    paused: false,
  };
}

/** Filter private events independently for every recipient, never broadcast raw engine events. */
export function eventsFor(
  events: readonly HandEvent[],
  viewer: number | 'spectator',
  state: TableState,
): HandEvent[] {
  return events
    .filter(
      (event) =>
        event.type !== 'holeCardsDealt' ||
        (event.seat === viewer &&
          event.playerId === state.seats[event.seat]?.id &&
          event.handId === state.hand?.id),
    )
    .map((event) => {
      if (event.type === 'holeCardsDealt')
        return { ...event, cards: [...event.cards] as [Card, Card] };
      if (event.type === 'boardDealt')
        return { ...event, cards: [...event.cards] };
      if (event.type === 'showdown')
        return {
          ...event,
          hands: event.hands.map((hand) => ({
            ...hand,
            cards: [...hand.cards] as [Card, Card],
          })),
        };
      if (event.type === 'potAwarded')
        return {
          ...event,
          seats: [...event.seats],
          shares: event.shares.map((share) => ({ ...share })),
        };
      return { ...event };
    });
}
