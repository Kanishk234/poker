import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  EngineError,
  HAND_CATEGORIES,
  compareHands,
  createDeck,
  evaluateHand,
  type Card,
  type HandCategory,
} from './index.js';

const hand = (cards: string) => cards.split(' ') as Card[];
const evaluate = (cards: string) => evaluateHand(hand(cards));
const stronger = (left: string, right: string) =>
  expect(compareHands(hand(left), hand(right))).toBe(1);

describe('hand categories', () => {
  const categories: [HandCategory, string][] = [
    ['highCard', 'As Kd 9c 7h 5s 3d 2c'],
    ['pair', 'As Ad Kc Jh 9s 4d 2c'],
    ['twoPair', 'As Ad Kc Kh 9s 4d 2c'],
    ['threeOfAKind', 'As Ad Ac Kh 9s 4d 2c'],
    ['straight', '9s 8d 7h 6c 5s 2d Ac'],
    ['flush', 'As Js 9s 7s 3s Kd 2c'],
    ['fullHouse', 'As Ad Ac Kh Ks 4d 2c'],
    ['fourOfAKind', 'As Ad Ac Ah Ks 4d 2c'],
    ['straightFlush', 'As Ks Qs Js Ts 2d 3c'],
  ];
  it.each(categories)('recognizes %s', (category, cards) => {
    const result = evaluate(cards);
    expect(result.category).toBe(category);
    expect(Number.isSafeInteger(result.score)).toBe(true);
    expect(result.bestFive).toHaveLength(5);
  });
  it('orders all nine categories without kicker overlap', () => {
    expect(categories.map(([category]) => category)).toEqual(HAND_CATEGORIES);
    for (let i = 1; i < categories.length; i++)
      stronger(categories[i]![1], categories[i - 1]![1]);
    stronger('2s 3s 4s 5s 6s', 'As Ad Ac Ah Ks');
    stronger('2c 2d 2h 3c 3d', 'As Ks Js 9s 7s');
    stronger('2c 3d 4h 5s 6c', 'As Ad Ac Kh Qs');
  });
  it('makes a wheel five-high and treats a royal as the highest straight flush', () => {
    expect(evaluate('As 2c 3d 4h 5s Kd Qc').category).toBe('straight');
    stronger('2s 3c 4d 5h 6s Ah Kd', 'As 2c 3d 4h 5s Kd Qc');
    stronger('As Ks Qs Js Ts 2d 3c', 'Kh Qh Jh Th 9h 2d 3c');
    stronger('2s 3s 4s 5s 6s Kd Qc', 'As 2s 3s 4s 5s Kd Qc');
    expect(evaluate('As 2c 3d 4h 6s Kd Qc').category).toBe('highCard');
    expect(evaluate('As Kc Qd 2h 3s 8d 7c').category).toBe('highCard');
  });
  it('does not combine a straight in one set with a flush in another', () => {
    expect(evaluate('As Ks Qs Js 9s Th 2d').category).toBe('flush');
  });
});

