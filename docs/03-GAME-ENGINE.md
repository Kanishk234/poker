# 03 - Game engine spec

Package: `packages/engine`. Pure TypeScript, no I/O, deterministic given an injected `rng`.

## Implementation status — cards and evaluation

The first M1 task group implements `Card`, `Rank`, `Suit`, `Rng`, `isCard`, `assertCards`, `createDeck`, `shuffleDeck`, `evaluateHand`, `compareHands`, and typed `EngineError`s. Table state, dealing/betting, pots, timeouts, events, and per-seat views below remain targets for the following engine groups. No network contract has changed.

- `createDeck()` returns a fresh rank-major deck (`2c, 2d, 2h, 2s, ... As`).
- `Rng = (upperExclusive: number) => number` returns an integer in `[0, upperExclusive)`. `shuffleDeck(deck, rng)` copies its input, rejects invalid or duplicate cards and invalid RNG results, and applies descending Fisher–Yates. It accepts smaller unique card sets for tests, too. Repeating the same random stream reproduces the shuffle; the engine owns no entropy source. The production adapter lives in `apps/server/src/random.ts` and calls Node's unbiased `crypto.randomInt`.
- `evaluateHand(cards)` accepts five, six, or seven distinct canonical cards and returns `{ category, score, bestFive }`. It enumerates the at-most-21 five-card subsets. A base-15 score orders category followed by all relevant kickers; higher wins. Royals are ace-high straight flushes. `compareHands(left, right)` returns -1, 0, or 1; equal ranks tie regardless of suits or unused cards.
- `bestFive` is a new tuple in canonical rank-descending, suit-order (`c, d, h, s`) order. Suit ordering only makes the representative deterministic; it never affects the score. Equal-scoring subsets choose the first canonical subset, so input permutation cannot change the result. Inputs are never mutated, and returned subsets contain no cards outside the input.
- Invalid calls throw `EngineError` with `INVALID_CARD`, `DUPLICATE_CARD`, `INVALID_HAND`, or `INVALID_RNG`. The server must still validate inbound messages with shared schemas before calling any engine API.

Validation: `pnpm test:engine:coverage` enforces >=90% per-file lines, statements, branches, and functions. `pnpm test:engine:exhaustive` checks every five-card combination against independent combinatorial counts and verifies category score ranges. Both run in CI. The 10,000-seed shuffle checks and 10,000 best-of-seven property checks are not full-hand betting simulations; those remain part of the later M1 acceptance criteria.

## Conventions
- Card: string `rank + suit`, ranks `23456789TJQKA`, suits `cdhs`. Example `"As"`, `"Td"`.
- Chips: non-negative integers.
- Seats: indexed `0..maxSeats-1` (default `maxSeats = 9`, table default 6).
- Bets are expressed as **"raise to"** totals for the current street, not increments.

## Public API (target)
```ts
createTable(config: TableConfig, rng: Rng): TableState
seatPlayer(state, seat, player: { id, name }, buyIn): TableState
removePlayer(state, seat): TableState             // allowed between hands, or auto-fold mid-hand
startHand(state): { state, events }               // if >= 2 eligible players
getLegalActions(state, seat): LegalActions        // { canFold, canCheck, callAmount, minRaiseTo, maxRaiseTo, canAllIn }
applyAction(state, seat, action: Action): { state, events }   // throws EngineError on illegal
applyTimeout(state, seat): { state, events }      // check if legal, else fold
viewFor(state, seat | 'spectator'): TableView     // the ONLY thing sent to clients
```
`Action = { type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin', amount?: number }`.
`bet`/`raise` use `amount = raiseTo`. The engine normalizes (a `raise` with nothing to call is a `bet`).

```ts
type TableConfig = {
  maxSeats: number; smallBlind: number; bigBlind: number;
  minBuyIn: number; maxBuyIn: number; actionSeconds: number; assistAllowed: boolean;
}
```

## State machine
`waiting -> preflop -> flop -> turn -> river -> showdown -> handOver -> (waiting | preflop)`

- `waiting`: fewer than 2 eligible players.
- Eligible = seated, has chips, not sitting out.
- `handOver` awards pots, emits events, then the server schedules the next hand (short delay for animations).

## Hand lifecycle
1. **Button** moves clockwise to the next occupied eligible seat. (Simplified: no dead-button rules; see DECISIONS.)
2. **Blinds:** SB is the next eligible seat after the button, BB the next after that.
   - **Heads-up:** the button posts the SB and acts **first preflop**, **last** on later streets. The other player posts BB.
   - A player who can't cover a blind posts all-in for what they have.
3. **Deal:** shuffle a fresh 52-card deck, deal 2 hole cards each, starting left of the button.
4. **Preflop** action starts left of the BB (heads-up: the button/SB).
5. **Flop/Turn/River:** burn one, deal 3/1/1 board cards. Action starts at the first active player left of the button.
6. **Showdown** if >= 2 players remain after the river (or everyone remaining is all-in, then run out the board).
7. **Uncontested win:** if all but one player fold, that player wins immediately; hole cards are not revealed.

