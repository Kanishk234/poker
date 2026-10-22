# 07 - Roadmap

Work top to bottom. Each milestone has tasks (checkboxes) and **acceptance criteria**. Give Codex one milestone (or one task group) at a time. M1 (engine) and M2 (static UI) are independent and can run in parallel.

## M0 - Scaffold

- [x] pnpm workspace: `apps/web`, `apps/server`, `packages/engine`, `packages/shared`, `packages/stats`
- [x] TypeScript strict base config, path aliases, project references
- [x] ESLint + Prettier, Vitest (+ fast-check) set up in all packages
- [x] `apps/web`: Vite + React + Tailwind + vite-plugin-pwa shell (manifest, icons placeholder)
- [x] `apps/server`: Colyseus with a `table` room that accepts a join and echoes a hello
- [x] `packages/shared`: `PROTOCOL_VERSION`, first zod schemas
- [x] Root scripts: `dev`, `test`, `typecheck`, `lint`, `build`
- [x] GitHub Actions CI: install, typecheck, lint, test, build
- [x] `.env.example`, `.gitignore`, update README/AGENTS command sections if needed

Local validation (2026-10-22): typecheck, lint, six tests, production build, and production dependency audit pass. Headless Chromium at 390x844 verifies Connected, no horizontal scroll, >=44px controls, and failed connection followed by successful retry. Desktop screenshot reviewed. GitHub CI for scaffold commit `2ed7916` passed; real iPhone testing remains part of M2/M7.

**Accept:** `pnpm dev` starts both; the web page shows "connected" after joining the server room; CI is green.

## M1 - Engine (spec: 03-GAME-ENGINE)

- [x] Cards, deck, injected RNG, Fisher-Yates shuffle (CSPRNG adapter for prod)
- [x] Hand evaluator (best 5 of 7) with tests incl. wheel and kickers
- [x] Table state, seating, button/blinds (incl. heads-up rules)
- [x] Betting rounds: legal actions, min-raise tracking, all-in handling, reopen logic
- [x] Street progression, run-out when all-in, showdown
- [x] Pots: main/side pots, uncalled return, split pots, odd chip
- [x] Timeouts, sit-out, busted/rebuy, leave mid-hand
- [x] Events emitted for every state change
- [x] `viewFor` with strict hidden-info handling
- [x] Fuzz/property tests (conservation, termination, determinism, no leaks)
- [ ] (Optional/slow) 7-card category distribution test

First M1 task group (2026-10-22): cards, shuffling, evaluation, and server CSPRNG adapter implemented. 39 quick tests pass repo-wide; current engine modules have 100% lines/branches/functions/statements coverage. Property tests cover 10,000 seeded shuffles and 10,000 best-of-seven inputs. An exhaustive audit of all 2,598,960 five-card combinations matches category frequencies and distinct rank counts. These are foundation tests, not the 10,000 complete-hand simulations required below. Table state/betting/pots/views and full M1 acceptance remain unfinished.

Second M1 task group: implemented immutable seating/configuration, button rotation, heads-up and short blinds, betting actions, all-in calls, minimum raises, per-player cumulative reopening, and betting-street completion boundaries. Added 10,000 seeded betting simulations covering legal-action acceptance, chip conservation, nonnegative integer ledgers, immutability, bounded termination, and deterministic states/events. 78 quick tests pass; engine lines/branches/functions/statements coverage is 100%; typecheck, lint, exhaustive evaluator audit, build, and production dependency audit pass. No cards are dealt or pots awarded by these simulations; complete hand/lifecycle and hidden-info acceptance remain open. No new dependencies or network contract changes.

**Accept:** all unit + property tests pass; fuzz of 10,000 seeded hands has zero invariant violations; hidden-info test passes; coverage >= 90% for the engine.

Third M1 checkpoint: complete dealing/street progression, all-in runouts, side-pot settlement, uncalled returns, split/odd chips, showdown and fold-win privacy. Recipient-specific views/events bind retained hole cards to player and hand identity, protecting seat reuse and stale private events. 10,000 complete seeded hands conserve chips through payout, terminate, reproduce identically and pass hidden-card checks for every recipient at every step. Coverage remains above the 90% per-file gate. Participant timeouts/departure/rebuy and complete command events remain to finish M1.

Final M1 checkpoint: added due-deadline timeout handling, consecutive-timeout sit-out, manual sit-out/in, safe between-hand rebuys, waiting arrivals, and deferred departures (all-in eligibility retained through settlement). Eventful participant commands cover seating, preference changes, top-ups and exact stack withdrawals. Kept state-only helpers for compatibility. Unit tests cover chip accounting, turn/deadline preservation, pending departures, all-in leavers and stale private payloads. The full 10,000-hand conservation/determinism/termination/privacy suite and >=90% per-file coverage gate remain mandatory CI checks. UI and multiplayer wiring are still M3; optional seven-card enumeration is not part of the completed acceptance scope.

## M2 - Table UI with fixtures (spec: 05-DESIGN-MOBILE)

