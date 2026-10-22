# Felt (working name)

Play-money Texas Hold'em for friends. Mobile-first web app (PWA) with a clean table, private invite-link games, and post-game stats. No real money, ever.

> "Felt" is a placeholder name. Rename freely (search the repo for `Felt`).

## Docs

| Doc                                                    | What it covers                                            |
| ------------------------------------------------------ | --------------------------------------------------------- |
| [AGENTS.md](./AGENTS.md)                               | Rules and workflow for Codex / AI agents. **Read first.** |
| [docs/01-PRODUCT.md](./docs/01-PRODUCT.md)             | Vision, scope, non-goals, user stories                    |
| [docs/02-ARCHITECTURE.md](./docs/02-ARCHITECTURE.md)   | Stack, repo layout, data flow, key decisions              |
| [docs/03-GAME-ENGINE.md](./docs/03-GAME-ENGINE.md)     | Poker rules spec, engine API, test plan                   |
| [docs/04-PROTOCOL.md](./docs/04-PROTOCOL.md)           | Client/server messages and the hidden-info rule           |
| [docs/05-DESIGN-MOBILE.md](./docs/05-DESIGN-MOBILE.md) | UI layout, interaction, PWA and iOS checklist             |
| [docs/06-STATS.md](./docs/06-STATS.md)                 | Stat definitions, hand history schema, live assist        |
| [docs/07-ROADMAP.md](./docs/07-ROADMAP.md)             | Milestones M0-M8 with task checklists                     |
| [docs/08-DEPLOYMENT.md](./docs/08-DEPLOYMENT.md)       | Free hosting setup, env vars, CI, security                |
| [docs/DECISIONS.md](./docs/DECISIONS.md)               | Running log of decisions (append as you go)               |

## Stack (short)

Vite + React + TypeScript + Tailwind (PWA) / Node + Colyseus (WebSockets) / Supabase (auth + Postgres) / pnpm monorepo / Vitest.

## Getting started

Use Node 24 LTS and pnpm 10.28.2 (pinned in `package.json`). If pnpm is not on your PATH, use `corepack pnpm` in place of `pnpm` below.

```bash
pnpm install
pnpm dev        # web + server
pnpm test
```

Open `http://localhost:5173` to create a table or join by six-character code. `/create` sets up a live private table; `/t/:code` joins one; `/dev/table` still offers sample hands without a server. The game server runs on port 2567; `http://localhost:2567/health` reports its status. Stop both with Ctrl+C.

M0–M3 now provide the workspace, pure poker engine, mobile table UI and live multiplayer. Create a room, share its code, take seats with play chips and let the host start. Real check/call/fold/raise actions, turn timers, automatic hands, sit-out/in, between-hand rebuys and plain-text chat are connected. `/dev/table?scene=flop&players=9` remains a static design preview with frozen timers.

Protocol v2 uses strict shared schemas, private per-seat views/events and stale-turn protection. Reconnect/seat recovery is still M4: refreshing currently leaves the seat, so keep the tab open during a game. The stats package is still empty. Accounts, persistence and public production hosting remain later milestones.

`localhost` links open only on the computer running the app. For a temporary phone-accessible live game, leave `pnpm dev` running and run `cloudflared tunnel --url http://127.0.0.1:5173 --http-host-header localhost:5173`. Open the printed HTTPS URL on the phone. Install `cloudflared` using [Cloudflare's instructions](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). Vite proxies `/api` and `/colyseus` to the local server, including WebSockets, so a single tunnel serves the whole game. Anyone with its URL can access the test app; both dev servers and the tunnel must stay running. Persistent hosting remains a launch task.

Local/LAN/tunnel defaults work without env files. Vite's development proxy forwards the trusted local origin; production HTTP/WebSocket requests still require `ALLOWED_ORIGINS`. Copy `.env.example` only when overriding defaults. For separate production hosts set both `VITE_SERVER_URL` and `VITE_API_URL` to the public game server, and add the web origin to server `ALLOWED_ORIGINS`. Explicit localhost URL overrides bypass the dev proxy and cannot work from another device.

Validation: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Formatting: `pnpm format` / `pnpm format:check`. Production server: `pnpm --filter @felt/server start`. Package imports currently resolve workspace TypeScript sources through `tsx`; this is intentional, not a standalone `dist` deployment. CI checks all validation commands and a production dependency audit. Placeholder PWA icons can be regenerated with `node scripts/generate-icons.mjs`.

Engine validation: `pnpm test:engine:coverage` enforces at least 90% coverage per source file. `pnpm test:engine:exhaustive` checks exact category frequencies and distinct scores for every five-card hand; it is separate from the quick test suite and also runs in CI. The optional full seven-card distribution audit is not implemented yet.

## Starting with Codex

Open the repo and prompt:

> Read AGENTS.md and docs/07-ROADMAP.md. Complete milestone M0 only, tick the checkboxes as you go, and stop when its acceptance criteria pass.

Then continue one milestone (or one task group) at a time.
