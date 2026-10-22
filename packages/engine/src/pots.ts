import { EngineError } from './errors.js';
import type { PlayerSeat } from './table.js';

export interface Pot {
  amount: number;
  eligibleSeats: number[];
}
export interface UncalledReturn {
  seat: number;
  amount: number;
}
export interface PotBreakdown {
  pots: Pot[];
  returns: UncalledReturn[];
}

/** Pure contribution slicing. A single contributor is uncalled; a single eligible winner is not. */
export function buildPots(seats: readonly (PlayerSeat | null)[]): PotBreakdown {
  if (
    !Number.isSafeInteger(
      seats.reduce((sum, seat) => sum + (seat?.committed ?? 0), 0),
    )
  )
    throw new EngineError(
      'INVALID_POT',
      'Total contributions exceed safe integer precision.',
    );
  if (
    seats.some(
      (seat) =>
        seat && (!Number.isSafeInteger(seat.committed) || seat.committed < 0),
    )
  )
    throw new EngineError(
      'INVALID_POT',
      'Contributions must be nonnegative safe integers.',
    );
  const participants = seats.filter(
    (seat): seat is PlayerSeat => !!seat && seat.committed > 0,
  );
  const levels = [...new Set(participants.map((seat) => seat.committed))].sort(
    (a, b) => a - b,
  );
  const pots: Pot[] = [];
  const returns: UncalledReturn[] = [];
  let previous = 0;
  for (const level of levels) {
    const contributors = participants.filter((seat) => seat.committed >= level);
    const amount = (level - previous) * contributors.length;
    previous = level;
    if (contributors.length === 1) {
      returns.push({ seat: contributors[0]!.seat, amount });
      continue;
    }
    const eligibleSeats = contributors
      .filter((seat) => seat.status !== 'folded')
      .map((seat) => seat.seat);
    if (!eligibleSeats.length)
      throw new EngineError(
        'INVALID_POT',
        'A contested pot must have an eligible winner.',
      );
    // Folded-player contribution levels need not split an otherwise identical pot.
    const prior = pots[pots.length - 1];
    if (prior && prior.eligibleSeats.join(',') === eligibleSeats.join(','))
      prior.amount += amount;
    else pots.push({ amount, eligibleSeats });
  }
  return { pots, returns };
}

/** Award shares in clockwise order left of the button, including each odd chip. */
export function splitPot(
  amount: number,
  winners: readonly number[],
  dealerSeat: number,
  maxSeats: number,
): { seat: number; amount: number }[] {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !winners.length ||
    new Set(winners).size !== winners.length ||
    !Number.isInteger(maxSeats) ||
    maxSeats < 2 ||
    maxSeats > 9 ||
    !Number.isInteger(dealerSeat) ||
    dealerSeat < 0 ||
    dealerSeat >= maxSeats ||
    winners.some(
      (seat) => !Number.isInteger(seat) || seat < 0 || seat >= maxSeats,
    )
  )
    throw new EngineError(
      'INVALID_POT',
      'Invalid pot amount or winning seats.',
    );
  const ordered = [...winners].sort(
    (a, b) =>
      ((a - dealerSeat - 1 + maxSeats) % maxSeats) -
      ((b - dealerSeat - 1 + maxSeats) % maxSeats),
  );
  const share = Math.floor(amount / ordered.length);
  const odd = amount % ordered.length;
  return ordered.map((seat, index) => ({
    seat,
    amount: share + (index < odd ? 1 : 0),
  }));
}