describe('kickers and selecting the best five', () => {
  it('compares every high-card and flush kicker in descending order', () => {
    stronger('As Kd 9c 7h 5s', 'As Kd 9c 7h 4s');
    stronger('As Qs 9s 7s 5s', 'As Js 9s 7s 5s');
    stronger('As Js 9s 7s 5s', 'As Js 9s 7s 4s');
  });
  it('compares pair rank before all three kickers', () => {
    stronger('3c 3d 9h 7s 4c', '2c 2d Ah Ks Qc');
    stronger('As Ad Kc Qh 9s', 'As Ad Kc Jh Ts');
    stronger('As Ad Kc Qh 9s', 'As Ad Kc Qh 8s');
  });
  it('compares both pairs and then their kicker; discards a third pair', () => {
    stronger('Ks Kd Qc Qh 2s', 'Qs Qd Jc Jh As');
    stronger('As Ad Kc Kh 2s', 'As Ad Qc Qh Ks');
    stronger('As Ad Kc Kh 9s', 'As Ad Kc Kh 8s');
    const result = evaluate('As Ad Ks Kd Qs Qd 2c');
    expect(result.category).toBe('twoPair');
    expect(result.bestFive.filter((card) => card.startsWith('Q'))).toHaveLength(
      1,
    );
    expect(result.bestFive).not.toContain('2c');
  });
  it('compares trips then both kickers, and quads then their kicker', () => {
    stronger('Ks Kd Kc Qh 2s', 'Qs Qd Qc Ah Ks');
    stronger('As Ad Ac Kh Qs', 'As Ad Ac Kh Js');
    stronger('Ks Kd Kc Kh 2s', 'Qs Qd Qc Qh As');
    stronger('As Ad Ac Ah Ks', 'As Ad Ac Ah Qs');
  });
  it('compares full houses by trips first, then pair; handles two trips', () => {
    stronger('Ks Kd Kc 2h 2s 3d 3h', 'Qs Qd Qc Ah As 4d 2c');
    stronger('Ks Kd Kc Ah As 7d 3c', 'Ks Kd Kc Qh Qs 7d 3c');
    const result = evaluate('As Ad Ac Ks Kd Kc 2h');
    expect(result.category).toBe('fullHouse');
    expect(result.bestFive.filter((card) => card.startsWith('A'))).toHaveLength(
      3,
    );
    expect(result.bestFive.filter((card) => card.startsWith('K'))).toHaveLength(
      2,
    );
  });
  it('ignores unused sixth/seventh cards and suits when hands tie', () => {
    expect(
      compareHands(hand('As Kd 9c 7h 5s 3d 2c'), hand('Ah Kc 9d 7s 5c 4h 2s')),
    ).toBe(0);
    expect(
      compareHands(hand('As Ad Kc Qh 9s 4d 2c'), hand('Ah Ac Ks Qd 9c 5h 3s')),
    ).toBe(0);
    expect(
      compareHands(hand('As Ks Qs Js Ts 2d 3c'), hand('As Ks Qs Js Ts Ah Ad')),
    ).toBe(0);
    expect(compareHands(hand('2s 3c 4d 5h 6s'), hand('As 2c 3d 4h 5s'))).toBe(
      1,
    );
    expect(compareHands(hand('As 2c 3d 4h 5s'), hand('2s 3c 4d 5h 6s'))).toBe(
      -1,
    );
  });
  it('allows the board to play and also finds hands using one or both hole cards', () => {
    const board = hand('As Ks Qs Js Ts');
    expect(compareHands([...board, '2d', '3c'], [...board, 'Ah', 'Ad'])).toBe(
      0,
    );
    expect(evaluate('As Ks Qs Js 2c Ts 3d').bestFive).toContain('Ts');
    expect(evaluate('As Ad 7h 4c 2s Ac Ah').category).toBe('fourOfAKind');
    expect(evaluate('As Ks 9s 7s 5s 3s 2d').bestFive).not.toContain('3s');
    expect(evaluate('2c 3d 4h 5s 6c 7d 8h').bestFive).not.toContain('3d');
  });
});

describe('evaluation boundary and determinism', () => {
  it('validates lengths, duplicate cards, and malformed cards', () => {
    for (const cards of [[], hand('As Kd Qc Jh'), createDeck().slice(0, 8)])
      expect(() => evaluateHand(cards)).toThrowError(
        expect.objectContaining({ code: 'INVALID_HAND' }),
      );
    expect(() => evaluate('As As Qc Jh Td')).toThrowError(
      expect.objectContaining({ code: 'DUPLICATE_CARD' }),
    );
    expect(() => evaluate('AS Kd Qc Jh Td')).toThrowError(
      expect.objectContaining({ code: 'INVALID_CARD' }),
    );
    expect(() => evaluate('As Kd Qc Jh 10s')).toThrowError(EngineError);
  });
  it('handles six cards and never mutates frozen caller input', () => {
    const cards = Object.freeze(hand('9s As Ks Qs Js Ts'));
    expect(evaluateHand(cards).category).toBe('straightFlush');
    expect(cards).toEqual(hand('9s As Ks Qs Js Ts'));
  });
  it('is invariant to input order, returns a valid subset, and never worsens when adding cards', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(createDeck(), { minLength: 7, maxLength: 7 }),
        (cards) => {
          const result = evaluateHand(cards);
          expect(result).toEqual(evaluateHand([...cards].reverse()));
          expect(new Set(result.bestFive).size).toBe(5);
          for (const card of result.bestFive) expect(cards).toContain(card);
          expect(evaluateHand(result.bestFive).score).toBe(result.score);
          expect(result.score).toBeGreaterThanOrEqual(
            evaluateHand(cards.slice(0, 6)).score,
          );
          expect(evaluateHand(cards.slice(0, 6)).score).toBeGreaterThanOrEqual(
            evaluateHand(cards.slice(0, 5)).score,
          );
        },
      ),
      { numRuns: 10_000, seed: 20261022 },
    );
  }, 30000);
  it('suit relabeling never changes category or score', () => {
    const mapping = { c: 'h', d: 's', h: 'd', s: 'c' } as const;
    fc.assert(
      fc.property(
        fc.shuffledSubarray(createDeck(), { minLength: 5, maxLength: 7 }),
        (cards) => {
          const relabeled = cards.map(
            (card) =>
              `${card[0]}${mapping[card[1] as keyof typeof mapping]}` as Card,
          );
          expect(evaluateHand(relabeled).score).toBe(evaluateHand(cards).score);
        },
      ),
      { numRuns: 1000, seed: 7 },
    );
  });
});
