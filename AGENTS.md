# AGENTS.md

Instructions for AI coding agents (Codex etc.). Read this first, then the doc relevant to your task.

## Project in one paragraph
A mobile-first, play-money Texas Hold'em web app (PWA) for playing with friends via invite links. Server-authoritative game logic, clean UI, and post-game stats. Specs live in `docs/`. The task list lives in `docs/07-ROADMAP.md`.

## Repo layout
```
apps/web        Vite + React + TS + Tailwind PWA (UI only, no game rules)
apps/server     Node + Colyseus room server (wraps the engine, handles timers/transport)
packages/engine Pure TS poker engine (rules, pots, hand evaluation, per-seat views)
packages/shared Protocol types + zod schemas, shared constants
packages/stats  Pure TS stat calculations over hand histories
docs/           Specs. Keep them in sync with code.
```

## Commands (keep accurate; fix this section if scripts change)
```
pnpm install
pnpm dev          # web + server
pnpm test         # vitest, all packages
pnpm test:engine:coverage    # engine tests + 90% per-file coverage gate
pnpm test:engine:exhaustive  # all 2,598,960 five-card combinations
pnpm typecheck
pnpm lint
pnpm build
pnpm format      # Prettier write
pnpm format:check
```

Use Node 24 LTS and the pinned pnpm version. If pnpm is unavailable, `corepack pnpm <command>` runs the same commands without a global install.

## Hard rules
1. **`packages/engine` is pure.** No I/O, no `Date.now()`, no `Math.random()`, no imports from `apps/*`. Time and randomness are injected. Same inputs must always give the same outputs.
2. **Server is authoritative.** The client sends *intents* (fold/call/raise). It never decides outcomes, pots, or turn order.
3. **Never leak hidden information.** Opponents' hole cards and the deck must never appear in any message, log, or snapshot sent to a client until showdown reveals them. Always build client payloads with the engine's `viewFor(state, seat)`.
4. **Chip conservation.** Total chips on a table (stacks + pots + bets) never changes except via explicit buy-in, rebuy, or leave. Tests must assert this.
5. **Validate every inbound message** with zod schemas from `packages/shared`. Reject unknown or malformed input with an error code; never crash the room.
6. **Protocol changes** must update `docs/04-PROTOCOL.md` and bump `PROTOCOL_VERSION` in the same change.
7. **Play money only.** Do not add payments, cash-out, purchasable chips, or anything gambling-adjacent. If asked, stop and flag it.
8. **Original branding only.** Do not copy names, art, text, or assets from other poker apps.
9. TypeScript `strict` everywhere. No `any` without a one-line comment explaining why.
10. Any engine behavior change needs a test. Engine coverage should stay high (aim 90%+ lines).

## Workflow
- Work on **one roadmap task group at a time**. Tick the checkbox in `docs/07-ROADMAP.md` when done.
- Small, focused commits (conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Before finishing any task: `pnpm typecheck && pnpm lint && pnpm test` must pass.
- If a spec is ambiguous, choose the simplest option consistent with the docs and record it in `docs/DECISIONS.md` (date, decision, why).
- If a spec is wrong or conflicts with reality, fix the doc in the same change.
- Don't add dependencies casually. Prefer the standard library and existing deps; justify new ones in the PR/commit message.

## Definition of done (per task)
- Behavior matches the relevant doc.
- Tests added/updated and passing; typecheck and lint clean.
- Docs updated if behavior, protocol, or commands changed.
- UI work: verified at 390x844 (iPhone-size) viewport; no horizontal scroll; tap targets >= 44px.

## Style
- Prefer small pure functions and explicit types. Name things after poker concepts (`street`, `pot`, `sidePot`, `raiseTo`).
- Cards are strings like `"As"`, `"Td"`, `"2c"` (rank + suit). Chips are integers (never floats).
- React: function components + hooks; keep game state derived from the latest server `update`, not duplicated locally.
- No secrets in the repo. Use `.env` (see `docs/08-DEPLOYMENT.md`).

## When stuck
Stop and write down what is blocking you (in the task's checklist comment or `docs/DECISIONS.md`) instead of guessing across multiple milestones.
