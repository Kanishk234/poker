import { expect, it } from 'vitest';
import {
  createDeck,
  evaluateHand,
  HAND_CATEGORIES,
  type HandCategory,
} from './index.js';

// Independent combinatorics for standard five-card poker; straight flush includes royals.
function choose(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - i + 1)) / i;
  return result;
}

it('matches category frequencies and distinct ranks over all 2,598,960 five-card hands', () => {
  const counts = Object.fromEntries(
    HAND_CATEGORIES.map((category) => [category, 0]),
  ) as Record<HandCategory, number>;
  const scores = Object.fromEntries(
    HAND_CATEGORIES.map((category) => [category, new Set<number>()]),
  ) as Record<HandCategory, Set<number>>;
  const deck = createDeck();
  let total = 0;
  for (let a = 0; a < 48; a++)
    for (let b = a + 1; b < 49; b++)
      for (let c = b + 1; c < 50; c++)
        for (let d = c + 1; d < 51; d++)
          for (let e = d + 1; e < 52; e++) {
            const result = evaluateHand([
              deck[a]!,
              deck[b]!,
              deck[c]!,
              deck[d]!,
              deck[e]!,
            ]);
            counts[result.category]++;
            scores[result.category].add(result.score);
            total++;
          }
  expect(total).toBe(choose(52, 5));
  expect(counts).toEqual({
    straightFlush: 4 * 10,
    fourOfAKind: 13 * 48,
    fullHouse: 13 * choose(4, 3) * 12 * choose(4, 2),
    flush: 4 * (choose(13, 5) - 10),
    straight: 10 * (4 ** 5 - 4),
    threeOfAKind: 13 * choose(4, 3) * choose(12, 2) * 4 ** 2,
    twoPair: choose(13, 2) * choose(4, 2) ** 2 * 11 * 4,
    pair: 13 * choose(4, 2) * choose(12, 3) * 4 ** 3,
    highCard: (choose(13, 5) - 10) * (4 ** 5 - 4),
  });
  expect(
    Object.fromEntries(
      HAND_CATEGORIES.map((category) => [category, scores[category].size]),
    ),
  ).toEqual({
    highCard: choose(13, 5) - 10,
    pair: 13 * choose(12, 3),
    twoPair: choose(13, 2) * 11,
    threeOfAKind: 13 * choose(12, 2),
    straight: 10,
    flush: choose(13, 5) - 10,
    fullHouse: 13 * 12,
    fourOfAKind: 13 * 12,
    straightFlush: 10,
  });
  // No score can straddle categories, even at their weakest/strongest kickers.
  for (let i = 1; i < HAND_CATEGORIES.length; i++)
    expect(Math.min(...scores[HAND_CATEGORIES[i]!]!)).toBeGreaterThan(
      Math.max(...scores[HAND_CATEGORIES[i - 1]!]!),
    );
});
