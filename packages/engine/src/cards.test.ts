import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  EngineError,
  RANKS,
  SUITS,
  assertCards,
  createDeck,
  isCard,
  shuffleDeck,
  type Card,
  type Rng,
} from './index.js';

function seeded(seed: number): Rng {
  let state = seed >>> 0;
  return (bound) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 2 ** 32) * bound);
  };
}

describe('cards and decks', () => {
  it('creates fresh, complete, canonical decks', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
    expect(deck[0]).toBe('2c');
    expect(deck[51]).toBe('As');
    expect(deck.filter((card) => card.startsWith('A'))).toHaveLength(4);
    expect(deck.filter((card) => card.endsWith('s'))).toHaveLength(13);
    expect(RANKS).toHaveLength(13);
    expect(SUITS).toHaveLength(4);
    deck.pop();
    expect(createDeck()).toHaveLength(52);
  });
  it('recognizes only canonical rank/suit strings', () => {
    for (const card of createDeck()) expect(isCard(card)).toBe(true);
    for (const value of [
      null,
      undefined,
      42,
      {},
      [],
      '',
      'A',
      'AS',
      'as',
      '10s',
      '1c',
      'Ax',
      'As ',
      'As\n',
    ])
      expect(isCard(value)).toBe(false);
    expect(() => assertCards(['As', 'As'])).toThrowError(EngineError);
    expect(() => assertCards(['AS'])).toThrowError(
      expect.objectContaining({ code: 'INVALID_CARD' }),
    );
    expect(() => assertCards(['2c', '2c'])).toThrowError(
      expect.objectContaining({ code: 'DUPLICATE_CARD' }),
    );
    expect(() => assertCards([])).not.toThrow();
    expect(() => assertCards(new Array<unknown>(5))).toThrowError(
      expect.objectContaining({ code: 'INVALID_CARD' }),
    );
  });
  it('performs descending Fisher–Yates swaps without changing the input', () => {
    const deck = Object.freeze(['As', 'Kd', 'Qc', 'Jh'] as Card[]);
    const bounds: number[] = [];
    expect(
      shuffleDeck(deck, (bound) => {
        bounds.push(bound);
        return 0;
      }),
    ).toEqual(['Kd', 'Qc', 'Jh', 'As']);
    expect(bounds).toEqual([4, 3, 2]);
    expect(deck).toEqual(['As', 'Kd', 'Qc', 'Jh']);
    expect(shuffleDeck(deck, (bound) => bound - 1)).toEqual(deck);
    const unused: Rng = () => {
      throw new Error('Must not consume entropy');
    };
    expect(shuffleDeck([], unused)).toEqual([]);
    expect(shuffleDeck(['As'], unused)).toEqual(['As']);
  });
  it('rejects invalid injected random values and invalid decks', () => {
    for (const value of [
      -1,
      52,
      1.5,
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(() => shuffleDeck(createDeck(), () => value)).toThrowError(
        expect.objectContaining({ code: 'INVALID_RNG' }),
      );
    expect(() => shuffleDeck(['As', 'As'], seeded(1))).toThrowError(
      EngineError,
    );
    expect(() => shuffleDeck(['invalid' as Card], seeded(1))).toThrowError(
      EngineError,
    );
  });
  it('preserves all 52 cards and repeats exactly across 10,000 seeded shuffles', () => {
    const original = Object.freeze(createDeck());
    const sorted = [...original].sort();
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const first = shuffleDeck(original, seeded(seed));
        expect([...first].sort()).toEqual(sorted);
        expect(first).toEqual(shuffleDeck(original, seeded(seed)));
        expect(first).not.toBe(original);
      }),
      { numRuns: 10_000, seed: 20261022 },
    );
  });
});
