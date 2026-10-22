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

Local validation (2026-10-22): typecheck, lint, six tests, production build, and production dependency audit pass. Headless Chromium at 390x844 verifies Connected, no horizontal scroll, >=44px controls, and failed connection followed by successful retry. Desktop screenshot reviewed. GitHub CI status must be confirmed after push; real iPhone testing remains part of M2/M7.

**Accept:** `pnpm dev` starts both; the web page shows "connected" after joining the server room; CI is green.

## M1 - Engine (spec: 03-GAME-ENGINE)
- [ ] Cards, deck, injected RNG, Fisher-Yates shuffle (CSPRNG adapter for prod)
- [ ] Hand evaluator (best 5 of 7) with tests incl. wheel and kickers
- [ ] Table state, seating, button/blinds (incl. heads-up rules)
- [ ] Betting rounds: legal actions, min-raise tracking, all-in handling, reopen logic
- [ ] Street progression, run-out when all-in, showdown
- [ ] Pots: main/side pots, uncalled return, split pots, odd chip
- [ ] Timeouts, sit-out, busted/rebuy, leave mid-hand
- [ ] Events emitted for every state change
- [ ] `viewFor` with strict hidden-info handling
- [ ] Fuzz/property tests (conservation, termination, determinism, no leaks)
- [ ] (Optional/slow) 7-card category distribution test

**Accept:** all unit + property tests pass; fuzz of 10,000 seeded hands has zero invariant violations; hidden-info test passes; coverage >= 90% for the engine.

## M2 - Table UI with fixtures (spec: 05-DESIGN-MOBILE)
- [ ] `/dev/table` route with fixture `TableView`s (preflop, flop, all-in, showdown, 2/6/9 players)
- [ ] Card, Seat, Board, Pot, TopBar components
- [ ] ActionBar + RaiseSheet (slider, quick buttons, clamping)
- [ ] Timer ring, status tags, "you" at bottom rotation
- [ ] Safe areas, `100dvh`, overscroll/touch rules, 16px inputs
- [ ] Landing and Create Table screens (no backend yet)

**Accept:** at a 390x844 viewport there is no horizontal scroll, controls are >= 44px, 9-seat layout doesn't overlap, and it feels good on a real iPhone via the deployed or tunneled dev URL.

## M3 - Multiplayer wiring (spec: 04-PROTOCOL)
- [ ] Shared zod schemas for all messages; `TableView`/`TableEvent` types
- [ ] `POST /api/tables`, invite code generation, `/t/:code` join flow
- [ ] Table room: validates intents, calls engine, broadcasts per-seat `update` with `seq`
- [ ] Server-side action timers, auto check/fold, next-hand scheduling
- [ ] Web client: connection hook, state from latest `update`, send intents
- [ ] Sit/stand, buy-in, host start, basic chat
- [ ] Event queue for animations (deal, bet, award)
- [ ] Integration test: 3 headless clients play a full hand; assert no hidden-card leaks

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
