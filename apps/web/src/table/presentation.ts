import type { LegalActions } from './types.js';
export const chips = (amount: number) => amount.toLocaleString('en-US');
// Amount editing only: legality is supplied by the view, never computed by the UI.
export function clampRaise(
  amount: number,
  legal: LegalActions,
  bigBlind: number,
): number {
  const minimum = legal.minRaiseTo ?? legal.maxRaiseTo;
  if (!Number.isFinite(amount)) return minimum;
  if (amount >= legal.maxRaiseTo) return legal.maxRaiseTo;
  return Math.max(
    minimum,
    Math.min(legal.maxRaiseTo, Math.round(amount / bigBlind) * bigBlind),
  );
}
export function displayOrder(seatCount: number, viewerSeat: number): number[] {
  return Array.from(
    { length: seatCount },
    (_, offset) => (viewerSeat + offset) % seatCount,
  );
}
export const positions: Record<number, readonly (readonly [number, number])[]> =
  {
    2: [[50, 15]],
    3: [
      [30, 15],
      [70, 15],
    ],
    4: [
      [16, 30],
      [50, 12],
      [84, 30],
    ],
    5: [
      [32, 8],
      [68, 8],
      [86, 81],
      [14, 81],
    ],
    6: [
      [18, 8],
      [50, 8],
      [82, 8],
      [86, 81],
      [14, 81],
    ],
    7: [
      [14, 32],
      [32, 4],
      [68, 4],
      [86, 32],
      [86, 81],
      [14, 81],
    ],
    8: [
      [14, 32],
      [18, 4],
      [50, 4],
      [82, 4],
      [86, 32],
      [86, 81],
      [14, 81],
    ],
    9: [
      [14, 32],
      [14, 4],
      [38, 4],
      [62, 4],
      [86, 4],
      [86, 32],
      [86, 81],
      [14, 81],
    ],
  };
