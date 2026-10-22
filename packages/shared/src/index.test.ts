import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  helloIntentSchema,
  probeJoinSchema,
  PROTOCOL_VERSION,
  roomCodeSchema,
  ROOM_CODE_ALPHABET,
} from './index.js';

describe('bootstrap protocol', () => {
  it('rejects mismatched versions and extra fields', () => {
    expect(
      probeJoinSchema.safeParse({ protocol: PROTOCOL_VERSION }).success,
    ).toBe(true);
    expect(
      probeJoinSchema.safeParse({ protocol: PROTOCOL_VERSION + 1 }).success,
    ).toBe(false);
    expect(
      helloIntentSchema.safeParse({ text: 'hello', cards: ['As'] }).success,
    ).toBe(false);
    expect(helloIntentSchema.safeParse({ text: ' ' }).success).toBe(false);
    expect(helloIntentSchema.safeParse({ text: 'x'.repeat(81) }).success).toBe(
      false,
    );
  });

  it('accepts six-character room codes from the unambiguous alphabet', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...ROOM_CODE_ALPHABET), {
          minLength: 6,
          maxLength: 6,
        }),
        (characters) => {
          expect(roomCodeSchema.safeParse(characters.join('')).success).toBe(
            true,
          );
        },
      ),
    );
    for (const code of ['O12345', 'ABC', 'abcdef', 'ABCDEF!']) {
      expect(roomCodeSchema.safeParse(code).success).toBe(false);
    }
  });
});
