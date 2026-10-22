import { EngineError } from './errors.js';

export const RANKS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'T',
  'J',
  'Q',
  'K',
  'A',
] as const;
export const SUITS = ['c', 'd', 'h', 's'] as const;
export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type Card = `${Rank}${Suit}`;

// A uniformly sampled integer in [0, upperExclusive). The caller supplies randomness.
export type Rng = (upperExclusive: number) => number;

export function isCard(value: unknown): value is Card {
  return (
    typeof value === 'string' &&
    value.length === 2 &&
    RANKS.some((rank) => rank === value[0]) &&
    SUITS.some((suit) => suit === value[1])
  );
}

export function assertCards(
  cards: readonly unknown[],
): asserts cards is readonly Card[] {
  // Iteration sees sparse-array holes as undefined; Array.every would skip them.
  for (const card of cards) {
    if (!isCard(card))
      throw new EngineError(
        'INVALID_CARD',
        'Cards must use rank + suit, for example As or Td.',
      );
  }
  if (new Set(cards).size !== cards.length)
    throw new EngineError('DUPLICATE_CARD', 'A card cannot appear twice.');
}

/** Fresh, canonical rank-major deck; callers may mutate their own returned array. */
export function createDeck(): Card[] {
  return RANKS.flatMap((rank) => SUITS.map((suit): Card => `${rank}${suit}`));
}

/** Fisher–Yates over a copy. Never changes the caller's deck or owns a random source. */
export function shuffleDeck(deck: readonly Card[], rng: Rng): Card[] {
  assertCards(deck);
  const shuffled = [...deck];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = rng(index + 1);
    if (!Number.isSafeInteger(other) || other < 0 || other > index) {
      throw new EngineError(
        'INVALID_RNG',
        'RNG must return an integer below its supplied bound.',
      );
    }
    [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
  }
  return shuffled;
}
