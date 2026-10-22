import { expect, it } from 'vitest';
import { createDeck, shuffleDeck } from '@felt/engine';
import { secureRng } from './random.js';

it('provides bounded CSPRNG integers and a complete production shuffle', () => {
  for (const bound of [1, 2, 13, 52, 2 ** 32]) {
    for (let i = 0; i < 100; i++) {
      const value = secureRng(bound);
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(bound);
    }
  }
  expect([...shuffleDeck(createDeck(), secureRng)].sort()).toEqual(
    createDeck().sort(),
  );
});