- [x] `/dev/table` route with fixture `TableView`s (preflop, flop, all-in, showdown, 2/6/9 players)
- [x] Card, Seat, Board, Pot, TopBar components
- [x] ActionBar + RaiseSheet (slider, quick buttons, clamping)
- [x] Timer ring, status tags, "you" at bottom rotation
- [x] Safe areas, `100dvh`, overscroll/touch rules, 16px inputs
- [x] Landing and Create Table screens (no backend yet)
- [x] Phone loads the HTTPS preview and matches the browser design (user confirmed)
- [ ] Hands-on real iPhone interaction check (safe areas, raise controls, and installed PWA)

M2 validation (2026-10-22): Chromium covers all five scenarios with 2–9 players at both 390x844 and 320x844 (80 layouts): no horizontal scroll, no opponent-seat or board overlap, >=44px interactive targets. Also checked raise presets/bounds, typed amounts, dialog Escape/focus restoration, code validation, local name persistence, selected create settings, and desktop layout. Screenshots visually reviewed. Typecheck, lint, ten tests, build, and production dependency audit pass; JS bundle ~88 KB gzipped. No new dependencies. WebKit is not installed; Safari and physical iPhone acceptance remain unverified.

**Accept:** at a 390x844 viewport there is no horizontal scroll, controls are >= 44px, 9-seat layout doesn't overlap, and it feels good on a real iPhone via the deployed or tunneled dev URL.

## M3 - Multiplayer wiring (spec: 04-PROTOCOL)

- [x] Shared zod schemas for all messages; `TableView`/`TableEvent` types
- [x] `POST /api/tables`, invite code generation, `/t/:code` join flow
- [x] Table room: validates intents, calls engine, broadcasts per-seat `update` with `seq`
- [x] Server-side action timers, auto check/fold, next-hand scheduling
- [x] Web client: connection hook, state from latest `update`, send intents
- [x] Sit/stand, buy-in, host start, basic chat
- [x] Event queue for animations (deal, bet, award)
- [x] Integration test: 3 headless clients play a full hand; assert no hidden-card leaks

M3 validation (2026-10-22): three real WebSocket clients play through showdown with exact chips, private recipient deals, stale-tap rejection, malformed/unknown intent rejection and host checks. A real five-second deadline auto-folds and schedules hand two. Three separate mobile browser contexts create/join by code, buy in, start, check/call through all streets, reveal showdown and send literal-text chat. Screenshots/geometry reviewed at 390x844 and 320x844, including the nine-seat lobby: no horizontal scroll, overlapping seats or controls under 44px. Fixed an abandoned StrictMode connection consuming host admission. No new dependencies. Physical two-phone gameplay, reconnect/seat recovery and public deployment remain unverified/M4/M7 work.

**Accept:** two phones (or phone + browser) can create, join via link, and play full hands to showdown with correct pots.

## M4 - Resilience and host tools

- [ ] Reconnect (token, `allowReconnection`), resync on gap, reconnect on `visibilitychange`/`online`
- [ ] Connection banner and `connected` flags in seats
- [ ] Two-timeout auto sit-out, rebuy flow
- [ ] Host controls: kick, pause/resume, change blinds/timer for next hand
- [ ] Rate limiting, message size limits, chat sanitization
- [ ] Voided-hand recovery after server restart (restore last-hand stacks)
- [ ] Cold-start UX: "Waking up the server..." state

**Accept:** lock the phone mid-hand for 30s, unlock, and you are back with the correct state; a stuck or disconnected player never blocks a hand.

## M5 - Accounts and persistence

- [ ] Supabase project, schema + migrations, row-level security
- [ ] Guest (anonymous) auth, upgrade to email/OAuth
- [ ] Persist `HandRecord` at hand end (async, retry on failure)
- [ ] Friend groups / "my tables" history

**Accept:** a guest upgrades to an account and their past hands/stats follow them; DB outage doesn't interrupt live play.

## M6 - Stats and review (spec: 06-STATS)

- [ ] `packages/stats` implementations with tests for every stat
- [ ] Session recap screen
- [ ] Hand history list + step-through replay
- [ ] Group leaderboard + fun awards
- [ ] Leak finder (>= 100 hands, suggestion wording)

**Accept:** stats match hand-computed values on fixture histories; replay never shows other players' un-shown cards.

## M7 - Polish and launch (free web launch)

- [ ] Sound effects (user-gesture unlock), reduced-motion support
- [ ] "Add to Home Screen" coaching, update prompt, offline screen
- [ ] Wake lock while seated
- [ ] Accessibility pass, performance budget check
- [ ] Deploy per 08-DEPLOYMENT; test on real iPhones (Safari + installed)
- [ ] Private beta with a real friend group; collect feedback

**Accept:** a new friend can open the link and be seated in under 30s; Lighthouse PWA/perf checks pass reasonable thresholds.

## M8 - Later / optional

- [ ] Web push turn notifications (installed PWA only)
- [ ] Learning assist overlay (06-STATS)
- [ ] Bots to fill seats
- [ ] Pre-action buttons, show/muck choice, run-it-twice
- [ ] Capacitor wrapper + App Store (requires the paid Apple Developer account)
- [ ] More variants (only if the engine stayed clean)

## Working agreement with the agent

- One milestone or task group per session. Stop at the acceptance criteria.
- Tick boxes in this file as you finish. Add new tasks you discover under the right milestone.
- Record any spec ambiguity you resolved in `docs/DECISIONS.md`.
