# 06 - Stats, hand history, and learning assist

Package: `packages/stats` (pure TS over hand-history JSON). Stats are **after-the-fact**. The only in-hand aid is the optional learning assist at the end of this doc.

## Hand history record
Written by the server at the end of every hand.
```ts
type HandRecord = {
  handId: string; tableId: string; handNumber: number; startedAt: string;
  config: { smallBlind: number; bigBlind: number };
  dealerSeat: number;
  players: { seat: number; playerId: string; name: string; startStack: number;
             holeCards: [Card, Card] | null; // only stored if revealed or for owner's own review
             endStack: number }[];
  board: Card[];
  actions: { street: 'preflop'|'flop'|'turn'|'river'; seat: number;
             type: 'fold'|'check'|'call'|'bet'|'raise'|'allin'; amount: number; potBefore: number }[];
  showdown: { seat: number; cards: [Card, Card]; handRank: string }[];
  results: { seat: number; won: number; potIndex: number }[];
};
```
Privacy: a player's hole cards are visible in a shared replay only if shown at showdown. Players can always see their own.

Suggested Postgres tables: `profiles`, `tables`, `hands (id, table_id, data jsonb, created_at)`, `hand_players (hand_id, player_id, net, ...)`. JSONB is fine for v1; denormalize only when a query needs it.

## Stat definitions
Denominators matter; implement exactly:

| Stat | Numerator | Denominator |
| --- | --- | --- |
| Hands | hands dealt in | - |
| **VPIP** | hands where player *voluntarily* put chips in preflop (call/bet/raise; posting blinds and checking BB don't count) | hands dealt |
| **PFR** | hands where player raised preflop | hands dealt |
| **3-bet %** | times player re-raised a preflop raise | times player faced one preflop raise with a chance to re-raise |
| **Fold to 3-bet %** | folds | times player (as opener) faced a 3-bet |
| **Aggression factor (AF)** | postflop bets + raises | postflop calls (undefined if 0 calls; show "-") |
| **Aggression frequency** | postflop bets + raises | postflop bets + raises + calls + folds |
| **C-bet %** | flop bets by preflop aggressor | flops seen as preflop aggressor with first action available |
| **Fold to c-bet %** | folds | times faced a flop c-bet |
| **WTSD** | showdowns reached | flops seen |
| **W$SD** | showdowns won (any share) | showdowns reached |
| **Net chips** | sum(endStack - startStack) | - |
| **bb/100** | net / bigBlind / hands x 100 | - |

Also track: biggest pot won, best hand shown, biggest bluff called, longest win/loss streak.

## Session recap (end of night)
Per player: net result, hands played, biggest pot, best hand, VPIP/PFR for the session. Group: who won the night, chip-lead chart over hands.

## Social layer (the differentiator)
- Group leaderboard and season standings (by net chips or bb/100, with a minimum hands threshold).
- Fun awards computed from stats: *Biggest Bluffer* (most uncalled-fold wins by river bet), *Calling Station* (high VPIP, low PFR, high call rate), *Rock* (low VPIP), *Cooler of the Night* (lost with strongest hand quality).
- Hand replay: step street by street; share a link to a specific hand (respect the privacy rule above).

## Leak finder (heuristics, v2)
Only show after >= 100 hands. Examples (tune thresholds with real data):
- VPIP much higher than PFR => "You call a lot preflop; try raising or folding more."
- Fold to c-bet very high => "Opponents can profit by betting into you."
- WTSD high but W$SD low => "You may be paying off too often at showdown."
Phrase as suggestions, never as certainties. Label small samples clearly.

## Learning assist (optional, host-enabled)
Setting `assistAllowed` (default off) lets players toggle an overlay for themselves. It uses **only the player's own visible info**; no opponent data:
- Current hand strength label (e.g. "Top pair").
- Pot odds: `call / (pot + call)` as a percent, plus "you need X% equity".
- Outs and approximate equity vs a random hand (exact enumeration for turn/river; Monte Carlo for flop/preflop). State clearly it's vs a random hand.
Make it visually distinct and dismissible, and show a small "assist on" marker to everyone if the table wants fairness (config option).

## Testing
Unit-test every stat against hand-crafted records with known answers, including edge cases: walks (BB wins unopposed), all-in preflop, heads-up, players who join mid-session, and zero-denominator cases.
