import { describe, expect, it } from 'vitest';
import { clampRaise, displayOrder, positions } from './presentation.js';
import { fixture, previewSettings, scenes } from './fixtures.js';

describe('view presentation', () => {
  it('keeps every physical seat exactly once when the viewer rotates to the bottom', () => {
    for (let count = 2; count <= 9; count++)
      for (let viewer = 0; viewer < count; viewer++) {
        const order = displayOrder(count, viewer);
        expect(order[0]).toBe(viewer);
        expect([...order].sort((a, b) => a - b)).toEqual(
          Array.from({ length: count }, (_, seat) => seat),
        );
        expect(positions[count]).toHaveLength(count - 1);
      }
  });
  it('never lets typed amounts or presets exceed server-supplied bounds, including an off-step all-in', () => {
    const legal = {
      canFold: true,
      canCheck: false,
      callAmount: 40,
      minRaiseTo: 85,
      maxRaiseTo: 197,
      canAllIn: true,
    };
    expect(clampRaise(-10, legal, 20)).toBe(85);
    expect(clampRaise(110, legal, 20)).toBe(120);
    expect(clampRaise(99999, legal, 20)).toBe(197);
    expect(clampRaise(NaN, legal, 20)).toBe(85);
    expect(clampRaise(10, { ...legal, minRaiseTo: null }, 20)).toBe(197);
  });
  it('fixtures preserve chips and keep opponent cards hidden before showdown', () => {
    for (const stack of [1000, 2000, 5000])
      for (const { id } of scenes)
        for (let count = 2; count <= 9; count++) {
          const view = fixture(
            id,
            count,
            previewSettings(
              new URLSearchParams({
                stack: String(stack),
                blinds: '25/50',
                timer: '15',
              }),
            ),
          );
          const total =
            view.seats.reduce(
              (sum, seat) => sum + (seat ? seat.stack + seat.bet : 0),
              0,
            ) + view.pots.reduce((sum, pot) => sum + pot.amount, 0);
          expect(total).toBe(count * stack);
          for (const seat of view.seats)
            if (seat && seat.seat !== view.you.seat && id !== 'showdown')
              expect(Array.isArray(seat.cards)).toBe(false);
          expect('deck' in view).toBe(false);
        }
  });
  it('uses supported preview settings and ignores tampered configuration values', () => {
    expect(
      previewSettings(new URLSearchParams('stack=-1&blinds=0/0&timer=NaN')),
    ).toEqual({ stack: 2000, smallBlind: 10, bigBlind: 20, turnSeconds: 30 });
    const view = fixture(
      'flop',
      9,
      previewSettings(new URLSearchParams('stack=5000&blinds=25/50&timer=15')),
    );
    expect(view.config).toMatchObject({
      smallBlind: 25,
      bigBlind: 50,
      turnSeconds: 15,
    });
    expect(view.you.legal?.maxRaiseTo).toBe(4800);
    expect(view.turn?.deadlineMs).toBe(9000);
  });
});
