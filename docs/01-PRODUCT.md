# 01 - Product

## Vision
The cleanest way to play a casual poker night with friends on your phone. Opening the app, creating a table, and getting friends seated should take under 30 seconds. After the game, players get stats and recaps that make them want to play again.

## Target users
- **Friend groups** who play for fun (primary).
- **Improving players** who want feedback on how they play (secondary).

## Principles
1. **Clean table.** Nothing on the table that real poker wouldn't show. No live HUD of opponents' tendencies.
2. **Fast to start.** Invite link, no signup required to join (guest name).
3. **Stats live after the hand,** not during it (except an optional host-enabled learning assist; see 06-STATS).
4. **Fair and trustworthy.** Server shuffles and deals; no client can see hidden cards.
5. **Phone first.** Portrait, one-handed, thumb-zone controls.

## MVP scope (must have)
- Create a table, get a shareable link/code.
- No-limit Texas Hold'em, 2-9 players per table (design for 9, default 6).
- Host-configurable: starting stack, blinds, action timer.
- Full rules: blinds, min-raise, all-ins, side pots, split pots.
- Reconnect after backgrounding/network loss without losing your seat.
- Text chat (simple) and quick emotes (optional).
- Installable PWA (Add to Home Screen).
- Hand history saved; session recap at the end.

## After MVP
- Accounts, friend groups, persistent leaderboard and season standings.
- Advanced stats and leak finder (06-STATS).
- Learning-mode assist (pot odds, outs) toggled by host.
- Bots to fill empty seats.
- Web push "it's your turn".
- Capacitor wrapper for App Store (needs paid Apple account).

## Non-goals
- Real money, cash-out, purchasable chips, ads.
- Tournaments (v1), other variants (Omaha etc.) - design so variants *could* be added, but don't build them.
- Public matchmaking/lobbies with strangers (v1).
- Native iOS/Android apps (v1).

## User stories
- As a host, I create a table, set blinds, and send a link in a group chat.
- As a guest, I open the link, enter a name, pick a seat, and play.
- As a player, my phone locks mid-hand and when I come back I'm still at the table.
- As a player, I can raise with a slider and quick buttons (1/2 pot, pot, all-in).
- As a group, we see who won the night, biggest pot, and fun awards.
- As a learner, I can see my VPIP/PFR and replay a hand I misplayed.

## Success metrics
- Time from landing to seated < 30s on a phone.
- A hand never gets stuck (timeouts always resolve it).
- Zero hidden-card leaks (verified by tests).
- 7-day return rate of friend groups (once there's anything to measure).

## Guardrails
- Visibly play money. Copy never implies cash value.
- Original name, logo, art, card faces. Inspiration from other apps is fine; copying is not.
- Minimal data collection. Guest play requires no personal info.

## Open questions
- Starting bankroll model (per-table stack only, vs. persistent chips with daily top-up)?
- Chat moderation basics (mute, report) before public sharing?
- Name and branding.
