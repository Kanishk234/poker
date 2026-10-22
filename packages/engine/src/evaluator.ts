import {
  assertCards,
  RANKS,
  SUITS,
  type Card,
  type Rank,
  type Suit,
} from './cards.js';
import { EngineError } from './errors.js';

export const HAND_CATEGORIES = [
  'highCard',
  'pair',
  'twoPair',
  'threeOfAKind',
  'straight',
  'flush',
  'fullHouse',
  'fourOfAKind',
  'straightFlush',
] as const;
export type HandCategory = (typeof HAND_CATEGORIES)[number];
export type FiveCards = readonly [Card, Card, Card, Card, Card];
export interface EvaluatedHand {
  category: HandCategory;
  /** Higher wins. Equal scores tie; suit and unused cards never break a tie. */
  score: number;
  bestFive: FiveCards;
}

function rankValue(card: Card): number {
  return RANKS.indexOf(card[0] as Rank) + 2;
}
function canonicalOrder(a: Card, b: Card): number {
  return (
    rankValue(b) - rankValue(a) ||
    SUITS.indexOf(a[1] as Suit) - SUITS.indexOf(b[1] as Suit)
  );
}

// Base-15 digits encode category then every relevant kicker, padded to five ranks.
function scoreFor(category: number, kickers: readonly number[]): number {
  let score = category;
  for (let index = 0; index < 5; index++)
    score = score * 15 + (kickers[index] ?? 0);
  return score;
}

function evaluateFiveUnchecked(cards: FiveCards): EvaluatedHand {
  const ranks = cards.map(rankValue).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card[1] === cards[0][1]);
  const straightHigh =
    counts.size !== 5
      ? 0
      : ranks[0]! - ranks[4]! === 4
        ? ranks[0]!
        : ranks.join(',') === '14,5,4,3,2'
          ? 5
          : 0;
  const first = groups[0]!;
  const second = groups[1]!;
  let category: number;
  let kickers: readonly number[];
  if (flush && straightHigh) {
    category = 8;
    kickers = [straightHigh];
  } else if (first[1] === 4) {
    category = 7;
    kickers = [first[0], second[0]];
  } else if (first[1] === 3 && second[1] === 2) {
    category = 6;
    kickers = [first[0], second[0]];
  } else if (flush) {
    category = 5;
    kickers = ranks;
  } else if (straightHigh) {
    category = 4;
    kickers = [straightHigh];
  } else if (first[1] === 3) {
    category = 3;
    kickers = groups.map(([rank]) => rank);
  } else if (first[1] === 2 && second[1] === 2) {
    category = 2;
    kickers = groups.map(([rank]) => rank);
  } else if (first[1] === 2) {
    category = 1;
    kickers = groups.map(([rank]) => rank);
  } else {
    category = 0;
    kickers = ranks;
  }
  return {
    category: HAND_CATEGORIES[category]!,
    score: scoreFor(category, kickers),
    bestFive: cards,
  };
}

/** Best five of five, six, or seven visible cards. No evaluation of unseen cards. */
export function evaluateHand(cards: readonly Card[]): EvaluatedHand {
  if (cards.length < 5 || cards.length > 7)
    throw new EngineError('INVALID_HAND', 'Evaluate five to seven cards.');
  assertCards(cards);
  const ordered = [...cards].sort(canonicalOrder);
  let best: EvaluatedHand | undefined;
  for (let a = 0; a < ordered.length - 4; a++)
    for (let b = a + 1; b < ordered.length - 3; b++)
      for (let c = b + 1; c < ordered.length - 2; c++)
        for (let d = c + 1; d < ordered.length - 1; d++)
          for (let e = d + 1; e < ordered.length; e++) {
            const candidate = evaluateFiveUnchecked([
              ordered[a]!,
              ordered[b]!,
              ordered[c]!,
              ordered[d]!,
              ordered[e]!,
            ]);
            if (!best || candidate.score > best.score) best = candidate;
          }
  // Length validation guarantees at least one five-card combination.
  return best!;
}

/** -1, 0, or 1; only poker rank and kickers influence this result. */
export function compareHands(
  left: readonly Card[],
  right: readonly Card[],
): number {
  return Math.sign(evaluateHand(left).score - evaluateHand(right).score);
}