## Betting rules (no-limit)
- `currentBet` = highest total bet this street. `callAmount = min(currentBet - myBet, myStack)`.
- **Min raise-to** = `currentBet + lastFullRaiseSize`. Initially `lastFullRaiseSize = bigBlind` (preflop) or `bigBlind` for the first bet on a later street (min bet = BB).
- **Max raise-to** = `myBet + myStack` (all-in).
- A player may always go all-in even if below the min raise.
- **All-in that is smaller than a full raise does not reopen betting** to players who have already acted; they may only call or fold. Track `actedSinceLastFullRaise` per player. An all-in that is a full raise or more does reopen action, and sets `lastFullRaiseSize = raiseTo - currentBet`.
- Check is legal only when `currentBet == myBet`. The BB has the option to check or raise preflop when no one raised.
- **Street ends** when every non-folded, non-all-in player has acted since the last full raise and has matched `currentBet`.
- If only one non-folded, non-all-in player remains and no live bet needs a call, skip remaining betting and run out the board.

## Pots
- Track each player's total contribution for the hand (`committed`).
- **Side pot algorithm** at showdown/award time:
  1. Collect distinct `committed` levels of players who are all-in (and the max).
  2. For each level `L` ascending, form a pot: each player contributes `min(committed, L) - previousLevel`. Eligible winners = non-folded players with `committed >= L`.
  3. Folded players' chips stay in the pots they contributed to but they are not eligible.
  4. If a top pot has only one eligible player (excess uncalled chips), **return** it to that player (not a win).
- Award each pot to the best hand(s) among its eligible players. Ties split equally; **odd chips go to the first winner left of the button**, one chip at a time.
- Example: three players go all-in with stacks 100 / 300 / 500. Main pot = 300 (100 x 3), eligible: all three. Side pot 1 = 400 ((300 - 100) x 2), eligible: the 300 and 500 players. The remaining 200 from the 500 player was never called, so it is returned to them.

## Hand evaluation
- Best 5 of 7 cards. Returns a comparable numeric score; higher wins.
- Categories (high to low): straight flush (royal is the top straight flush), four of a kind, full house, flush, straight, three of a kind, two pair, pair, high card.
- Ace plays high and low (wheel A-2-3-4-5 is the lowest straight, 5-high).
- Kickers handled correctly; suits never break ties.
- Either use a well-tested library or implement a fast evaluator in-package. Whichever is chosen, the tests below are mandatory.

## Sitting out, timeouts, leaving
- Server calls `applyTimeout(state, seat)` when the action clock expires: auto-check if legal, else auto-fold.
- Two consecutive timeouts => player is set `sitting_out` (skipped for blinds/dealing from the next hand).
- A player with 0 chips after a hand becomes `busted`; they may rebuy (between hands) up to `maxBuyIn` or stand up.
- Leaving mid-hand = fold now, removed after the hand. Their committed chips stay in the pot.
- New players are seated as `waiting` and are dealt in from the next hand (no blind required to enter).

## Events (emitted by the engine for UI + history)
`handStarted`, `blindPosted`, `holeCardsDealt` (per-seat, only visible to that seat), `boardDealt`, `playerActed {seat, action, amount}`, `streetEnded`, `showdown {hands}`, `potAwarded {potIndex, seats, amount}`, `uncalledReturned`, `handEnded`, `playerBusted`, `timeoutFold`.

## Views (what clients may see)
`viewFor(state, seat)` includes: config, phase, board, pots, all seats' public info (name, stack, current bet, status, last action), **only the viewer's own hole cards**, legal actions for the viewer, and whose turn it is. At showdown, revealed hands for contesting players are included. Spectator view has no hole cards.

## Test plan (required)
**Unit**
- Heads-up: button posts SB, acts first preflop, last postflop.
- 3-way side pots (stacks 100/300/500 all-in) produce the amounts above.
- Short all-in (less than a full raise) does not reopen betting; a full all-in raise does.
- Min raise sizing after a raise of X: next min raise-to = `currentBet + X`.
- Split pot with odd chip goes to the first winner left of the button.
- Uncontested pot returned correctly; fold-win reveals nothing.
- Wheel straight loses to 6-high straight; flush beats straight; full house kicker comparisons; board plays (split).
- BB option preflop when everyone limps.
- Player can't cover the blind posts all-in.

**Evaluator distribution (slow test, run nightly or on demand):** enumerate all C(52,7) = 133,784,560 seven-card hands and match known counts:

| Category | Count |
| --- | --- |
| Straight flush (incl. royal) | 41,584 |
| Four of a kind | 224,848 |
| Full house | 3,473,184 |
| Flush | 4,047,644 |
| Straight | 6,180,020 |
| Three of a kind | 6,461,620 |
| Two pair | 31,433,400 |
| One pair | 58,627,800 |
| High card | 23,294,460 |

**Property / fuzz (fast-check, thousands of hands, random legal actions, seeded RNG)**
- Chip conservation: stacks + pots + bets are constant within a hand; after award, total equals the starting total.
- No negative stacks or bets.
- `getLegalActions` results are always accepted by `applyAction`; anything else throws.
- Every hand terminates within a bounded number of actions.
- Determinism: same seed + same actions => identical state and events.
- **Hidden info:** serialize `viewFor` for every seat at every step; assert no other seat's hole cards or any deck card appears before showdown.
