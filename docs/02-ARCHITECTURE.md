# 02 - Architecture

## Overview
```
 iPhone (PWA)                     Game server (Node)                 Supabase
┌──────────────┐  WebSocket   ┌────────────────────────┐  async   ┌──────────────┐
│ React UI     │ <==========> │ Colyseus room "table"  │ ───────> │ Postgres     │
│ renders      │  intents ->  │  ├─ engine (pure TS)   │ hand     │ (hands,      │
│ latest view  │  <- updates  │  ├─ timers             │ history  │  profiles)   │
└──────────────┘              │  └─ per-seat views     │          │ Auth (guest  │
        │  REST/auth          └────────────────────────┘          │  + email)    │
        └──────────────────────────────────────────────────────> └──────────────┘
```

## Repo layout (pnpm workspaces)
```
apps/web          Vite + React + TS + Tailwind, vite-plugin-pwa
apps/server       Colyseus server, REST for create-table, hand-history writer
packages/engine   Pure poker engine (no I/O)
packages/shared   Protocol types, zod schemas, constants, PROTOCOL_VERSION
packages/stats    Pure stat functions over hand histories
docs/
```
Dependency direction: `web` and `server` depend on `shared`; `server` depends on `engine` and `stats` (for server-side summaries); `web` may import `engine` *only* for read-only helpers (hand-strength label, pot odds, equity) using the player's own visible data. `engine` and `stats` depend on nothing in this repo except types from `shared` if needed.

## Key design decisions

### 1. Server-authoritative, pure engine
All rules live in `packages/engine` as pure functions: `applyAction(state, action) -> { state, events }`. The Colyseus room is a thin adapter: validates input, calls the engine, manages timers, broadcasts per-seat views. This makes rules unit-testable and lets us swap the transport later.

### 2. Hidden information
The full `TableState` (including the deck and everyone's hole cards) exists only on the server. Clients only ever receive `TableView` produced by `viewFor(state, seat)`. A test must assert that no opponent hole card or deck card appears anywhere in serialized views before showdown.

### 3. Snapshot + events
Each server message contains the full current `TableView` (small, simple, resync-proof) plus an `events` list so the UI can animate (deal, bet, fold, award). A monotonically increasing `seq` lets the client detect gaps and request a resync.

### 4. In-memory rooms, async persistence
Active tables live in server memory (single instance for MVP). At the end of each hand the server writes the hand history to Postgres asynchronously (never blocking play). If the server restarts mid-hand, that hand is voided and players return to the stacks recorded at the previous hand's end (stored in the room's snapshot, persisted per hand).

### 5. Identity
- MVP: guest identity = random `playerId` + display name, stored in `localStorage` with a `sessionToken` for reconnects.
- Later: Supabase anonymous auth, upgradeable to email/OAuth so stats follow the person.

### 6. Time
Action timers run on the server only. The engine never reads the clock; the server injects `now` and calls the engine's timeout handling (auto-check if legal, else auto-fold).

### 7. Randomness
Shuffle with Fisher-Yates using a CSPRNG (`crypto.randomInt`) in production. The engine takes an injected `rng` so tests can use a seeded one.

## Tech choices

| Concern | Choice | Why |
| --- | --- | --- |
| Frontend | Vite + React + TS + Tailwind | Fast, mobile-friendly, great tooling |
| PWA | vite-plugin-pwa | Manifest + service worker with little config |
| Realtime | Colyseus | Room-based multiplayer, reconnection built in |
| Validation | zod | One schema for runtime + types |
| DB/Auth | Supabase (Postgres) | Free tier, auth, SQL for stats |
| Tests | Vitest + fast-check | Fast; property tests suit poker invariants |
| Monorepo | pnpm workspaces | Simple, fast |

## Scaling notes (not needed for MVP)
One server instance holds all rooms. If needed later: sticky routing per room, or Colyseus presence/Redis. Don't build this now.

## Security basics
See `08-DEPLOYMENT.md` (validation, rate limits, CORS, chat sanitization, table-code entropy).
